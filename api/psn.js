export default async function handler(req, res) {
    // Nagłówki CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    // W czystym Node.js na Vercelu parsujemy parametry bezpośrednio z req.url
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['host'] || 'localhost';
    const fullUrl = new URL(req.url, `${protocol}://${host}`);

    const id = fullUrl.searchParams.get('id');
    const locale = fullUrl.searchParams.get('locale');

    // Jeśli brakuje parametrów, zwracamy jasny komunikat
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
