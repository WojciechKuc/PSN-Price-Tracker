export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    const id = req.query?.id;
    const locale = req.query?.locale;

    if (!id || !locale) {
        return res.status(400).json({ error: 'Brak parametrow id lub locale' });
    }

    // PSN publiczne REST API - nie wymaga whitelistingu
    // locale format: pl-PL -> country=PL, language=pl
    const [lang, country] = locale.split('-');
    const countryUp = country.toUpperCase();
    const langLow = lang.toLowerCase();

    const psnUrl = `https://web.np.playstation.com/api/graphql/v1/op?operationName=catalogGetProductById&variables=%7B%22productId%22%3A%22${encodeURIComponent(id)}%22%2C%22country%22%3A%22${countryUp}%22%2C%22language%22%3A%22${langLow}%22%7D&extensions=%7B%22persistedQuery%22%3A%7B%22version%22%3A1%2C%22sha256Hash%22%3A%222d26a0b2a2b9e5f7e28a1b3c9d4e6f8a0b2c4e6f8a0b2c4e6f8a0b2c4e6f8a%22%7D%7D`;

    // Fallback: Sony storefront API (publiczne, bez auth)
    const storeUrl = `https://store.playstation.com/store/api/chihiro/00_09_000/container/${locale}/1/${id}?size=1&start=0&gameContentType=games&platform=ps4`;

    try {
        // Proba przez nowe store API
        const newApiUrl = `https://store.playstation.com/${locale.toLowerCase()}/product/${id}`;
        
        const response = await fetch(newApiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': locale,
                'Referer': 'https://store.playstation.com/'
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: `Store error: ${response.status}` });
        }

        const html = await response.text();

        // Wyciagnij dane z __NEXT_DATA__ (Next.js SSR)
        const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (!match) {
            return res.status(404).json({ error: 'Brak __NEXT_DATA__ w odpowiedzi' });
        }

        const nextData = JSON.parse(match[1]);
        
        // Znajdz cene w strukturze Next.js
        const pageProps = nextData?.props?.pageProps;
        const productData = pageProps?.productDetail || pageProps?.product || pageProps?.data?.product;
        
        // Szukamy ceny w roznych miejscach struktury
        let price = null;
        
        if (productData?.price) {
            const p = productData.price;
            price = {
                basePriceValue: p.basePrice ? Math.round(parseFloat(p.basePrice.replace(/[^0-9.]/g, '')) * 100) : null,
                discountedValue: p.discountedPrice ? Math.round(parseFloat(p.discountedPrice.replace(/[^0-9.]/g, '')) * 100) : null,
                currencyCode: p.currencyCode || null,
                discountText: p.discountPercentage ? `-${p.discountPercentage}%` : null
            };
        }

        if (!price) {
            return res.status(404).json({ 
                error: 'Nie znaleziono ceny', 
                keys: Object.keys(pageProps || {}).slice(0, 10) 
            });
        }

        return res.status(200).json({
            data: {
                productRetrieve: {
                    products: [{ price }]
                }
            }
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
