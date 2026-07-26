export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['host'] || 'localhost';
    const fullUrl = new URL(req.url, `${protocol}://${host}`);

    const id = fullUrl.searchParams.get('id');
    const locale = fullUrl.searchParams.get('locale');

    if (!id || !locale) {
        return res.status(400).json({ error: 'Brak wymaganych parametrow id lub locale' });
    }

    // Mapowanie locale -> country code dla PSN GraphQL
    const [lang, country] = locale.toLowerCase().split('-');
    const countryUp = country.toUpperCase();

    const query = `query catalogGetProductById($productId: String!, $country: String!, $language: String!) {
  productRetrieve(productId: $productId, country: $country, language: $language) {
    ... on Product {
      id
      name
      localizedStoreDisplayClassification
      price {
        basePriceValue
        discountedValue
        discountText
        currencyCode
        serviceBranding
      }
    }
  }
}`;

    const variables = {
        productId: id,
        country: countryUp,
        language: lang
    };

    try {
        const gqlRes = await fetch('https://web.np.playstation.com/api/graphql/v1/op?operationName=catalogGetProductById', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Origin': 'https://store.playstation.com',
                'Referer': 'https://store.playstation.com/',
                'x-psn-store-locale-override': locale
            },
            body: JSON.stringify({ operationName: 'catalogGetProductById', variables, query })
        });

        if (!gqlRes.ok) {
            return res.status(gqlRes.status).json({ error: `PSN GraphQL error: ${gqlRes.status}` });
        }

        const json = await gqlRes.json();

        // Owijamy w strukture ktorej oczekuje index.html:
        // data?.data?.productRetrieve?.products?.[0]?.price
        const product = json?.data?.productRetrieve;
        if (!product) {
            return res.status(404).json({ error: 'Nie znaleziono produktu', raw: json });
        }

        return res.status(200).json({
            data: {
                productRetrieve: {
                    products: [{
                        price: product.price
                    }]
                }
            }
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
