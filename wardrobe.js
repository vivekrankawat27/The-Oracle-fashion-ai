/**
 * wardrobe.js — My Wardrobe Module
 *
 * matchGarment() posts to n8n wardrobe-match webhook, shows a scanning
 * animation overlay, renders Oracle's Advice box + 3 "Why it Matches" cards.
 */

// ── Config ─────────────────────────────────────────────────────────────
const WRD_N8N_URL  = 'https://piyushh.app.n8n.cloud/webhook-test/wardrobe-match';
const WRD_N8N_PROD = 'https://piyushh.app.n8n.cloud/webhook/wardrobe-match';
const WRD_TIMEOUT  = 30000;

// ── Module state ────────────────────────────────────────────────────────
const _wrd = {
  matchType:    'bottom',   // 'top' | 'bottom'
  imageBase64:  null,
  dominantColour: '#888888',
  lastItems:    [],
};

const _w$ = id => document.getElementById(id);

// ── Toggle handler (replaces old setWardrobeMode) ───────────────────────
window.setWardrobeMode = function(btn) {
  document.querySelectorAll('.wrd-tog-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _wrd.matchType = btn.dataset.mode; // 'top' | 'bottom'
};

// ── Enable / disable Find My Match button ────────────────────────────────
function _wrdSetBtnState(hasImage) {
  const btn  = _w$('btn-wrd-match');
  const wrap = _w$('wrd-btn-wrap');
  if (!btn) return;
  if (hasImage) {
    btn.disabled = false;
    btn.style.opacity = '1';
    if (wrap) wrap.title = '';
  } else {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    if (wrap) wrap.title = 'Please upload a photo of your garment first.';
  }
}

// ── Show / hide scanning overlay on the wardrobe zone ───────────────────
function _wrdShowScanning(visible) {
  const ov = _w$('wrd-scanning-overlay');
  if (ov) ov.style.display = visible ? 'flex' : 'none';
}

// ── Setup wardrobe zone (extends existing setupWardrobe in index.html) ───
function setupWardrobeEnhanced() {
  const zone = _w$('wardrobe-zone');
  const inp  = _w$('wrd-input');
  const prev = _w$('wrd-preview');
  const ph   = _w$('wrd-placeholder');
  const sl   = _w$('wrd-scanline');

  if (!zone || !inp) return;

  // Disable btn initially
  _wrdSetBtnState(false);

  // Click to upload
  zone.onclick = () => inp.click();

  // Drag & drop
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) {
      const dt = new DataTransfer(); dt.items.add(e.dataTransfer.files[0]);
      inp.files = dt.files; inp.dispatchEvent(new Event('change'));
    }
  });

  inp.onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = ev => {
      prev.src = ev.target.result;
      prev.style.display = 'block';
      if (ph) ph.style.display = 'none';
      zone.classList.add('has-image');
      _wrd.imageBase64 = ev.target.result.split(',')[1];

      // Activate scan-line animation
      sl?.classList.add('scanning');
      setTimeout(() => {
        sl?.classList.remove('scanning');
        // Extract dominant colour
        try {
          if (window.extractDominantColour) {
            const col = extractDominantColour(prev);
            _wrd.dominantColour = col;
            if (_w$('wrd-colour-swatch')) _w$('wrd-colour-swatch').style.background = col;
            if (_w$('wrd-colour-name')) {
              const name = window.hueName ? hueName(col) : col;
              _w$('wrd-colour-name').textContent = name + ' · ' + col;
            }
            const ci = _w$('wrd-colour-info');
            if (ci) ci.style.display = 'block';
          }
        } catch { _wrd.dominantColour = '#888888'; }

        _wrdSetBtnState(true);
        if (window.toast) toast('✓', 'Garment scanned — ready for Oracle matching!');
        else if (window.showToast) showToast('✓', 'Garment scanned!');
      }, 2200);
    };
    rd.readAsDataURL(f);
  };
}

// ════════════════════════════════════════════════════════════════════════
//  MAIN: matchGarment — POST to n8n wardrobe-match
// ════════════════════════════════════════════════════════════════════════
async function matchGarment() {
  if (!_wrd.imageBase64) {
    if (window.toast) toast('⚠', 'Please upload a photo of your garment first.');
    return;
  }

  const btn = _w$('btn-wrd-match');
  if (btn) { btn.disabled = true; btn.textContent = '◈ Consulting Oracle…'; }

  // Show overlay on garment zone
  _wrdShowScanning(true);

  // ── Build payload ─────────────────────────────────────────────────────
  const profile  = window.state?.profile || {};
  const location = profile.location || profile.city || 'India';
  const style    = (profile.style?.length ? profile.style[0] : null) || 'old_money';

  const payload = {
    owned_item_image: _wrd.imageBase64,
    match_type:       _wrd.matchType,       // 'top' | 'bottom'
    location:         location,
    style:            style,
    // extra context
    dominant_colour:  _wrd.dominantColour,
    user_profile: {
      gender:    profile.gender    || 'female',
      bodyShape: profile.bodyShape || 'hourglass',
      skinTone:  profile.skinTone  || 'medium',
      budget:    profile.budget    || 10000,
    },
  };

  // ── POST with 30s timeout ─────────────────────────────────────────────
  let responseData = null;
  let lastErr      = null;
  const ctrl       = new AbortController();
  const t          = setTimeout(() => ctrl.abort(), WRD_TIMEOUT);

  try {
    for (const endpoint of [WRD_N8N_URL, WRD_N8N_PROD]) {
      try {
        const res = await fetch(endpoint, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
          signal:  ctrl.signal,
        });
        clearTimeout(t);
        if (!res.ok) { lastErr = `HTTP ${res.status}`; continue; }
        responseData = await res.json();
        break;
      } catch (e) {
        lastErr = e.message;
        if (e.name === 'AbortError') break;
      }
    }
  } catch (e) {
    lastErr = e.message;
  }

  clearTimeout(t);
  _wrdShowScanning(false);
  if (btn) { btn.disabled = false; btn.textContent = '◆  Find My Match'; }
  _wrdSetBtnState(true);

  // ── Parse response ────────────────────────────────────────────────────
  let items      = [];
  let adviceTip  = null;

  if (responseData) {
    // Expected: { items: [{title, why_it_matches, price, img_url?, brand?}], styling_tip }
    const arr = responseData.items || responseData.matches || responseData.recommendations || null;
    if (Array.isArray(arr)) items = arr.slice(0, 3);
    adviceTip = responseData.styling_tip || responseData.advice || responseData.tip || null;
  }

  // ── Fallback to colour-theory if n8n gave nothing ────────────────────
  if (items.length === 0) {
    items = _wrdFallbackItems();
    adviceTip = adviceTip || _wrdFallbackAdvice();
  }

  _wrd.lastItems = items;

  // ── Update results subtitle ───────────────────────────────────────────
  const matchLabel = _wrd.matchType === 'top' ? 'tops' : 'bottoms';
  const sub = _w$('wrd-results-subtitle');
  if (sub) sub.textContent = `3 perfect ${matchLabel} matched to your uploaded garment via colour theory & AI`;

  // ── Update colour wheel display ───────────────────────────────────────
  _wrdUpdateColourWheel();

  // ── Render Oracle's Advice box ────────────────────────────────────────
  const adviceBox  = _w$('wrd-oracle-advice');
  const adviceText = _w$('wrd-advice-text');
  if (adviceTip && adviceBox && adviceText) {
    adviceText.textContent = adviceTip;
    adviceBox.style.display = 'block';
  } else if (adviceBox) {
    adviceBox.style.display = 'none';
  }

  // ── Render 3-card match grid ──────────────────────────────────────────
  _wrdRenderMatchGrid(items);

  // Navigate to results
  if (window.showScreen) showScreen('wardrobe-results');
}

// ── Colour wheel display ─────────────────────────────────────────────────
function _wrdUpdateColourWheel() {
  const cwDisplay = _w$('wrd-colour-wheel-display');
  if (!cwDisplay) return;
  try {
    if (window.getColourMatches) {
      const matches = getColourMatches(_wrd.dominantColour);
      const labels = [
        { hex: _wrd.dominantColour, label: 'Your Garment' },
        { hex: matches.complementary[0], label: 'Complementary' },
        { hex: matches.analogous[0],     label: 'Analogous' },
        { hex: matches.triadic[0],       label: 'Triadic' },
      ];
      cwDisplay.innerHTML = labels.map(cl =>
        `<div style="text-align:center">
          <div style="width:36px;height:36px;border-radius:50%;background:${cl.hex};border:2px solid rgba(212,175,55,.5);margin:0 auto .4rem;"></div>
          <div style="font-size:.7rem;color:var(--slate-light,rgba(255,255,255,.45));">${cl.label}</div>
        </div>`
      ).join('<div style="color:var(--gold,#D4AF37);font-size:1.2rem;align-self:center;">→</div>');
    }
  } catch { cwDisplay.innerHTML = ''; }
}

// ── Render 3 elegant match cards ─────────────────────────────────────────
function _wrdRenderMatchGrid(items) {
  const grid = _w$('wrd-match-grid');
  if (!grid) return;

  const matchLabel = _wrd.matchType === 'top' ? 'TOP' : 'BOTTOM';
  const badgeLabels = ['✦ Best Match', '◈ Colour Harmony', '◆ Style Sync'];

  grid.innerHTML = items.map((item, i) => {
    const title      = item.title || item.name  || `Match ${i + 1}`;
    const whyText    = item.why_it_matches || item.reason || item.why || item.tip
                     || `Complements your garment via ${['complementary','analogous','triadic'][i % 3]} colour theory.`;
    const price      = item.price_fmt || item.price || '₹999';
    const imgUrl     = item.img_url   || item.img   || '';
    const brand      = item.brand     || '';
    const badge      = badgeLabels[i] || '◈ Match';

    return `
      <div class="wrd-match-card">
        <!-- Image panel -->
        <div class="wrd-mc-img-wrap">
          ${imgUrl
            ? `<img src="${imgUrl}" alt="${title}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
               <div class="wrd-mc-img-fallback" style="display:none;">👗</div>`
            : `<div class="wrd-mc-img-fallback">👗</div>`
          }
          <div class="wrd-mc-badge">${badge}</div>
          <div class="wrd-mc-type-pill">${matchLabel}</div>
        </div>

        <!-- Content panel -->
        <div class="wrd-mc-content">
          ${brand ? `<div class="wrd-mc-brand">${brand}</div>` : ''}
          <h3 class="wrd-mc-title">${title}</h3>

          <!-- Why it Matches -->
          <div class="wrd-mc-why">
            <div class="wrd-mc-why-label">◈ Why it Matches</div>
            <p class="wrd-mc-why-text">${whyText}</p>
          </div>

          <div class="wrd-mc-footer">
            <div class="wrd-mc-price">${price}</div>
            <button class="wrd-mc-btn" onclick="wrdTryOn('${imgUrl}','${title.replace(/'/g,"\\'")}')" title="Try this on in the Virtual Mirror">
              🪡 Try It On
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ── Wire "Try It On" from match card to Virtual Mirror ───────────────────
function wrdTryOn(imgUrl, title) {
  if (window.openVirtualMirror) openVirtualMirror();
  else if (window.showScreen)   showScreen('virtual-mirror');
  setTimeout(() => {
    if (window.handleVirtualTryOn) handleVirtualTryOn(imgUrl, title);
  }, 400);
}

// ── Fallback items (colour-theory based, no network needed) ─────────────
function _wrdFallbackItems() {
  const matchingLabel = _wrd.matchType === 'top' ? 'Bottom' : 'Top';
  const colName = window.hueName ? hueName(_wrd.dominantColour) : 'your colour';
  return [
    {
      title: `Complementary ${matchingLabel} — Slim Fit`,
      why_it_matches: `Directly opposite your ${colName} garment on the colour wheel, creating maximum visual contrast — a classic, timeless look.`,
      price: '₹1,499',
    },
    {
      title: `Analogous ${matchingLabel} — Relaxed Fit`,
      why_it_matches: `Harmonious neighbours to ${colName} on the spectrum — this creates a serene, sophisticated tonal outfit.`,
      price: '₹1,199',
    },
    {
      title: `Triadic ${matchingLabel} — Tailored`,
      why_it_matches: `A bold triadic accent that brings energy to ${colName} — worn by Old Money aesthetes for effortless pop.`,
      price: '₹1,899',
    },
  ];
}

function _wrdFallbackAdvice() {
  const colName = window.hueName ? hueName(_wrd.dominantColour) : 'your garment colour';
  return `Your ${colName} piece has excellent versatility. Focus on clean lines and quality fabrics for the complementary items — the Oracle recommends keeping accessories minimal to let the colour pairing breathe.`;
}

// ── Expose globally ──────────────────────────────────────────────────────
window.matchGarment         = matchGarment;
window.wrdTryOn             = wrdTryOn;
window.setupWardrobeEnhanced = setupWardrobeEnhanced;

// Override the old consultWardrobe — redirect to matchGarment
window.consultWardrobe = matchGarment;

// Auto-setup when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupWardrobeEnhanced);
} else {
  // DOM already ready — run after a tick so other scripts finish
  setTimeout(setupWardrobeEnhanced, 0);
}

// ════════════════════════════════════════════════════════════════════════
//  LUXURY CSS — My Wardrobe Module
// ════════════════════════════════════════════════════════════════════════
(function injectWardrobeStyles() {
  if (document.getElementById('wrd-module-styles')) return;
  const s = document.createElement('style');
  s.id = 'wrd-module-styles';
  s.textContent = `
    /* ── Disabled button tooltip wrapper ── */
    .wrd-btn-wrap {
      position: relative;
      display: inline-block;
    }
    .wrd-btn-wrap[title]:hover::after {
      content: attr(title);
      position: absolute;
      bottom: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%);
      background: rgba(10,8,25,.95);
      color: rgba(255,255,255,.85);
      font-size: .7rem;
      padding: .35rem .7rem;
      border-radius: 8px;
      white-space: nowrap;
      border: 1px solid rgba(212,175,55,.2);
      pointer-events: none;
      z-index: 99;
    }
    #btn-wrd-match:disabled {
      cursor: not-allowed;
      opacity: 0.5 !important;
    }

    /* ── Scanning overlay (in-flight POST) ── */
    .wrd-scanning-overlay {
      position: absolute;
      inset: 0;
      z-index: 10;
      background: rgba(7,5,26,.88);
      backdrop-filter: blur(6px);
      border-radius: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
    }
    .wrd-scan-ring {
      width: 60px; height: 60px;
      border: 3px solid rgba(212,175,55,.15);
      border-top-color: #D4AF37;
      border-right-color: rgba(212,175,55,.5);
      border-radius: 50%;
      animation: wrd-spin 1.1s linear infinite;
    }
    @keyframes wrd-spin { to { transform: rotate(360deg); } }
    .wrd-scan-label { text-align: center; }

    /* ── Toggle ── */
    .wrd-toggle {
      display: flex;
      gap: .5rem;
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(212,175,55,.15);
      border-radius: 30px;
      padding: .25rem;
      flex-wrap: wrap;
      justify-content: center;
    }
    .wrd-tog-btn {
      background: transparent;
      border: none;
      color: rgba(255,255,255,.55);
      font-size: .78rem;
      padding: .45rem 1rem;
      border-radius: 24px;
      cursor: pointer;
      transition: all .22s;
      font-family: 'Inter', sans-serif;
    }
    .wrd-tog-btn.active {
      background: linear-gradient(135deg, rgba(212,175,55,.2), rgba(212,175,55,.08));
      color: #D4AF37;
      border: 1px solid rgba(212,175,55,.3);
    }
    .wrd-tog-btn:hover:not(.active) { color: rgba(255,255,255,.85); }

    /* ── Wardrobe zone (overrides or supplements existing style) ── */
    .wardrobe-zone {
      position: relative;
      width: min(320px, 92vw);
      height: 380px;
      border: 2px dashed rgba(212,175,55,.25);
      border-radius: 20px;
      background: rgba(15,10,40,.6);
      cursor: pointer;
      transition: border-color .22s;
      overflow: hidden;
    }
    .wardrobe-zone:hover, .wardrobe-zone.dragover {
      border-color: rgba(212,175,55,.6);
    }
    .wardrobe-zone.has-image { border-style: solid; border-color: rgba(212,175,55,.4); }

    /* ── 3-card match grid ── */
    .wrd-match-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.5rem;
      max-width: 980px;
      width: 100%;
      margin: 0 auto 2rem;
      padding: 0 1.5rem;
    }
    @media (max-width: 600px) {
      .wrd-match-grid { grid-template-columns: 1fr; padding: 0 1rem; }
    }

    /* ── Match card (glassmorphism) ── */
    .wrd-match-card {
      background: rgba(255,255,255,.035);
      backdrop-filter: blur(14px);
      border: 1px solid rgba(212,175,55,.14);
      border-radius: 18px;
      overflow: hidden;
      transition: transform .22s, box-shadow .22s, border-color .22s;
      display: flex;
      flex-direction: column;
    }
    .wrd-match-card:hover {
      transform: translateY(-6px);
      box-shadow: 0 16px 40px rgba(212,175,55,.1);
      border-color: rgba(212,175,55,.35);
    }

    /* Card image */
    .wrd-mc-img-wrap {
      position: relative;
      width: 100%;
      height: 220px;
      overflow: hidden;
      background: rgba(15,10,40,.6);
      flex-shrink: 0;
    }
    .wrd-mc-img-wrap img {
      width: 100%; height: 100%;
      object-fit: cover;
      transition: transform .4s;
    }
    .wrd-match-card:hover .wrd-mc-img-wrap img { transform: scale(1.05); }
    .wrd-mc-img-fallback {
      position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center;
      font-size: 4rem; opacity: .25;
    }
    .wrd-mc-badge {
      position: absolute; top: 10px; left: 10px;
      background: rgba(7,5,26,.85);
      border: 1px solid rgba(212,175,55,.4);
      color: #D4AF37;
      font-size: .65rem; font-weight: 700;
      padding: 3px 9px; border-radius: 20px;
      letter-spacing: .06em;
      backdrop-filter: blur(4px);
    }
    .wrd-mc-type-pill {
      position: absolute; top: 10px; right: 10px;
      background: rgba(167,139,250,.85);
      color: #fff;
      font-size: .6rem; font-weight: 700;
      padding: 3px 8px; border-radius: 20px;
      letter-spacing: .08em;
    }

    /* Card content */
    .wrd-mc-content {
      padding: 1rem 1.1rem 1.1rem;
      display: flex;
      flex-direction: column;
      gap: .6rem;
      flex: 1;
    }
    .wrd-mc-brand {
      font-size: .65rem;
      text-transform: uppercase;
      letter-spacing: .1em;
      color: rgba(212,175,55,.65);
    }
    .wrd-mc-title {
      font-family: 'Cormorant Garamond', serif;
      font-size: 1.05rem;
      color: rgba(255,255,255,.92);
      line-height: 1.35;
      margin: 0;
    }

    /* Why it matches */
    .wrd-mc-why {
      background: rgba(212,175,55,.05);
      border-left: 2px solid rgba(212,175,55,.35);
      border-radius: 0 8px 8px 0;
      padding: .55rem .75rem;
    }
    .wrd-mc-why-label {
      font-size: .63rem;
      text-transform: uppercase;
      letter-spacing: .09em;
      color: #D4AF37;
      margin-bottom: .25rem;
      font-weight: 700;
    }
    .wrd-mc-why-text {
      font-size: .78rem;
      color: rgba(255,255,255,.65);
      line-height: 1.6;
      margin: 0;
    }

    /* Footer */
    .wrd-mc-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: auto;
      padding-top: .5rem;
      border-top: 1px solid rgba(255,255,255,.06);
    }
    .wrd-mc-price {
      font-size: 1.05rem;
      font-weight: 700;
      color: #D4AF37;
      font-family: 'Cormorant Garamond', serif;
    }
    .wrd-mc-btn {
      background: linear-gradient(135deg, #7c3aed, #a855f7);
      color: #fff;
      border: none;
      border-radius: 20px;
      font-size: .68rem;
      font-weight: 700;
      padding: .35rem .85rem;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(168,85,247,.35);
      transition: box-shadow .2s, transform .2s;
      letter-spacing: .04em;
    }
    .wrd-mc-btn:hover {
      box-shadow: 0 6px 20px rgba(168,85,247,.55);
      transform: scale(1.04);
    }

    /* ── Oracle's Advice box pulse ── */
    #wrd-oracle-advice {
      animation: wrd-advice-in .5s ease both;
    }
    @keyframes wrd-advice-in {
      from { opacity: 0; transform: translateY(10px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(s);
})();

console.log('[Wardrobe] Module loaded — n8n endpoint:', WRD_N8N_URL);
