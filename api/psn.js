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

        // Zbierz wszystkie SKU ze wszystkich batarangow
        const allSkus = {};
        const allProducts = {};

        for (const batarangKey of Object.keys(batarangs)) {
            const text = batarangs[batarangKey]?.text;
            if (!text) continue;
            const innerMatch = text.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
            if (!innerMatch) continue;
            let apolloData;
            try { apolloData = JSON.parse(innerMatch[1]); } catch(e) { continue; }
            const cache = apolloData?.cache;
            if (!cache) continue;

            for (const key of Object.keys(cache)) {
                if (key.startsWith('Sku:')) allSkus[key] = cache[key];
                if (key.startsWith('Product:')) allProducts[key] = cache[key];
            }
        }

        return res.status(200).json({ debug: true, skus: allSkus, products: allProducts });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
