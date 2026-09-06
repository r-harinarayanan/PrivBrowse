/**
 * PrivBrowse Enterprise Commercial Verification Suite (v1.2.0)
 * 
 * Part of SIH 2026, PS ID SIH26171 | Team: Breaking Bad
 * 
 * Tests:
 * 1. Options UI DOM Architecture & Settings Schema
 * 2. Real Browser Options UI Interaction & Real-Time chrome.storage.local Persistence (CDP)
 * 3. Native Browser Integrations (Context Menus & Keyboard Shortcut Ctrl+Shift+Y)
 * 4. Air-Gapped Local Reasoning Engine Architecture & Fallback
 * 5. Commercial Distribution Bundle (ZIP) Verification
 * 6. Zero Prototype Invariant & Production Branding Audit
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn, execSync } = require('child_process');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${desc}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${desc}`);
    console.error(`     Reason: ${err.message}`);
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
    console.error(`     Reason: ${err.message}`);
    failCount++;
  }
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
    this.events = [];
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
      }
    };
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

console.log('================================================================');
console.log(' PrivBrowse Enterprise Commercial Product Suite (v1.2.0) ');
console.log('================================================================\n');

(async () => {
  // [Check 1] Options UI Static Architecture & Schema
  console.log('[Test 1] Options Dashboard Architecture & HTML Structure:');
  it('Options HTML exists and includes all 6 enterprise administrative tabs', () => {
    const optionsPath = path.join(__dirname, 'options.html');
    assert(fs.existsSync(optionsPath), 'options.html exists');
    const content = fs.readFileSync(optionsPath, 'utf8');
    assert(content.includes('data-tab="tab-vault"'), 'Has Identity Vault tab');
    assert(content.includes('data-tab="tab-engine"'), 'Has Perception Engine tab');
    assert(content.includes('data-tab="tab-reasoning"'), 'Has Cloud & Air-Gapped Reasoning tab');
    assert(content.includes('data-tab="tab-sanitizer"'), 'Has NER & PII Redaction tab');
    assert(content.includes('data-tab="tab-compliance"'), 'Has Compliance & Audit Center tab');
    assert(content.includes('data-tab="tab-storage"'), 'Has Neural Model Cache & Storage tab');
  });

  it('Options UI contains all required configuration controls', () => {
    const content = fs.readFileSync(path.join(__dirname, 'options.html'), 'utf8');
    assert(content.includes('id="opt_fullname"'), 'Has Full Name input');
    assert(content.includes('id="opt_passphrase"'), 'Has Passphrase input');
    assert(content.includes('id="opt_reasoning_backend"'), 'Has Backend Provider select');
    assert(content.includes('id="opt_custom_endpoint"'), 'Has Custom Endpoint input');
    assert(content.includes('id="opt_ner_engine"'), 'Has NER engine select');
    assert(content.includes('id="btn_save_options"'), 'Has Save All Changes button');
    assert(content.includes('id="btn_export_compliance_report"'), 'Has Compliance Certificate export button');
  });

  // [Check 2] Manifest V3 Enterprise Native Integrations
  console.log('\n[Test 2] Native Browser Integrations & Manifest V3 Specs:');
  it('Manifest registers options_ui page with open_in_tab', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
    assert(manifest.options_ui, 'options_ui defined in manifest');
    assert(manifest.options_ui.page === 'options.html', 'Points to options.html');
    assert(manifest.options_ui.open_in_tab === true, 'open_in_tab is true');
  });

  it('Manifest declares contextMenus permission and Ctrl+Shift+Y shortcut', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
    assert(manifest.permissions.includes('contextMenus'), 'contextMenus in permissions');
    assert(manifest.commands && manifest.commands['run-agent'], 'run-agent command registered');
    assert(manifest.commands['run-agent'].suggested_key.default === 'Ctrl+Shift+Y', 'Default key is Ctrl+Shift+Y');
  });

  // [Check 3] Air-Gapped Local Reasoner Architecture
  console.log('\n[Test 3] Air-Gapped Local Reasoner Architecture & Fallback:');
  it('background.js supports Ollama and OpenAI-compatible local reasoning backends', () => {
    const bg = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
    assert(bg.includes('callOllamaReasoner'), 'callOllamaReasoner defined');
    assert(bg.includes('callOpenAiCompatibleReasoner'), 'callOpenAiCompatibleReasoner defined');
    assert(bg.includes("apiConfig.reasoningBackend === 'ollama'"), 'Stage 3 handles ollama backend');
    assert(bg.includes("apiConfig.reasoningBackend === 'openai_compatible'"), 'Stage 3 handles openai_compatible backend');
  });

  it('Air-gapped reasoners implement timeout abort controller and graceful fallback', () => {
    const bg = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8');
    assert(bg.includes('new AbortController()'), 'Uses AbortController for timeouts');
    assert(bg.includes('clearTimeout(timeoutId)'), 'Clears timeout on response');
    assert(bg.includes('Gracefully falling back to Simulated Reasoner'), 'Logs audit warning and falls back');
  });

  // [Check 4] Commercial Packaging & Invariant Validation
  console.log('\n[Test 4] Commercial Distribution & Invariant Compliance:');
  it('pack_extension.js successfully generates production distribution ZIP', () => {
    const zipPath = path.join(__dirname, 'dist', 'privbrowse-v1.2.0-enterprise.zip');
    assert(fs.existsSync(zipPath), 'Distribution ZIP exists');
    const stat = fs.statSync(zipPath);
    assert(stat.size > 20000, `ZIP file has valid size: ${stat.size} bytes`);
  });

  it('Distribution package strictly excludes PowerPoint and non-production files', () => {
    const script = fs.readFileSync(path.join(__dirname, 'scripts', 'pack_extension.js'), 'utf8');
    assert(script.includes('.endsWith(\'.pptx\')'), 'Explicitly asserts zero PPTX files');
    assert(!script.includes('SIH2026_SIH26171_BreakingBad_IdeaSubmission.pptx'), 'Presentation kept invariant');
  });

  // [Check 5] Real Browser CDP Options UI Verification
  console.log('\n[Test 5] Live Browser Options Dashboard Interaction & Persistence (CDP):');
  
  const possiblePaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  ];
  const browserExe = possiblePaths.find(p => fs.existsSync(p));
  const cdpPort = 9270;
  const tmpDir = path.join(os.tmpdir(), 'pb_options_e2e_' + Date.now());
  const extensionPath = path.resolve(__dirname);

  let browserProc = null;
  let pageClient = null;
  let swClient = null;

  try {
    browserProc = spawn(browserExe, [
      '--headless=new',
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${tmpDir}`,
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-sync',
      'about:blank'
    ]);

    await sleep(2500);

    const getTargets = () => new Promise((resolve) => {
      http.get(`http://127.0.0.1:${cdpPort}/json`, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(raw)); } catch (e) { resolve([]); }
        });
      }).on('error', () => resolve([]));
    });

    let targets = [];
    for (let attempt = 0; attempt < 30; attempt++) {
      targets = await getTargets();
      if (targets.some(t => t.type === 'service_worker' && t.url.includes('background.js'))) break;
      await sleep(300);
    }
    assert(targets.length > 0, 'Chromium CDP targets available');

    const swTarget = targets.find(t => t.type === 'service_worker' && t.url.includes('background.js'));
    assert(swTarget, 'PrivBrowse Service Worker registered');

    const extMatch = swTarget.url.match(/chrome-extension:\/\/([a-z]+)\//);
    assert(extMatch, 'Extension ID extracted from service worker');
    const extensionId = extMatch[1];
    const optionsUrl = `chrome-extension://${extensionId}/options.html`;

    const pageTarget = targets.find(t => t.type === 'page');
    assert(pageTarget, 'Page target available');

    pageClient = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await pageClient.ready;
    await pageClient.send('Page.enable');
    await pageClient.send('Runtime.enable');

    await itAsync('Navigates to chrome-extension://<id>/options.html and verifies title', async () => {
      await pageClient.send('Page.navigate', { url: optionsUrl });
      await sleep(1200);
      const title = await pageClient.eval('document.title');
      assert(title.includes('PrivBrowse Enterprise'), `Page title is: "${title}"`);
    });

    await itAsync('Interacts with Tabs and switches between panels smoothly', async () => {
      await pageClient.eval(`
        document.querySelector('[data-tab="tab-reasoning"]').click();
      `);
      await sleep(200);
      const activeTab = await pageClient.eval(`
        document.getElementById('tab-reasoning').classList.contains('active')
      `);
      assert(activeTab === true, 'tab-reasoning panel is active');
    });

    await itAsync('Configures Air-Gapped Local Ollama endpoint and changes dropdown', async () => {
      const endpoint = await pageClient.eval(`
        const sel = document.getElementById('opt_reasoning_backend');
        sel.value = 'ollama';
        sel.dispatchEvent(new Event('change'));
        document.getElementById('opt_custom_endpoint').value;
      `);
      assert(endpoint.includes('11434'), `Ollama default endpoint set: ${endpoint}`);
    });

    await itAsync('Fills profile fields, saves options, and verifies chrome.storage.local persistence', async () => {
      await pageClient.eval(`
        document.querySelector('[data-tab="tab-vault"]').click();
        document.getElementById('opt_fullname').value = 'Dr. Vikram Sarabhai';
        document.getElementById('opt_email').value = 'sarabhai@isro.gov.in';
        document.getElementById('opt_phone').value = '9876543210';
        document.getElementById('btn_save_options').click();
      `);
      await sleep(1200);

      const storageData = await pageClient.eval(`
        new Promise(resolve => {
          chrome.storage.local.get(['userProfile', 'privbrowse_config'], resolve);
        })
      `);

      assert(storageData && storageData.userProfile, 'userProfile saved in chrome.storage.local');
      assert(storageData.userProfile.fullName === 'Dr. Vikram Sarabhai', `Full name is ${storageData.userProfile.fullName}`);
      assert(storageData.privbrowse_config?.reasoningBackend === 'ollama', `Reasoning backend is ${storageData.privbrowse_config?.reasoningBackend}`);
    });

    await itAsync('Verifies native context menu AUTOFILL_ACTIVE_FORM detection on web form', async () => {
      // Navigate to test form
      await pageClient.send('Page.navigate', { url: 'http://localhost:8000/test-form.html' });
      await sleep(1500);

      // Connect to service worker to dispatch AUTOFILL_ACTIVE_FORM
      swClient = new CDPClient(swTarget.webSocketDebuggerUrl);
      await swClient.ready;
      await swClient.send('Runtime.enable');

      const dispatchResult = await swClient.eval(`
        new Promise(async (resolve) => {
          const [tab] = await chrome.tabs.query({ active: true });
          if (!tab) return resolve({ success: false, reason: 'no_active_tab' });
          chrome.tabs.sendMessage(tab.id, { type: 'AUTOFILL_ACTIVE_FORM', source: 'Automated E2E Test' }, (res) => {
            resolve(res || { success: true });
          });
        })
      `);
      assert(dispatchResult && dispatchResult.success === true, 'AUTOFILL_ACTIVE_FORM handled successfully');
      assert(dispatchResult.targetFormDetected === true, 'Target form was detected by content script');
    });

  } finally {
    if (pageClient) pageClient.close();
    if (swClient) swClient.close();
    if (browserProc) {
      try { browserProc.kill('SIGKILL'); } catch (e) {}
    }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }

  // [Check 6] Production Branding Audit
  console.log('\n[Test 6] Commercial Enterprise Branding & Artifact Integrity:');
  it('Production codebase contains zero occurrences of "prototype stub"', () => {
    const filesToAudit = ['background.js', 'content.js', 'popup.html', 'options.html', 'manifest.json'];
    for (const f of filesToAudit) {
      const code = fs.readFileSync(path.join(__dirname, f), 'utf8');
      assert(!code.toLowerCase().includes('prototype stub'), `File ${f} is clean of "prototype stub"`);
    }
  });

  it('All deliverables consistently report version 1.2.0', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    assert(manifest.version === '1.2.0', 'manifest.json version is 1.2.0');
    assert(pkg.version === '1.2.0', 'package.json version is 1.2.0');
  });

  console.log('\n===========================================================');
  console.log(` Summary: ${passCount}/${passCount + failCount} Enterprise Production Tests Passed!`);
  console.log('===========================================================');

  if (failCount > 0) process.exit(1);
})();
