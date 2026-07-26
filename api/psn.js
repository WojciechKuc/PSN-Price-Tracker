function extractJsonScripts(text) {
    const matches = [...text.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)];
    return matches.map(m => m[1]).filter(Boolean);
}

function pickPrice(price) {
    if (!price) return null;

    const basePrice =
        price.basePrice ??
        price.regularPrice ??
        price.fullPrice ??
        price.displayPrice ??
        null;

    const discountedPrice =
        price.discountedPrice ??
        price.salePrice ??
        price.offerPrice ??
        basePrice ??
        null;

    const isFree = Boolean(price.isFree) || basePrice === 'Free' || discountedPrice === 'Free';

    if (!basePrice && !discountedPrice && !isFree) return null;

    return {
        basePrice,
        discountedPrice,
        isFree,
        serviceBranding: price.serviceBranding ?? null
    };
}

function findAnyPrice(cache, id) {
    const directProduct = cache[`Product:${id}`];
    if (directProduct) {
        const direct = pickPrice(directProduct.price);
        if (direct) {
            return {
                name: directProduct.name || directProduct.invariantName || id,
                ...direct,
                source: 'product-direct'
            };
        }

        if (Array.isArray(directProduct.webctas)) {
            for (const ref of directProduct.webctas) {
                const key = ref?.__ref;
                if (!key) continue;
                const cta = cache[key];
                const ctaPrice = pickPrice(cta?.price);
                if (ctaPrice) {
                    return {
                        name: directProduct.name || directProduct.invariantName || id,
                        ...ctaPrice,
                        source: 'product-webcta'
                    };
                }
            }
        }
    }

    for (const [key, value] of Object.entries(cache)) {
        if (!value || typeof value !== 'object') continue;

        const price = pickPrice(value.price);
        if (!price) continue;

        const keyHasId = key.includes(id);
        const valueHasId =
            value.productId === id ||
            value.id === id ||
            value.webctas?.some?.(x => x?.__ref?.includes?.(id));

        if (keyHasId || valueHasId) {
            return {
                name: value.name || value.invariantName || directProduct?.name || id,
                ...price,
                source: `cache-scan:${key}`
            };
        }
    }

    return directProduct
        ? {
              name: directProduct.name || directProduct.invariantName || id,
              source: 'product-no-price'
          }
        : null;
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
    const storeUrl = `https://store.playstation.com/${localeFormatted}/product/${id}`;

    try {
        const response = await fetch(storeUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': locale,
                'Referer': 'https://store.playstation.com/'
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: `Store HTTP: ${response.status}` });
        }

        const html = await response.text();

        const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (!nextDataMatch) {
            return res.status(404).json({ error: 'Brak __NEXT_DATA__' });
        }

        let nextData;
        try {
            nextData = JSON.parse(nextDataMatch[1]);
        } catch (e) {
            return res.status(500).json({ error: 'Nie udalo sie sparsowac __NEXT_DATA__' });
        }

        const pageProps = nextData?.props?.pageProps || {};
        const cache = {};

        const batarangs = pageProps?.batarangs;
        if (batarangs && typeof batarangs === 'object') {
            for (const key of Object.keys(batarangs)) {
                const text = batarangs[key]?.text;
                if (!text) continue;

                for (const jsonText of extractJsonScripts(text)) {
                    try {
                        const parsed = JSON.parse(jsonText);
                        if (parsed?.cache && typeof parsed.cache === 'object') {
                            Object.assign(cache, parsed.cache);
                        }
                    } catch {}
                }
            }
        }

        const priceResult = findAnyPrice(cache, id);

        if (priceResult?.basePrice || priceResult?.discountedPrice || priceResult?.isFree) {
            return res.status(200).json({
                id,
                locale,
                name: priceResult.name || id,
                basePrice: priceResult.basePrice ?? null,
                discountedPrice: priceResult.discountedPrice ?? null,
                isFree: !!priceResult.isFree,
                serviceBranding: priceResult.serviceBranding ?? null
            });
        }

        if (priceResult?.name) {
            return res.status(404).json({
                error: 'Produkt znaleziony, ale bez ceny w tym regionie',
                id,
                locale,
                name: priceResult.name
            });
        }

        return res.status(404).json({
            error: 'Nie znaleziono ceny dla tego produktu w tym regionie'
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
