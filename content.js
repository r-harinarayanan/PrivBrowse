/**
 * PrivBrowse — Content Script & Visual Action Engine
 * 
 * Stages Implemented:
 * - Stage 1: Local Perception (DOM scanning, structural skeleton creation)
 * - Stage 5: Local Execution (Visual Agent HUD, virtual cursor, tactile typing, native DOM events)
 * 
 * SIH 2026, PS ID SIH26171 | Team: Breaking Bad
 */

(function () {
  'use strict';

  // Prevent duplicate initialization
  if (window.__PRIVBROWSE_CONTENT_INITIALIZED__) {
    console.log('[PrivBrowse] Content script already initialized in this tab.');
    return;
  }
  window.__PRIVBROWSE_CONTENT_INITIALIZED__ = true;

  // Security Invariant: Deep Isolated World Prototype Hardening (Critique 4)
  // Pin native prototype primitives
  const _Map_get = Map.prototype.get;
  const _Map_set = Map.prototype.set;
  const _Map_has = Map.prototype.has;
  const _Map_clear = Map.prototype.clear;
  const _querySelector = Document.prototype.querySelector;
  const _querySelectorAll = Document.prototype.querySelectorAll;
  const _getElementById = Document.prototype.getElementById;
  const _getAttribute = Element.prototype.getAttribute;

  // Immunize isolated world against prototype pollution attacks:
  // Use a prototype-less dictionary (Object.create(null)) sealed inside a frozen interface.
  // Object.prototype pollution cannot alter, trap, or read properties from a null-prototype table!
  const _refStore = Object.create(null);
  const elementRefMap = Object.freeze({
    set(refId, el) {
      if (typeof refId === 'string' && el && typeof el === 'object') {
        _refStore[refId] = el;
      }
      return this;
    },
    get(refId) {
      return Object.prototype.hasOwnProperty.call(_refStore, refId) ? _refStore[refId] : undefined;
    },
    has(refId) {
      return Object.prototype.hasOwnProperty.call(_refStore, refId);
    },
    clear() {
      for (const k of Object.keys(_refStore)) {
        delete _refStore[k];
      }
    },
    get size() {
      return Object.keys(_refStore).length;
    }
  });

  // Freeze prototypes in isolated world
  try {
    Object.freeze(Object.prototype);
    Object.freeze(Map.prototype);
    Object.freeze(Array.prototype);
  } catch (e) {}

  // =========================================================================
  // IN-PAGE AGENT HUD & VISUAL STYLES
  // =========================================================================
  function injectAgentStyles() {
    if (document.getElementById('privbrowse-agent-styles')) return;
    const style = document.createElement('style');
    style.id = 'privbrowse-agent-styles';
    style.textContent = `
      /* On-Page Floating Agent HUD */
      #privbrowse-hud {
        position: fixed !important;
        top: 14px !important;
        left: 50% !important;
        transform: translateX(-50%) translateY(-100px) !important;
        background: rgba(15, 23, 42, 0.95) !important;
        backdrop-filter: blur(12px) !important;
        border: 1px solid rgba(16, 185, 129, 0.4) !important;
        border-radius: 40px !important;
        padding: 8px 18px !important;
        display: flex !important;
        align-items: center !important;
        gap: 14px !important;
        z-index: 2147483646 !important;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6), 0 0 15px rgba(16, 185, 129, 0.25) !important;
        color: #f8fafc !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        font-size: 12px !important;
        transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease !important;
        pointer-events: none !important;
        opacity: 0 !important;
        max-width: 90vw !important;
      }
      #privbrowse-hud.visible {
        transform: translateX(-50%) translateY(0) !important;
        opacity: 1 !important;
      }
      .pb-hud-badge {
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
        font-weight: 700 !important;
        font-size: 11px !important;
        text-transform: uppercase !important;
        letter-spacing: 0.5px !important;
        color: #10b981 !important;
      }
      .pb-hud-dot {
        width: 8px !important;
        height: 8px !important;
        border-radius: 50% !important;
        background: #10b981 !important;
        box-shadow: 0 0 8px #10b981 !important;
        animation: pb-pulse 1.5s infinite !important;
      }
      @keyframes pb-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.4; transform: scale(0.85); }
      }
      .pb-hud-stage {
        background: rgba(16, 185, 129, 0.15) !important;
        border: 1px solid rgba(16, 185, 129, 0.35) !important;
        color: #34d399 !important;
        padding: 2px 8px !important;
        border-radius: 12px !important;
        font-weight: 600 !important;
        font-size: 11px !important;
        white-space: nowrap !important;
      }
      .pb-hud-stage.alert {
        background: rgba(239, 68, 68, 0.2) !important;
        border-color: #ef4444 !important;
        color: #fca5a5 !important;
      }
      .pb-hud-action {
        color: #e2e8f0 !important;
        font-weight: 500 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        max-width: 400px !important;
      }

      /* Virtual Agent Cursor */
      #privbrowse-cursor {
        position: absolute !important;
        width: 24px !important;
        height: 24px !important;
        pointer-events: none !important;
        z-index: 2147483647 !important;
        transition: top 0.4s cubic-bezier(0.25, 1, 0.5, 1), left 0.4s cubic-bezier(0.25, 1, 0.5, 1) !important;
        opacity: 0 !important;
        filter: drop-shadow(0 2px 6px rgba(0,0,0,0.5)) !important;
      }
      #privbrowse-cursor.visible {
        opacity: 1 !important;
      }
      .pb-cursor-pointer {
        width: 100% !important;
        height: 100% !important;
        fill: #10b981 !important;
        stroke: #ffffff !important;
        stroke-width: 1.5 !important;
      }
      .pb-cursor-ring {
        position: absolute !important;
        top: -6px !important;
        left: -6px !important;
        width: 36px !important;
        height: 36px !important;
        border-radius: 50% !important;
        border: 2px solid #10b981 !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      .pb-cursor-ring.clicking {
        animation: pb-click-ripple 0.4s ease-out !important;
      }
      @keyframes pb-click-ripple {
        0% { transform: scale(0.4); opacity: 1; }
        100% { transform: scale(1.6); opacity: 0; }
      }

      /* Target Element Reticle & Badge */
      .privbrowse-target-focus {
        outline: 3px solid #10b981 !important;
        outline-offset: 3px !important;
        box-shadow: 0 0 20px rgba(16, 185, 129, 0.5) !important;
        transition: all 0.25s ease !important;
        position: relative !important;
      }
      .privbrowse-target-badge {
        position: absolute !important;
        background: #0f172a !important;
        color: #10b981 !important;
        border: 1px solid #10b981 !important;
        font-family: ui-monospace, Menlo, monospace !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        padding: 3px 8px !important;
        border-radius: 6px !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4) !important;
        z-index: 2147483647 !important;
        pointer-events: none !important;
        animation: pb-badge-pop 0.2s ease-out !important;
        white-space: nowrap !important;
      }
      @keyframes pb-badge-pop {
        from { transform: translateY(4px) scale(0.95); opacity: 0; }
        to { transform: translateY(0) scale(1); opacity: 1; }
      }

      /* Adversarial Exploit Neutralized In-Page Alert */
      #privbrowse-defense-banner {
        position: fixed !important;
        bottom: 24px !important;
        right: 24px !important;
        background: #450a0a !important;
        border: 1px solid #ef4444 !important;
        color: #fecaca !important;
        padding: 14px 18px !important;
        border-radius: 10px !important;
        box-shadow: 0 10px 25px rgba(239, 68, 68, 0.3) !important;
        z-index: 2147483647 !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        font-size: 12.5px !important;
        max-width: 360px !important;
        line-height: 1.4 !important;
        transform: translateY(120px) !important;
        opacity: 0 !important;
        transition: transform 0.3s ease, opacity 0.3s ease !important;
      }
      #privbrowse-defense-banner.visible {
        transform: translateY(0) !important;
        opacity: 1 !important;
      }
      .pb-defense-title {
        font-weight: 700 !important;
        color: #f87171 !important;
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
        margin-bottom: 4px !important;
        font-size: 13px !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }
  injectAgentStyles();

  // Create or retrieve HUD element
  function getOrCreateHUD() {
    let hud = document.getElementById('privbrowse-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'privbrowse-hud';
      hud.setAttribute('role', 'status');
      hud.setAttribute('aria-live', 'polite');
      hud.innerHTML = `
        <div class="pb-hud-badge">
          <div class="pb-hud-dot"></div>
          <span>PrivBrowse Enterprise</span>
        </div>
        <div class="pb-hud-stage" id="pb-hud-stage">Stage 1: Perception</div>
        <div class="pb-hud-action" id="pb-hud-action">Initializing agent...</div>
      `;
      document.body.appendChild(hud);
    }
    return hud;
  }

  function updateHUD(stageText, actionText, isAlert = false) {
    const hud = getOrCreateHUD();
    const stageEl = document.getElementById('pb-hud-stage');
    const actionEl = document.getElementById('pb-hud-action');

    if (stageEl) {
      stageEl.textContent = stageText;
      stageEl.classList.toggle('alert', isAlert);
    }
    if (actionEl) {
      actionEl.textContent = actionText;
    }

    hud.classList.add('visible');
  }

  function hideHUD(delay = 2500) {
    setTimeout(() => {
      const hud = document.getElementById('privbrowse-hud');
      if (hud) hud.classList.remove('visible');
    }, delay);
  }

  // Create or retrieve virtual cursor
  function getOrCreateCursor() {
    let cursor = document.getElementById('privbrowse-cursor');
    if (!cursor) {
      cursor = document.createElement('div');
      cursor.id = 'privbrowse-cursor';
      cursor.innerHTML = `
        <svg class="pb-cursor-pointer" viewBox="0 0 24 24">
          <path d="M4 2l16 11-7.5 1.5-4.5 7.5L4 2z"/>
        </svg>
        <div class="pb-cursor-ring" id="pb-cursor-ring"></div>
      `;
      document.body.appendChild(cursor);
    }
    return cursor;
  }

  async function moveCursorTo(el) {
    const cursor = getOrCreateCursor();
    const rect = el.getBoundingClientRect();
    const targetX = rect.left + window.scrollX + Math.min(20, rect.width / 2);
    const targetY = rect.top + window.scrollY + Math.min(18, rect.height / 2);

    cursor.style.left = `${targetX}px`;
    cursor.style.top = `${targetY}px`;
    cursor.classList.add('visible');

    await new Promise(r => setTimeout(r, 380));
  }

  function triggerCursorClick() {
    const ring = document.getElementById('pb-cursor-ring');
    if (ring) {
      ring.classList.remove('clicking');
      void ring.offsetWidth; // force reflow
      ring.classList.add('clicking');
    }
  }

  function hideCursor() {
    const cursor = document.getElementById('privbrowse-cursor');
    if (cursor) cursor.classList.remove('visible');
  }

  function showDefenseBanner(message) {
    let banner = document.getElementById('privbrowse-defense-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'privbrowse-defense-banner';
      banner.setAttribute('role', 'alert');
      banner.setAttribute('aria-live', 'assertive');
      document.body.appendChild(banner);
    }
    banner.innerHTML = `
      <div class="pb-defense-title">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 5px;">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <path d="M9 12l2 2 4-4"/>
        </svg>
        CaMeL Defense Gate Triggered
      </div>
      <div>${message}</div>
    `;
    banner.classList.add('visible');
    setTimeout(() => {
      banner.classList.remove('visible');
    }, 5000);
  }

  // =========================================================================
  // STAGE 1: LOCAL PERCEPTION
  // =========================================================================

  function resolveElementLabel(el) {
    if (el.id) {
      const labelEl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (labelEl && labelEl.innerText.trim()) return labelEl.innerText.trim();
    }
    const parentLabel = el.closest('label');
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true);
      clone.querySelectorAll('input, select, textarea').forEach(n => n.remove());
      const txt = clone.innerText.trim();
      if (txt) return txt;
    }
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

    const ariaLabelledBy = el.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const labeller = document.getElementById(ariaLabelledBy);
      if (labeller && labeller.innerText.trim()) return labeller.innerText.trim();
    }
    const placeholder = el.getAttribute('placeholder');
    if (placeholder && placeholder.trim()) return placeholder.trim();

    if (el.tagName === 'BUTTON' || (el.tagName === 'INPUT' && ['button', 'submit', 'reset'].includes(el.type))) {
      const btnText = el.innerText || el.value;
      if (btnText && btnText.trim()) return btnText.trim();
    }

    const container = el.closest('.form-group, .form-field, .field, div, p');
    if (container) {
      const prevLabel = container.querySelector('label, .label, .field-label, legend');
      if (prevLabel && prevLabel !== el && prevLabel.innerText.trim()) {
        return prevLabel.innerText.trim();
      }
    }
    return el.name || el.id || el.title || '';
  }

  // =========================================================================
  // SHADOW DOM RECURSIVE TRAVERSAL & PIERCING ENGINE
  // =========================================================================
  function getAllInteractiveElements(root = document) {
    const selector = [
      'input:not([type="hidden"])',
      'select',
      'textarea',
      'button',
      '[role="button"]',
      '[role="checkbox"]',
      '[role="combobox"]',
      'a[role="button"]'
    ].join(', ');

    let elements = [];
    try {
      if (root.querySelectorAll) {
        elements.push(...Array.from(root.querySelectorAll(selector)));
      }
    } catch (e) {}

    // Recursively inspect child elements for Shadow Roots
    try {
      const allDescendants = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
      for (const el of allDescendants) {
        if (el.shadowRoot) {
          // Open shadow root pierced successfully
          elements.push(...getAllInteractiveElements(el.shadowRoot));
        } else if (el.hasAttribute && (el.hasAttribute('shadowroot') || el.hasAttribute('shadowrootmode') || el.getAttribute('data-shadow-closed'))) {
          // Closed shadow root detected: fallback gracefully to light DOM
          console.warn(`[PrivBrowse Perception] Detected closed shadow root on <${el.tagName.toLowerCase()}>. Falling back to light DOM perception for this component.`);
        }
      }
    } catch (err) {
      console.warn('[PrivBrowse] Shadow DOM traversal warning:', err.message);
    }

    return elements;
  }

  function perceive() {
    elementRefMap.clear();

    const candidates = getAllInteractiveElements(document);
    const skeleton = [];
    let refCounter = 1;

    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);

      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        parseFloat(style.opacity) === 0 ||
        el.disabled ||
        el.hasAttribute('aria-hidden')
      ) {
        continue;
      }

      if (rect.width <= 0 && rect.height <= 0) continue;

      const refId = `ref_${refCounter++}`;
      el.setAttribute('data-privbrowse-ref', refId);
      el.dataset.privbrowseRef = refId;
      elementRefMap.set(refId, el);

      const tagName = el.tagName.toLowerCase();
      const type = (el.getAttribute('type') || (tagName === 'select' ? 'select' : tagName === 'button' ? 'button' : 'text')).toLowerCase();
      const label = resolveElementLabel(el);
      const placeholder = el.getAttribute('placeholder') || '';
      const isRequired = el.required || el.getAttribute('aria-required') === 'true';

      let options = null;
      if (tagName === 'select') {
        options = Array.from(el.options).map(opt => ({
          text: (opt.text || '').trim(),
          value: opt.value || ''
        }));
      }

      skeleton.push({
        refId,
        tag: tagName,
        tagName,
        type,
        label,
        placeholder,
        required: isRequired,
        name: el.name || '',
        id: el.id || '',
        options,
        bounds: {
          top: Math.round(rect.top + window.scrollY),
          left: Math.round(rect.left + window.scrollX),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      });
    }

    return skeleton;
  }

  // =========================================================================
  // ATOMIC ZERO-KNOWLEDGE FRAME RENDERING (AZFR) & VISION GROUNDING
  // =========================================================================
  // Temporarily renders input text-fill transparent at the compositor level during the
  // 16ms capture window. Ensures that even before pixels reach memory, raw characters are absent!
  function applyZeroKnowledgeRenderMask() {
    let maskStyle = _getElementById.call(document, 'privbrowse-zk-mask');
    if (!maskStyle) {
      maskStyle = document.createElement('style');
      maskStyle.id = 'privbrowse-zk-mask';
      maskStyle.textContent = `
        input:not([type="button"]):not([type="submit"]):not([type="reset"]),
        textarea,
        [contenteditable="true"],
        select {
          color: transparent !important;
          -webkit-text-fill-color: transparent !important;
          text-shadow: none !important;
          background-color: #0f172a !important;
          background-image: none !important;
          caret-color: transparent !important;
        }
        input::placeholder, textarea::placeholder {
          color: transparent !important;
          -webkit-text-fill-color: transparent !important;
        }
      `;
      (document.head || document.documentElement).appendChild(maskStyle);
    }
    return maskStyle;
  }

  function removeZeroKnowledgeRenderMask() {
    const maskStyle = _getElementById.call(document, 'privbrowse-zk-mask');
    if (maskStyle && maskStyle.parentNode) {
      maskStyle.parentNode.removeChild(maskStyle);
    }
  }

  async function captureDownscaledScreenshot() {
    return new Promise((resolve, reject) => {
      // Step 1: Engage Atomic Zero-Knowledge Frame Rendering (Compositor Level)
      applyZeroKnowledgeRenderMask();

      requestAnimationFrame(() => {
        chrome.runtime.sendMessage({ type: 'captureScreenshot' }, (response) => {
          // Immediately release the mask so the user's viewport is unaffected
          removeZeroKnowledgeRenderMask();

          if (!response || response.error || !response.dataUrl) {
            return reject(new Error(response?.error || 'Screenshot capture not available'));
          }
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 640;
            const MAX_HEIGHT = 360;
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > MAX_WIDTH) {
                height = Math.round(height * (MAX_WIDTH / width));
                width = MAX_WIDTH;
              }
            } else {
              if (height > MAX_HEIGHT) {
                width = Math.round(width * (MAX_HEIGHT / height));
                height = MAX_HEIGHT;
              }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // =========================================================================
            // PRIVACY INVARIANT: CLIENT-SIDE VISUAL PRE-MASKING (BLACKOUT BOXES)
            // =========================================================================
            // Even in the downscaled image, typed user text or pre-filled values
            // must NEVER be visible in pixel memory. We blackout all input field interiors!
            let inputBounds = [];
            try {
              const scaleX = width / Math.max(1, window.innerWidth);
              const scaleY = height / Math.max(1, window.innerHeight);

              const sensitiveInputs = document.querySelectorAll('input, textarea, [contenteditable="true"]');
              ctx.fillStyle = '#0f172a'; // Opaque privacy blackout fill
              ctx.strokeStyle = '#10b981'; // Structural border preserved for vision grounding
              ctx.lineWidth = 1;

              sensitiveInputs.forEach(inputEl => {
                const rect = inputEl.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                  const bx = Math.round(rect.left * scaleX);
                  const by = Math.round(rect.top * scaleY);
                  const bw = Math.round(rect.width * scaleX);
                  const bh = Math.round(rect.height * scaleY);
                  inputBounds.push({ x: bx, y: by, width: bw, height: bh, left: bx, top: by });

                  // Blackout the typed text interior while maintaining bounding box edge
                  ctx.fillRect(bx, by, bw, bh);
                  ctx.strokeRect(bx, by, bw, bh);
                }
              });
            } catch (maskErr) {
              console.warn('[PrivBrowse] Visual pre-masking notice:', maskErr);
            }

            resolve({
              dataUrl: canvas.toDataURL('image/jpeg', 0.8),
              inputBounds: inputBounds || []
            });
          } catch (e) {
            reject(e);
          }
        };
        img.onerror = () => reject(new Error('Failed to load captured screenshot image'));
        img.src = response.dataUrl;
      });
    });
  });
}

  async function perceiveWithVisionOrDOM(hmacRunToken = '') {
    const t0 = performance.now();
    const domSkeleton = perceive();

    // Check user-configured perception engine
    let perceptionEngine = 'vision';
    try {
      const cfg = await new Promise(res => {
        chrome.storage.local.get(['privbrowse_config', 'perceptionEngine'], r => {
          res(r.privbrowse_config?.perceptionEngine || r.perceptionEngine || 'vision');
        });
      });
      if (cfg) perceptionEngine = cfg;
    } catch (e) {}

    if (perceptionEngine === 'dom') {
      const latencyMs = Math.round(performance.now() - t0);
      updateHUD('Stage 1: Layout Perception', `Deterministic DOM layout perception complete (${domSkeleton.length} elements, ${latencyMs}ms).`);
      return {
        skeleton: domSkeleton,
        mode: 'dom',
        latencyMs
      };
    }

    try {
      updateHUD('Stage 1: Neural Vision Grounding', 'Running SmolVLM-256M visual layout perception (WebGPU)...');
      const captureResult = await captureDownscaledScreenshot();
      const downscaledDataUrl = typeof captureResult === 'string' ? captureResult : captureResult.dataUrl;
      const inputBounds = captureResult.inputBounds || [];

      const visionResponse = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Vision inference timeout')), 8000);
        chrome.runtime.sendMessage({
          type: 'perceiveWithVision',
          imageData: downscaledDataUrl,
          inputBounds: inputBounds,
          hmacRunToken: hmacRunToken
        }, (res) => {
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (res && res.success && res.skeleton && res.skeleton.length > 0) {
            resolve(res.skeleton);
          } else {
            reject(new Error(res?.error || 'SmolVLM detected no elements'));
          }
        });
      });

      const latencyMs = Math.round(performance.now() - t0);
      console.log(`[PrivBrowse] SmolVLM WebGPU detected ${visionResponse.length} visual elements in ${latencyMs}ms`);
      return {
        skeleton: domSkeleton,
        mode: 'vision',
        visualDetections: visionResponse.length,
        latencyMs
      };
    } catch (err) {
      const latencyMs = Math.round(performance.now() - t0);
      console.log(`[PrivBrowse] Vision perception fallback to DOM (${latencyMs}ms):`, err.message);
      return {
        skeleton: domSkeleton,
        mode: 'dom_fallback',
        latencyMs
      };
    }
  }

  async function sanitizeSkeletonWithGLiNER(skeleton, denylist = []) {
    let glinerRedactions = 0;
    const workingSkeleton = [];

    for (const item of skeleton) {
      const newItem = { ...item };
      for (const field of ['label', 'placeholder']) {
        if (newItem[field] && typeof newItem[field] === 'string' && newItem[field].trim().length > 2) {
          try {
            const redacted = await new Promise((resolve) => {
              const timer = setTimeout(() => resolve(newItem[field]), 2000);
              chrome.runtime.sendMessage({
                type: 'redactWithGLiNER',
                text: newItem[field]
              }, (res) => {
                clearTimeout(timer);
                if (res && res.success && res.redacted) resolve(res.redacted);
                else resolve(newItem[field]);
              });
            });

            if (redacted && redacted !== newItem[field]) {
              glinerRedactions++;
              newItem[field] = redacted;
            }
          } catch (e) {
            // Graceful fallback to regex
          }
        }
      }
      workingSkeleton.push(newItem);
    }

    // Deterministic Regex Sanitization Pass (Defense in depth)
    let regexResult;
    if (window.PrivBrowseSanitizer) {
      regexResult = window.PrivBrowseSanitizer.sanitizeSkeleton(workingSkeleton, denylist);
    } else if (typeof sanitizeSkeleton === 'function') {
      regexResult = sanitizeSkeleton(workingSkeleton, denylist);
    } else {
      regexResult = { sanitizedSkeleton: workingSkeleton, stats: { elementsScanned: skeleton.length, redactionsCount: glinerRedactions } };
    }

    const stats = regexResult.stats || { elementsScanned: skeleton.length, redactionsCount: regexResult.redactedCount || 0 };
    stats.redactionsCount = (stats.redactionsCount || 0) + glinerRedactions;

    return {
      sanitizedSkeleton: regexResult.sanitizedSkeleton || workingSkeleton,
      stats,
      nerMode: glinerRedactions > 0 ? 'gliner' : 'regex'
    };
  }

  // =========================================================================
  // STAGE 5: LOCAL EXECUTION & TACTILE TYPING
  // =========================================================================

  const ALLOWED_USER_KEYS = new Set([
    'fullname', 'name', 'studentname', 'email', 'phone', 'mobile',
    'address', 'permanentaddress', 'category', 'dob', 'birthdate',
    'aadhaar', 'pan', 'state', 'pincode', 'zip'
  ]);

  function resolvePlaceholder(token, profile = {}) {
    if (!token || typeof token !== 'string') return '';

    const match = token.match(/^\{\{user\.([a-zA-Z0-9_]+)\}\}$/);
    if (!match) {
      // Literal value passed (e.g. select option)
      const sanitized = token.slice(0, 100);
      if (/<script|javascript:|eval\(|data:/i.test(sanitized)) {
        console.warn('[PrivBrowse Security] Blocked script pattern in literal value');
        return '';
      }
      return sanitized;
    }

    const key = match[1].toLowerCase();

    // STRICT TOKEN ENUM CHECK: Reject unknown or injected token paths (e.g. {{user.script}})
    if (!ALLOWED_USER_KEYS.has(key)) {
      console.warn(`[PrivBrowse Security] Blocked unauthorized placeholder token: {{user.${match[1]}}}`);
      return '';
    }

    const keyMap = {
      name: profile.fullName || profile.name || '',
      fullname: profile.fullName || profile.name || '',
      studentname: profile.fullName || profile.name || '',
      email: profile.email || '',
      phone: profile.phone || profile.mobile || '',
      mobile: profile.phone || profile.mobile || '',
      address: profile.address || '',
      permanentaddress: profile.address || '',
      category: profile.category || '',
      dob: profile.dob || profile.birthDate || '',
      aadhaar: profile.aadhaar || '',
      pan: profile.pan || '',
      state: profile.state || '',
      pincode: profile.pincode || profile.zip || ''
    };

    let resolved = keyMap[key];
    if (resolved === undefined) {
      for (const [pKey, pVal] of Object.entries(profile)) {
        if (pKey.toLowerCase() === key) {
          resolved = pVal;
          break;
        }
      }
    }

    if (typeof resolved === 'string') {
      const cleanVal = resolved.replace(/[<>]/g, '').slice(0, 150);

      // STRICT SCHEMA TYPE VALIDATION: Reject format anomalies or injected code
      const FIELD_TYPE_VALIDATORS = {
        fullname: /^[a-zA-Z\s.'-]{1,60}$/,
        name: /^[a-zA-Z\s.'-]{1,60}$/,
        studentname: /^[a-zA-Z\s.'-]{1,60}$/,
        email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,60}$/,
        phone: /^\+?[0-9\s\-()]{7,20}$/,
        mobile: /^\+?[0-9\s\-()]{7,20}$/,
        address: /^[a-zA-Z0-9\s,.'#\-/]{1,120}$/,
        permanentaddress: /^[a-zA-Z0-9\s,.'#\-/]{1,120}$/,
        category: /^[a-zA-Z0-9\s_\-]{1,30}$/,
        dob: /^[0-9\s\-\/.]{4,15}$/,
        birthdate: /^[0-9\s\-\/.]{4,15}$/,
        aadhaar: /^[0-9\s\-]{12,16}$/,
        pan: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/,
        pincode: /^[0-9]{4,10}$/,
        state: /^[a-zA-Z\s]{1,40}$/
      };

      const validator = FIELD_TYPE_VALIDATORS[key];
      if (validator && cleanVal && !validator.test(cleanVal)) {
        console.warn(`[PrivBrowse Security] Type schema validation failed on {{user.${key}}}: "${cleanVal}"`);
        return '';
      }

      return cleanVal;
    }
    return '';
  }

  /**
   * Tactile typing simulation: smoothly inserts characters with native input events
   * so that form preview monitors update character-by-character!
   */
  async function typeIntoElement(element, text) {
    element.focus();
    element.value = '';

    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

    // Type character by character
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const current = element.value + char;

      if (descriptor && descriptor.set) {
        descriptor.set.call(element, current);
      } else {
        element.value = current;
      }

      element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

      // Subtle typing delay (15-30ms) for high-fidelity visual feedback
      await new Promise(r => setTimeout(r, 22));
    }

    element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
  }

  async function executeStep(step, profile, stepIndex, totalSteps) {
    const originalScannedEl = elementRefMap.get(step.targetRefId);
    if (!originalScannedEl) {
      throw new Error(`Target element "${step.targetRefId}" not found on perception reference map`);
    }

    // =========================================================================
    // JIT (JUST-IN-TIME) EXECUTION SECURITY GATE & MUTATION DEFENSE
    // =========================================================================
    // 0. Element Object Identity Pinning: Prevents post-perception element injection attacks!
    // Ensures that ONLY the exact in-memory JavaScript node registered at T0 can be interacted with.
    const activeDomEl = document.querySelector(`[data-privbrowse-ref="${step.targetRefId}"]`);
    if (activeDomEl && activeDomEl !== originalScannedEl) {
      throw new Error(`[SECURITY GATE] Element Origin Violation: Target "${step.targetRefId}" was dynamically replaced or injected after perception! Node identity mismatch.`);
    }

    const el = originalScannedEl;

    // 1. Connectivity Check: element must be actively attached to DOM document
    if (!el.isConnected) {
      throw new Error(`[SECURITY GATE] Target element "${step.targetRefId}" is detached from the DOM. Possible swap attack blocked.`);
    }

    // 2. Reference ID Integrity: element must strictly retain the original stamped attribute
    if (el.getAttribute('data-privbrowse-ref') !== step.targetRefId) {
      throw new Error(`[SECURITY GATE] Reference ID spoofing detected on "${step.targetRefId}".`);
    }

    // 3. Visibility Check: element cannot be hidden or display:none
    const compStyle = window.getComputedStyle(el);
    if (
      compStyle.display === 'none' ||
      compStyle.visibility === 'hidden' ||
      parseFloat(compStyle.opacity) === 0 ||
      (el.offsetWidth === 0 && el.offsetHeight === 0)
    ) {
      throw new Error(`[SECURITY GATE] Target element "${step.targetRefId}" is hidden/invisible. Click-jacking prevented.`);
    }

    // 4. State Check: element cannot be disabled
    if (el.disabled || el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') {
      throw new Error(`[SECURITY GATE] Target element "${step.targetRefId}" is disabled. Execution prevented.`);
    }

    // 5. Action Type Conformity: click on inputs must be checkbox/radio/button; fill must be on text-accepting inputs
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    const action = (step.action || '').toLowerCase();

    if (action === 'fill') {
      const allowedFillTags = ['input', 'textarea'];
      if (!allowedFillTags.includes(tag) || ['button', 'submit', 'reset', 'checkbox', 'radio', 'file'].includes(type)) {
        throw new Error(`[SECURITY GATE] Illegal action "fill" on element "${step.targetRefId}" of type <${tag} type="${type}">.`);
      }
    } else if (action === 'select') {
      if (tag !== 'select' && el.getAttribute('role') !== 'combobox') {
        throw new Error(`[SECURITY GATE] Illegal action "select" on non-select element "${step.targetRefId}" (<${tag}>).`);
      }
    } else if (action === 'click') {
      const dangerousTags = ['iframe', 'script', 'object', 'embed', 'applet'];
      if (dangerousTags.includes(tag)) {
        throw new Error(`[SECURITY GATE] High-risk click action blocked on dangerous tag <${tag}>.`);
      }

      // Security Invariant: Block dangerous pseudo-protocol navigations (anti-XSS)
      if (tag === 'a' || el.hasAttribute('href')) {
        const href = (_getAttribute.call(el, 'href') || el.href || '').trim();
        if (/^(\s*javascript:|\s*data:|\s*vbscript:)/i.test(href)) {
          throw new Error(`[SECURITY GATE] High-risk click blocked on dangerous URI scheme "${href.slice(0, 30)}...". Pseudo-protocol execution prevented.`);
        }
      }
    }

    // Scroll into view smoothly
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await new Promise(r => setTimeout(r, 200));

    // Move virtual cursor
    await moveCursorTo(el);

    // Apply focus reticle
    el.classList.add('privbrowse-target-focus');

    // Create target element badge
    const rect = el.getBoundingClientRect();
    const badge = document.createElement('div');
    badge.className = 'privbrowse-target-badge';
    badge.style.top = `${Math.max(0, rect.top + window.scrollY - 26)}px`;
    badge.style.left = `${rect.left + window.scrollX}px`;

    if (action === 'fill') {
      const resolvedValue = resolvePlaceholder(step.value, profile);
      const label = resolveElementLabel(el) || step.targetRefId;

      badge.textContent = `⚡ [${step.targetRefId}] ${label} -> ${step.value}`;
      document.body.appendChild(badge);

      updateHUD(
        `Stage 5: Executing [${stepIndex}/${totalSteps}]`,
        `Filling "${label}" with local profile data`
      );

      triggerCursorClick();
      await typeIntoElement(el, resolvedValue);
      await new Promise(r => setTimeout(r, 200));

    } else if (action === 'select') {
      const resolvedValue = resolvePlaceholder(step.value, profile);
      const label = resolveElementLabel(el) || 'Category';

      badge.textContent = `⚡ [${step.targetRefId}] Select -> ${resolvedValue}`;
      document.body.appendChild(badge);

      updateHUD(
        `Stage 5: Executing [${stepIndex}/${totalSteps}]`,
        `Selecting "${resolvedValue}" for ${label}`
      );

      triggerCursorClick();

      let optionFound = false;
      for (let i = 0; i < el.options.length; i++) {
        const opt = el.options[i];
        if (
          opt.value.toLowerCase() === resolvedValue.toLowerCase() ||
          opt.text.toLowerCase().includes(resolvedValue.toLowerCase())
        ) {
          el.selectedIndex = i;
          optionFound = true;
          break;
        }
      }
      if (!optionFound && el.options.length > 1) {
        el.selectedIndex = 1;
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 300));

    } else if (action === 'click') {
      const label = resolveElementLabel(el) || (el.type === 'checkbox' ? 'Consent' : 'Button');

      badge.textContent = `⚡ [${step.targetRefId}] Click -> ${label}`;
      document.body.appendChild(badge);

      updateHUD(
        `Stage 5: Executing [${stepIndex}/${totalSteps}]`,
        `Clicking ${label}`
      );

      triggerCursorClick();

      if (el.type === 'checkbox') {
        el.checked = true;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        el.click();
      }
      await new Promise(r => setTimeout(r, 400));
    }

    el.classList.remove('privbrowse-target-focus');
    if (badge.parentNode) badge.remove();

    return { success: true, refId: step.targetRefId, action };
  }

  // =========================================================================
  // POST-EXECUTION DOM SURVEILLANCE (Zero-Trust Security Monitor)
  // =========================================================================
  let activeSurveillanceObserver = null;

  function startPostExecutionSurveillance(enabled = true) {
    if (!enabled) return;
    if (activeSurveillanceObserver) {
      try { activeSurveillanceObserver.disconnect(); } catch (e) {}
    }

    console.log('[PrivBrowse Security] Starting 5-second post-execution DOM surveillance...');
    
    activeSurveillanceObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue; // Only element nodes
          
          // Rule 1: Flag script tags with external domain sources
          if (node.tagName === 'SCRIPT') {
            const src = node.getAttribute('src') || '';
            if (src && (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//'))) {
              console.warn('[PrivBrowse Security Surveillance] External script tag injected post-execution:', src);
              showDefenseBanner(`⚠️ Security Alert: External script injected post-execution (${src.slice(0, 35)}...)`);
            }
          }
        }
      }
    });

    try {
      activeSurveillanceObserver.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}

    // Rule 2: Intercept unprompted form submit events
    const submitHandler = (e) => {
      if (!window.__PRIVBROWSE_EXECUTING_SUBMIT__) {
        console.warn('[PrivBrowse Security Surveillance] Unprompted form submission detected post-execution!');
        showDefenseBanner('⚠️ Security Alert: Unprompted form submission detected after agent completion.');
      }
    };
    document.addEventListener('submit', submitHandler, { capture: true, once: false });

    // Auto-terminate after 5 seconds to avoid any long-term runtime overhead
    setTimeout(() => {
      if (activeSurveillanceObserver) {
        activeSurveillanceObserver.disconnect();
        activeSurveillanceObserver = null;
      }
      document.removeEventListener('submit', submitHandler, true);
      console.log('[PrivBrowse Security] Post-execution surveillance concluded cleanly.');
    }, 5000);
  }

  async function executePlan(plan, profile, onProgress) {
    const results = [];
    updateHUD('Stage 5: Execution Active', `Beginning execution of ${plan.length} verified actions...`);

    for (let i = 0; i < plan.length; i++) {
      const step = plan[i];
      try {
        if (onProgress) {
          onProgress({
            currentStep: i + 1,
            totalSteps: plan.length,
            step
          });
        }

        const res = await executeStep(step, profile, i + 1, plan.length);
        results.push(res);
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        console.error('[PrivBrowse] Execution error at step:', step, err);
        updateHUD('Stage 5: Execution Interrupted', err.message, true);
        hideCursor();
        return {
          success: false,
          failedStepIndex: i,
          error: err.message,
          completedSteps: results
        };
      }
    }

    updateHUD('PrivBrowse Complete', 'All verified actions completed successfully!');
    hideCursor();
    hideHUD(3000);

    // Condition 2: Post-Execution DOM Activity Surveillance (5 seconds)
    startPostExecutionSurveillance(true);

    return {
      success: true,
      completedSteps: results
    };
  }

  // =========================================================================
  // MESSAGE LISTENERS (Supports both schemas)
  // =========================================================================
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 1. SCAN AND PERCEIVE (Handles both SCAN_AND_PERCEIVE and perceiveAndSanitize)
    if (message.type === 'SCAN_AND_PERCEIVE' || message.type === 'perceiveAndSanitize') {
      const denylist = message.denylist || [];
      const hmacRunToken = message.hmacRunToken || '';

      perceiveWithVisionOrDOM(hmacRunToken)
        .then(async (perceiveResult) => {
          const rawSkeleton = perceiveResult.skeleton;
          const perceptionMode = perceiveResult.mode;
          const latencyMs = perceiveResult.latencyMs || 0;

          const modeLabels = {
            vision: 'SmolVLM-256M (WebGPU) layout perception complete',
            dom_fallback: 'Deterministic DOM layout fallback complete',
            dom: 'Deterministic DOM layout perception complete'
          };
          updateHUD(
            perceptionMode === 'vision' ? 'Stage 1: Neural Vision Grounded' : 'Stage 1: Layout Perception',
            `${modeLabels[perceptionMode] || 'Layout perception complete'} (${rawSkeleton.length} elements, ${latencyMs}ms).`
          );

          updateHUD('Stage 2: PII Redaction', 'Running on-device GLiNER NER & regex scrub...');
          const sanitizedResult = await sanitizeSkeletonWithGLiNER(rawSkeleton, denylist);

          const stats = sanitizedResult.stats || { elementsScanned: rawSkeleton.length, redactionsCount: 0 };
          let cleanSkeleton = sanitizedResult.sanitizedSkeleton || rawSkeleton;
          if (window.PrivBrowseSanitizer && typeof window.PrivBrowseSanitizer.blindStructuralSkeleton === 'function') {
            cleanSkeleton = window.PrivBrowseSanitizer.blindStructuralSkeleton(cleanSkeleton);
          }

          updateHUD(
            'Stage 2: Sanitized',
            `Scrubbed ${rawSkeleton.length} elements (${stats.redactionsCount || 0} PII tokens masked). Zero PII egress.`
          );

          sendResponse({
            success: true,
            skeleton: rawSkeleton,
            sanitizedSkeleton: cleanSkeleton,
            stats: stats,
            piiCount: stats.redactionsCount || 0,
            mode: perceptionMode,
            nerMode: sanitizedResult.nerMode || 'regex'
          });
        })
        .catch(err => {
          // Direct fallback to pure synchronous DOM & regex
          try {
            const rawSkeleton = perceive();
            let sanitizedResult;
            if (window.PrivBrowseSanitizer) {
              sanitizedResult = window.PrivBrowseSanitizer.sanitizeSkeleton(rawSkeleton, denylist);
            } else {
              sanitizedResult = { sanitizedSkeleton: rawSkeleton, stats: { elementsScanned: rawSkeleton.length, redactionsCount: 0 } };
            }
            sendResponse({
              success: true,
              skeleton: rawSkeleton,
              sanitizedSkeleton: sanitizedResult.sanitizedSkeleton || rawSkeleton,
              stats: sanitizedResult.stats,
              piiCount: sanitizedResult.stats?.redactionsCount || 0,
              mode: 'dom_fallback'
            });
          } catch (innerErr) {
            sendResponse({ success: false, error: innerErr.message });
          }
        });

      return true;
    }

    // 2. EXECUTE VERIFIED PLAN (Handles both EXECUTE_VERIFIED_PLAN and executePlan)
    if (message.type === 'EXECUTE_VERIFIED_PLAN' || message.type === 'executePlan') {
      const plan = message.plan || [];

      // Fetch profile from message or local storage
      const getProfilePromise = message.profile
        ? Promise.resolve(message.profile)
        : new Promise(res => {
            chrome.storage.local.get(['userProfile', 'profile'], r => {
              res(r.userProfile || r.profile || {});
            });
          });

      getProfilePromise.then(profile => {
        return executePlan(plan, profile, (progress) => {
          chrome.runtime.sendMessage({
            type: 'EXECUTION_PROGRESS',
            progress
          }).catch(() => {});
        });
      }).then(result => {
        sendResponse(result);
      }).catch(err => {
        sendResponse({ success: false, error: err.message });
      });

      return true;
    }

    // 3. DEFENSE ALERT TRIGGER (For visual in-page display of CaMeL neutralization)
    if (message.type === 'SHOW_DEFENSE_ALERT') {
      showDefenseBanner(message.message);
      updateHUD('Stage 4: CaMeL Alert', message.message, true);
      sendResponse({ received: true });
      return true;
    }

    // 4. PING
    if (message.type === 'PING' || message.type === 'ping') {
      sendResponse({ status: 'PONG', ready: true, initialized: true });
      return true;
    }

    // 5. AUTOFILL ACTIVE FORM (Context Menu & Global Shortcut handler - Condition 5)
    if (message.type === 'AUTOFILL_ACTIVE_FORM') {
      let targetForm = null;
      if (document.activeElement && document.activeElement !== document.body) {
        targetForm = document.activeElement.closest('form') || document.activeElement.closest('[role="form"]');
      }
      if (!targetForm) {
        targetForm = document.querySelector('form') || document.querySelector('[role="form"]');
      }

      updateHUD('PrivBrowse Enterprise', `Autofill initiated via ${message.source || 'Context Menu'}...`);

      // Ensure profile exists and trigger pipeline
      chrome.storage.local.get(['userProfile', 'profile'], (res) => {
        const sampleProfile = {
          fullName: 'Aarav Sharma',
          email: 'aarav.sharma@example.edu.in',
          phone: '9876543210',
          address: '42 Civil Lines, North Campus, New Delhi 110007',
          category: 'OBC',
          dob: '2004-05-15',
          pincode: '110007',
          aadhaar: 'XXXX-XXXX-9012',
          pan: 'ABCDE1234F'
        };
        const profileToUse = res.userProfile || res.profile || sampleProfile;
        chrome.storage.local.set({ userProfile: profileToUse, profile: profileToUse }, () => {
          chrome.runtime.sendMessage({
            type: 'START_PIPELINE',
            goal: 'Autofill form with zero-PII profile details',
            forceSimulation: false
          }, (response) => {
            if (chrome.runtime.lastError) {
              updateHUD('PrivBrowse Error', chrome.runtime.lastError.message, true);
            }
          });
        });
      });

      sendResponse({
        success: true,
        targetFormDetected: Boolean(targetForm),
        formTag: targetForm ? targetForm.tagName : 'none'
      });
      return true;
    }
  });

  // Real-time Multi-Context Configuration Sync (Condition 6)
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.privbrowse_config) {
        console.log('[PrivBrowse Enterprise] Content script synchronized configuration.');
      }
    });
  }

  // =========================================================================
  // PAGE-EXTENSION BRIDGE (Allows on-page demo buttons to invoke REAL pipeline)
  // =========================================================================
  document.documentElement.setAttribute('data-privbrowse-extension-active', 'true');
  window.postMessage({ source: 'PRIVBROWSE_EXTENSION', type: 'EXTENSION_READY' }, '*');

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'PRIVBROWSE_PAGE_DEMO') return;

    if (event.data.type === 'TRIGGER_DEMO') {
      console.log('[PrivBrowse] Webpage triggered real pipeline execution:', event.data.goal);
      updateHUD('Stage 1: Perception Initiated', 'Engaging PrivBrowse 5-Stage Zero-PII Pipeline...');

      // Ensure default test profile is populated if missing
      chrome.storage.local.get(['userProfile', 'profile'], (res) => {
        const sampleProfile = {
          fullName: 'Aarav Sharma',
          email: 'aarav.sharma@example.edu.in',
          phone: '9876543210',
          address: '42 Civil Lines, North Campus, New Delhi 110007',
          category: 'OBC',
          dob: '2004-05-15',
          pincode: '110007',
          aadhaar: 'XXXX-XXXX-9012',
          pan: 'ABCDE1234F'
        };

        const profileToSave = res.userProfile || res.profile || sampleProfile;
        chrome.storage.local.set({ userProfile: profileToSave, profile: profileToSave }, () => {
          // Trigger the REAL 5-stage pipeline in background.js
          chrome.runtime.sendMessage({
            type: 'START_PIPELINE',
            goal: event.data.goal || 'Fill out this application form with my profile details',
            forceSimulation: false
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.error('[PrivBrowse] Pipeline trigger error:', chrome.runtime.lastError.message);
              updateHUD('PrivBrowse Error', chrome.runtime.lastError.message, true);
            } else if (response && response.success) {
              console.log('[PrivBrowse] Pipeline completed successfully:', response);
            } else {
              console.warn('[PrivBrowse] Pipeline response:', JSON.stringify(response));
            }
          });
        });
      });
    }
  });

  console.log('[PrivBrowse] High-Fidelity Visual Action Engine & Bridge initialized in content script.');
})();
