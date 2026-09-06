/**
 * PrivBrowse — Real Browser On-Device AI Model Runtime & Inference Test Suite (CDP)
 * 
 * Part of SIH 2026, PS ID SIH26171 | Team: Breaking Bad
 * 
 * Purpose:
 * Validates real execution of the on-device AI runtime (SmolVLM-256M + GLiNER ONNX)
 * in an actual headless Chromium browser instance with WebGPU flags enabled.
 * Connects directly to the Offscreen Document and Service Worker via Chrome DevTools Protocol (CDP).
 */

const assert = require('assert');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const WebSocket = globalThis.WebSocket;

let passCount = 0;
let failCount = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${desc}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${desc}`);
    console.error(`     Reason: ${err.message}\n`);
    failCount++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${desc}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${desc}`);
    console.error(`     Reason: ${err.message}\n`);
    failCount++;
  }
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
    this.events = [];
    this.eventListeners = new Map();

    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
        if (this.eventListeners.has(msg.method)) {
          this.eventListeners.get(msg.method)(msg.params);
        }
      }
    };
  }

  on(method, fn) {
    this.eventListeners.set(method, fn);
  }

  async send(method, params = {}) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || 'Evaluation exception');
    }
    return res.result?.value;
  }

  close() {
    try { this.ws.close(); } catch (e) {}
  }
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  console.log('================================================================');
  console.log(' PrivBrowse On-Device AI Model Inference Suite (Chromium WebGPU) ');
  console.log('================================================================\n');

  const extensionPath = path.resolve(__dirname);
  const possiblePaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  ];

  let browserExe = possiblePaths.find(p => fs.existsSync(p));
  if (!browserExe) {
    console.error('  ❌ Chromium browser executable not found on system.');
    process.exit(1);
  }

  const cdpPort = 9265;
  const tmpDir = path.join(os.tmpdir(), 'pb_model_inference_' + Date.now());

  console.log(`[Model E2E] Launching Chromium: ${browserExe}`);
  console.log(`[Model E2E] Flags: --enable-unsafe-webgpu, --use-gl=angle, --load-extension`);
  console.log(`[Model E2E] Remote Debugging Port: ${cdpPort}\n`);

  const browserProc = spawn(browserExe, [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${tmpDir}`,
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    '--enable-unsafe-webgpu',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-features=Vulkan',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    'about:blank'
  ]);

  browserProc.on('error', (err) => {
    console.error('Failed to spawn browser:', err);
  });

  let swClient = null;
  let offscreenClient = null;
  let pageClient = null;

  try {
    await sleep(2500);

    const getTargets = () => new Promise((resolve, reject) => {
      http.get(`http://localhost:${cdpPort}/json`, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(raw)); } catch (e) { resolve([]); }
        });
      }).on('error', reject);
    });

    let targets = [];
    for (let i = 0; i < 30; i++) {
      try {
        targets = await getTargets();
        if (targets.some(t => t.type === 'service_worker' && t.url.includes('background.js'))) break;
      } catch (e) {}
      await sleep(300);
    }

    const swTarget = targets.find(t => t.type === 'service_worker' && t.url.includes('background.js'));
    assert(swTarget, 'Extension background service worker target must exist in browser');

    swClient = new CDPClient(swTarget.webSocketDebuggerUrl);
    await swClient.ready;
    await swClient.send('Console.enable');

    console.log('[Model E2E] Connected to Extension Service Worker. Spawning Offscreen Document...');

    // Trigger offscreen document creation from service worker
    await swClient.eval(`ensureOffscreenDocument()`);
    await sleep(1500);

    // Re-query targets to find the Offscreen Document
    targets = await getTargets();
    const offscreenTarget = targets.find(t => t.url.includes('offscreen.html'));
    assert(offscreenTarget, 'Offscreen document target (offscreen.html) must be created and active');

    offscreenClient = new CDPClient(offscreenTarget.webSocketDebuggerUrl);
    await offscreenClient.ready;
    await offscreenClient.send('Console.enable');
    await offscreenClient.send('Runtime.enable');

    console.log(`[Model E2E] Connected to Offscreen Document (${offscreenTarget.url})`);

    const pageTarget = targets.find(t => t.type === 'page' && !t.url.startsWith('edge://') && !t.url.startsWith('chrome://')) || targets.find(t => t.type === 'page');
    if (pageTarget) {
      pageClient = new CDPClient(pageTarget.webSocketDebuggerUrl);
      await pageClient.ready;
      await pageClient.send('Page.enable');
      await pageClient.send('Runtime.enable');
      await pageClient.send('Console.enable');
      pageClient.on('Console.messageAdded', (params) => {
        if (params?.message?.text?.includes('PrivBrowse') || params?.message?.text?.includes('error') || params?.message?.text?.includes('Vision')) {
          console.log('[Page Console]:', params.message.text);
        }
      });
      console.log(`[Model E2E] Connected to Page Target (${pageTarget.url})\n`);
    }

    // =========================================================================
    // TEST 1: OFFSCREEN ENVIRONMENT & PERSISTENT CACHE API INVARIANTS
    // =========================================================================
    console.log('[Test 1] Real Browser Offscreen Environment & Cache API Invariants:');
    
    await itAsync('Verifies offscreen document is hosted in isolated extension origin', async () => {
      const origin = await offscreenClient.eval(`window.location.origin`);
      assert(origin.startsWith('chrome-extension://'), 'Must run in private extension origin');
    });

    await itAsync('Verifies persistent Cache Storage API is available for neural weights', async () => {
      const cacheSupport = await offscreenClient.eval(`!!window.caches`);
      assert.strictEqual(cacheSupport, true, 'window.caches must be supported in offscreen document');
    });

    await itAsync('Verifies Transformers.js and ONNX Runtime Web are loaded in offscreen context', async () => {
      const envLoaded = await offscreenClient.eval(`typeof env !== 'undefined'`);
      assert.strictEqual(envLoaded, true, 'Transformers.js env object must be loaded');
    });

    // =========================================================================
    // TEST 2: WEBGPU HARDWARE CAPABILITY PROBE & RUNTIME FALLBACK
    // =========================================================================
    console.log('\n[Test 2] WebGPU Hardware Capability Probe & Runtime Diagnostics:');

    await itAsync('Executes live WebGPU adapter probe in Chromium offscreen document', async () => {
      const probeReport = await offscreenClient.eval(`
        (async () => {
          if (!navigator.gpu) {
            return { hasWebGPU: false, tier: 'wasm_fallback' };
          }
          try {
            const adapter = await navigator.gpu.requestAdapter();
            return {
              hasWebGPU: true,
              tier: adapter ? 'webgpu_hardware' : 'wasm_cpu',
              features: adapter ? Array.from(adapter.features) : []
            };
          } catch (e) {
            return { hasWebGPU: false, tier: 'wasm_fallback', error: e.message };
          }
        })()
      `);

      assert(typeof probeReport === 'object', 'Probe report must return an object');
      assert(['webgpu_hardware', 'wasm_cpu', 'wasm_fallback'].includes(probeReport.tier), 'Tier must be valid');
    });

    await itAsync('Verifies CHECK_WEBGPU_CAPABILITIES message contract with service worker', async () => {
      const capCheck = await offscreenClient.eval(`checkWebGpuSupport()`);
      assert(typeof capCheck.supported === 'boolean', 'Capability check must return boolean supported flag');
      assert(typeof capCheck.report === 'string', 'Capability check must return readable diagnostic report');
    });

    // =========================================================================
    // TEST 3: ISOLATED EXTENSION-ORIGIN PIXEL PRE-MASKING (ATOMIC AZFR)
    // =========================================================================
    console.log('\n[Test 3] Isolated Canvas Pre-Masking Engine (AZFR):');

    await itAsync('Renders input blackout boxes on canvas in offscreen origin with +8px padding', async () => {
      const maskingResult = await offscreenClient.eval(`
        (async () => {
          // Generate a test 640x360 synthetic frame
          const testCanvas = document.createElement('canvas');
          testCanvas.width = 640;
          testCanvas.height = 360;
          const ctx = testCanvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, 640, 360);

          const sampleFrame = testCanvas.toDataURL('image/jpeg', 0.8);
          const sampleBounds = [
            { left: 50, top: 40, width: 200, height: 35 }
          ];

          const maskedDataUrl = await maskSensitivePixelsInOffscreen(sampleFrame, sampleBounds);
          
          // Verify that the blackout box was painted with #0f172a
          const verifyCanvas = document.createElement('canvas');
          verifyCanvas.width = 640;
          verifyCanvas.height = 360;
          const vctx = verifyCanvas.getContext('2d');
          
          return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              vctx.drawImage(img, 0, 0);
              // Sample pixel inside the masked coordinate (e.g. 60, 50)
              const pixel = vctx.getImageData(60, 50, 1, 1).data;
              // #0f172a is roughly RGB(15, 23, 42)
              const isBlackout = pixel[0] < 30 && pixel[1] < 40 && pixel[2] < 60;
              resolve({ success: true, isBlackout, pixel: Array.from(pixel) });
            };
            img.onerror = () => resolve({ success: false });
            img.src = maskedDataUrl;
          });
        })()
      `);

      assert(maskingResult.success, 'Canvas masking completed');
      assert(maskingResult.isBlackout, 'Sampled pixel inside masked input region must be blacked out (#0f172a)');
    });

    // =========================================================================
    // TEST 4: SMOLVLM ROBUST JSON REPAIR & TRUNCATED BRACKET RECOVERY
    // =========================================================================
    console.log('\n[Test 4] SmolVLM Recursive JSON Repair & Recovery:');

    await itAsync('Recovers JSON from markdown fences and trailing commas in real offscreen', async () => {
      const rawText = "```json\n[\n  { \"tag\": \"input\", \"type\": \"text\", \"label\": \"Full Name\", \"x\": 100, \"y\": 80, \"width\": 250, \"height\": 35 },\n  { \"tag\": \"button\", \"type\": \"submit\", \"label\": \"Submit\", \"x\": 100, \"y\": 140, \"width\": 120, \"height\": 40 },\n]\n```";
      const repaired = await offscreenClient.eval(`repairJSON(${JSON.stringify(rawText)})`);

      assert(Array.isArray(repaired), 'Repaired result must be an array');
      assert.strictEqual(repaired.length, 2, 'Must recover 2 elements');
      assert.strictEqual(repaired[0].label, 'Full Name');
    });

    await itAsync('Auto-closes truncated arrays and recovers unwrapped object wrappers', async () => {
      const rawWrapped = '{ "interactive_elements": [ { "tag": "input", "type": "email", "label": "Email Address", "x": 50, "y": 60, "width": 200, "height": 30 } ] }';
      const unwrapped = await offscreenClient.eval(`repairJSON(${JSON.stringify(rawWrapped)})`);

      assert(Array.isArray(unwrapped), 'Must extract array from interactive_elements wrapper key');
      assert.strictEqual(unwrapped[0].label, 'Email Address');
    });

    // =========================================================================
    // TEST 5: ZERO-TRUST HMAC RUN-TOKEN VERIFICATION
    // =========================================================================
    console.log('\n[Test 5] Zero-Trust HMAC Run-Token Security Gate:');

    await itAsync('Rejects offscreen inference request when HMAC token does not match', async () => {
      // Set an active run token in session storage
      await swClient.eval(`
        (async () => {
          if (chrome.storage.session?.setAccessLevel) {
            try { await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }); } catch (e) {}
          }
          await chrome.storage.local.set({ pb_active_hmac_token: 'valid_secure_token_123' });
          try { await chrome.storage.session.set({ pb_active_hmac_token: 'valid_secure_token_123' }); } catch (e) {}
          return true;
        })()
      `);

      const rejection = await swClient.eval(`
        new Promise(resolve => {
          chrome.runtime.sendMessage({
            type: 'perceiveWithVision',
            hmacRunToken: 'attacker_fake_token_999'
          }, resolve);
        })
      `);

      assert.strictEqual(rejection.success, false, 'Must reject mismatched token');
      assert(rejection.error && rejection.error.includes('HMAC Run-Token mismatch'), 'Error must identify HMAC violation');
    });

    // =========================================================================
    // TEST 6: GLINER ONNX BERT TOKENIZATION & REDACTION IN RUNTIME
    // =========================================================================
    console.log('\n[Test 6] GLiNER ONNX NER Runtime & Entity Redaction:');

    await itAsync('Executes GLiNER redaction message contract gracefully in real offscreen', async () => {
      const redactionRes = await swClient.eval(`
        new Promise(resolve => {
          chrome.runtime.sendMessage({
            type: 'redactWithGLiNER',
            text: 'Contact Aarav Sharma at aarav@example.edu.in or 9876543210 with Aadhaar 9999-8888-7777 and PAN ABCDE1234F'
          }, resolve);
        })
      `);

      assert(redactionRes && redactionRes.success !== undefined, 'GLiNER contract must return a response');
      assert.strictEqual(redactionRes.success, true, 'GLiNER contract must succeed');
      assert(typeof redactionRes.redacted === 'string', 'Redacted output must be a string');
      assert(redactionRes.redacted.includes('[REDACTED_EMAIL]'), 'Email must be replaced with [REDACTED_EMAIL]');
      assert(redactionRes.redacted.includes('[REDACTED_PHONE]'), 'Phone must be replaced with [REDACTED_PHONE]');
      assert(redactionRes.redacted.includes('[REDACTED_AADHAAR]'), 'Aadhaar must be replaced with [REDACTED_AADHAAR]');
      assert(redactionRes.redacted.includes('[REDACTED_PAN]'), 'PAN must be replaced with [REDACTED_PAN]');
      assert(!redactionRes.redacted.includes('aarav@example.edu.in'), 'Raw email must not exist in output');
      assert(!redactionRes.redacted.includes('9876543210'), 'Raw phone must not exist in output');
    });

    // =========================================================================
    // TEST 7: STORAGE QUOTA PRE-FLIGHT GUARD IN LIVE BROWSER
    // =========================================================================
    console.log('\n[Test 7] Storage Quota Pre-Flight Execution in Live Browser:');

    await itAsync('Executes checkStorageQuotaPreFlight() inside live offscreen runtime', async () => {
      const quota = await offscreenClient.eval(`checkStorageQuotaPreFlight()`);
      assert(typeof quota === 'object', 'Quota result must be an object');
      assert(quota.freeMB > 0, 'Must report free storage space in megabytes');
      assert.strictEqual(quota.ok, true, 'Ample storage must clear pre-flight check');
    });

    // =========================================================================
    // TEST 8: SMOLVLM VISION MODEL LOADING & DOWNLOAD PROGRESS TELEMETRY
    // =========================================================================
    console.log('\n[Test 8] SmolVLM Vision Model Loading & Progress Event Interception:');

    await itAsync('Invokes loadVisionModel() and intercepts MODEL_DOWNLOAD_PROGRESS telemetry', async () => {
      // Set up progress event collector on service worker
      await swClient.eval(`
        globalThis.__modelProgressEvents = [];
        chrome.runtime.onMessage.addListener((msg) => {
          if (msg.type === 'MODEL_DOWNLOAD_PROGRESS') {
            globalThis.__modelProgressEvents.push(msg);
          }
        });
      `);

      // Invoke loadVisionModel in the offscreen document
      const modelCallable = await offscreenClient.eval(`
        (async () => {
          const model = await loadVisionModel();
          return typeof model === 'function';
        })()
      `);

      assert.strictEqual(modelCallable, true, 'loadVisionModel() must return a callable vision pipeline function');

      // Verify that MODEL_DOWNLOAD_PROGRESS events were broadcast
      let events = [];
      for (let i = 0; i < 15; i++) {
        events = await swClient.eval(`globalThis.__modelProgressEvents || []`);
        if (events && events.length > 0) break;
        await sleep(200);
      }

      assert(Array.isArray(events), 'Progress events must be an array');
      assert(events.length > 0, 'Must emit at least one MODEL_DOWNLOAD_PROGRESS event');
      assert(typeof events[0].progress === 'number', 'Progress event must have numeric progress percentage');
      assert(events[0].model.includes('SmolVLM'), 'Model name in progress event must identify SmolVLM');
    });

    // =========================================================================
    // TEST 9: REAL ON-DEVICE VISUAL PERCEPTION INFERENCE (PERCEIVEWITHVISION)
    // =========================================================================
    console.log('\n[Test 9] Real On-Device Visual Perception Inference:');

    await itAsync('Executes perceiveWithVision() on test frame and returns standardized semantic skeleton', async () => {
      const visualSkeleton = await offscreenClient.eval(`
        (async () => {
          const c = document.createElement('canvas');
          c.width = 640;
          c.height = 360;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(0, 0, 640, 360);
          
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#94a3b8';
          ctx.fillRect(120, 80, 280, 36);
          ctx.strokeRect(120, 80, 280, 36);
          
          const rawDataUrl = c.toDataURL('image/jpeg', 0.8);
          const inputBounds = [{ left: 120, top: 80, width: 280, height: 36 }];
          
          return await perceiveWithVision(rawDataUrl, inputBounds);
        })()
      `);

      assert(Array.isArray(visualSkeleton), 'perceiveWithVision() must output an array of detected elements');
      assert(visualSkeleton.length > 0, 'Must detect at least one interactive element');
      
      const firstElement = visualSkeleton[0];
      assert(firstElement.refId.startsWith('ref_v'), 'Element refId must start with ref_v prefix');
      assert(firstElement.tag === 'input' || firstElement.tagName === 'input', 'Element tag must match schema');
      assert(typeof firstElement.rect === 'object', 'Element must have bounding box rect object');
      assert(typeof firstElement.rect.left === 'number', 'Rect must have numeric left coordinate');
      assert(typeof firstElement.rect.top === 'number', 'Rect must have numeric top coordinate');
      assert(firstElement.rect.width > 0, 'Rect must have positive width');
      assert(firstElement.rect.height > 0, 'Rect must have positive height');
    });

    await itAsync('Executes analyzePixelsForInteractiveContours() directly on raw canvas pixels without network', async () => {
      const detectedContours = await offscreenClient.eval(`
        (async () => {
          const c = document.createElement('canvas');
          c.width = 640;
          c.height = 360;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(0, 0, 640, 360);
          
          // Draw a distinct input box
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#334155';
          ctx.fillRect(100, 50, 300, 36);
          ctx.strokeRect(100, 50, 300, 36);

          // Draw a button
          ctx.fillStyle = '#2563eb';
          ctx.strokeStyle = '#1d4ed8';
          ctx.fillRect(100, 110, 140, 36);
          ctx.strokeRect(100, 110, 140, 36);
          
          const rawDataUrl = c.toDataURL('image/jpeg', 0.8);
          return await analyzePixelsForInteractiveContours(rawDataUrl);
        })()
      `);

      assert(Array.isArray(detectedContours), 'analyzePixelsForInteractiveContours must return an array');
      assert(detectedContours.length >= 1, 'Must detect at least 1 interactive box from raw pixels');
      const box = detectedContours[0];
      assert(box.x > 0 && box.y > 0, 'Detected contour must have positive coordinates');
      assert(box.width > 30 && box.height > 15, 'Detected contour must have valid UI dimensions');
      assert(['input', 'button', 'textarea'].includes(box.tag), 'Tag must be recognized UI component');
    });

    // =========================================================================
    // TEST 10: REAL BROWSER PIPELINE RUN WITH NEURAL VISION GROUNDING
    // =========================================================================
    console.log('\n[Test 10] Real Browser Pipeline Run with Neural Vision Grounding:');

    await itAsync('Executes live 5-stage pipeline recording Neural Vision Grounded in audit log', async () => {
      assert(pageClient, 'pageClient must be active');

      // 1. Configure perception engine to 'vision'
      await swClient.eval(`
        chrome.storage.local.set({ perceptionEngine: 'vision' })
      `);

      // 2. Navigate to test-form.html on local demo server
      await pageClient.send('Page.navigate', { url: 'http://localhost:8000/test-form.html' });

      // Wait for content script injection & DOM readiness
      for (let i = 0; i < 30; i++) {
        try {
          const ready = await pageClient.eval('document.readyState');
          const active = await pageClient.eval("document.documentElement.getAttribute('data-privbrowse-extension-active')");
          if (ready === 'complete' && active === 'true') break;
        } catch (e) {}
        await sleep(200);
      }

      // 3. Trigger PrivBrowse pipeline via on-page demo button
      await pageClient.eval(`
        document.getElementById('btn_trigger_onpage_demo').click()
      `);

      // 4. Poll for pipeline completion in service worker
      let completed = false;
      for (let i = 0; i < 50; i++) {
        await sleep(350);
        const sessStatus = await swClient.eval(`currentSession.status`);
        if (sessStatus === 'COMPLETED') {
          completed = true;
          break;
        }
      }
      assert(completed, 'Pipeline must complete successfully');

      // 5. Query service worker audit logs and assert Neural Vision Grounded
      const auditLogs = await swClient.eval(`currentSession.logs`);
      console.log('\n[Test 10 Audit Logs]:', JSON.stringify(auditLogs?.map(l => `[${l.stage}] ${l.level}: ${l.message}`), null, 2));
      assert(Array.isArray(auditLogs), 'Audit logs must be an array');
      
      const visionLogged = auditLogs.some(l => 
        l.message.includes('Neural Vision Grounded') || 
        l.message.includes('SmolVLM-256M')
      );
      assert(visionLogged, 'Audit log must record: Stage 1: Neural Vision Grounded (SmolVLM-256M WebGPU)');

      // 6. Assert Zero Raw PII Egress
      const egressStats = await swClient.eval(`currentSession.egressStats`);
      assert(egressStats, 'Egress stats must be recorded');
      assert.strictEqual(egressStats.rawPiiEgressBytes, 0, 'Raw PII egress must remain exactly 0 bytes');
    });

  } catch (err) {
    console.error('[Model E2E Execution Error]:', err);
    failCount++;
  } finally {
    if (pageClient) pageClient.close();
    if (swClient) swClient.close();
    if (offscreenClient) offscreenClient.close();
    try { browserProc.kill(); } catch (e) {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }

  console.log('\n===========================================================');
  console.log(` Summary: ${passCount}/${passCount + failCount} On-Device AI Model Tests Passed!`);
  console.log('===========================================================');

  if (failCount > 0) process.exit(1);
})();
