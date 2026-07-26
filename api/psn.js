function normalizeexport default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    const id = req.query?.id;
    const locale = req.query?.locale;

    if (!id || !locale) {
        return res.status(400).json({ error: 'Brak parametrow id lub locale' });
    }

    const [lang, country] = locale.split('-');
    const localeFormatted = `${lang.toLowerCase()}-${country.toUpperCase()}`;

    try {
        const storeUrl = `https://store.playstation.com/${localeFormatted}/product/${id}`;

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
        const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (!match) return res.status(404).json({ error: 'Brak __NEXT_DATA__' });

        const nextData = JSON.parse(match[1]);
        const pageProps = nextData?.props?.pageProps;
        const batarangs = pageProps?.batarangs;
        if (!batarangs) return res.status(404).json({ error: 'Brak batarangs' });

        // Zbierz caly cache ze wszystkich batarangow
        const cache = {};
        for (const batarangKey of Object.keys(batarangs)) {
            const text = batarangs[batarangKey]?.text;
            if (!text) continue;
            const innerMatch = text.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
            if (!innerMatch) continue;
            let apolloData;
            try { apolloData = JSON.parse(innerMatch[1]); } catch(e) { continue; }
            const c = apolloData?.cache;
            if (!c) continue;
            Object.assign(cache, c);
        }

        const product = cache[`Product:${id}`];
        const name = product?.name || product?.invariantName || id;

        // 1. Cena bezposrednio na produkcie (VC, passy, dodatki)
        if (product?.price?.basePrice) {
            const p = product.price;
            return res.status(200).json({
                id, locale, name,
                basePrice: p.basePrice,
                discountedPrice: p.discountedPrice,
                isFree: p.isFree,
                serviceBranding: p.serviceBranding
            });
        }

        // 2. Cena z GameCTA ADD_TO_CART powiazanego przez webctas
        if (product?.webctas) {
            for (const ctaRef of product.webctas) {
                const ctaKey = ctaRef?.__ref;
                if (!ctaKey || !ctaKey.startsWith('GameCTA:ADD_TO_CART')) continue;
                const cta = cache[ctaKey];
                if (cta?.price?.basePrice) {
                    const p = cta.price;
                    return res.status(200).json({
                        id, locale, name,
                        basePrice: p.basePrice,
                        discountedPrice: p.discountedPrice,
                        isFree: p.isFree,
                        serviceBranding: p.serviceBranding
                    });
                }
            }
        }

        // 3. Fallback: szukaj GameCTA:ADD_TO_CART:{id} w cache
        const ctaFallbackKey = Object.keys(cache).find(
            k => k.startsWith('GameCTA:ADD_TO_CART:ADD_TO_CART') && k.includes(id) && cache[k]?.price?.basePrice
        );
        if (ctaFallbackKey) {
            const p = cache[ctaFallbackKey].price;
            return res.status(200).json({
                id, locale, name,
                basePrice: p.basePrice,
                discountedPrice: p.discountedPrice,
                isFree: p.isFree,
                serviceBranding: p.serviceBranding
            });
        }

        return res.status(404).json({ error: 'Nie znaleziono ceny dla tego produktu w tym regionie' });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}Text(value) {
    return String(value || '').toLowerCase();
}

function isTrialOrSubscriptionCandidate(key, value, price) {
    const blob = normalizeText([
        key,
        value?.name,
        value?.invariantName,
        value?.typeName,
        value?.__typename,
        value?.ctaType,
        value?.serviceBranding,
        price?.serviceBranding
    ].join(' '));

    return (
        blob.includes('trial') ||
        blob.includes('game trial') ||
        blob.includes('wersja próbna') ||
        blob.includes('playstation plus') ||
        blob.includes('ps plus') ||
        blob.includes('premium') ||
        blob.includes('subscription')
    );
}

function makeCandidate(key, value, fallbackName, sourcePrefix) {
    const price = pickPrice(value?.price);
    if (!price) return null;

    return {
        key,
        name: value?.name || value?.invariantName || fallbackName,
        ...price,
        source: `${sourcePrefix}:${key}`,
        isTrialOrSubscription: isTrialOrSubscriptionCandidate(key, value, price),
        hasDiscount:
            !!price.basePrice &&
            !!price.discountedPrice &&
            price.basePrice !== price.discountedPrice
    };
}

function findAnyPrice(cache, id) {
    const directProduct = cache[`Product:${id}`];
    const fallbackName = directProduct?.name || directProduct?.invariantName || id;
    const candidates = [];

    if (directProduct) {
        const direct = makeCandidate(`Product:${id}`, directProduct, fallbackName, 'product-direct');
        if (direct) candidates.push(direct);

        if (Array.isArray(directProduct.webctas)) {
            for (const ref of directProduct.webctas) {
                const key = ref?.__ref;
                if (!key) continue;
                const cta = cache[key];
                const candidate = makeCandidate(key, cta, fallbackName, 'product-webcta');
                if (candidate) candidates.push(candidate);
            }
        }
    }

    for (const [key, value] of Object.entries(cache)) {
        if (!value || typeof value !== 'object') continue;

        const keyHasId = key.includes(id);
        const valueHasId =
            value.productId === id ||
            value.id === id ||
            value.webctas?.some?.(x => x?.__ref?.includes?.(id));

        if (!keyHasId && !valueHasId) continue;

        const candidate = makeCandidate(key, value, fallbackName, 'cache-scan');
        if (candidate) candidates.push(candidate);
    }

    if (!candidates.length) {
        return directProduct
            ? {
                  name: fallbackName,
                  source: 'product-no-price'
              }
            : null;
    }

    const nonTrial = candidates.filter(c => !c.isTrialOrSubscription);
    const pool = nonTrial.length ? nonTrial : candidates;

    pool.sort((a, b) => {
        const aScore =
            (a.source.startsWith('product-direct') ? 100 : 0) +
            (a.source.startsWith('product-webcta') ? 50 : 0) +
            (a.hasDiscount ? 20 : 0);

        const bScore =
            (b.source.startsWith('product-direct') ? 100 : 0) +
            (b.source.startsWith('product-webcta') ? 50 : 0) +
            (b.hasDiscount ? 20 : 0);

        return bScore - aScore;
    });

    return pool[0];
}
