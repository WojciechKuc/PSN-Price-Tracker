export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['host'] || 'localhost';
    const fullUrl = new URL(req.url, `${protocol}://${host}`);

    const id = fullUrl.searchParams.get('id');
    const locale = fullUrl.searchParams.get('locale');

    if (!id || !locale) {
        return res.status(400).json({ error: 'Brak wymaganych parametrów id lub locale' });
    }

    // Nowe API Sony (stare /chihiro/ zostało wyłączone)
    const [language, country] = locale.split('-');

    try {
        const psnUrl = `https://store.playstation.com/en-${country}/product/${id}`;

        const response = await fetch(psnUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Accept-Language': locale,
                'Referer': 'https://store.playstation.com/'
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: `Sony API error: ${response.status}` });
        }

        const html = await response.text();

        // Wyciągnij JSON z tagu __NEXT_DATA__
        const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (!match) {
            return res.status(404).json({ error: 'Nie znaleziono danych produktu' });
        }

        const nextData = JSON.parse(match[1]);
        const productData = nextData?.props?.pageProps?.productDetail;

        if (!productData) {
            return res.status(404).json({ error: 'Brak danych produktu w odpowiedzi' });
        }

        // Zwróć ustandaryzowany format
        return res.status(200).json({
            name: productData?.name,
            price: productData?.price?.discountedPrice ?? productData?.price?.basePrice,
            basePrice: productData?.price?.basePrice,
            discount: productData?.price?.discountPercentage ?? 0,
            currency: productData?.price?.currencyCode,
            locale: locale
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
