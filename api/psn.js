async function tryHtmlStore(id, localeFormatted, rawLocale) {
    const storeUrl = `https://store.playstation.com/${localeFormatted}/product/${id}`;

    const response = await fetch(storeUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': rawLocale,
            'Referer': 'https://store.playstation.com/'
        }
    });

    if (!response.ok) {
        throw new Error(`Store HTTP: ${response.status}`);
    }

    const html = await response.text();
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!match) return null;

    let nextData;
    try {
        nextData = JSON.parse(match[1]);
    } catch {
        return null;
    }

    const pageProps = nextData?.props?.pageProps;
    const batarangs = pageProps?.batarangs;
    if (!batarangs || typeof batarangs !== 'object') {
        return null;
    }

    const cache = {};
    for (const batarangKey of Object.keys(batarangs)) {
        const text = batarangs[batarangKey]?.text;
        if (!text) continue;

        const innerMatch = text.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
        if (!innerMatch) continue;

        try {
            const apolloData = JSON.parse(innerMatch[1]);
            const c = apolloData?.cache;
            if (c) Object.assign(cache, c);
        } catch {}
    }

    const product = cache[`Product:${id}`];
    if (!product) return null;

    const name = product?.name || product?.invariantName || id;

    if (product?.price && (product.price.basePrice || product.price.discountedPrice || product.price.isFree)) {
        const p = product.price;
        return {
            id,
            locale: rawLocale,
            name,
            basePrice: p.basePrice ?? null,
            discountedPrice: p.discountedPrice ?? null,
            isFree: !!p.isFree,
            serviceBranding: p.serviceBranding ?? null,
            source: 'html-product'
        };
    }

    if (Array.isArray(product?.webctas)) {
        for (const ctaRef of product.webctas) {
            const ctaKey = ctaRef?.__ref;
            if (!ctaKey || !ctaKey.startsWith('GameCTA:')) continue;

            const cta = cache[ctaKey];
            if (cta?.price && (cta.price.basePrice || cta.price.discountedPrice || cta.price.isFree)) {
                const p = cta.price;
                return {
                    id,
                    locale: rawLocale,
                    name,
                    basePrice: p.basePrice ?? null,
                    discountedPrice: p.discountedPrice ?? null,
                    isFree: !!p.isFree,
                    serviceBranding: p.serviceBranding ?? null,
                    source: 'html-cta'
                };
            }
        }
    }

    const ctaFallbackKey = Object.keys(cache).find(
        k =>
            k.startsWith('GameCTA:') &&
            k.includes(id) &&
            cache[k]?.price &&
            (cache[k].price.basePrice || cache[k].price.discountedPrice || cache[k].price.isFree)
    );

    if (ctaFallbackKey) {
        const p = cache[ctaFallbackKey].price;
        return {
            id,
            locale: rawLocale,
            name,
            basePrice: p.basePrice ?? null,
            discountedPrice: p.discountedPrice ?? null,
            isFree: !!p.isFree,
            serviceBranding: p.serviceBranding ?? null,
            source: 'html-cta-fallback'
        };
    }

    return {
        id,
        locale: rawLocale,
        name,
        source: 'html-no-price'
    };
}

async function tryGraphqlStore(id, localeFormatted, rawLocale) {
    const variables = {
        productId: id,
        locale: localeFormatted
    };

    const gqlUrl =
        'https://web.np.playstation.com/api/graphql/v1/op?' +
        'operationName=catalogGetProductById&variables=' +
        encodeURIComponent(JSON.stringify(variables));

    const response = await fetch(gqlUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Accept-Language': rawLocale,
            'Referer': `https://store.playstation.com/${localeFormatted}/product/${id}`
        }
    });

    if (!response.ok) {
        throw new Error(`GraphQL HTTP: ${response.status}`);
    }

    const data = await response.json();

    const product =
        data?.data?.catalogGetProductById?.product ||
        data?.data?.catalogGetProductById ||
        data?.data?.product ||
        null;

    if (!product) return null;

    const name =
        product?.name ||
        product?.localizedName ||
        product?.invariantName ||
        id;

    const price =
        product?.price ||
        product?.defaultSku?.price ||
        product?.skus?.[0]?.price ||
        null;

    if (!price) {
        return {
            id,
            locale: rawLocale,
            name,
            source: 'graphql-no-price'
        };
    }

    return {
        id,
        locale: rawLocale,
        name,
        basePrice: price.basePrice ?? price.regularPrice ?? null,
        discountedPrice: price.discountedPrice ?? price.salePrice ?? null,
        isFree: !!price.isFree,
        serviceBranding: price.serviceBranding ?? null,
        source: 'graphql'
    };
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    const id = req.query?.id?.trim();
    const locale = req.query?.locale?.trim();

    if (!id || !locale) {
        return res.status(400).json({ error: 'Brak parametrow id lub locale' });
    }

    const parts = locale.split('-');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return res.status(400).json({ error: 'Nieprawidlowy locale, np. pl-PL' });
    }

    const [lang, country] = parts;
    const localeFormatted = `${lang.toLowerCase()}-${country.toUpperCase()}`;

    try {
        try {
            const htmlResult = await tryHtmlStore(id, localeFormatted, locale);
            if (htmlResult && (htmlResult.basePrice || htmlResult.discountedPrice || htmlResult.isFree)) {
                return res.status(200).json(htmlResult);
            }
        } catch {}

        try {
            const gqlResult = await tryGraphqlStore(id, localeFormatted, locale);
            if (gqlResult && (gqlResult.basePrice || gqlResult.discountedPrice || gqlResult.isFree)) {
                return res.status(200).json(gqlResult);
            }

            if (gqlResult?.name) {
                return res.status(404).json({
                    error: 'Produkt znaleziony, ale bez ceny w tym regionie',
                    ...gqlResult
                });
            }
        } catch (gqlError) {
            return res.status(502).json({ error: gqlError.message });
        }

        return res.status(404).json({ error: 'Nie znaleziono ceny dla tego produktu w tym regionie' });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
