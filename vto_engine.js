/**
 * Oracle VTO Engine v3 — CSS Two-Layer Fabric System
 *
 * Architecture:
 *   Layer 1 (.base-layer)     : User selfie image — fills the mirror frame
 *   Layer 2 (.overlay-layer)  : Garment PNG — absolutely positioned on top
 *
 * Controls:
 *   ▲▼◀▶  — move garment overlay (changes top/left %)
 *   ＋ / － — scale garment (changes width %)
 *   Drag   — drag the overlay with mouse/touch
 *
 * Save Look: merges both layers onto a hidden Canvas and downloads as PNG
 */

// ── Proxy strategies (in priority order) ─────────────────────────────
const VTO_PROXY_LOCAL     = 'http://localhost:7799/proxy?url=';
const VTO_PROXY_CORSPROXY = 'https://corsproxy.io/?';
const VTO_IMG_CACHE       = new Map(); // url → object-URL or data-url

// ── State ─────────────────────────────────────────────────────────────
let _vtoOverlayTop    = 35;   // % from top of mirror
let _vtoOverlayLeft   = 50;   // % from left of mirror  (centred)
let _vtoOverlayWidth  = 60;   // % of mirror width

// ── DOM helpers ────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const log = msg => console.log(`[VTO] ${msg}`);

// ── Apply current overlay position/size to the DOM img ────────────────
function _applyOverlayStyle() {
  const g = $('vto-garment');
  if (!g) return;
  g.style.top       = `${_vtoOverlayTop}%`;
  g.style.left      = `${_vtoOverlayLeft}%`;
  g.style.width     = `${_vtoOverlayWidth}%`;
  g.style.transform = 'translate(-50%, -50%)';
}

// ── Load image through proxy chain ────────────────────────────────────
async function _loadViaProxy(url) {
  if (!url) return null;
  if (VTO_IMG_CACHE.has(url)) return VTO_IMG_CACHE.get(url);

  const strategies = [
    VTO_PROXY_LOCAL     + encodeURIComponent(url),
    VTO_PROXY_CORSPROXY + encodeURIComponent(url),
    url,   // direct (may fail CORS but worth trying for same-origin / CDN images)
  ];

  for (const proxyUrl of strategies) {
    try {
      const blob    = await _fetchBlob(proxyUrl);
      const objUrl  = URL.createObjectURL(blob);
      VTO_IMG_CACHE.set(url, objUrl);
      log(`Loaded via: ${proxyUrl.slice(0, 50)}…`);
      return objUrl;
    } catch (_) {}
  }
  log('All proxy strategies failed — garment image could not be loaded');
  return null;
}

function _fetchBlob(url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.responseType = 'blob';
    xhr.timeout = 10000;
    xhr.onload  = () => xhr.status < 400 ? resolve(xhr.response) : reject(new Error(xhr.status));
    xhr.onerror = () => reject(new Error('network error'));
    xhr.ontimeout = () => reject(new Error('timeout'));
    xhr.send();
  });
}

// ── Pose-based initial positioning ────────────────────────────────────
// Simple heuristic: if we have pose keypoints stored, compute initial
// top/left/width from shoulder keypoints, otherwise use smart defaults.
function _computeInitialPlacement() {
  // Check if pose was detected (stored globally by pre-scan step)
  const kps = window._vtoLastPoseKeypoints; // set by pose detection pre-scan
  if (kps) {
    const ls = kps['leftShoulder'], rs = kps['rightShoulder'];
    const lh = kps['leftHip'],     rh = kps['rightHip'];

    const confOk = kp => kp && kp.score > 0.25;

    if (confOk(ls) && confOk(rs)) {
      // Shoulders give us horizontal centre and width
      const midX   = ((ls.x + rs.x) / 2) * 100; // normalised 0–100
      const width  = Math.abs(rs.x - ls.x) * 100 * 1.4 + 15; // 40% extra padding
      const top    = confOk(ls) ? ls.y * 100 - 5 : 35;

      _vtoOverlayLeft  = Math.max(20, Math.min(80, midX));
      _vtoOverlayTop   = Math.max(10, Math.min(70, top));
      _vtoOverlayWidth = Math.max(30, Math.min(90, width));
      return;
    }
  }
  // Default: torso-centred layout
  _vtoOverlayTop   = 35;
  _vtoOverlayLeft  = 50;
  _vtoOverlayWidth = 60;
}

// ── Drag support ──────────────────────────────────────────────────────
function _setupDrag() {
  const mirror  = $('virtual-mirror');
  const garment = $('vto-garment');
  if (!mirror || !garment) return;

  let dragging = false, startX, startY, startTop, startLeft;

  const px2pct = (px, dim) => (px / dim) * 100;

  garment.addEventListener('mousedown', e => {
    dragging = true;
    startX    = e.clientX;
    startY    = e.clientY;
    startTop  = _vtoOverlayTop;
    startLeft = _vtoOverlayLeft;
    e.preventDefault();
  });

  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const rect = mirror.getBoundingClientRect();
    _vtoOverlayLeft = startLeft + px2pct(e.clientX - startX, rect.width);
    _vtoOverlayTop  = startTop  + px2pct(e.clientY - startY, rect.height);
    _applyOverlayStyle();
  });

  window.addEventListener('mouseup', () => { dragging = false; });

  // Touch support
  garment.addEventListener('touchstart', e => {
    dragging = true;
    startX    = e.touches[0].clientX;
    startY    = e.touches[0].clientY;
    startTop  = _vtoOverlayTop;
    startLeft = _vtoOverlayLeft;
    e.preventDefault();
  }, { passive: false });

  window.addEventListener('touchmove', e => {
    if (!dragging) return;
    const rect = mirror.getBoundingClientRect();
    _vtoOverlayLeft = startLeft + px2pct(e.touches[0].clientX - startX, rect.width);
    _vtoOverlayTop  = startTop  + px2pct(e.touches[0].clientY - startY, rect.height);
    _applyOverlayStyle();
  });

  window.addEventListener('touchend', () => { dragging = false; });
}

// ── MAIN openVTO ──────────────────────────────────────────────────────
async function openVTO(btn) {
  const title  = btn?.dataset?.title  || 'Oracle Look';
  const imgUrl = btn?.dataset?.img    || '';
  const emoji  = btn?.dataset?.emoji  || '👗';

  // Reset state
  _vtoOverlayTop   = 35;
  _vtoOverlayLeft  = 50;
  _vtoOverlayWidth = 60;

  // Show modal
  $('vto-modal').classList.add('open');
  $('vto-item-label').textContent  = `Fitting: ${title.slice(0, 50)}`;
  $('vto-controls').style.display  = 'none';
  $('vto-save-btn').style.display  = 'none';
  $('vto-progress-wrap').style.display = 'block';

  const setP = (pct, msg) => {
    $('vto-fill').style.width     = pct + '%';
    $('vto-pct').textContent       = Math.round(pct) + '%';
    if (msg) $('vto-item-label').textContent = msg;
  };

  // ── Step 1: Selfie layer ───────────────────────────────────────────
  setP(15, 'Loading your selfie…');
  const selfieEl  = $('vto-selfie');
  const noSelfie  = $('vto-no-selfie');

  if (window.state?.imageBase64) {
    selfieEl.src          = 'data:image/jpeg;base64,' + state.imageBase64;
    selfieEl.style.display = 'block';
    noSelfie.style.display = 'none';
  } else {
    selfieEl.style.display = 'none';
    noSelfie.style.display = 'flex';
  }

  await _tick(100);

  // ── Step 2: Compute pose-based placement ──────────────────────────
  setP(35, 'Detecting body pose…');
  _computeInitialPlacement();
  await _tick(600); // let TF.js model warm up if it's doing work

  // ── Step 3: Load garment image via proxy ──────────────────────────
  setP(60, 'Fetching clothing image…');
  const garmentEl = $('vto-garment');

  if (imgUrl) {
    // Activate scan-line animation
    $('vto-scanline').classList.add('active');

    const resolvedUrl = await _loadViaProxy(imgUrl);
    $('vto-scanline').classList.remove('active');

    if (resolvedUrl) {
      garmentEl.src           = resolvedUrl;
      garmentEl.style.display = 'block';
      _applyOverlayStyle();
      _setupDrag();
      setP(90, 'Aligning garment to torso…');
      await _tick(500);
    } else {
      // Fallback: emoji indicator
      garmentEl.style.display = 'none';
      // Draw emoji in garment position via CSS pseudo or inline note
      toast('⚠', 'Image blocked by CDN. Try uploading the selfie first and the garment appears as overlay.');
    }
  } else {
    garmentEl.style.display = 'none';
  }

  // ── Step 4: Done ──────────────────────────────────────────────────
  setP(100, `Fitting: ${title.slice(0, 50)}`);
  await _tick(300);

  $('vto-progress-wrap').style.display  = 'none';
  $('vto-controls').style.display       = (imgUrl ? 'block' : 'none');
  $('vto-save-btn').style.display       = 'inline-flex';

  // Show Oracle Stitch button when both selfie + garment are present
  const hasGarment = !!(imgUrl && garmentEl.src);
  const stitchBtn  = $('vto-stitch-btn');
  if (stitchBtn) {
    stitchBtn.style.display  = hasGarment ? 'inline-flex' : 'none';
    stitchBtn.disabled       = false;
    stitchBtn.textContent    = '🪡 Oracle Stitch';
  }

  // Reset any previous stitch status/result
  const statusEl = $('vto-stitch-status');
  if (statusEl) { statusEl.style.display = 'none'; statusEl.innerHTML = ''; }
  const resultEl = $('vto-result-wrap');
  if (resultEl) resultEl.style.display = 'none';

  if (hasGarment) {
    const hasSelfie = !!window.state?.imageBase64;
    toast('◈', hasSelfie
      ? 'Try-on ready! Drag to align · Click 🪡 Oracle Stitch for AI stitching.'
      : 'Try-on ready! Upload a selfie to enable Oracle Stitch.'
    );
  }
}


// ── Arrow control functions ────────────────────────────────────────────
function vtoAdjust(dx, dy) {
  _vtoOverlayLeft = Math.max(5,  Math.min(95,  _vtoOverlayLeft + dx));
  _vtoOverlayTop  = Math.max(-5, Math.min(110, _vtoOverlayTop  + dy));
  _applyOverlayStyle();
}

function vtoScale(delta) {
  _vtoOverlayWidth = Math.max(15, Math.min(110, _vtoOverlayWidth + delta));
  _applyOverlayStyle();
}

// ── Save Look — merges both layers on Canvas then downloads ───────────
function saveVTO() {
  const mirror   = $('virtual-mirror');
  const selfieEl = $('vto-selfie');
  const garment  = $('vto-garment');
  const canvas   = $('vto-canvas');

  if (!mirror) return;

  const mRect = mirror.getBoundingClientRect();
  const W = mRect.width  || 480;
  const H = mRect.height || 640;

  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Draw background
  if (selfieEl && selfieEl.src && selfieEl.style.display !== 'none') {
    ctx.drawImage(selfieEl, 0, 0, W, H);
  } else {
    // Dark gradient placeholder
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0d0d1a');
    g.addColorStop(1, '#1a0e30');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Draw garment overlay
  if (garment && garment.src && garment.style.display !== 'none') {
    const gW = (W * _vtoOverlayWidth / 100);
    const gH = gW * (garment.naturalHeight / garment.naturalWidth || 1.4);
    const gX = (W * _vtoOverlayLeft  / 100) - gW / 2;
    const gY = (H * _vtoOverlayTop   / 100) - gH / 2;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    try {
      ctx.drawImage(garment, gX, gY, gW, gH);
    } catch (e) {
      // If canvas tainting occurs, skip garment layer
      log('Canvas taint error — garment not in Save Look: ' + e.message);
    }
    ctx.restore();
  }

  // Gold frame + label
  ctx.strokeStyle = 'rgba(212,175,55,0.55)';
  ctx.lineWidth   = 2;
  ctx.strokeRect(2, 2, W - 4, H - 4);
  ctx.fillStyle   = 'rgba(212,175,55,0.9)';
  ctx.font        = 'bold 11px Inter,sans-serif';
  ctx.textAlign   = 'left';
  ctx.fillText('◈ Oracle Virtual Mirror', 10, 18);

  // Download
  try {
    const a = document.createElement('a');
    a.href     = canvas.toDataURL('image/png');
    a.download = 'oracle-virtual-mirror.png';
    a.click();
    toast('✓', 'Look saved as oracle-virtual-mirror.png');
  } catch (e) {
    // CORS taint means we cannot export — use html screenshot fallback
    toast('⚠', 'Could not export (CORS taint). Screenshots via Ctrl+Shift+S instead.');
  }
}

// ── Close ─────────────────────────────────────────────────────────────
function closeVTO() {
  $('vto-modal').classList.remove('open');
}

// ── Helpers ───────────────────────────────────────────────────────────
function _tick(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Register aliases for index.html shims ─────────────────────────────
window._vtoEngine_openVTO   = openVTO;
window._vtoEngine_closeVTO  = closeVTO;
window._vtoEngine_saveVTO   = saveVTO;
window._vtoEngine_vtoAdjust = vtoAdjust;
window._vtoEngine_vtoScale  = vtoScale;

// Also direct references
window.openVTO   = openVTO;
window.closeVTO  = closeVTO;
window.saveVTO   = saveVTO;
window.vtoAdjust = vtoAdjust;
window.vtoScale  = vtoScale;

// ══════════════════════════════════════════════════════════════════════
//  n8n Oracle Stitching Integration
// ══════════════════════════════════════════════════════════════════════

const N8N_VTO_PROD    = 'https://piyushh.app.n8n.cloud/webhook/vto-stitching';
const N8N_VTO_TEST    = 'https://piyushh.app.n8n.cloud/webhook-test/vto-stitching';
const VTO_TIMEOUT_MS  = 30000; // 30 seconds

// Track last result for download
let _vtoResultBase64 = null;

// ── Utility: get base64 string from an <img> element ─────────────────
function _imgElementToBase64(imgEl) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width  = imgEl.naturalWidth  || imgEl.width  || 400;
    canvas.height = imgEl.naturalHeight || imgEl.height || 500;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return dataUrl.split(',')[1]; // strip data:image/jpeg;base64,
  } catch (e) {
    log('Canvas taint on _imgElementToBase64: ' + e.message);
    return null;
  }
}

// ── Utility: fetch image URL and convert to base64 ───────────────────
async function _urlToBase64(url) {
  if (!url) return null;
  try {
    // Try local proxy first to avoid CORS
    const strategies = [
      'http://localhost:7799/proxy?url=' + encodeURIComponent(url),
      'https://corsproxy.io/?' + encodeURIComponent(url),
      url
    ];
    for (const src of strategies) {
      try {
        const res = await fetch(src, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) continue;
        const blob   = await res.blob();
        const reader = new FileReader();
        const b64    = await new Promise((res, rej) => {
          reader.onload  = e => res(e.target.result.split(',')[1]);
          reader.onerror = rej;
          reader.readAsDataURL(blob);
        });
        return b64;
      } catch (_) {}
    }
  } catch (_) {}
  return null;
}

// ── Set VTO stitch status message ─────────────────────────────────────
function _setStitchStatus(html, type = 'info') {
  const el = $('vto-stitch-status');
  if (!el) return;
  const colours = {
    info:    'rgba(168,85,247,0.12)',
    success: 'rgba(34,197,94,0.12)',
    error:   'rgba(239,68,68,0.12)',
    loading: 'rgba(212,175,55,0.12)',
  };
  el.style.display    = html ? 'block' : 'none';
  el.style.background = colours[type] || colours.info;
  el.innerHTML        = html;
}

// ── Main: Call n8n Oracle Stitching endpoint ──────────────────────────
async function callOracleStitching() {
  const stitchBtn  = $('vto-stitch-btn');
  const selfieEl   = $('vto-selfie');
  const garmentEl  = $('vto-garment');

  // ── Step 1: Collect selfie base64 ───────────────────────────────────
  let selfieB64 = null;
  if (window.state?.imageBase64) {
    selfieB64 = window.state.imageBase64;          // already stripped
  } else if (selfieEl?.src && selfieEl.style.display !== 'none') {
    selfieB64 = _imgElementToBase64(selfieEl);
  }

  if (!selfieB64) {
    _setStitchStatus(`
      <span style="color:#f87171;">⚠ No selfie found.</span>
      Please upload a selfie photo first, then click Oracle Stitch.
    `, 'error');
    return;
  }

  // ── Step 2: Collect garment base64 or URL ───────────────────────────
  let clothB64 = null;
  let clothUrl = null;

  if (garmentEl?.src && garmentEl.style.display !== 'none') {
    clothUrl = garmentEl.src;
    // Try canvas extraction first (works for same-origin/proxied blobs)
    clothB64 = _imgElementToBase64(garmentEl);
    // If canvas tainted, try fetching the URL
    if (!clothB64 && clothUrl) {
      clothB64 = await _urlToBase64(clothUrl);
    }
  }

  if (!clothB64 && !clothUrl) {
    _setStitchStatus(`
      <span style="color:#f87171;">⚠ No garment selected.</span>
      Please open a garment with "Try On" first, then click Oracle Stitch.
    `, 'error');
    return;
  }

  // ── Step 3: Build payload ────────────────────────────────────────────
  const payload = {
    user_selfie:    selfieB64,
    selected_cloth: clothB64 || clothUrl,  // send base64 preferably, else URL
  };

  // ── Step 4: Show loading state ───────────────────────────────────────
  if (stitchBtn) { stitchBtn.disabled = true; stitchBtn.textContent = '🪡 Stitching…'; }
  $('vto-result-wrap').style.display = 'none';
  _vtoResultBase64 = null;

  _setStitchStatus(`
    <div class="vto-stitch-anim">
      <div class="vto-stitch-spinner"></div>
      <div>
        <div style="font-weight:600;color:#a78bfa;">◈ Oracle is stitching your look…</div>
        <div style="font-size:.72rem;color:var(--slate-light);margin-top:.25rem;">
          AI fabric layering in progress · Up to 30 seconds
        </div>
      </div>
    </div>
  `, 'loading');

  // ── Step 5: Fetch with 30-second timeout ────────────────────────────
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => {
    controller.abort();
  }, VTO_TIMEOUT_MS);

  let responseData = null;
  let usedEndpoint = N8N_VTO_TEST;

  try {
    // Try test URL first, fall back to production
    const endpoints = [N8N_VTO_TEST, N8N_VTO_PROD];
    let lastErr = null;

    for (const endpoint of endpoints) {
      try {
        usedEndpoint = endpoint;
        log(`Calling n8n: ${endpoint}`);

        const response = await fetch(endpoint, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
          signal:  controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          lastErr = `HTTP ${response.status}`;
          continue;
        }

        responseData = await response.json();
        break; // success
      } catch (endpointErr) {
        lastErr = endpointErr.message;
        if (endpointErr.name === 'AbortError') break; // timeout — stop trying
      }
    }

    if (!responseData) throw new Error(lastErr || 'Both endpoints failed');

  } catch (err) {
    clearTimeout(timeoutId);
    if (stitchBtn) { stitchBtn.disabled = false; stitchBtn.textContent = '🪡 Oracle Stitch'; }

    if (err.name === 'AbortError' || err.message?.includes('abort')) {
      _setStitchStatus(`
        <span style="color:#fbbf24;">⏳ The Oracle is busy stitching high-fashion. Please wait a moment longer.</span>
        <div style="margin-top:.4rem;">
          <button class="btn btn-ghost" style="font-size:.72rem;padding:.3rem .8rem;" onclick="callOracleStitching()">↺ Retry</button>
        </div>
      `, 'error');
    } else {
      _setStitchStatus(`
        <span style="color:#f87171;">⚠ Oracle Stitch failed:</span> ${err.message}
        <div style="margin-top:.4rem;">
          <button class="btn btn-ghost" style="font-size:.72rem;padding:.3rem .8rem;" onclick="callOracleStitching()">↺ Retry</button>
        </div>
      `, 'error');
    }
    return;
  }

  // ── Step 6: Process response ─────────────────────────────────────────
  if (stitchBtn) { stitchBtn.disabled = false; stitchBtn.textContent = '🪡 Oracle Stitch'; }

  // Response may be: { result: "base64..." } or { image: "base64..." } or bare string
  let resultB64 = null;
  if (typeof responseData === 'string') {
    resultB64 = responseData;
  } else if (responseData.result) {
    resultB64 = responseData.result;
  } else if (responseData.image) {
    resultB64 = responseData.image;
  } else if (responseData.output) {
    resultB64 = responseData.output;
  } else if (responseData.data) {
    resultB64 = responseData.data;
  }

  // Strip data URI prefix if present
  if (resultB64?.startsWith('data:')) {
    resultB64 = resultB64.split(',')[1];
  }

  if (!resultB64) {
    log('Unexpected response from n8n: ' + JSON.stringify(responseData).slice(0, 200));
    _setStitchStatus(`
      <span style="color:#f87171;">⚠ Oracle returned an unexpected response.</span>
      The n8n workflow may still be configuring. Check your n8n Code node output.
      <pre style="font-size:.6rem;margin-top:.4rem;overflow:auto;max-height:80px;color:rgba(255,255,255,.5);">${JSON.stringify(responseData, null, 2).slice(0, 300)}</pre>
    `, 'error');
    return;
  }

  // ── Step 7: Show side-by-side comparison ─────────────────────────────
  _vtoResultBase64 = resultB64;

  const beforeSrc = selfieB64
    ? 'data:image/jpeg;base64,' + selfieB64
    : (selfieEl?.src || '');

  $('vto-compare-before').src = beforeSrc;
  $('vto-compare-after').src  = 'data:image/jpeg;base64,' + resultB64;
  $('vto-result-wrap').style.display = 'block';

  _setStitchStatus(`
    <span style="color:#4ade80;">✓ Oracle stitching complete!</span>
    AI-generated try-on is shown below.
  `, 'success');

  toast('✦', 'Oracle Stitch complete! Your AI look is ready.');
  log(`Stitch successful via ${usedEndpoint}`);
}

// ── Close the result comparison panel ────────────────────────────────
function closeVTOResult() {
  $('vto-result-wrap').style.display = 'none';
  _setStitchStatus('', '');
}

// ── Download the AI stitched result ──────────────────────────────────
function downloadVTOResult() {
  if (!_vtoResultBase64) {
    toast('⚠', 'No Oracle result to download yet.');
    return;
  }
  const a = document.createElement('a');
  a.href     = 'data:image/jpeg;base64,' + _vtoResultBase64;
  a.download = 'oracle-ai-look.jpg';
  a.click();
  toast('✓', 'AI look downloaded!');
}

// Expose globally
window.callOracleStitching = callOracleStitching;
window.closeVTOResult      = closeVTOResult;
window.downloadVTOResult   = downloadVTOResult;
window._vtoEngine_callOracleStitching = callOracleStitching;

// ── Inject CSS for stitching panels ──────────────────────────────────
(function injectVTOStyles() {
  if (document.getElementById('vto-n8n-styles')) return;
  const s = document.createElement('style');
  s.id = 'vto-n8n-styles';
  s.textContent = `
    /* ── Stitch status box ── */
    #vto-stitch-status {
      margin: .75rem 0 0;
      padding: .65rem .9rem;
      border-radius: 10px;
      font-size: .78rem;
      color: rgba(255,255,255,.85);
      border: 1px solid rgba(255,255,255,.08);
      line-height: 1.5;
    }
    .vto-stitch-anim {
      display: flex;
      align-items: center;
      gap: .75rem;
    }
    .vto-stitch-spinner {
      width: 28px; height: 28px; flex-shrink: 0;
      border: 3px solid rgba(167,139,250,.25);
      border-top-color: #a78bfa;
      border-radius: 50%;
      animation: vto-spin 0.8s linear infinite;
    }
    @keyframes vto-spin { to { transform: rotate(360deg); } }

    /* ── Result comparison panel ── */
    #vto-result-wrap {
      margin-top: 1rem;
      background: rgba(15,10,30,.85);
      border: 1px solid rgba(167,139,250,.2);
      border-radius: 14px;
      padding: .8rem;
      animation: vto-fadein .4s ease;
    }
    @keyframes vto-fadein { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
    .vto-result-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: .6rem;
    }
    .vto-compare-grid {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: .5rem;
      align-items: center;
    }
    .vto-compare-side {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: .3rem;
    }
    .vto-compare-side img {
      width: 100%;
      max-height: 260px;
      object-fit: cover;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,.1);
    }
    .vto-compare-label {
      font-size: .65rem;
      color: var(--slate-light, rgba(255,255,255,.45));
      text-transform: uppercase;
      letter-spacing: .08em;
    }
    .vto-compare-divider {
      color: #a78bfa;
      font-size: 1.3rem;
      font-weight: 300;
    }

    /* ── Oracle Stitch button pulse ── */
    #vto-stitch-btn {
      border: none;
      box-shadow: 0 0 18px rgba(168,85,247,.35);
      transition: box-shadow .3s, opacity .2s;
    }
    #vto-stitch-btn:hover:not(:disabled) {
      box-shadow: 0 0 28px rgba(168,85,247,.6);
    }
    #vto-stitch-btn:disabled { opacity: .6; cursor: not-allowed; }

    /* ── Modal scroll + actions always visible ── */
    #vto-modal {
      max-height: 92vh;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .vto-actions {
      position: sticky;
      bottom: 0;
      background: rgba(10,8,25,0.97);
      padding: .6rem 0 .3rem;
      margin-top: .5rem;
      border-top: 1px solid rgba(212,175,55,0.12);
      display: flex;
      flex-wrap: wrap;
      gap: .5rem;
      justify-content: center;
      z-index: 1;
    }
  `;
  document.head.appendChild(s);
})();

log('VTO Engine v3 ready — CSS two-layer mode + n8n Oracle Stitching enabled');

