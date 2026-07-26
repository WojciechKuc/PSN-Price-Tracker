function normalizeText(value) {
    return String(value || '').toLowerCase();
}

function isTrialOrSubscriptionCandidate(key, value, price) {
    const blob = normalizeText([
        key,
        value?.name,
        value?.invariantName,
        value?.typeName,
        value?.__typename,
        value?.ctaType,
        value?.serviceBranding,
        price?.serviceBranding
    ].join(' '));

    return (
        blob.includes('trial') ||
        blob.includes('game trial') ||
        blob.includes('wersja próbna') ||
        blob.includes('playstation plus') ||
        blob.includes('ps plus') ||
        blob.includes('premium') ||
        blob.includes('subscription')
    );
}

function makeCandidate(key, value, fallbackName, sourcePrefix) {
    const price = pickPrice(value?.price);
    if (!price) return null;

    return {
        key,
        name: value?.name || value?.invariantName || fallbackName,
        ...price,
        source: `${sourcePrefix}:${key}`,
        isTrialOrSubscription: isTrialOrSubscriptionCandidate(key, value, price),
        hasDiscount:
            !!price.basePrice &&
            !!price.discountedPrice &&
            price.basePrice !== price.discountedPrice
    };
}

function findAnyPrice(cache, id) {
    const directProduct = cache[`Product:${id}`];
    const fallbackName = directProduct?.name || directProduct?.invariantName || id;
    const candidates = [];

    if (directProduct) {
        const direct = makeCandidate(`Product:${id}`, directProduct, fallbackName, 'product-direct');
        if (direct) candidates.push(direct);

        if (Array.isArray(directProduct.webctas)) {
            for (const ref of directProduct.webctas) {
                const key = ref?.__ref;
                if (!key) continue;
                const cta = cache[key];
                const candidate = makeCandidate(key, cta, fallbackName, 'product-webcta');
                if (candidate) candidates.push(candidate);
            }
        }
    }

    for (const [key, value] of Object.entries(cache)) {
        if (!value || typeof value !== 'object') continue;

        const keyHasId = key.includes(id);
        const valueHasId =
            value.productId === id ||
            value.id === id ||
            value.webctas?.some?.(x => x?.__ref?.includes?.(id));

        if (!keyHasId && !valueHasId) continue;

        const candidate = makeCandidate(key, value, fallbackName, 'cache-scan');
        if (candidate) candidates.push(candidate);
    }

    if (!candidates.length) {
        return directProduct
            ? {
                  name: fallbackName,
                  source: 'product-no-price'
              }
            : null;
    }

    const nonTrial = candidates.filter(c => !c.isTrialOrSubscription);
    const pool = nonTrial.length ? nonTrial : candidates;

    pool.sort((a, b) => {
        const aScore =
            (a.source.startsWith('product-direct') ? 100 : 0) +
            (a.source.startsWith('product-webcta') ? 50 : 0) +
            (a.hasDiscount ? 20 : 0);

        const bScore =
            (b.source.startsWith('product-direct') ? 100 : 0) +
            (b.source.startsWith('product-webcta') ? 50 : 0) +
            (b.hasDiscount ? 20 : 0);

        return bScore - aScore;
    });

    return pool[0];
}
