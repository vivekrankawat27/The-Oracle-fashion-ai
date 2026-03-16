/**
 * virtual-mirror.js
 * Oracle Virtual Mirror — Module 2
 *
 * Features:
 *  - Side-by-side Sacred Scan (selfie) vs Oracle Vision (AI result)
 *  - Horizontal product rail from oracle_products.json (top-scored products)
 *  - handleVirtualTryOn(itemImage, itemTitle) — async n8n POST integration
 *  - Gold stitching animation with 4-step progress indicator
 *  - "The Oracle's vision is blurred." error state
 *  - Download & Share result
 */

// ── Config ────────────────────────────────────────────────────────────
const VM_N8N_URL   = 'https://piyushh.app.n8n.cloud/webhook-test/vto-stitching';
const VM_N8N_PROD  = 'https://piyushh.app.n8n.cloud/webhook/vto-stitching';
const VM_TIMEOUT   = 30000; // 30 s
const VM_RAIL_SIZE = 20;    // products shown in rail

// ── State ─────────────────────────────────────────────────────────────
const _vm = {
  lastItemImg:   null,   // last selected garment URL/base64
  lastItemTitle: null,   // last selected garment title
  lastResult:    null,   // base64 result from n8n
  isLoading:     false,
};

// ── $ helper ──────────────────────────────────────────────────────────
const _vm$ = id => document.getElementById(id);

// ── Open Virtual Mirror screen ────────────────────────────────────────
function openVirtualMirror() {
  // Populate selfie in left panel from global state
  _vmRefreshSelfie();
  // Navigate to screen
  showScreen('virtual-mirror');
  // Load product rail
  _vmBuildRail();
}

// ── Self refresh: reads window.state.imageBase64 ──────────────────────
function _vmRefreshSelfie() {
  const selfieImg = _vm$('vm-selfie-img');
  const noSelfie  = _vm$('vm-no-selfie');
  const badge     = _vm$('vm-selfie-badge');

  if (window.state?.imageBase64) {
    selfieImg.src          = 'data:image/jpeg;base64,' + state.imageBase64;
    selfieImg.style.display = 'block';
    noSelfie.style.display = 'none';
    if (badge) badge.style.opacity = '1';
  } else {
    selfieImg.style.display = 'none';
    noSelfie.style.display = 'flex';
    if (badge) badge.style.opacity = '0.4';
  }
}

// ── Reset result panel to placeholder ────────────────────────────────
function _vmResetResult() {
  _vm$('vm-placeholder').style.display       = 'flex';
  _vm$('vm-result-img').style.display        = 'none';
  _vm$('vm-stitching-overlay').style.display = 'none';
  _vm$('vm-error-state').style.display       = 'none';
  _vm$('vm-result-actions').style.display    = 'none';
}

// ── Show stitching overlay ────────────────────────────────────────────
function _vmShowStitching() {
  _vm$('vm-placeholder').style.display       = 'none';
  _vm$('vm-result-img').style.display        = 'none';
  _vm$('vm-error-state').style.display       = 'none';
  _vm$('vm-stitching-overlay').style.display = 'flex';
  _vm$('vm-result-actions').style.display    = 'none';

  // Animate steps + gold fill
  const fill   = _vm$('vm-gold-fill');
  const steps  = ['vms1','vms2','vms3','vms4'];
  let progress = 0;
  let si       = 0;

  // Reset
  steps.forEach(id => {
    const el = _vm$(id);
    if (el) { el.classList.remove('active','done'); }
  });
  if (fill) fill.style.width = '0%';

  const advance = (targetPct, durationMs) => {
    const start     = performance.now();
    const startPct  = progress;
    const animate   = (now) => {
      if (_vm$('vm-stitching-overlay').style.display === 'none') return;
      const elapsed = now - start;
      const t       = Math.min(elapsed / durationMs, 1);
      progress      = startPct + (targetPct - startPct) * t;
      if (fill) fill.style.width = progress + '%';
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  };

  const stepForward = () => {
    if (si > 0) {
      const prev = _vm$(steps[si - 1]);
      if (prev) { prev.classList.remove('active'); prev.classList.add('done'); }
    }
    if (si < steps.length) {
      const curr = _vm$(steps[si]);
      if (curr) curr.classList.add('active');
      advance((si + 1) * 22, 6000);
      si++;
      if (si < steps.length) setTimeout(stepForward, 7000);
    }
  };
  stepForward();
}

// ── Show error state ──────────────────────────────────────────────────
function _vmShowError(itemImg, itemTitle) {
  _vm$('vm-placeholder').style.display       = 'none';
  _vm$('vm-stitching-overlay').style.display = 'none';
  _vm$('vm-error-state').style.display       = 'flex';
  _vm$('vm-result-actions').style.display    = 'none';

  // Wire retry
  const retryBtn = _vm$('vm-retry-btn');
  if (retryBtn) {
    retryBtn.onclick = () => handleVirtualTryOn(itemImg, itemTitle);
  }
}

// ── Show result image ─────────────────────────────────────────────────
function _vmShowResult(base64) {
  _vm.lastResult = base64;
  const img = _vm$('vm-result-img');
  img.src           = 'data:image/jpeg;base64,' + base64;
  img.style.display = 'block';

  _vm$('vm-placeholder').style.display       = 'none';
  _vm$('vm-stitching-overlay').style.display = 'none';
  _vm$('vm-error-state').style.display       = 'none';
  _vm$('vm-result-actions').style.display    = 'flex';

  // Pulse the gold fill to 100%
  const fill = _vm$('vm-gold-fill');
  if (fill) fill.style.width = '100%';

  // Toast
  if (window.showToast) showToast('✦', 'Oracle Vision ready! Check your look.');
  if (window.toast)     toast('✦', 'Oracle Vision ready!');
}

// ── Convert img element → base64 ─────────────────────────────────────
function _vmImgToB64(imgEl) {
  try {
    const c  = document.createElement('canvas');
    c.width  = imgEl.naturalWidth  || 400;
    c.height = imgEl.naturalHeight || 500;
    c.getContext('2d').drawImage(imgEl, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  } catch { return null; }
}

// ── Fetch garment URL → base64 (proxy chain) ─────────────────────────
async function _vmUrlToB64(url) {
  const proxies = [
    'http://localhost:7799/proxy?url=' + encodeURIComponent(url),
    'https://corsproxy.io/?' + encodeURIComponent(url),
    url,
  ];
  for (const src of proxies) {
    try {
      const res = await fetch(src, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const blob = await res.blob();
      return await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload  = e => res(e.target.result.split(',')[1]);
        r.onerror = rej;
        r.readAsDataURL(blob);
      });
    } catch { continue; }
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════
//  MAIN: handleVirtualTryOn — async n8n POST
// ══════════════════════════════════════════════════════════════════════
async function handleVirtualTryOn(itemImageUrl, itemTitle = 'selected look') {
  if (_vm.isLoading) return;
  _vm.isLoading     = true;
  _vm.lastItemImg   = itemImageUrl;
  _vm.lastItemTitle = itemTitle;

  // ── 1. Get selfie base64 ──────────────────────────────────────────
  let selfieB64 = window.state?.imageBase64 || null;
  if (!selfieB64) {
    const selfieEl = _vm$('vm-selfie-img');
    if (selfieEl?.src && selfieEl.style.display !== 'none') {
      selfieB64 = _vmImgToB64(selfieEl);
    }
  }

  if (!selfieB64) {
    _vm.isLoading = false;
    _vmShowError(itemImageUrl, itemTitle);
    if (window.showToast) showToast('⚠', 'Upload a selfie first to try on looks.');
    else if (window.toast) toast('⚠', 'Upload a selfie to use Virtual Mirror.');
    return;
  }

  // ── 2. Get cloth base64 ───────────────────────────────────────────
  let clothB64 = await _vmUrlToB64(itemImageUrl);

  // ── 3. Build payload ──────────────────────────────────────────────
  const payload = {
    user_selfie:    selfieB64,
    selected_cloth: clothB64 || itemImageUrl,   // base64 preferred, else URL
  };

  // ── 4. Show stitching animation ───────────────────────────────────
  _vmShowStitching();
  // Update subtitle
  const sub = _vm$('vm-rail-subtitle');
  if (sub) sub.textContent = `Stitching: ${itemTitle.slice(0, 40)}…`;

  // ── 5. POST with timeout ──────────────────────────────────────────
  const ctrl      = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), VM_TIMEOUT);

  let responseData = null;
  let usedUrl      = VM_N8N_URL;

  try {
    for (const endpoint of [VM_N8N_URL, VM_N8N_PROD]) {
      try {
        usedUrl = endpoint;
        const res = await fetch(endpoint, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
          signal:  ctrl.signal,
        });
        clearTimeout(timeoutId);
        if (!res.ok) continue;
        responseData = await res.json();
        break;
      } catch (e) {
        if (e.name === 'AbortError') break;
      }
    }

    if (!responseData) throw new Error('No response from n8n endpoints');

    // ── 6. Extract base64 from response ──────────────────────────────
    let resultB64 = null;
    if (typeof responseData === 'string')    resultB64 = responseData;
    else if (responseData.result)            resultB64 = responseData.result;
    else if (responseData.image)             resultB64 = responseData.image;
    else if (responseData.output)            resultB64 = responseData.output;
    else if (responseData.data)              resultB64 = responseData.data;

    if (resultB64?.startsWith('data:'))      resultB64 = resultB64.split(',')[1];

    if (!resultB64) throw new Error('Unexpected response format');

    // ── 7. Show result ────────────────────────────────────────────────
    _vmShowResult(resultB64);
    if (sub) sub.textContent = `Fitted: ${itemTitle.slice(0, 40)}`;

  } catch (err) {
    clearTimeout(timeoutId);
    console.warn('[VirtualMirror] Error:', err.message);
    _vmShowError(itemImageUrl, itemTitle);
    if (sub) sub.textContent = 'Select a piece to try on';
  } finally {
    _vm.isLoading = false;
  }
}

// ── Retry handler ─────────────────────────────────────────────────────
function vmRetry() {
  if (_vm.lastItemImg) {
    handleVirtualTryOn(_vm.lastItemImg, _vm.lastItemTitle);
  }
}

// ── Download the AI result ────────────────────────────────────────────
function vmDownload() {
  if (!_vm.lastResult) return;
  const a  = document.createElement('a');
  a.href     = 'data:image/jpeg;base64,' + _vm.lastResult;
  a.download = 'oracle-vision.jpg';
  a.click();
  if (window.showToast) showToast('✓', 'Oracle Vision downloaded!');
  else if (window.toast) toast('✓', 'Downloaded!');
}

// ── Share the look ────────────────────────────────────────────────────
async function vmShareLook() {
  if (!_vm.lastResult) return;
  if (navigator.share) {
    try {
      const blob = await (await fetch('data:image/jpeg;base64,' + _vm.lastResult)).blob();
      const file = new File([blob], 'oracle-vision.jpg', { type: 'image/jpeg' });
      await navigator.share({ title: 'My Oracle Look', files: [file] });
    } catch { vmDownload(); }
  } else {
    vmDownload();
  }
}

// ══════════════════════════════════════════════════════════════════════
//  PRODUCT RAIL BUILDER
// ══════════════════════════════════════════════════════════════════════
async function _vmBuildRail() {
  const rail = _vm$('vm-rail');
  if (!rail) return;

  // Reset
  rail.innerHTML = `<div class="vm-rail-loading"><div class="vm-rail-spinner"></div> Loading collection…</div>`;

  // Pull products from FashionAI if loaded, else fetch directly
  let products = [];

  if (window.FashionAI && window.FashionAI.isLoaded) {
    const profile = {
      gender:    window.state?.profile?.gender    || 'female',
      bodyShape: window.state?.profile?.bodyShape || 'hourglass',
      skinTone:  window.state?.profile?.skinTone  || 'medium',
      occasion:  'casual',
      style:     '',
    };
    const result = window.FashionAI.recommend(profile, { limit: VM_RAIL_SIZE });
    products = result.products;
  } else {
    // Fallback: fetch oracle_products.json directly
    try {
      const res = await fetch('oracle_products.json');
      const d   = await res.json();
      products  = (d.products || []).slice(0, VM_RAIL_SIZE);
    } catch { products = []; }
  }

  if (products.length === 0) {
    rail.innerHTML = `<div class="vm-rail-loading" style="color:rgba(255,255,255,.4);">No products found.</div>`;
    return;
  }

  rail.innerHTML = products.map((p, i) => {
    const img   = p.img_url || `Images/${p.id}.jpg`;
    const score = p.aiScore ? `${p.aiScore}%` : '';
    const fab   = p.fabric  || 'cotton';
    return `
      <div class="vm-card" data-idx="${i}" title="${p.title}">
        <div class="vm-card-img-wrap">
          <img src="${img}" alt="${p.title}" loading="lazy"
               onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 120%22%3E%3Crect width=%22100%25%22 height=%22100%25%22 fill=%22%23141428%22/%3E%3Ctext x=%2250%25%22 y=%2255%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23D4AF37%22 font-size=%2232%22%3E${p.emoji||'👗'}%3C/text%3E%3C/svg%3E'"/>
          ${score ? `<div class="vm-card-score">${score}</div>` : ''}
          <div class="vm-card-overlay">
            <button class="vm-try-btn" onclick="event.stopPropagation(); vmSelectItem('${img.replace(/'/g,"\\'")}','${p.title.replace(/'/g,"\\'")}', this)">
              🪡 Try It On
            </button>
          </div>
        </div>
        <div class="vm-card-info">
          <div class="vm-card-title">${p.title.slice(0,40)}</div>
          <div class="vm-card-meta">
            <span class="vm-card-price">${p.price_fmt || '₹'+p.price}</span>
            <span class="vm-card-fab">${fab}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ── Select item from rail and trigger try-on ──────────────────────────
function vmSelectItem(imgUrl, title, btn) {
  // Highlight selected card
  document.querySelectorAll('.vm-card').forEach(c => c.classList.remove('vm-card--active'));
  btn?.closest('.vm-card')?.classList.add('vm-card--active');

  // Refresh selfie (user may have uploaded since entering)
  _vmRefreshSelfie();

  // Reset result panel, then trigger
  _vmResetResult();
  handleVirtualTryOn(imgUrl, title);
}

// ── Expose globally ───────────────────────────────────────────────────
window.openVirtualMirror  = openVirtualMirror;
window.handleVirtualTryOn = handleVirtualTryOn;
window.vmRetry            = vmRetry;
window.vmDownload         = vmDownload;
window.vmShareLook        = vmShareLook;
window.vmSelectItem       = vmSelectItem;

// ══════════════════════════════════════════════════════════════════════
//  LUXURY CSS — Virtual Mirror
// ══════════════════════════════════════════════════════════════════════
(function injectVMStyles() {
  if (document.getElementById('vm-styles')) return;
  const s = document.createElement('style');
  s.id = 'vm-styles';
  s.textContent = `
    /* ── Screen layout ── */
    #screen-virtual-mirror {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      background: radial-gradient(ellipse at 20% 50%, rgba(124,58,237,.08) 0%, transparent 60%),
                  radial-gradient(ellipse at 80% 30%, rgba(212,175,55,.06) 0%, transparent 55%),
                  #07051a;
      overflow-y: auto;
      overflow-x: hidden;
    }

    /* ── VM Header ── */
    .vm-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: .9rem 2rem;
      background: rgba(7,5,26,.85);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(212,175,55,.1);
      position: sticky;
      top: 0;
      z-index: 10;
      flex-shrink: 0;
    }
    .vm-back-btn { font-size:.8rem; padding:.35rem .9rem; }
    .vm-title-wrap { text-align:center; }
    .vm-title {
      font-family: 'Cormorant Garamond', serif;
      font-size: clamp(1.3rem, 3vw, 2rem);
      color: #D4AF37;
      margin: 0;
      line-height: 1.1;
    }
    .vm-selfie-badge {
      display: flex;
      align-items: center;
      gap: .45rem;
      font-size: .72rem;
      color: rgba(255,255,255,.55);
      background: rgba(255,255,255,.05);
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 20px;
      padding: .3rem .75rem;
      transition: opacity .3s;
    }
    .vm-badge-dot {
      width: 7px; height: 7px;
      border-radius: 50%;
      background: #4ade80;
      box-shadow: 0 0 6px #4ade80;
      animation: vm-pulse 2s ease-in-out infinite;
    }
    @keyframes vm-pulse {
      0%,100% { opacity:1; transform:scale(1); }
      50%      { opacity:.5; transform:scale(.8); }
    }

    /* ── Main side-by-side area ── */
    .vm-main {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 1.5rem;
      padding: 1.5rem 2rem 1rem;
      flex: 1;
      min-height: 0;
      align-items: start;
    }
    @media (max-width: 700px) {
      .vm-main { grid-template-columns: 1fr; gap: 1rem; padding: 1rem; }
      .vm-divider { display:flex; flex-direction:row; padding: 0; }
      .vm-divider-arrow { transform:rotate(90deg); }
    }

    /* ── Panel ── */
    .vm-panel { display:flex; flex-direction:column; gap:.7rem; }
    .vm-panel-label {
      display: flex;
      align-items: center;
      gap: .4rem;
      font-size: .72rem;
      text-transform: uppercase;
      letter-spacing: .12em;
      color: rgba(255,255,255,.45);
      font-family: 'Inter', sans-serif;
    }
    .vm-panel-icon { font-size: 1rem; }

    /* ── Selfie frame ── */
    .vm-selfie-frame {
      position: relative;
      width: 100%;
      aspect-ratio: 3/4;
      border-radius: 20px;
      overflow: hidden;
      border: 1px solid rgba(212,175,55,.2);
      background: rgba(15,10,30,.8);
    }
    .vm-selfie-frame img {
      width:100%; height:100%; object-fit:cover;
      border-radius:20px;
    }
    .vm-panel-shine, .vm-result-shine {
      position:absolute; inset:0; pointer-events:none;
      background: linear-gradient(135deg, rgba(255,255,255,.04) 0%, transparent 60%);
      border-radius:20px;
    }
    .vm-no-selfie {
      position:absolute; inset:0;
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      text-align:center; padding:1.5rem;
      color: rgba(255,255,255,.5);
      font-size:.82rem; line-height:1.6;
    }
    .vm-no-selfie-icon { font-size:3.5rem; opacity:.3; margin-bottom:.75rem; }

    /* ── Divider ── */
    .vm-divider {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem 0;
      gap: .4rem;
    }
    .vm-divider-arrow {
      font-size: 2rem;
      color: #a78bfa;
      font-weight: 200;
      animation: vm-arrow-pulse 2s ease-in-out infinite;
    }
    @keyframes vm-arrow-pulse {
      0%,100% { opacity:.6; transform:translateX(-3px); }
      50%      { opacity:1;  transform:translateX(3px); }
    }
    .vm-divider-label {
      font-size: .62rem;
      color: #a78bfa;
      text-transform: uppercase;
      letter-spacing: .1em;
    }

    /* ── Result frame ── */
    .vm-result-frame {
      position: relative;
      width: 100%;
      aspect-ratio: 3/4;
      border-radius: 20px;
      overflow: hidden;
      border: 1px solid rgba(167,139,250,.25);
      background: rgba(15,10,30,.8);
    }

    /* ── Placeholder ── */
    .vm-placeholder {
      position:absolute; inset:0;
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      text-align:center; padding:2rem;
      gap:.75rem;
    }
    .vm-placeholder-icon {
      font-size: 3rem;
      color: rgba(212,175,55,.3);
      animation: vm-float 3s ease-in-out infinite;
    }
    @keyframes vm-float {
      0%,100% { transform:translateY(0); }
      50%      { transform:translateY(-10px); }
    }
    .vm-placeholder-text {
      color: rgba(255,255,255,.45);
      font-size: .82rem;
      line-height: 1.7;
    }
    .vm-placeholder-text strong { color: #D4AF37; }
    .vm-placeholder-shimmer {
      width:60%; height:3px;
      background: linear-gradient(90deg, transparent, rgba(212,175,55,.4), transparent);
      border-radius:2px;
      animation: vm-shimmer 2s ease-in-out infinite;
    }
    @keyframes vm-shimmer { 0%,100%{opacity:.3} 50%{opacity:1} }

    /* ── Stitching overlay ── */
    .vm-stitching-overlay {
      position:absolute; inset:0;
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      background: rgba(7,5,26,.92);
      backdrop-filter: blur(6px);
      border-radius:20px;
      gap:1.5rem;
      padding:1.5rem;
    }
    .vm-stitch-ring {
      width: 72px; height: 72px;
      border: 3px solid rgba(212,175,55,.15);
      border-top-color:  #D4AF37;
      border-right-color: rgba(212,175,55,.5);
      border-radius: 50%;
      animation: vm-spin 1.2s linear infinite;
      flex-shrink: 0;
    }
    @keyframes vm-spin { to{ transform:rotate(360deg); } }
    .vm-stitch-text { text-align:center; }
    .vm-stitch-title {
      font-family: 'Cormorant Garamond', serif;
      font-size: 1.25rem;
      font-style: italic;
      color: #D4AF37;
      line-height: 1.4;
      margin-bottom:.75rem;
    }
    .vm-stitch-steps { display:flex; flex-direction:column; gap:.35rem; }
    .vm-stitch-step {
      font-size:.72rem;
      color: rgba(255,255,255,.3);
      transition: color .4s, transform .3s;
      text-align:center;
    }
    .vm-stitch-step.active {
      color: #D4AF37;
      transform: scale(1.05);
    }
    .vm-stitch-step.done {
      color: rgba(74,222,128,.6);
    }
    /* Gold progress bar */
    .vm-gold-progress {
      width:80%; height:3px;
      background: rgba(255,255,255,.08);
      border-radius:4px;
      overflow:hidden;
    }
    .vm-gold-fill {
      height:100%;
      background: linear-gradient(90deg, #D4AF37, #F0D060);
      border-radius:4px;
      width:0%;
      transition: width 1s ease;
    }

    /* ── Error state ── */
    .vm-error-state {
      position:absolute; inset:0;
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      text-align:center; padding:1.5rem;
      background: rgba(7,5,26,.9);
      backdrop-filter: blur(4px);
      border-radius:20px;
    }
    .vm-error-icon { font-size:2.5rem; opacity:.5; margin-bottom:.75rem; color:#f87171; }
    .vm-error-text { color:rgba(255,255,255,.6); font-size:.82rem; line-height:1.7; }

    /* ── Result actions ── */
    .vm-result-actions {
      display: flex;
      gap:.5rem;
      justify-content: center;
      margin-top:.6rem;
      flex-wrap:wrap;
    }

    /* ── Product Rail ── */
    .vm-rail-section {
      padding: 1rem 2rem 2rem;
      border-top: 1px solid rgba(255,255,255,.06);
      flex-shrink: 0;
    }
    .vm-rail-header {
      display:flex; justify-content:space-between; align-items:center;
      margin-bottom:.9rem;
    }
    .vm-rail-title {
      font-family:'Cormorant Garamond',serif;
      font-size:1.15rem; color:#D4AF37;
    }
    .vm-rail-subtitle { font-size:.72rem; color:rgba(255,255,255,.4); }
    .vm-rail {
      display: flex;
      gap: 1rem;
      overflow-x: auto;
      padding-bottom: .75rem;
      scrollbar-width: thin;
      scrollbar-color: rgba(212,175,55,.3) transparent;
    }
    .vm-rail::-webkit-scrollbar { height:4px; }
    .vm-rail::-webkit-scrollbar-thumb { background:rgba(212,175,55,.3); border-radius:4px; }

    /* ── Glassmorphism Product Cards ── */
    .vm-card {
      flex-shrink: 0;
      width: 160px;
      border-radius: 16px;
      overflow: hidden;
      background: rgba(255,255,255,.04);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(212,175,55,.12);
      transition: transform .22s, border-color .22s, box-shadow .22s;
      cursor: pointer;
    }
    .vm-card:hover {
      transform: translateY(-5px);
      border-color: rgba(212,175,55,.4);
      box-shadow: 0 12px 32px rgba(212,175,55,.12);
    }
    .vm-card--active {
      border-color: #a78bfa !important;
      box-shadow: 0 0 22px rgba(167,139,250,.35) !important;
    }
    .vm-card-img-wrap {
      position:relative; width:100%; height:200px; overflow:hidden;
    }
    .vm-card-img-wrap img {
      width:100%; height:100%; object-fit:cover;
      transition: transform .4s;
    }
    .vm-card:hover .vm-card-img-wrap img { transform: scale(1.06); }
    .vm-card-score {
      position:absolute; top:8px; right:8px;
      background:rgba(212,175,55,.9); color:#07051a;
      font-size:.62rem; font-weight:700;
      padding:2px 6px; border-radius:20px;
    }
    .vm-card-overlay {
      position:absolute; inset:0;
      background: linear-gradient(to top, rgba(7,5,26,.85) 0%, transparent 50%);
      display:flex; align-items:flex-end; justify-content:center;
      padding-bottom:.75rem;
      opacity:0; transition:opacity .22s;
    }
    .vm-card:hover .vm-card-overlay { opacity:1; }
    .vm-try-btn {
      background: linear-gradient(135deg,#7c3aed,#a855f7);
      color:#fff; border:none; border-radius:20px;
      font-size:.68rem; font-weight:700;
      padding:.35rem .85rem; cursor:pointer;
      letter-spacing:.04em;
      box-shadow: 0 4px 14px rgba(168,85,247,.4);
      transition: box-shadow .2s, transform .2s;
    }
    .vm-try-btn:hover { box-shadow:0 6px 20px rgba(168,85,247,.6); transform:scale(1.05); }
    .vm-card-info { padding:.6rem .7rem .75rem; }
    .vm-card-title {
      font-size:.72rem; color:rgba(255,255,255,.85);
      line-height:1.3;
      display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
      margin-bottom:.35rem;
    }
    .vm-card-meta { display:flex; justify-content:space-between; align-items:center; }
    .vm-card-price { color:#D4AF37; font-size:.75rem; font-weight:700; }
    .vm-card-fab {
      font-size:.58rem; background:rgba(212,175,55,.08);
      color:rgba(212,175,55,.7); padding:2px 5px; border-radius:10px;
      border:1px solid rgba(212,175,55,.15); text-transform:capitalize;
    }
    .vm-rail-loading {
      display:flex; align-items:center; gap:.6rem;
      color:rgba(255,255,255,.35); font-size:.8rem;
      padding:1rem;
    }
    .vm-rail-spinner {
      width:16px; height:16px;
      border:2px solid rgba(212,175,55,.2); border-top-color:#D4AF37;
      border-radius:50%;
      animation:vm-spin .8s linear infinite;
    }
  `;
  document.head.appendChild(s);
})();

console.log('[VirtualMirror] Module 2 loaded — n8n endpoint:', VM_N8N_URL);
