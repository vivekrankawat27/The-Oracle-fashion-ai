/**
 * The Oracle — Main Application Logic
 * Handles: Auth, Multi-step profile, Geolocation, Selfie scan, API call, 3D tilt cards
 */

import { getOracleRecommendation } from './oracle-api.js';
import { initOrbScene } from './three-scene.js';

// ───────── STATE ─────────
const state = {
  user: null,  // { email, name }
  profile: {
    height: '',
    heightUnit: 'cm',
    location: '',
    gender: '',
    bodyShape: '',
    style: []
  },
  imageBase64: null,
  currentScreen: 'landing'
};

// Body shapes per gender
const BODY_SHAPES = {
  female: [
    { id: 'hourglass',  label: 'Hourglass',    tag: 'Balanced bust & hip', emoji: '⧖' },
    { id: 'pear',       label: 'Pear',          tag: 'Wider hips',          emoji: '🍐' },
    { id: 'apple',      label: 'Apple',         tag: 'Fuller midsection',   emoji: '🍎' },
    { id: 'rectangle',  label: 'Rectangle',     tag: 'Straight silhouette', emoji: '▭' },
    { id: 'inverted',   label: 'Inv. Triangle', tag: 'Broader shoulders',   emoji: '▽' }
  ],
  male: [
    { id: 'rectangle',  label: 'Rectangle',     tag: 'Balanced build',      emoji: '▭' },
    { id: 'inverted',   label: 'Inv. Triangle', tag: 'Broad shoulders',     emoji: '▽' },
    { id: 'triangle',   label: 'Triangle',      tag: 'Fuller lower body',   emoji: '△' },
    { id: 'oval',       label: 'Oval',          tag: 'Fuller midsection',   emoji: '⬭' },
    { id: 'trapezoid',  label: 'Trapezoid',     tag: 'Athletic build',      emoji: '⬠' }
  ],
  'non-binary': [
    { id: 'rectangle',  label: 'Rectangle',     tag: 'Linear frame',        emoji: '▭' },
    { id: 'hourglass',  label: 'Hourglass',     tag: 'Defined waist',       emoji: '⧖' },
    { id: 'inverted',   label: 'Inv. Triangle', tag: 'Wider shoulders',     emoji: '▽' },
    { id: 'pear',       label: 'Pear',          tag: 'Wider hips',          emoji: '🍐' },
    { id: 'oval',       label: 'Oval',          tag: 'Rounded frame',       emoji: '⬭' }
  ]
};

const STYLE_PREFS = ['Classic', 'Minimal', 'Bohemian', 'Street Style', 'Formal', 'Ethnic', 'Sporty', 'Romantic', 'Edgy', 'Preppy'];

// Recommendation card emojis per category
const CAT_EMOJIS = {
  'Smart Workwear': '👔',
  'Elevated Casual': '✨',
  'Modern Ethnic': '🤍',
  'Athleisure Luxe': '🏃',
  default: '👗'
};

const CAT_GRADIENTS = [
  'linear-gradient(135deg, #1a0a2e, #2e1a4e)',
  'linear-gradient(135deg, #0a1a2e, #1a2e4e)',
  'linear-gradient(135deg, #2e1a00, #4e2e00)',
  'linear-gradient(135deg, #0a1a0a, #1a2e1a)',
];

// ───────── SCREEN NAVIGATION ─────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  const target = document.getElementById(`screen-${id}`);
  if (target) {
    target.style.display = 'flex';
    requestAnimationFrame(() => target.classList.add('active'));
  }
  state.currentScreen = id;

  // Show/hide nav
  const nav = document.getElementById('oracle-nav');
  if (nav) {
    if (id === 'landing') {
      nav.style.opacity = '0';
      nav.style.pointerEvents = 'none';
    } else {
      nav.style.opacity = '1';
      nav.style.pointerEvents = 'all';
      updateNavUser();
    }
  }

  // Init orb on landing
  if (id === 'landing') {
    setTimeout(() => initOrbScene('oracle-canvas'), 100);
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ───────── AUTH ─────────
function setupAuth() {
  const tabLogin  = document.getElementById('tab-login');
  const tabSignup = document.getElementById('tab-signup');
  const formLogin  = document.getElementById('form-login');
  const formSignup = document.getElementById('form-signup');

  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active'); tabSignup.classList.remove('active');
    formLogin.style.display = 'block'; formSignup.style.display = 'none';
  });
  tabSignup.addEventListener('click', () => {
    tabSignup.classList.add('active'); tabLogin.classList.remove('active');
    formSignup.style.display = 'block'; formLogin.style.display = 'none';
  });

  // Login submit
  document.getElementById('btn-login').addEventListener('click', () => {
    const email = document.getElementById('login-email').value.trim();
    const pass  = document.getElementById('login-pass').value.trim();
    const err   = document.getElementById('login-error');
    err.classList.remove('show');

    if (!email || !pass) { err.textContent = 'Please fill in all fields.'; err.classList.add('show'); return; }
    if (!isValidEmail(email)) { err.textContent = 'Please enter a valid email.'; err.classList.add('show'); return; }

    // Check stored user
    const stored = JSON.parse(localStorage.getItem('oracle_user') || 'null');
    if (!stored || stored.email !== email || stored.password !== btoa(pass)) {
      err.textContent = 'Invalid email or password.';
      err.classList.add('show'); return;
    }

    state.user = { email, name: stored.name };
    localStorage.setItem('oracle_session', JSON.stringify(state.user));
    showToast('✦', `Welcome back, ${state.user.name || 'Seeker'}`);
    showScreen('step1');
  });

  // Signup submit
  document.getElementById('btn-signup').addEventListener('click', () => {
    const name  = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const pass  = document.getElementById('signup-pass').value.trim();
    const err   = document.getElementById('signup-error');
    err.classList.remove('show');

    if (!name || !email || !pass) { err.textContent = 'All fields are required.'; err.classList.add('show'); return; }
    if (!isValidEmail(email)) { err.textContent = 'Please enter a valid email.'; err.classList.add('show'); return; }
    if (pass.length < 6) { err.textContent = 'Password must be at least 6 characters.'; err.classList.add('show'); return; }

    const userData = { email, name, password: btoa(pass) };
    localStorage.setItem('oracle_user', JSON.stringify(userData));
    state.user = { email, name };
    localStorage.setItem('oracle_session', JSON.stringify(state.user));
    showToast('✦', `Oracle welcomes you, ${name}`);
    showScreen('step1');
  });
}

// ───────── STEP 1: HEIGHT + LOCATION ─────────
function setupStep1() {
  const unitTabs = document.querySelectorAll('.unit-tab');
  unitTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      unitTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.profile.heightUnit = tab.dataset.unit;
      updateHeightPlaceholder();
    });
  });

  document.getElementById('btn-get-location').addEventListener('click', getLocation);
  document.getElementById('btn-next-1').addEventListener('click', () => {
    const height = document.getElementById('height-input').value.trim();
    if (!height) { showToast('⚠', 'Please enter your height.'); return; }
    state.profile.height = `${height} ${state.profile.heightUnit}`;
    showScreen('step2');
    updateProgress(2);
  });
  document.getElementById('btn-back-1').addEventListener('click', () => showScreen('auth'));
}

function updateHeightPlaceholder() {
  const input = document.getElementById('height-input');
  input.placeholder = state.profile.heightUnit === 'cm' ? 'e.g. 165' : 'e.g. 5.5';
}

async function getLocation() {
  const btn = document.getElementById('btn-get-location');
  const badge = document.getElementById('location-badge');
  btn.textContent = '⟳ Detecting…';
  btn.disabled = true;

  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000 })
    );
    const { latitude, longitude } = pos.coords;
    // Reverse geocode
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`);
    const data = await r.json();
    const city = data.address?.city || data.address?.town || data.address?.county || 'Your City';
    const state_r = data.address?.state || '';
    state.profile.location = `${city}${state_r ? ', ' + state_r : ''}, India`;
  } catch {
    // Fallback to IP
    try {
      const r = await fetch('https://ipapi.co/json/');
      const d = await r.json();
      state.profile.location = `${d.city || 'India'}, ${d.region || ''}, India`;
    } catch {
      state.profile.location = 'India';
    }
  }

  badge.textContent = `📍 ${state.profile.location}`;
  badge.style.display = 'flex';
  btn.textContent = '✓ Location Confirmed';
  btn.classList.add('btn-outline');
  btn.classList.remove('btn-ghost');
}

// ───────── STEP 2: GENDER ─────────
function setupStep2() {
  document.getElementById('btn-next-2').addEventListener('click', () => {
    if (!state.profile.gender) { showToast('⚠', 'Please select a gender option.'); return; }
    renderBodyShapes();
    showScreen('step3');
    updateProgress(3);
  });
  document.getElementById('btn-back-2').addEventListener('click', () => showScreen('step1'));
}

function setupGenderCards() {
  document.querySelectorAll('.gender-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.gender-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      state.profile.gender = card.dataset.gender;
    });
  });
}

// ───────── STEP 3: BODY SHAPE + STYLE ─────────
function renderBodyShapes() {
  const grid = document.getElementById('body-grid');
  const gender = state.profile.gender || 'female';
  const shapes = BODY_SHAPES[gender] || BODY_SHAPES['female'];

  grid.innerHTML = shapes.map(s => `
    <div class="body-card" data-shape="${s.id}">
      <div class="body-svg-wrap" style="font-size:2.8rem;line-height:1">${s.emoji}</div>
      <div class="body-label">${s.label}</div>
      <div class="body-tag">${s.tag}</div>
    </div>
  `).join('');

  grid.querySelectorAll('.body-card').forEach(card => {
    card.addEventListener('click', () => {
      grid.querySelectorAll('.body-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      state.profile.bodyShape = card.dataset.shape;
    });
  });
}

function renderStyleTags() {
  const container = document.getElementById('style-tags');
  container.innerHTML = STYLE_PREFS.map(s => `
    <button class="style-tag" data-style="${s}">${s}</button>
  `).join('');
  container.querySelectorAll('.style-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      tag.classList.toggle('active');
      const style = tag.dataset.style;
      if (state.profile.style.includes(style)) {
        state.profile.style = state.profile.style.filter(s => s !== style);
      } else {
        state.profile.style.push(style);
      }
    });
  });
}

function setupStep3() {
  document.getElementById('btn-next-3').addEventListener('click', () => {
    if (!state.profile.bodyShape) { showToast('⚠', 'Please select your body shape.'); return; }
    showScreen('scan');
    updateProgress(4);
  });
  document.getElementById('btn-back-3').addEventListener('click', () => {
    showScreen('step2');
    updateProgress(2);
  });
}

// ───────── SACRED SCAN ─────────
function setupScan() {
  const scanZone = document.getElementById('scan-zone');
  const scanInput = document.getElementById('scan-input');
  const preview = document.getElementById('scan-preview');
  const placeholder = document.getElementById('scan-placeholder');

  scanZone.addEventListener('click', () => scanInput.click());

  scanInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('⚠', 'Please select an image file.'); return; }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target.result;
      // Show preview
      preview.src = result;
      preview.style.display = 'block';
      placeholder.style.display = 'none';
      scanZone.classList.add('has-image');

      // Store Base64 (strip the data: prefix for API)
      state.imageBase64 = result.split(',')[1];
      showToast('✓', 'Selfie captured. Ready to consult.');
    };
    reader.readAsDataURL(file);
  });

  // Drag & drop
  scanZone.addEventListener('dragover', (e) => { e.preventDefault(); scanZone.classList.add('dragover'); });
  scanZone.addEventListener('dragleave', () => scanZone.classList.remove('dragover'));
  scanZone.addEventListener('drop', (e) => {
    e.preventDefault(); scanZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) scanInput.files = e.dataTransfer.files;
    scanInput.dispatchEvent(new Event('change'));
  });

  document.getElementById('btn-consult').addEventListener('click', async () => {
    if (!state.imageBase64) {
      // Allow proceeding without image for demo
      const proceed = confirm('No selfie uploaded. Proceed with text-based profile only?');
      if (!proceed) return;
    }
    await consultOracle();
  });

  document.getElementById('btn-back-scan').addEventListener('click', () => {
    showScreen('step3');
    updateProgress(3);
  });
}

// ───────── API CALL + LOADING ─────────
async function consultOracle() {
  showLoading(true);
  await animateLoadingSteps();

  const userData = {
    height: state.profile.height,
    gender: state.profile.gender,
    location: state.profile.location,
    style: state.profile.style.join(', '),
    bodyShape: state.profile.bodyShape
  };

  try {
    const result = await getOracleRecommendation(userData, state.imageBase64);
    showLoading(false);
    if (result.success) {
      renderResults(result.recommendations, result.source);
      showScreen('results');
      setTimeout(setupTiltCards, 200);
      if (result.source === 'mock') {
        showToast('◈', 'Showing curated mock recommendations (n8n demo mode)');
      } else {
        showToast('✦', 'Live Oracle recommendations received!');
      }
    }
  } catch (err) {
    showLoading(false);
    showToast('⚠', 'Error consulting Oracle. Please try again.');
    console.error(err);
  }
}

function animateLoadingSteps() {
  return new Promise(resolve => {
    const steps = document.querySelectorAll('.loading-step');
    let i = 0;
    const advance = () => {
      if (i > 0) { steps[i-1].classList.remove('active'); steps[i-1].classList.add('done'); }
      if (i < steps.length) {
        steps[i].classList.add('active'); i++;
        setTimeout(advance, 900);
      } else { setTimeout(resolve, 400); }
    };
    advance();
  });
}

function showLoading(show) {
  const overlay = document.getElementById('loading-overlay');
  if (show) { overlay.classList.add('show'); }
  else { overlay.classList.remove('show'); }
}

// ───────── RESULTS ─────────
function renderResults(recs, source) {
  const grid = document.getElementById('rec-grid');
  const meta = document.getElementById('results-meta');

  meta.innerHTML = `
    <div class="meta-pill">◆ ${state.profile.gender || 'All'}</div>
    <div class="meta-pill">📍 ${state.profile.location || 'India'}</div>
    <div class="meta-pill">◈ ${state.profile.bodyShape || 'Universal'}</div>
    <div class="meta-pill">${source === 'live' ? '🟢 Live AI' : '◇ Curated Demo'}</div>
  `;

  // ── Oracle Outfit Cards (n8n or mock) ───────────────────────────
  const outfitHTML = recs.map((rec, idx) => {
    const emoji = CAT_EMOJIS[rec.category] || CAT_EMOJIS.default;
    const gradient = CAT_GRADIENTS[idx % CAT_GRADIENTS.length];
    const items = Array.isArray(rec.items)
      ? rec.items.map(item => `<div class="rec-item">${item}</div>`).join('')
      : '';

    return `
      <div class="rec-card" data-idx="${idx}">
        <div class="rec-card-glow"></div>
        <div class="rec-card-header" style="background:${gradient}">
          ${rec.badge ? `<div class="rec-card-badge">${rec.badge}</div>` : ''}
          <div class="rec-confidence">${rec.confidence || '90'}% match</div>
          <div class="rec-emoji">${emoji}</div>
        </div>
        <div class="rec-body">
          <div class="rec-category">${rec.category || 'Style'}</div>
          <div class="rec-title">${rec.title}</div>
          <div class="rec-items">${items}</div>
          ${rec.tip ? `<div class="rec-tip">"${rec.tip}"</div>` : ''}
          <div class="rec-footer">
            <div>
              <div class="rec-price">${rec.price || '₹2,999'}</div>
              <div class="rec-brand">${rec.brand || ''}</div>
            </div>
            ${rec.occasion ? `<div class="rec-occasion">${rec.occasion}</div>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // ── AI Product Grid from enriched oracle_products.json ──────────
  let productHTML = '';
  if (window.FashionAI && window.FashionAI.isLoaded) {
    const profile = {
      gender:     state.profile.gender || 'female',
      bodyShape:  state.profile.bodyShape || 'rectangle',
      skinTone:   state.profile.skinTone || 'medium',
      occasion:   state.profile.style?.[0] || 'casual',
      style:      (state.profile.style || []).join(' '),
    };

    const result = window.FashionAI.recommend(profile, { limit: 24 });
    const bodyAdvice = window.FashionAI.getBodyShapeAdvice(profile.bodyShape, profile.gender);

    if (result.products.length > 0) {
      const bodyTipHTML = bodyAdvice ? `
        <div class="ai-body-tip">
          <span class="ai-tip-icon">◈</span>
          <strong>For your ${profile.bodyShape} shape:</strong>
          ${bodyAdvice.recommended.slice(0,4).join(' · ')}
        </div>
      ` : '';

      const productCards = result.products.map(p => {
        const score = p.aiScore || 0;
        const scoreBar = Math.round(score / 10) * 10;
        const colourTip = window.FashionAI.getColourTip(p.colour);
        const seasonTag = (p.season || ['all-season'])[0];
        const img = p.img_url || `Images/${p.id}.jpg`;
        return `
          <div class="product-card" data-id="${p.id}" data-img="${img}">
            <div class="product-score-bar" style="width:${scoreBar}%"></div>
            <div class="product-img-wrap">
              <img src="${img}" alt="${p.title}" loading="lazy"
                   onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 120%22><rect width=%22100%22 height=%22120%22 fill=%22%23141428%22/><text x=%2250%22 y=%2265%22 text-anchor=%22middle%22 fill=%22%23D4AF37%22 font-size=%2232%22>${p.emoji||'👗'}</text></svg>'"/>
              <div class="product-ai-badge" title="AI Match Score: ${score}%">${score}%</div>
              <div class="product-btn-vto" onclick="event.stopPropagation(); openVTO(this)"
                   data-product-img="${img}"
                   data-product-id="${p.id}"
                   data-product-title="${p.title}">
                ◈ Try On
              </div>
            </div>
            <div class="product-info">
              <div class="product-tags">
                <span class="product-tag fabric-tag">${p.fabric||'cotton'}</span>
                <span class="product-tag season-tag">${seasonTag}</span>
                ${p.sub_category ? `<span class="product-tag">${p.sub_category}</span>` : ''}
              </div>
              <div class="product-title">${p.title}</div>
              <div class="product-meta">
                <span class="product-price">${p.price_fmt || '₹'+p.price}</span>
                <span class="product-brand">${p.brand}</span>
              </div>
              ${colourTip ? `<div class="product-colour-tip">🎨 ${colourTip}</div>` : ''}
              <div class="product-rating">★ ${p.rating?.toFixed(1)||'4.0'} <span>(${p.rating_count?.toLocaleString()||'0'})</span></div>
            </div>
          </div>
        `;
      }).join('');

      productHTML = `
        <div class="ai-products-section">
          <div class="ai-products-header">
            <div class="ai-products-title">◆ AI-Matched Products for You</div>
            <div class="ai-products-subtitle">${result.total} items scored by Oracle AI · Season: ${result.meta.season}</div>
          </div>
          ${bodyTipHTML}
          <div class="ai-products-grid">${productCards}</div>
        </div>
      `;
    }
  }

  grid.innerHTML = outfitHTML + productHTML;

  // Inject product card styles if not already present
  if (!document.getElementById('ai-product-styles')) {
    const style = document.createElement('style');
    style.id = 'ai-product-styles';
    style.textContent = `
      .ai-products-section { margin-top: 2.5rem; width: 100%; }
      .ai-products-header  { text-align: center; margin-bottom: 1rem; }
      .ai-products-title   { font-size: 1.4rem; color: #D4AF37; font-family: 'Cormorant Garamond', serif; }
      .ai-products-subtitle{ font-size: 0.8rem; color: rgba(255,255,255,0.5); margin-top: 0.3rem; }
      .ai-body-tip         { background: rgba(212,175,55,0.08); border: 1px solid rgba(212,175,55,0.2); border-radius: 10px; padding: 0.7rem 1rem; margin-bottom: 1.2rem; font-size: 0.82rem; color: rgba(255,255,255,0.75); display: flex; gap: 0.5rem; }
      .ai-tip-icon         { color: #D4AF37; font-size: 1rem; }
      .ai-products-grid    { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 1.2rem; }
      .product-card        { background: rgba(20,20,40,0.9); border: 1px solid rgba(212,175,55,0.12); border-radius: 14px; overflow: hidden; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; position: relative; }
      .product-card:hover  { transform: translateY(-4px); box-shadow: 0 8px 30px rgba(212,175,55,0.15); border-color: rgba(212,175,55,0.4); }
      .product-score-bar   { height: 3px; background: linear-gradient(90deg, #D4AF37, #F0D060); transition: width 0.5s; }
      .product-img-wrap    { position: relative; height: 220px; overflow: hidden; }
      .product-img-wrap img{ width: 100%; height: 100%; object-fit: cover; }
      .product-ai-badge    { position: absolute; top: 8px; right: 8px; background: rgba(212,175,55,0.9); color: #0a0a1a; font-size: 0.7rem; font-weight: 700; padding: 3px 7px; border-radius: 20px; }
      .product-btn-vto     { position: absolute; bottom: 0; left: 0; right: 0; background: rgba(212,175,55,0.85); color: #0a0a1a; text-align: center; padding: 8px; font-size: 0.78rem; font-weight: 700; opacity: 0; transition: opacity 0.2s; cursor: pointer; letter-spacing: 1px; }
      .product-card:hover .product-btn-vto { opacity: 1; }
      .product-info        { padding: 0.8rem; }
      .product-tags        { display: flex; gap: 0.35rem; flex-wrap: wrap; margin-bottom: 0.4rem; }
      .product-tag         { font-size: 0.62rem; background: rgba(212,175,55,0.1); color: #D4AF37; padding: 2px 6px; border-radius: 20px; border: 1px solid rgba(212,175,55,0.2); text-transform: capitalize; }
      .product-title       { font-size: 0.82rem; color: rgba(255,255,255,0.9); line-height: 1.3; margin-bottom: 0.4rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .product-meta        { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.3rem; }
      .product-price       { color: #D4AF37; font-weight: 700; font-size: 0.9rem; }
      .product-brand       { font-size: 0.7rem; color: rgba(255,255,255,0.4); }
      .product-colour-tip  { font-size: 0.68rem; color: rgba(212,175,55,0.7); margin-top: 0.3rem; line-height: 1.3; }
      .product-rating      { font-size: 0.72rem; color: #F0D060; margin-top: 0.3rem; }
      .product-rating span { color: rgba(255,255,255,0.35); font-size: 0.65rem; }
    `;
    document.head.appendChild(style);
  }
}


// ───────── 3D TILT CARDS ─────────
function setupTiltCards() {
  document.querySelectorAll('.rec-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top  + rect.height / 2;
      const dx = (e.clientX - cx) / (rect.width / 2);
      const dy = (e.clientY - cy) / (rect.height / 2);
      const tiltX = dy * -12;
      const tiltY = dx * 14;
      card.style.transform = `perspective(900px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale3d(1.03,1.03,1.03)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)';
    });
  });
}

// ───────── PROGRESS BAR ─────────
function updateProgress(activeStep) {
  document.querySelectorAll('.progress-step').forEach((s, i) => {
    s.classList.remove('active', 'done');
    if (i + 1 < activeStep) s.classList.add('done');
    else if (i + 1 === activeStep) s.classList.add('active');
  });
}

// ───────── NAV USER ─────────
function updateNavUser() {
  const chip = document.getElementById('nav-user-chip');
  const avatar = document.getElementById('nav-avatar');
  if (!chip || !state.user) return;
  const n = state.user.name || state.user.email || 'Seeker';
  chip.querySelector('.nav-name').textContent = n.split(' ')[0];
  avatar.textContent = n[0].toUpperCase();
}

// ───────── TOAST ─────────
function showToast(icon, msg) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(20px)'; toast.style.transition = 'all 0.3s'; setTimeout(() => toast.remove(), 300); }, 3500);
}

// ───────── UTILITIES ─────────
function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

function checkExistingSession() {
  const session = JSON.parse(localStorage.getItem('oracle_session') || 'null');
  if (session) { state.user = session; }
}

// ───────── INIT ─────────
document.addEventListener('DOMContentLoaded', () => {
  checkExistingSession();

  // Landing CTA
  document.getElementById('btn-start')?.addEventListener('click', () => showScreen('auth'));
  document.getElementById('btn-start-2')?.addEventListener('click', () => showScreen('auth'));

  // Logout
  document.getElementById('btn-logout')?.addEventListener('click', () => {
    localStorage.removeItem('oracle_session');
    state.user = null;
    showScreen('landing');
  });

  // Redo scan from results
  document.getElementById('btn-redo')?.addEventListener('click', () => {
    state.imageBase64 = null;
    document.getElementById('scan-preview').style.display = 'none';
    document.getElementById('scan-placeholder').style.display = 'flex';
    document.getElementById('scan-zone').classList.remove('has-image');
    showScreen('scan');
  });

  // Results restart
  document.getElementById('btn-restart')?.addEventListener('click', () => {
    state.profile = { height: '', heightUnit: 'cm', location: '', gender: '', bodyShape: '', style: [] };
    state.imageBase64 = null;
    showScreen('step1');
    updateProgress(1);
  });

  // Setup all screens
  setupAuth();
  setupStep1();
  setupStep2();
  setupStep3();
  setupScan();
  setupGenderCards();
  renderStyleTags();

  // Start on landing
  showScreen('landing');
});
