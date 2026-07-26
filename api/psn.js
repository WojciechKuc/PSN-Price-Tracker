export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    // Vercel Node runtime dostarcza req.query automatycznie
    const id = req.query?.id;
    const locale = req.query?.locale;

    if (!id || !locale) {
        return res.status(400).json({ error: 'Brak parametrow id lub locale', got: { id, locale, url: req.url } });
    }

    const [lang, country] = locale.toLowerCase().split('-');
    const countryUp = country.toUpperCase();

    const query = `query catalogGetProductById($productId: String!, $country: String!, $language: String!) {
  productRetrieve(productId: $productId, country: $country, language: $language) {
    ... on Product {
      id
      name
      price {
        basePriceValue
        discountedValue
        discountText
        currencyCode
      }
    }
  }
}`;

    const variables = { productId: id, country: countryUp, language: lang };

    try {
        const gqlRes = await fetch('https://web.np.playstation.com/api/graphql/v1/op?operationName=catalogGetProductById', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Origin': 'https://store.playstation.com',
                'Referer': 'https://store.playstation.com/'
            },
            body: JSON.stringify({ operationName: 'catalogGetProductById', variables, query })
        });

        const rawText = await gqlRes.text();

        if (!gqlRes.ok) {
            return res.status(gqlRes.status).json({ error: `PSN error: ${gqlRes.status}`, body: rawText.slice(0, 500) });
        }

        const json = JSON.parse(rawText);
        const product = json?.data?.productRetrieve;

        if (!product) {
            return res.status(404).json({ error: 'Brak produktu', raw: json });
        }

        return res.status(200).json({
            data: {
                productRetrieve: {
                    products: [{ price: product.price }]
                }
            }
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
