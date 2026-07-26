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
        const batarangsText = pageProps?.batarangs?.['accessibility-features']?.text;
        if (!batarangsText) return res.status(404).json({ error: 'Brak batarangsText' });

        const innerMatch = batarangsText.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
        if (!innerMatch) return res.status(404).json({ error: 'Brak inner script' });

        const apolloData = JSON.parse(innerMatch[1]);
        const cache = apolloData?.cache;
        if (!cache) return res.status(404).json({ error: 'Brak cache' });

        // Zwroc pelna zawartosc wszystkich kluczy cache do debugowania
        return res.status(200).json({
            debug: true,
            cacheKeys: Object.keys(cache),
            sku: cache['Sku:' + id + '-E002'] || null,
            product: cache['Product:' + id] || null,
            rootQuery: cache['ROOT_QUERY'] || null
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
