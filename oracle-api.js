/**
 * The Oracle — API Integration Module
 * Sends user profile + selfie to n8n webhook and returns fashion recommendations
 */

const N8N_WEBHOOK_URL = 'https://piyushh.app.n8n.cloud/webhook-test/oracle-stylist';

// Mock recommendations for fallback / demo
const MOCK_RECOMMENDATIONS = [
  {
    id: 1,
    title: "The Power Ensemble",
    category: "Smart Workwear",
    occasion: "Office / Meetings",
    confidence: 97,
    price: "₹4,850",
    brand: "Zara India",
    color: "#1a0a2e",
    accent: "#D4AF37",
    items: ["Tailored Blazer", "Fitted Trousers", "Silk Blouse", "Block Heels"],
    tip: "The structured silhouette elongates your frame and commands presence in any boardroom.",
    badge: "Best Match"
  },
  {
    id: 2,
    title: "Sunday Royale",
    category: "Elevated Casual",
    occasion: "Brunch / Weekend",
    confidence: 92,
    price: "₹2,999",
    brand: "H&M Select",
    color: "#0a1a2e",
    accent: "#C0A030",
    items: ["Linen Co-ord Set", "Minimal Sneakers", "Crossbody Bag"],
    tip: "Neutral tones paired with clean lines create effortless polish without trying too hard.",
    badge: "Trending"
  },
  {
    id: 3,
    title: "Festive Empress",
    category: "Modern Ethnic",
    occasion: "Celebrations / Festivals",
    confidence: 88,
    price: "₹6,200",
    brand: "Fabindia",
    color: "#1a0a0a",
    accent: "#E8B84B",
    items: ["Chanderi Kurta", "Palazzo Pants", "Dupatta", "Juttis"],
    tip: "Rich heritage textiles styled with contemporary cuts — tradition meets the modern Oracle.",
    badge: "Cultural Pick"
  },
  {
    id: 4,
    title: "Active Opulence",
    category: "Athleisure Luxe",
    occasion: "Gym / Studio / Post-workout",
    confidence: 84,
    price: "₹3,400",
    brand: "Decathlon Premium",
    color: "#0a0a1a",
    accent: "#B8A040",
    items: ["High-waist Leggings", "Cropped Sports Bra", "Mesh Jacket", "Runners"],
    tip: "Performance meets prestige — outfit optimised for your body shape and active lifestyle.",
    badge: "Lifestyle Pick"
  }
];

/**
 * Main API function
 * @param {Object} userData - { height, gender, location, style, bodyShape }
 * @param {string|null} imageBase64 - Base64 encoded selfie
 * @returns {Promise<Object>} Recommendation response
 */
async function getOracleRecommendation(userData, imageBase64 = null) {
  const payload = {
    user_data: {
      height: userData.height || '',
      gender: userData.gender || '',
      location: userData.location || '',
      style: userData.style || 'balanced',
      body_shape: userData.bodyShape || ''
    },
    image_data: imageBase64 ? {
      base64_image: imageBase64,
      mime_type: 'image/jpeg'
    } : null,
    timestamp: new Date().toISOString(),
    source: 'the-oracle-app'
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`Oracle API returned ${response.status}, using mock data`);
      return { success: true, source: 'mock', recommendations: MOCK_RECOMMENDATIONS };
    }

    const data = await response.json();

    // If n8n returns recommendations, use them; otherwise use mock
    if (data && data.recommendations && data.recommendations.length > 0) {
      return { success: true, source: 'live', recommendations: data.recommendations };
    } else {
      return { success: true, source: 'mock', recommendations: MOCK_RECOMMENDATIONS };
    }

  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn('Oracle API timed out, using mock recommendations');
    } else {
      console.warn('Oracle API error:', error.message);
    }
    return { success: true, source: 'mock', recommendations: MOCK_RECOMMENDATIONS };
  }
}

export { getOracleRecommendation, MOCK_RECOMMENDATIONS };
