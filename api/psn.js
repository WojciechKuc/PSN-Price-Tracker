export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    let id = req.query?.id;
    let locale = req.query?.locale;

    // Awaryjne parsowanie URL gdyby req.query było puste przez rozszerzenia przeglądarki
    if (!id || !locale) {
        try {
            const fullUrl = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
            id = id || fullUrl.searchParams.get('id');
            locale = locale || fullUrl.searchParams.get('locale');
        } catch (e) {}
    }

    // Jeśli nadal brak, zwracamy szczegółowy podgląd błędu do konsoli
    if (!id || !locale) {
        return res.status(400).json({ 
            error: 'Brak wymaganych parametrów', 
            received_url: req.url, 
            received_query: req.query 
        });
    }

    try {
        const psnUrl = `https://store.playstation.com/store/api/chihiro/00_09_000/container/${locale}/1/${id}`;
        
        const response = await fetch(psnUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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
