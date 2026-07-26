export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    const { id, locale } = req.query;
    if (!id || !locale) {
        return res.status(400).json({ error: 'Brak ID lub locale' });
    }

    try {
        const psnUrl = `https://store.playstation.com/store/api/chihiro/00_09_000/container/${locale}/1/${id}`;
        const response = await fetch(psnUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: 'Nie znaleziono produktu' });
        }

        const data = await response.json();
        return res.status(200).json(data);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}