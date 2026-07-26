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

        // Szukaj ceny we WSZYSTKICH batarangs
        let priceObj = null;

        for (const batarangKey of Object.keys(batarangs)) {
            const text = batarangs[batarangKey]?.text;
            if (!text) continue;

            const innerMatch = text.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
            if (!innerMatch) continue;

            let apolloData;
            try { apolloData = JSON.parse(innerMatch[1]); } catch(e) { continue; }

            const cache = apolloData?.cache;
            if (!cache) continue;

            // Szukaj w cache obiektu z ceną
            for (const key of Object.keys(cache)) {
                const obj = cache[key];
                // Cena moze byc bezposrednio w Sku lub w zagniezdonym price
                const candidate = obj?.price || obj;
                if (candidate?.currencyCode && (candidate?.basePriceValue != null || candidate?.basePrice != null)) {
                    priceObj = candidate;
                    break;
                }
            }

            if (priceObj) break;
        }

        if (!priceObj) {
            // Zwroc liste wszystkich batarangs i kluczy cache do diagnostyki
            const debugInfo = {};
            for (const batarangKey of Object.keys(batarangs)) {
                const text = batarangs[batarangKey]?.text;
                if (!text) { debugInfo[batarangKey] = 'no text'; continue; }
                const innerMatch = text.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
                if (!innerMatch) { debugInfo[batarangKey] = 'no inner script'; continue; }
                try {
                    const d = JSON.parse(innerMatch[1]);
                    debugInfo[batarangKey] = Object.keys(d?.cache || d || {}).slice(0, 10);
                } catch(e) { debugInfo[batarangKey] = 'parse error'; }
            }
            return res.status(404).json({ error: 'Cena nie znaleziona w zadnym batarangu', batarangs: debugInfo });
        }

        let basePriceValue = priceObj.basePriceValue ?? priceObj.basePrice ?? null;
        let discountedValue = priceObj.discountedValue ?? priceObj.discountedPrice ?? null;

        if (typeof basePriceValue === 'string') basePriceValue = Math.round(parseFloat(basePriceValue.replace(/[^0-9.]/g, '')) * 100);
        if (typeof discountedValue === 'string') discountedValue = Math.round(parseFloat(discountedValue.replace(/[^0-9.]/g, '')) * 100);

        return res.status(200).json({
            data: {
                productRetrieve: {
                    products: [{
                        price: {
                            basePriceValue,
                            discountedValue,
                            currencyCode: priceObj.currencyCode ?? null,
                            discountText: priceObj.discountText ?? null
                        }
                    }]
                }
            }
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
