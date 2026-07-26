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
        const newApiUrl = `https://store.playstation.com/${localeFormatted}/product/${id}`;

        const response = await fetch(newApiUrl, {
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

        if (!match) {
            return res.status(404).json({ error: 'Brak __NEXT_DATA__' });
        }

        const nextData = JSON.parse(match[1]);
        const pageProps = nextData?.props?.pageProps;

        // Rekurencyjnie szukaj obiektu zawierajacego currencyCode lub basePriceValue
        function findPrice(obj, depth = 0) {
            if (!obj || typeof obj !== 'object' || depth > 10) return null;
            if (obj.currencyCode || obj.basePriceValue || obj.basePrice) return obj;
            for (const key of Object.keys(obj)) {
                const found = findPrice(obj[key], depth + 1);
                if (found) return found;
            }
            return null;
        }

        const rawPrice = findPrice(pageProps);

        if (!rawPrice) {
            // Zwroc fragment struktury do debugowania
            return res.status(404).json({
                error: 'Nie znaleziono ceny w strukturze',
                pageKeys: Object.keys(pageProps || {}),
                pageFragment: JSON.stringify(pageProps).slice(0, 800)
            });
        }

        // Normalizuj cene do formatu oczekiwanego przez index.html
        // index.html: p.basePriceValue / 100 dla PL/TR/IN, p.discountedValue dla JP
        let basePriceValue = rawPrice.basePriceValue ?? rawPrice.basePrice ?? null;
        let discountedValue = rawPrice.discountedValue ?? rawPrice.discountedPrice ?? null;

        // Jesli ceny sa stringami (np. "299.00"), zamien na grosze
        if (typeof basePriceValue === 'string') {
            basePriceValue = Math.round(parseFloat(basePriceValue.replace(/[^0-9.]/g, '')) * 100);
        }
        if (typeof discountedValue === 'string') {
            discountedValue = Math.round(parseFloat(discountedValue.replace(/[^0-9.]/g, '')) * 100);
        }

        return res.status(200).json({
            data: {
                productRetrieve: {
                    products: [{
                        price: {
                            basePriceValue,
                            discountedValue,
                            currencyCode: rawPrice.currencyCode ?? null,
                            discountText: rawPrice.discountText ?? null
                        }
                    }]
                }
            }
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
