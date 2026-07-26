export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    // Wyciągamy parametry niezależnie od tego, jak Vercel je spakował
    const query = req.query || {};
    let id = query.id;
    let locale = query.locale;

    // Awaryjne wyciąganie z pełnego adresu, gdyby req.query zawiodło
    if (!id || !locale) {
        const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
        id = id || url.searchParams.get('id');
        locale = locale || url.searchParams.get('locale');
    }

    if (!id || !locale) {
        return res.status(400).json({ error: "Brak parametrów", debug: { query, url: req.url } });
    }

    try {
        const psnUrl = `https://store.playstation.com/store/api/chihiro/00_09_000/container/${locale}/1/${id}`;
        const response = await fetch(psnUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
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
