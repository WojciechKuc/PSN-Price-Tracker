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
    const localeLower = `${lang.toLowerCase()}-${country.toLowerCase()}`;

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
        if (!match) {
            return res.status(404).json({ error: 'Brak __NEXT_DATA__' });
        }

        const nextData = JSON.parse(match[1]);
        const pageProps = nextData?.props?.pageProps;

        // Ceny sa w batarangs -> accessibility-features -> text (JSON string z Apollo cache)
        const batarangsText = pageProps?.batarangs?.['accessibility-features']?.text;
        if (!batarangsText) {
            return res.status(404).json({ error: 'Brak batarangs.accessibility-features.text' });
        }

        // Wyciagnij JSON z tagu <script> wewnatrz stringa HTML
        const innerMatch = bataranksText.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
        if (!innerMatch) {
            return res.status(404).json({ error: 'Brak inner script w batarangs' });
        }

        const apolloData = JSON.parse(innerMatch[1]);
        const cache = apolloData?.cache;

        if (!cache) {
            return res.status(404).json({ error: 'Brak cache w apolloData', keys: Object.keys(apolloData || {}) });
        }

        // Znajdz klucz Product:${id} w Apollo cache
        const productKey = Object.keys(cache).find(k => k.startsWith('Product:') && k.includes(id));
        if (!productKey) {
            return res.status(404).json({ error: 'Brak Product w cache', cacheKeys: Object.keys(cache).slice(0, 20) });
        }

        // Znajdz klucz Sku z cena (ma pole price)
        const skuKey = Object.keys(cache).find(k => k.startsWith('Sku:') && k.includes(id) && cache[k]?.price);
        
        // Alternatywnie szukaj w calosci cache
        let priceObj = null;
        if (skuKey) {
            priceObj = cache[skuKey].price;
        } else {
            // Szukaj dowolnego obiektu z currencyCode
            for (const key of Object.keys(cache)) {
                const obj = cache[key];
                if (obj?.price?.currencyCode || obj?.currencyCode) {
                    priceObj = obj.price || obj;
                    break;
                }
            }
        }

        if (!priceObj) {
            return res.status(404).json({
                error: 'Nie znaleziono ceny w Apollo cache',
                cacheKeys: Object.keys(cache).slice(0, 30)
            });
        }

        // Normalizuj do formatu oczekiwanego przez index.html
        // index.html robi: val = p.discountedValue || p.basePriceValue
        // potem dla nie-JP: (val / 100).toFixed(2)
        let basePriceValue = priceObj.basePriceValue ?? priceObj.basePrice ?? null;
        let discountedValue = priceObj.discountedValue ?? priceObj.discountedPrice ?? null;

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
