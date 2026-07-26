export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Pobieramy ID (np. EP9000-PPSA01325_00-GOWRAGNAROK00000)
  const { id, locale = 'pl-PL' } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Brak parametru id' });
  }

  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'x-psn-store-locale-override': locale,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
  };

  const payload = {
    operationName: "metGetProductById",
    variables: { productId: id }, // Podajemy klasyczne Product ID
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: "6c23ceccb2f6efba23a9a202d51197475306354898dc2153c9e6bb07d0f735d4" 
      }
    }
  };

  try {
    const psnResponse = await fetch('https://m.np.playstation.net/api/graphql/v1/op', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });

    const data = await psnResponse.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
