export default async function handler(req, res) {
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

        // Znajdz produkt glowny
        const product = cache[`Product:${id}`];
        const name = product?.name || product?.invariantName || id;

        // 1. Cena bezposrednio na produkcie
        if (product?.price?.basePrice && product.price.basePrice !== 'Niedostepne') {
            return res.status(200).json({
                id, locale, name,
                basePrice: product.price.basePrice,
                discountedPrice: product.price.discountedPrice,
                isFree: product.price.isFree,
                serviceBranding: product.price.serviceBranding
            });
        }

        // 2. Znajdz SKU z webctas produktu (ADD_TO_CART)
        let skuId = null;
        if (product?.webctas) {
            for (const ctaRef of product.webctas) {
                const ctaKey = ctaRef?.__ref;
                if (!ctaKey) continue;
                const cta = cache[ctaKey];
                const params = cta?.action?.param;
                if (!params) continue;
                const skuParam = params.find(p => p.name === 'skuId');
                if (skuParam) { skuId = skuParam.value; break; }
            }
        }

        // 3. Fallback: activeCtaId zawiera skuId
        if (!skuId && product?.activeCtaId) {
            // format: "ADD_TO_CART:ADD_TO_CART:{skuId}:OUTRIGHT"
            const parts = product.activeCtaId.split(':');
            // skuId to srodkowa czesc zawierajaca PPSA/CUSA
            const skuPart = parts.find(p => p.includes('-'));
            if (skuPart) skuId = skuPart;
        }

        // 4. Szukaj ceny w GameCTA lub SkuPrice powiazanym ze skuId
        if (skuId) {
            // Szukaj SkuPrice:{skuId} lub podobnych kluczy
            for (const key of Object.keys(cache)) {
                if (key.includes(skuId) && cache[key]?.basePrice) {
                    const p = cache[key];
                    return res.status(200).json({
                        id, locale, name,
                        basePrice: p.basePrice,
                        discountedPrice: p.discountedPrice,
                        isFree: p.isFree,
                        serviceBranding: p.serviceBranding
                    });
                }
            }

            // Szukaj w GameCTA ktore zawiera ten skuId
            for (const key of Object.keys(cache)) {
                if (!key.startsWith('GameCTA:')) continue;
                const cta = cache[key];
                const params = cta?.action?.param || [];
                const hasThisSku = params.some(p => p.name === 'skuId' && p.value === skuId);
                if (hasThisSku && cta?.price?.basePrice) {
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

        // 5. Ostatnia deska: dump wszystkich kluczy z cena do debugowania
        const priceEntries = {};
        for (const key of Object.keys(cache)) {
            if (cache[key]?.basePrice) priceEntries[key] = { basePrice: cache[key].basePrice, discountedPrice: cache[key].discountedPrice };
        }

        return res.status(404).json({
            error: 'Nie znaleziono ceny',
            skuId,
            keysWithPrice: priceEntries
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
