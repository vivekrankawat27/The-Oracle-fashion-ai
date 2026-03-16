/**
 * fashion-ai.js
 * Oracle Fashion AI — Smart Product Recommendation Engine v2.0
 * Uses enriched oracle_products.json + outfit_rules.json for colour-theory-based scoring
 */

const FashionAI = (() => {
  let _products = [];
  let _rules    = {};
  let _loaded   = false;

  // ── Load data ─────────────────────────────────────────────────────
  async function init() {
    if (_loaded) return;
    try {
      const [prodRes, rulesRes] = await Promise.all([
        fetch('oracle_products.json'),
        fetch('outfit_rules.json')
      ]);
      const prodData = await prodRes.json();
      _products = prodData.products || [];
      _rules    = await rulesRes.json();
      _loaded   = true;
      console.log(`[FashionAI] Loaded ${_products.length} products + rules v${_rules.version}`);
    } catch (e) {
      console.warn('[FashionAI] Failed to load data:', e.message);
      _products = [];
      _rules    = {};
      _loaded   = true;
    }
  }

  // ── Scoring engine ────────────────────────────────────────────────
  /**
   * Score a product against user profile (0–100)
   * Weights: colour 35, fabric 20, occasion 20, body_shape 15, skin_tone 10
   */
  function scoreProduct(product, profile) {
    let score = 0;
    const { gender, bodyShape, skinTone, occasion, style } = profile;

    // 1. Gender filter (hard filter)
    if (product.gender && product.gender !== gender && product.gender !== 'unisex') {
      return -1;
    }

    // 2. Colour–skin tone compatibility (0–10)
    const skinTones = product.skin_tone || [];
    if (skinTones.includes(skinTone) || skinTones.includes('all')) {
      score += 10;
    } else if (skinTones.length === 0) {
      score += 5;
    }

    // 3. Body shape compatibility (0–15)
    const shapes = product.shapes || [];
    if (shapes.length === 0) {
      score += 8; // neutral
    } else if (shapes.includes(bodyShape)) {
      score += 15;
    } else {
      score += 3;
    }

    // 4. Occasion match (0–20)
    const occTags = product.occasion_tags || [product.occasion?.toLowerCase()];
    const occasionMap = {
      casual:    ['casual','daily','weekend'],
      formal:    ['formal','office','work'],
      party:     ['party','evening','night out'],
      ethnic:    ['ethnic','cultural','fusion'],
      festive:   ['festive','celebration','traditional'],
      athletic:  ['casual','daily'],
    };
    const userOccTags = occasionMap[occasion?.toLowerCase()] || ['casual'];
    const matchedTags = occTags.filter(t => userOccTags.includes(t));
    score += Math.min(20, matchedTags.length * 8);

    // 5. Style match (0–10 bonus)
    if (style && product.style && product.style.includes(style)) {
      score += 10;
    }

    // 6. Fabric season bonus (0–10 bonus)
    const season = getCurrentSeason();
    const prodSeasons = product.season || ['all-season'];
    if (prodSeasons.includes('all-season') || prodSeasons.includes(season)) {
      score += 5;
    }

    // 7. Rating quality boost (0–5)
    const rating = product.rating || 4.0;
    score += Math.round((rating - 3.5) * 5);

    return Math.max(0, Math.min(100, score));
  }

  // ── Get current season from month ────────────────────────────────
  function getCurrentSeason() {
    const m = new Date().getMonth(); // 0-11
    if (m >= 2 && m <= 5)  return 'spring';
    if (m >= 6 && m <= 8)  return 'summer';
    if (m >= 9 && m <= 10) return 'autumn';
    return 'winter';
  }

  // ── Get outfit pair for a product ─────────────────────────────────
  function getOutfitPairs(product, profile, limit = 3) {
    const pairIds = product.pair_with || [];
    const pairColours = product.pair_colours || [];

    // Find from pair_with IDs first
    let pairs = _products.filter(p =>
      pairIds.includes(p.id) && (p.gender === profile.gender || !p.gender)
    ).slice(0, limit);

    // Top up with colour-theory matches if needed
    if (pairs.length < limit) {
      const extra = _products
        .filter(p =>
          !pairIds.includes(p.id) &&
          p.id !== product.id &&
          pairColours.includes(p.colour) &&
          (p.gender === profile.gender || !p.gender)
        )
        .slice(0, limit - pairs.length);
      pairs = [...pairs, ...extra];
    }

    return pairs.slice(0, limit);
  }

  // ── Main recommend function ───────────────────────────────────────
  /**
   * @param {Object} profile - { gender, bodyShape, skinTone, occasion, style, category? }
   * @param {Object} opts    - { limit, page, sortBy }
   * @returns {Object}       - { products, total, meta }
   */
  function recommend(profile, opts = {}) {
    const { limit = 20, page = 0, sortBy = 'score' } = opts;
    const { category } = profile;

    if (!_loaded || _products.length === 0) {
      return { products: [], total: 0, meta: { loaded: false } };
    }

    // Score all products
    let scored = _products
      .map(p => ({ product: p, score: scoreProduct(p, profile) }))
      .filter(({ score }) => score >= 0);  // remove gender-mismatches

    // Category filter
    if (category && category !== 'all') {
      scored = scored.filter(({ product }) =>
        product.category?.toLowerCase().includes(category.toLowerCase()) ||
        product.sub_category?.toLowerCase().includes(category.toLowerCase())
      );
    }

    // Sort
    if (sortBy === 'score') {
      scored.sort((a, b) => b.score - a.score);
    } else if (sortBy === 'price_asc') {
      scored.sort((a, b) => a.product.price - b.product.price);
    } else if (sortBy === 'price_desc') {
      scored.sort((a, b) => b.product.price - a.product.price);
    } else if (sortBy === 'rating') {
      scored.sort((a, b) => b.product.rating - a.product.rating);
    }

    const total = scored.length;
    const paginated = scored.slice(page * limit, (page + 1) * limit);

    return {
      products: paginated.map(({ product, score }) => ({ ...product, aiScore: score })),
      total,
      page,
      hasMore: (page + 1) * limit < total,
      meta: { loaded: true, season: getCurrentSeason(), scored: total }
    };
  }

  // ── Get full outfit combo ─────────────────────────────────────────
  function getOutfitCombo(productId, profile) {
    const base = _products.find(p => p.id === productId);
    if (!base) return null;
    const pairs = getOutfitPairs(base, profile, 3);
    const colourTip = getColourTip(base.colour);
    return {
      base,
      pairs,
      colourTip,
      outfitScore: Math.round((base.rating || 4) * 20),
    };
  }

  // ── Colour combination tip ────────────────────────────────────────
  function getColourTip(colour) {
    const complements = _rules.colour_theory?.complementary?.[colour] || [];
    if (complements.length === 0) return '';
    const top2 = complements.slice(0, 2).join(' or ');
    return `Pair ${colour} with ${top2} for a colour-theory compliant outfit.`;
  }

  // ── Body shape advice ─────────────────────────────────────────────
  function getBodyShapeAdvice(bodyShape, gender = 'female') {
    const rules = _rules.body_shape_rules?.[bodyShape];
    if (!rules) return null;
    return {
      description:  rules.description,
      recommended:  rules.recommended_tops?.concat(rules.recommended_bottoms || []) || [],
      avoid:        rules.avoid || [],
    };
  }

  // ── Skin tone best colours ────────────────────────────────────────
  function getSkinToneColours(skinTone) {
    return _rules.skin_tone_palette?.[skinTone] || [];
  }

  // ── Get all categories available ─────────────────────────────────
  function getCategories() {
    const cats = new Set(_products.map(p => p.category).filter(Boolean));
    return [...cats];
  }

  // ── Get products by IDs ───────────────────────────────────────────
  function getById(ids) {
    const idSet = new Set(ids);
    return _products.filter(p => idSet.has(p.id));
  }

  // ── Public API ────────────────────────────────────────────────────
  return {
    init,
    recommend,
    getOutfitCombo,
    getColourTip,
    getBodyShapeAdvice,
    getSkinToneColours,
    getCategories,
    getById,
    get isLoaded() { return _loaded; },
    get productCount() { return _products.length; },
  };
})();

// Auto-init on load
window.FashionAI = FashionAI;
FashionAI.init().then(() => {
  console.log(`[FashionAI] Ready — ${FashionAI.productCount} products loaded`);
  window.dispatchEvent(new CustomEvent('fashionai:ready', { detail: { count: FashionAI.productCount } }));
});
