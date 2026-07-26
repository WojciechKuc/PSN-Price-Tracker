export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    let id, locale;

    // 1. Próba pobrania przez standardowy Node.js / Express (req.query)
    if (req.query) {
        id = req.query.id;
        locale = req.query.locale;
    }

    // 2. Awaryjne parsowanie z adresu URL (dla Edge / Web Request / Vercel Runtime)
    if (!id || !locale) {
        try {
            const host = (req.headers && typeof req.headers.get === 'function') 
                ? req.headers.get('host') 
                : (req.headers?.host || 'localhost');
                
            const fullUrl = new URL(req.url, `https://${host}`);
            id = id || fullUrl.searchParams.get('id');
            locale = locale || fullUrl.searchParams.get('locale');
        } catch (e) {}
    }

    if (!id || !locale) {
        return res.status(400).json({ error: 'Brak wymaganych parametrów id lub locale' });
    }

    try {
        const psnUrl = `https://store.playstation.com/store/api/chihiro/00_09_000/container/${locale}/1/${id}`;
        
        const response = await fetch(psnUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': locale
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: `Sony API error: ${response.status}` });
        }

        const data = await response.json();
        return res.status(200).json(data);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
