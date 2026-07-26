export default async function handler(req, res) {
  // Ponieważ hostujesz na Vercelu (ta sama domena), CORS nie jest tu stricte wymagany,
  // ale przydaje się, jeśli testujesz lokalnie.
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Pobieramy conceptId z zapytania (np. /api/psn?conceptId=10002131)
  const { conceptId } = req.query;

  if (!conceptId) {
    return res.status(400).json({ error: 'Brak parametru conceptId' });
  }

  // Wymagane nagłówki dla API Sony (symulacja przeglądarki)
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };

  // Endpoint GraphQL Sony
  const graphqlUrl = 'https://m.np.playstation.net/api/graphql/v1/op';

  // Opcje, które chcemy wyciągnąć (hash zapytania)
  // UWAGA: To jest specyficzne zapytanie 'metGetProductById' używane przez Sony
  const payload = {
    operationName: "metGetProductById",
    variables: {
      productId: conceptId,
    },
    // Ten 'sha256Hash' czasami się zmienia. Gdyby przestało działać, trzeba go wyciągnąć 
    // na nowo z zakładki Network w PS Store.
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: "6c23ceccb2f6efba23a9a202d51197475306354898dc2153c9e6bb07d0f735d4" 
      }
    }
  };

  try {
    const psnResponse = await fetch(graphqlUrl, {
      method: 'POST', // GraphQL zwykle używa POST
      headers: headers,
      body: JSON.stringify(payload)
    });

    if (!psnResponse.ok) {
      const errorText = await psnResponse.text();
      console.error("Sony API Error:", psnResponse.status, errorText);
      throw new Error(`API Sony zwróciło błąd: ${psnResponse.status}`);
    }

    const data = await psnResponse.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error('Wystąpił błąd po stronie Vercela:', error);
    return res.status(500).json({ error: error.message });
  }
}