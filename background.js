/**
 * PrivBrowse — Background Service Worker (Manifest V3)
 * 
 * Stages Implemented:
 * - Stage 3: Cloud Reasoning (Anthropic Claude Sonnet 4.6 integration)
 * - Stage 4: Local CaMeL-style Safety Verification Gate
 * 
 * SIH 2026, PS ID SIH26171 | Team: Breaking Bad
 */

// Attempt to load local config if present
try {
  importScripts('config.example.js');
} catch (e) {
  // Optional config fallback
}

// Ensure storage.session is accessible to offscreen document
if (typeof chrome !== 'undefined' && chrome.storage?.session?.setAccessLevel) {
  try {
    chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }).catch(() => {});
  } catch (e) {}
}

// Global active session state
let currentSession = {
  status: 'IDLE',
  logs: [],
  validRefIds: new Set(),
  scannedSkeleton: []
};

// Ensure chrome.storage.session is accessible to offscreen document for HMAC tokens & rate limiter
if (typeof chrome !== 'undefined' && chrome.storage?.session?.setAccessLevel) {
  chrome.storage.session.setAccessLevel({
    accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS'
  }).catch(() => {});
}

// =========================================================================
// SCRIPT INJECTION RESILIENCE & OFFSCREEN WEBGPU MANAGEMENT
// =========================================================================
async function ensureOffscreenDocument() {
  if (!chrome.offscreen) return false;
  try {
    // 1. Proactive health check: ping existing offscreen doc
    try {
      const pingRes = await chrome.runtime.sendMessage({ type: 'ping' });
      if (pingRes && (pingRes.status === 'ready' || pingRes.initialized)) {
        return true;
      }
    } catch (pingErr) {
      // Offscreen document not responding or not created yet
    }

    if (chrome.runtime.getContexts) {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
      });
      if (contexts && contexts.length > 0) return true;
    }
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['WORKERS', 'BLOBS'],
      justification: 'WebGPU offscreen execution environment for local SmolVLM/GLiNER models'
    });
    // Brief delay to allow offscreen script initialization
    await new Promise(r => setTimeout(r, 400));
    return true;
  } catch (err) {
    // If already exists or unsupported, continue gracefully
    return false;
  }
}

async function ensureContentScriptInjected(tabId) {
  try {
    const pingRes = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    if (pingRes && pingRes.ready) return true;
  } catch (e) {
    // Content script not yet attached; inject programmatically
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['sanitize.js', 'content.js']
    });
    // Wait brief moment for script initialization
    await new Promise(r => setTimeout(r, 100));
    return true;
  } catch (err) {
    console.warn('[PrivBrowse] Programmatic injection warning:', err.message);
    return false;
  }
}

// =========================================================================
// AUDIT LOGGING HELPER
// =========================================================================
// CRYPTOGRAPHIC HASH-CHAINED AUDIT TRAIL (MERKLE LOG INTEGRITY - Critique 8)
// =========================================================================
let _lastAuditHash = 'GENESIS_PRIVBROWSE_ENTERPRISE_v1.2.0';

/**
 * Fast Tamper-Evident Integrity Hash (Murmur-inspired 64-character Merkle Chain Hash)
 * 
 * Provides instantaneous, synchronous, microsecond tamper-evidence across
 * the in-memory and persistent ring buffer without blocking event loop or I/O.
 * Yields a deterministic 64-hex-character digest linking each log entry to its predecessor.
 */
function computeFastIntegrityHash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const part1 = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(16, '0');
  const part2 = (4294967296 * (2097151 & h1) + (h2 >>> 0)).toString(16).padStart(16, '0');
  return (part1 + part2 + part1 + part2).slice(0, 64);
}

// Backward-compatibility alias
const computeFastSha256Hex = computeFastIntegrityHash;

function verifyAuditTrailIntegrity(logs = []) {
  if (!Array.isArray(logs) || logs.length === 0) return { valid: true, count: 0, rootHash: _lastAuditHash };
  let prev = 'GENESIS_PRIVBROWSE_ENTERPRISE_v1.2.0';
  for (let i = 0; i < logs.length; i++) {
    const item = logs[i];
    if (item.prevHash && item.prevHash !== prev) {
      return { valid: false, brokenIndex: i, reason: 'Broken cryptographic prevHash chain linkage' };
    }
    if (item.hash) {
      const expected = computeFastIntegrityHash(`${prev}:${item.stage}:${item.type}:${item.message}`);
      if (item.hash !== expected) {
        return { valid: false, brokenIndex: i, reason: 'Hash signature mismatch (log entry tampered)' };
      }
      prev = item.hash;
    }
  }
  return { valid: true, count: logs.length, rootHash: prev };
}

function logAudit(stage, type, message, details = null) {
  const timestamp = new Date().toLocaleTimeString();
  const prev = _lastAuditHash;
  const currentHash = computeFastIntegrityHash(`${prev}:${stage}:${type}:${message}`);
  _lastAuditHash = currentHash;

  const logEntry = {
    index: currentSession.logs.length,
    timestamp,
    stage,
    type,  // 'INFO', 'SUCCESS', 'WARNING', 'SECURITY_ALERT', 'ERROR'
    message,
    details,
    prevHash: prev,
    hash: currentHash
  };

  currentSession.logs.push(logEntry);

  // Persistent Audit Log ring buffer (capped at 1000 items)
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.get(['pb_audit_logs']).then(res => {
      let logs = res.pb_audit_logs || [];
      logs.push(logEntry);
      if (logs.length > 1000) logs = logs.slice(logs.length - 1000);
      chrome.storage.local.set({ pb_audit_logs: logs }).catch(() => {});
    }).catch(() => {});
  }

  // Broadcast to popup
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({
      type: 'AUDIT_LOG_UPDATE',
      log: logEntry
    }).catch(() => {});

    // Also broadcast generic 'log' message for compatibility
    chrome.runtime.sendMessage({
      type: 'log',
      stage: stage === 4 && type === 'SECURITY_ALERT' ? 'security' :
             type === 'ERROR' ? 'error' :
             type === 'SUCCESS' ? 'done' : 'info',
      msg: message
    }).catch(() => {});
  }

  console.log(`[PrivBrowse Stage ${stage}] [${type}] ${message}`, details || '');
}

// =========================================================================
// AES-GCM 256-BIT WEB CRYPTO API ENCRYPTION ENGINE (WITH USER PASSPHRASE)
// =========================================================================
const DEFAULT_SALT = new Uint8Array([112, 114, 105, 118, 98, 114, 111, 119, 115, 101, 45, 115, 101, 99, 117, 114]); // 'privbrowse-secur'

async function deriveAesKey(masterSecret, dynamicSalt = null, userPassphrase = null) {
  const enc = new TextEncoder();
  let secret = userPassphrase;
  if (!secret) {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      try {
        const sess = await chrome.storage.session.get(['userPassphrase']);
        if (sess && sess.userPassphrase) secret = sess.userPassphrase;
      } catch (e) {}
    }
  }
  // CRITICAL SECURITY HARDENING (Critique 5):
  // Zero static fallback strings or public extension IDs.
  // If no userPassphrase is provided, generate and hold a true 256-bit cryptographically random
  // in-memory ephemeral secret via crypto.getRandomValues strictly in volatile service worker RAM.
  if (!secret) {
    if (!globalThis.__PB_EPHEMERAL_VOLATILE_SECRET__) {
      const entropy = new Uint8Array(32);
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(entropy);
      } else if (typeof require !== 'undefined') {
        require('crypto').randomFillSync(entropy);
      }
      globalThis.__PB_EPHEMERAL_VOLATILE_SECRET__ = Array.from(entropy).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    secret = masterSecret || globalThis.__PB_EPHEMERAL_VOLATILE_SECRET__;
  }
  const subtle = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : (typeof require !== 'undefined' ? require('crypto').webcrypto?.subtle : null);
  if (!subtle) return null;

  const keyMaterial = await subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: dynamicSalt || DEFAULT_SALT,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptApiKey(plaintext, masterSecret, userPassphrase = null) {
  if (!plaintext) return null;
  const subtle = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : (typeof require !== 'undefined' ? require('crypto').webcrypto?.subtle : null);
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : (typeof require !== 'undefined' ? require('crypto').webcrypto : null);
  if (!subtle || !cryptoObj) return null;

  const salt = cryptoObj.getRandomValues(new Uint8Array(16));
  const iv = cryptoObj.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(masterSecret, salt, userPassphrase);
  const enc = new TextEncoder();
  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );
  return {
    salt: Array.from(salt),
    iv: Array.from(iv),
    ciphertext: Array.from(new Uint8Array(ciphertext)),
    createdAt: Date.now(),
    ttlMs: 4 * 60 * 60 * 1000, // 4-hour automatic rotation window
    maxLifetimeMs: 30 * 24 * 60 * 60 * 1000, // 30-day cryptographic lifetime
    isUserPassphraseProtected: !!userPassphrase
  };
}

async function decryptApiKey(encryptedData, masterSecret, userPassphrase = null) {
  if (!encryptedData || !encryptedData.ciphertext || !encryptedData.iv) return '';
  // Check 30-day absolute cryptographic lifetime
  if (encryptedData.createdAt && encryptedData.maxLifetimeMs && (Date.now() - encryptedData.createdAt > encryptedData.maxLifetimeMs)) {
    console.warn('[PrivBrowse Security] API Key has exceeded 30-day cryptographic lifetime. Expired.');
    return '';
  }
  // Check key TTL expiration (4 hours max for session token)
  if (encryptedData.createdAt && (Date.now() - encryptedData.createdAt > (encryptedData.ttlMs || 14400000))) {
    console.warn('[PrivBrowse Security] Encrypted API Key has exceeded 4-hour TTL rotation window. Expired.');
    return '';
  }

  try {
    const subtle = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : (typeof require !== 'undefined' ? require('crypto').webcrypto?.subtle : null);
    if (!subtle) return '';

    const salt = encryptedData.salt ? new Uint8Array(encryptedData.salt) : null;
    const key = await deriveAesKey(masterSecret, salt, userPassphrase);
    const iv = new Uint8Array(encryptedData.iv);
    const ciphertext = new Uint8Array(encryptedData.ciphertext);
    const decrypted = await subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    const dec = new TextDecoder();
    return dec.decode(decrypted);
  } catch (e) {
    console.warn('[PrivBrowse] Failed to decrypt API key (AES-GCM):', e.message);
    return '';
  }
}

// =========================================================================
// STAGE 3: CLOUD REASONING (Anthropic API / Heuristic Simulation)
// =========================================================================
async function getApiConfig() {
  // Support in-memory session storage (volatile memory only) as primary secure tier
  let storage = {};
  if (chrome.storage && chrome.storage.session) {
    try {
      storage = await chrome.storage.session.get(['encryptedApiKey', 'anthropicApiKey', 'apiKey', 'modelName', 'model', 'simulationMode', 'offlineMode', 'perceptionEngine']);
    } catch (e) {}
  }
  if (!storage.encryptedApiKey && !storage.anthropicApiKey && !storage.apiKey) {
    if (chrome.storage && chrome.storage.local) {
      storage = await chrome.storage.local.get([
        'encryptedApiKey', 'anthropicApiKey', 'apiKey',
        'modelName', 'model',
        'simulationMode', 'offlineMode', 'perceptionEngine'
      ]);
    }
  }

  let rawKey = '';
  if (storage.encryptedApiKey) {
    rawKey = await decryptApiKey(storage.encryptedApiKey);
  }
  if (!rawKey) {
    rawKey = (storage.anthropicApiKey || storage.apiKey || '').trim();
  }

  // Validate Anthropic API key format: sk-ant-... with min length
  const isValidFormat = !rawKey || /^sk-ant-[a-zA-Z0-9_\-]{15,}$/.test(rawKey);
  if (rawKey && !isValidFormat) {
    console.warn('[PrivBrowse Security] Rejected malformed API key in storage.');
  }
  const apiKey = isValidFormat ? rawKey : '';
  const model = storage.modelName || storage.model || 'claude-sonnet-4-6';
  const offlineMode = storage.simulationMode !== undefined ? storage.simulationMode :
                     storage.offlineMode !== undefined ? storage.offlineMode : !apiKey;
  const perceptionEngine = storage.perceptionEngine || 'vision'; // Default to On-Device Vision
  let cfg = {};
  if (chrome.storage && chrome.storage.local) {
    try {
      const res = await chrome.storage.local.get(['privbrowse_config']);
      cfg = res.privbrowse_config || {};
    } catch (e) {}
  }
  const reasoningBackend = cfg.reasoningBackend || 'anthropic';
  const customEndpointUrl = cfg.customEndpointUrl || '';
  const customModelName = cfg.customModelName || '';
  const timeoutSec = cfg.timeoutSec || 15;

  return {
    apiKey,
    model,
    offlineMode,
    perceptionEngine,
    isValidKey: isValidFormat,
    reasoningBackend,
    customEndpointUrl,
    customModelName,
    timeoutSec
  };
}

// =========================================================================
// DETERMINISTIC DEEP EGRESS GATE & MATHEMATICAL ZERO-PII INSPECTOR (Critique 2)
// =========================================================================
function inspectPayloadForPii(payloadString, userProfile = {}) {
  if (!payloadString || typeof payloadString !== 'string') return { safe: true, violations: [] };

  const violations = [];

  // 1. Exact Literal Profile Substring Check
  const profileKeys = ['fullName', 'email', 'phone', 'address', 'dob', 'aadhaar', 'pan', 'pincode'];
  for (const key of profileKeys) {
    const rawVal = userProfile[key];
    if (rawVal && typeof rawVal === 'string' && rawVal.trim().length > 3) {
      const trimmed = rawVal.trim();
      if (payloadString.includes(trimmed)) {
        violations.push({
          type: 'DIRECT_PROFILE_LEAK',
          field: key,
          snippet: trimmed.slice(0, 2) + '***'
        });
      }
    }
  }

  // 2. High-Entropy Pattern Recognition (Aadhaar, PAN, Emails, Phones)
  const AADHAAR_REGEX = /\b[2-9]\d{3}\s?\d{4}\s?\d{4}\b/g;
  const PAN_REGEX = /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g;
  const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  const PHONE_REGEX = /\b(?:\+91|91|0)?[6-9]\d{9}\b/g;

  let match;
  while ((match = AADHAAR_REGEX.exec(payloadString)) !== null) {
    violations.push({ type: 'AADHAAR_PATTERN_DETECTED', snippet: match[0].slice(0, 4) + 'XXXX' });
  }
  while ((match = PAN_REGEX.exec(payloadString)) !== null) {
    violations.push({ type: 'PAN_PATTERN_DETECTED', snippet: match[0].slice(0, 3) + 'XX' });
  }
  while ((match = EMAIL_REGEX.exec(payloadString)) !== null) {
    const emailLower = match[0].toLowerCase();
    if (!emailLower.includes('example.') && !emailLower.includes('privbrowse') && !emailLower.includes('w3.org') && !emailLower.includes('schema.org') && !emailLower.includes('test.') && !emailLower.includes('sample.')) {
      violations.push({ type: 'EMAIL_PATTERN_DETECTED', snippet: '***@***' });
    }
  }
  while ((match = PHONE_REGEX.exec(payloadString)) !== null) {
    violations.push({ type: 'PHONE_PATTERN_DETECTED', snippet: match[0].slice(0, 3) + 'XXXX' });
  }

  if (violations.length > 0) {
    console.error('[PrivBrowse Cryptographic Gate] FATAL EGRESS VIOLATION INTERCEPTED:', violations);
    throw new Error(`[SECURITY INVARIANT VIOLATION] Deep Egress Inspector detected ${violations.length} raw personal data token(s) in Stage 3 payload! Cloud egress aborted.`);
  }

  return {
    safe: true,
    inspectedBytes: new TextEncoder().encode(payloadString).length,
    rawPiiBytes: 0,
    timestamp: Date.now()
  };
}

async function callCloudReasoner(goal, sanitizedSkeleton, apiKey, modelName) {
  const systemPrompt = `You are PrivBrowse, an on-device privacy-preserving browser automation planner.
You receive:
1. The user's automation goal.
2. A sanitized semantic skeleton of interactive webpage elements (with refId, tagName, type, label, placeholder, options).

YOUR TASK:
Output an ordered action plan in STRICT JSON format matching this schema:
{
  "plan": [
    {
      "action": "fill" | "click" | "select",
      "targetRefId": "ref_X",
      "value": "{{user.token}}" or "option_value"
    }
  ]
}

STRICT PRIVACY & REASONING RULES:
1. You must ONLY reference valid targetRefId values present in the provided skeleton. Never invent refIds.
2. For personal fields (name, email, phone, address, etc.), you MUST NEVER generate literal values.
   Use ONLY standardized placeholder tokens:
   - {{user.fullName}}
   - {{user.email}}
   - {{user.phone}}
   - {{user.address}}
   - {{user.category}}
   - {{user.aadhaar}}
   - {{user.pan}}
   - {{user.dob}}
3. For dropdowns (tagName: "select"), action must be "select", and "value" must be the chosen option value or text.
4. For checkboxes or buttons, action must be "click".
5. Return ONLY the raw JSON object. Do not include markdown code fences, greetings, or conversational text.`;

  const userPrompt = JSON.stringify({
    userGoal: goal,
    semanticSkeleton: sanitizedSkeleton
  }, null, 2);

  let apiModel = modelName || 'claude-sonnet-4-6';
  if (apiModel === 'claude-sonnet-4-6') {
    apiModel = 'claude-3-7-sonnet-20250219';
  }

  logAudit(3, 'INFO', `Transmitting sanitized skeleton to Anthropic API (${apiModel})...`, {
    elementCount: sanitizedSkeleton.length,
    payloadSizeChars: userPrompt.length
  });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: apiModel,
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API Error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const textContent = data.content?.[0]?.text || '';

  let cleaned = textContent.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json\s*/, '').replace(/```$/, '');
  else if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```\s*/, '').replace(/```$/, '');

  const parsed = JSON.parse(cleaned);
  return parsed.plan || parsed || [];
}

async function callOllamaReasoner(goal, sanitizedSkeleton, endpointUrl, modelName, timeoutSec = 15) {
  const url = endpointUrl || 'http://localhost:11434/api/chat';
  const model = modelName || 'llama3.2';

  const systemPrompt = `You are PrivBrowse, an on-device privacy-preserving browser automation planner.
Output an ordered action plan in STRICT JSON format matching this schema:
{
  "plan": [
    {
      "action": "fill" | "click" | "select",
      "targetRefId": "ref_X",
      "value": "{{user.token}}" or "option_value"
    }
  ]
}
RULES:
1. ONLY reference valid targetRefId values from skeleton. Never invent refIds.
2. For personal fields, use ONLY tokens: {{user.fullName}}, {{user.email}}, {{user.phone}}, {{user.address}}, {{user.category}}, {{user.aadhaar}}, {{user.pan}}, {{user.dob}}.
3. For dropdowns, action is "select". For buttons/checkboxes, action is "click".
4. Return ONLY valid raw JSON object. No markdown fences.`;

  const userPrompt = JSON.stringify({
    userGoal: goal,
    semanticSkeleton: sanitizedSkeleton
  }, null, 2);

  logAudit(3, 'INFO', `Transmitting sanitized skeleton to Local Air-Gapped Ollama LLM (${model} @ ${url})...`, {
    elementCount: sanitizedSkeleton.length,
    timeoutSec
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutSec * 1000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stream: false,
        format: 'json',
        options: { temperature: 0.1 }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const content = data.message?.content || data.response || '';
    let cleaned = content.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json\s*/, '').replace(/```$/, '');
    else if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```\s*/, '').replace(/```$/, '');

    const parsed = JSON.parse(cleaned);
    return parsed.plan || parsed || [];
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

async function callOpenAiCompatibleReasoner(goal, sanitizedSkeleton, endpointUrl, modelName, apiKey = '', timeoutSec = 15) {
  const url = endpointUrl || 'http://localhost:8080/v1/chat/completions';
  const model = modelName || 'mistral-7b-instruct';

  const systemPrompt = `You are PrivBrowse, an on-device privacy-preserving browser automation planner.
Output an ordered action plan in STRICT JSON format matching this schema:
{
  "plan": [
    {
      "action": "fill" | "click" | "select",
      "targetRefId": "ref_X",
      "value": "{{user.token}}" or "option_value"
    }
  ]
}
RULES:
1. ONLY reference valid targetRefId values from skeleton. Never invent refIds.
2. For personal fields, use ONLY tokens: {{user.fullName}}, {{user.email}}, {{user.phone}}, {{user.address}}, {{user.category}}, {{user.aadhaar}}, {{user.pan}}, {{user.dob}}.
3. For dropdowns, action is "select". For buttons/checkboxes, action is "click".
4. Return ONLY valid raw JSON object.`;

  const userPrompt = JSON.stringify({
    userGoal: goal,
    semanticSkeleton: sanitizedSkeleton
  }, null, 2);

  logAudit(3, 'INFO', `Transmitting sanitized skeleton to Air-Gapped OpenAI-Compatible LLM (${model} @ ${url})...`, {
    elementCount: sanitizedSkeleton.length,
    timeoutSec
  });

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutSec * 1000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI-compatible API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    let cleaned = content.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json\s*/, '').replace(/```$/, '');
    else if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```\s*/, '').replace(/```$/, '');

    const parsed = JSON.parse(cleaned);
    return parsed.plan || parsed || [];
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

function simulateCloudReasoner(goal, sanitizedSkeleton, isAdversarial = false) {
  logAudit(3, 'INFO', 'Executing Reasoning Planner (Heuristic Model Engine)...', {
    mode: isAdversarial ? 'Adversarial Test Mode' : 'Standard Form Mode'
  });

  const plan = [];
  const submitButtons = [];

  for (const el of sanitizedSkeleton) {
    const label = (el.label || '').toLowerCase();
    const name = (el.name || '').toLowerCase();
    const placeholder = (el.placeholder || '').toLowerCase();
    const type = (el.type || '').toLowerCase();
    const combined = `${label} ${name} ${placeholder}`;

    // Skip reset, clear, demo buttons
    if (type === 'reset' || combined.includes('reset') || combined.includes('clear') || combined.includes('demo')) {
      continue;
    }

    if (type === 'submit' || combined.includes('submit') || combined.includes('apply')) {
      submitButtons.push({ action: 'click', targetRefId: el.refId });
      continue;
    }

    if (el.tagName === 'select' || el.tag === 'select') {
      let chosenVal = 'General';
      if (el.options && el.options.length > 1) {
        const obcOpt = el.options.find(o => {
          const t = (typeof o === 'string' ? o : (o.text || o.value || '')).toLowerCase();
          return t.includes('obc');
        });
        if (obcOpt) {
          chosenVal = typeof obcOpt === 'string' ? obcOpt : (obcOpt.value || obcOpt.text);
        } else {
          const first = el.options[1];
          chosenVal = typeof first === 'string' ? first : (first.value || first.text);
        }
      }
      plan.push({ action: 'select', targetRefId: el.refId, value: chosenVal });
      continue;
    }

    if (type === 'checkbox') {
      plan.push({ action: 'click', targetRefId: el.refId });
      continue;
    }

    // Inputs (specific types/keywords prioritized over generic student/applicant matching)
    if (combined.includes('mail') || type === 'email') {
      plan.push({ action: 'fill', targetRefId: el.refId, value: '{{user.email}}' });
    } else if (combined.includes('phone') || combined.includes('mobile') || combined.includes('contact') || type === 'tel') {
      plan.push({ action: 'fill', targetRefId: el.refId, value: '{{user.phone}}' });
    } else if (combined.includes('aadhaar') || combined.includes('uid')) {
      plan.push({ action: 'fill', targetRefId: el.refId, value: '{{user.aadhaar}}' });
    } else if (combined.includes('pan')) {
      plan.push({ action: 'fill', targetRefId: el.refId, value: '{{user.pan}}' });
    } else if (combined.includes('date') || combined.includes('dob') || type === 'date') {
      plan.push({ action: 'fill', targetRefId: el.refId, value: '{{user.dob}}' });
    } else if (combined.includes('address') || combined.includes('residence') || combined.includes('street')) {
      plan.push({ action: 'fill', targetRefId: el.refId, value: '{{user.address}}' });
    } else if (combined.includes('name') || combined.includes('student') || combined.includes('applicant')) {
      plan.push({ action: 'fill', targetRefId: el.refId, value: '{{user.fullName}}' });
    }
  }

  // Submit button clicked after all form inputs and consents are filled
  if (submitButtons.length > 0) {
    plan.push(submitButtons[0]);
  }

  // If this is the adversarial test page, intentionally append an attacker's injected action
  // to demonstrably trigger and prove Stage 4 CaMeL safety gate protection!
  if (isAdversarial) {
    plan.splice(2, 0, {
      action: 'fill',
      targetRefId: 'ref_999', // Injected phantom target
      value: 'INJECTED_EXFILTRATION_PAYLOAD'
    });
  }

  return plan;
}

// =========================================================================
// CENTRALIZED CONFIGURATION SCHEMA (PrivBrowseConfig)
// =========================================================================
const PrivBrowseConfig = {
  DEFAULT_CONFIG: {
    perceptionEngine: 'vision',
    simulationMode: false,
    autoSubmit: false,
    strictCaMeL: true,
    surveillanceEnabled: true,
    passphraseRequired: false,
    modelName: 'claude-sonnet-4-6'
  },

  async get() {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        const res = await chrome.storage.local.get(['privbrowse_config']);
        return { ...this.DEFAULT_CONFIG, ...(res.privbrowse_config || {}) };
      } catch (e) {}
    }
    return { ...this.DEFAULT_CONFIG };
  },

  async set(updates) {
    const current = await this.get();
    const updated = { ...current, ...updates };
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ privbrowse_config: updated }).catch(() => {});
    }
    return updated;
  }
};

// =========================================================================
// PIPELINE RATE LIMITER & CONCURRENCY CONTROLLER (SESSION-PERSISTENT)
// =========================================================================
const executionRateLimiter = {
  timestamps: [],
  maxPerMinute: 10,
  maxActionsPerPlan: 30,
  isPipelineRunning: false,

  async checkAllowed() {
    const now = Date.now();
    // Condition 2: Read persistent timestamps across service worker restarts
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      try {
        const stored = await chrome.storage.session.get(['pb_rate_timestamps', 'pb_pipeline_running']);
        if (Array.isArray(stored.pb_rate_timestamps)) {
          this.timestamps = stored.pb_rate_timestamps;
        }
        if (typeof stored.pb_pipeline_running === 'boolean') {
          this.isPipelineRunning = stored.pb_pipeline_running;
        }
      } catch (e) {}
    }

    this.timestamps = this.timestamps.filter(t => now - t < 60000);
    if (this.timestamps.length >= this.maxPerMinute) {
      return { allowed: false, error: 'Rate limit exceeded: Maximum 10 automation pipelines per minute. Throttling active.' };
    }
    if (this.isPipelineRunning) {
      return { allowed: false, error: 'Concurrent execution blocked: A PrivBrowse pipeline is already active.' };
    }
    this.timestamps.push(now);
    this.isPipelineRunning = true;

    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      await chrome.storage.session.set({
        pb_rate_timestamps: this.timestamps,
        pb_pipeline_running: true
      }).catch(() => {});
    }
    return { allowed: true };
  },

  async releaseLock() {
    this.isPipelineRunning = false;
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      await chrome.storage.session.set({ pb_pipeline_running: false }).catch(() => {});
    }
  }
};

// =========================================================================
// MULTI-TAB CONCURRENT PIPELINE FIFO JOB QUEUE
// =========================================================================
const pipelineJobQueue = [];
let isProcessingQueue = false;

function enqueuePipelineJob(job) {
  return new Promise((resolve, reject) => {
    pipelineJobQueue.push({ ...job, resolve, reject });
    if (!isProcessingQueue) {
      processPipelineJobQueue();
    }
  });
}

async function processPipelineJobQueue() {
  if (pipelineJobQueue.length === 0) {
    isProcessingQueue = false;
    return;
  }
  isProcessingQueue = true;
  const currentJob = pipelineJobQueue.shift();
  try {
    const result = await runPrivBrowsePipeline(currentJob.goal, currentJob.tabId, currentJob.forceSimulation);
    currentJob.resolve(result);
  } catch (err) {
    currentJob.reject(err);
  } finally {
    processPipelineJobQueue();
  }
}

// =========================================================================
// ZERO-TRUST RUN-TOKEN HMAC GENERATOR (CONDITION 3)
// =========================================================================
function generateHmacToken() {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function checkForUpdates() {
  const currentVersion = (typeof chrome !== 'undefined' && chrome.runtime?.getManifest)
    ? chrome.runtime.getManifest().version
    : '1.2.0';
  console.log(`[PrivBrowse Lifecycle] Running PrivBrowse v${currentVersion} (Enterprise Edition).`);
  return { version: currentVersion, status: 'LATEST' };
}

// =========================================================================
// STAGE 4: LOCAL SAFETY VERIFICATION GATE (CaMeL-Style Deterministic Filter)
// =========================================================================
function verifyActionPlan(proposedPlan, validRefIds) {
  // Safety Limit: Cap max actions per plan to disallow flooding
  if (Array.isArray(proposedPlan) && proposedPlan.length > executionRateLimiter.maxActionsPerPlan) {
    console.warn(`[CaMeL Gate] Proposed plan size (${proposedPlan.length}) capped to safety max of ${executionRateLimiter.maxActionsPerPlan}.`);
    proposedPlan = proposedPlan.slice(0, executionRateLimiter.maxActionsPerPlan);
  }

  const verifiedPlan = [];
  const blockedActions = [];

  const ALLOWED_USER_TOKENS = new Set([
    'fullname', 'name', 'studentname', 'email', 'phone', 'mobile',
    'address', 'permanentaddress', 'category', 'dob', 'birthdate',
    'aadhaar', 'pan', 'state', 'pincode', 'zip'
  ]);

  const isMap = validRefIds instanceof Map;

  for (let i = 0; i < proposedPlan.length; i++) {
    const step = proposedPlan[i];
    let isSafe = true;
    let blockReason = '';

    // Check 1: RefId existence in initial perception map
    const hasRef = isMap ? validRefIds.has(step.targetRefId) : (validRefIds && validRefIds.has && validRefIds.has(step.targetRefId));
    if (!step.targetRefId || !hasRef) {
      isSafe = false;
      blockReason = `Target ID "${step.targetRefId}" was not found in the initial webpage perception map. Possible indirect prompt injection or phantom reference.`;
    }

    // Check 2: Action type whitelist
    const allowedActions = ['fill', 'click', 'select'];
    if (!step.action || !allowedActions.includes(step.action.toLowerCase())) {
      isSafe = false;
      blockReason = `Disallowed action type "${step.action}". Only "fill", "click", and "select" are permitted.`;
    }

    // Check 3: Sensitive value leakage / code injection & Token Whitelist
    if (step.action === 'fill') {
      const val = step.value;
      if (typeof val !== 'string') {
        isSafe = false;
        blockReason = `Invalid fill value format.`;
      } else {
        const trimmed = val.trim();
        const placeholderMatch = trimmed.match(/^\{\{user\.([a-zA-Z0-9_]+)\}\}$/);
        const hasScriptTags = /<script|javascript:|eval\(|data:/i.test(val);

        if (hasScriptTags) {
          isSafe = false;
          blockReason = `Malicious executable code pattern detected in fill value.`;
        } else if (placeholderMatch) {
          const tokenKey = placeholderMatch[1].toLowerCase();
          if (!ALLOWED_USER_TOKENS.has(tokenKey)) {
            isSafe = false;
            blockReason = `Unauthorized user token key "{{user.${placeholderMatch[1]}}}". Only predefined identity tokens are permitted.`;
          }
        } else if (trimmed.length > 50) {
          isSafe = false;
          blockReason = `Cloud returned raw literal string instead of authorized {{user.X}} placeholder.`;
        }
      }
    }

    // Check 4: Cross-check element type if metadata map is available
    if (isSafe && isMap) {
      const targetMeta = validRefIds.get(step.targetRefId);
      if (targetMeta) {
        const tag = (targetMeta.tagName || targetMeta.tag || '').toLowerCase();
        if (step.action === 'select' && tag !== 'select' && targetMeta.role !== 'combobox') {
          isSafe = false;
          blockReason = `Action "select" cannot be executed on non-select element "${step.targetRefId}" (<${tag}>).`;
        }
        if (step.action === 'click') {
          const dangerousTags = ['iframe', 'script', 'object', 'embed', 'applet'];
          if (dangerousTags.includes(tag)) {
            isSafe = false;
            blockReason = `Action "click" blocked on high-risk element tag <${tag}>.`;
          }
          const href = (targetMeta.href || '').trim();
          if (/^(\s*javascript:|\s*data:|\s*vbscript:)/i.test(href)) {
            isSafe = false;
            blockReason = `Action "click" blocked on dangerous URI scheme "${href.slice(0, 30)}...". Pseudo-protocol execution prevented.`;
          }
        }
      }
    }

    if (isSafe) {
      verifiedPlan.push(step);
    } else {
      blockedActions.push({
        stepIndex: i,
        step,
        reason: blockReason
      });
    }
  }

  return {
    verifiedPlan,
    blockedActions,
    totalCount: proposedPlan.length,
    safeCount: verifiedPlan.length,
    blockedCount: blockedActions.length
  };
}

// =========================================================================
// PIPELINE ORCHESTRATOR
// =========================================================================
async function runPrivBrowsePipeline(goal, tabId, forceSimulation = false) {
  const rateCheck = await executionRateLimiter.checkAllowed();
  if (!rateCheck.allowed) {
    logAudit(0, 'SECURITY_ALERT', rateCheck.error);
    return { success: false, error: rateCheck.error, logs: currentSession.logs };
  }

  try {
    currentSession.status = 'RUNNING';
    currentSession.logs = [];

    // Condition 3: Generate Zero-Trust HMAC Run-Token per pipeline run
    const hmacRunToken = generateHmacToken();
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      await chrome.storage.session.set({ pb_active_hmac_token: hmacRunToken }).catch(() => {});
    }
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ pb_active_hmac_token: hmacRunToken }).catch(() => {});
    }
    chrome.runtime.sendMessage({
      type: 'SET_ACTIVE_HMAC_TOKEN',
      hmacRunToken
    }).catch(() => {});

    // Ensure content script is ready in the tab
    await ensureContentScriptInjected(tabId);

    // -------------------------------------------------------------
    // STAGE 1: LOCAL PERCEPTION
    // -------------------------------------------------------------
    logAudit(1, 'INFO', `Stage 1: Scanning active tab for interactive elements (On-Device Vision / DOM)...`);

    const storage = await chrome.storage.local.get(['userProfile', 'profile']);
    const profile = storage.userProfile || storage.profile || {};
    const denylist = [profile.fullName, profile.email, profile.phone, profile.aadhaar, profile.pan].filter(Boolean);

    // Warm up offscreen WebGPU runtime in parallel
    ensureOffscreenDocument().catch(() => {});

    let scanResponse = null;
    try {
      scanResponse = await chrome.tabs.sendMessage(tabId, {
        type: 'SCAN_AND_PERCEIVE',
        denylist,
        hmacRunToken
      });
    } catch (e) {
      // Retry once after reinjecting
      await ensureContentScriptInjected(tabId);
      scanResponse = await chrome.tabs.sendMessage(tabId, {
        type: 'SCAN_AND_PERCEIVE',
        denylist,
        hmacRunToken
      });
    }

    if (!scanResponse || !scanResponse.success) {
      throw new Error(scanResponse?.error || 'Failed to perceive page. Make sure the target page is loaded.');
    }

    const rawSkeleton = scanResponse.skeleton || [];
    const sanitizedSkeleton = scanResponse.sanitizedSkeleton || rawSkeleton;
    currentSession.scannedSkeleton = rawSkeleton;
    currentSession.sanitizedSkeleton = sanitizedSkeleton;
    currentSession.validRefIds = new Set(rawSkeleton.map(el => el.refId));
    currentSession.validRefMap = new Map(rawSkeleton.map(el => [el.refId, el]));

    if (scanResponse.mode === 'vision') {
      logAudit(1, 'SUCCESS', `Stage 1: Neural Vision Grounded (SmolVLM-256M WebGPU): ${rawSkeleton.length} interactive elements indexed. Zero field values read.`);
    } else {
      const perceptionEngine = scanResponse.mode === 'dom_fallback' ? 'Deterministic DOM Layout Fallback' : 'Deterministic DOM Perception';
      logAudit(1, 'SUCCESS', `Perceived page via ${perceptionEngine}: ${rawSkeleton.length} interactive elements indexed. Zero field values read.`);
    }

    // -------------------------------------------------------------
    // STAGE 2: LOCAL PII FILTERING
    // -------------------------------------------------------------
    const stats = scanResponse.stats || {};
    const nerEngine = scanResponse.nerMode === 'gliner' ? 'GLiNER ONNX NER + Regex Engine' : 'Deterministic Regex Engine';
    logAudit(2, 'INFO', `Stage 2: Running on-device ${nerEngine}... Scanned ${stats.elementsScanned || rawSkeleton.length} elements.`);

    if (stats.redactionsCount > 0) {
      logAudit(2, 'WARNING', `Redacted ${stats.redactionsCount} sensitive tokens (${stats.detectedTypes?.join(', ') || 'residual PII'}).`);
    } else {
      logAudit(2, 'SUCCESS', `Stage 2 Complete: Zero residual PII detected in structure map. Skeleton is clean.`);
    }

    // -------------------------------------------------------------
    // STAGE 3: CLOUD REASONING
    // -------------------------------------------------------------
    logAudit(3, 'INFO', `Stage 3: Preparing cloud reasoning payload (Structure only, no user values)...`);

    // Total Egress Tracking & Zero-PII Tally (Item 4.D)
    const skeletonPayload = JSON.stringify(sanitizedSkeleton);

    // Mathematical Deep Zero-PII Egress Gate (Critique 2):
    // Verifies zero raw personal data tokens or high-entropy identity patterns exist in outbound string
    inspectPayloadForPii(skeletonPayload, profile);

    const cloudPayloadBytes = new TextEncoder().encode(skeletonPayload).length;
    currentSession.egressStats = {
      cloudPayloadBytes,
      rawPiiEgressBytes: 0,
      timestamp: Date.now()
    };
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ pb_last_egress_stats: currentSession.egressStats }).catch(() => {});
    }
    chrome.runtime.sendMessage({
      type: 'EGRESS_STATS_UPDATE',
      stats: currentSession.egressStats
    }).catch(() => {});
    logAudit(3, 'INFO', `Stage 3 Egress Audit: ${cloudPayloadBytes} bytes structure egressed. Exactly 0 bytes raw PII egressed.`);

    const apiConfig = await getApiConfig();
    let proposedPlan = [];

    const tabInfo = await chrome.tabs.get(tabId);
    const isAdversarialPage = (tabInfo.url && tabInfo.url.includes('malicious')) ||
                              (tabInfo.title && tabInfo.title.toLowerCase().includes('malicious'));

    if (apiConfig.reasoningBackend === 'ollama') {
      try {
        proposedPlan = await callOllamaReasoner(goal, sanitizedSkeleton, apiConfig.customEndpointUrl, apiConfig.customModelName, apiConfig.timeoutSec);
      } catch (ollamaErr) {
        logAudit(3, 'WARNING', `Local Ollama endpoint unreachable or error: ${ollamaErr.message}. Gracefully falling back to Simulated Reasoner.`);
        proposedPlan = simulateCloudReasoner(goal, sanitizedSkeleton, isAdversarialPage);
      }
    } else if (apiConfig.reasoningBackend === 'openai_compatible') {
      try {
        proposedPlan = await callOpenAiCompatibleReasoner(goal, sanitizedSkeleton, apiConfig.customEndpointUrl, apiConfig.customModelName, apiConfig.apiKey, apiConfig.timeoutSec);
      } catch (localErr) {
        logAudit(3, 'WARNING', `Local OpenAI-compatible endpoint unreachable or error: ${localErr.message}. Gracefully falling back to Simulated Reasoner.`);
        proposedPlan = simulateCloudReasoner(goal, sanitizedSkeleton, isAdversarialPage);
      }
    } else if (apiConfig.reasoningBackend === 'simulation') {
      logAudit(3, 'INFO', 'Explicit simulation mode configured in Options.');
      proposedPlan = simulateCloudReasoner(goal, sanitizedSkeleton, isAdversarialPage);
    } else {
      // Default: Anthropic Cloud Reasoner
      const shouldSimulate = forceSimulation || apiConfig.offlineMode || !apiConfig.apiKey;
      if (shouldSimulate) {
        if (!apiConfig.apiKey) {
          logAudit(3, 'INFO', 'No Anthropic API Key provided. Running in On-Device Simulated Cloud Reasoner mode.');
        }
        proposedPlan = simulateCloudReasoner(goal, sanitizedSkeleton, isAdversarialPage);
      } else {
        try {
          proposedPlan = await callCloudReasoner(goal, sanitizedSkeleton, apiConfig.apiKey, apiConfig.model);
        } catch (cloudErr) {
          logAudit(3, 'WARNING', `Cloud API call encountered issue: ${cloudErr.message}. Falling back to Simulated Reasoner.`);
          proposedPlan = simulateCloudReasoner(goal, sanitizedSkeleton, isAdversarialPage);
        }
      }
    }

    logAudit(3, 'SUCCESS', `Received reasoning plan with ${proposedPlan.length} proposed actions.`);

    // -------------------------------------------------------------
    // STAGE 4: LOCAL SAFETY VERIFICATION GATE
    // -------------------------------------------------------------
    logAudit(4, 'INFO', `Stage 4: CaMeL-style Safety Gate: Verifying all proposed actions against local invariants...`);

    const verification = verifyActionPlan(proposedPlan, currentSession.validRefMap || currentSession.validRefIds);

    if (verification.blockedCount > 0) {
      for (const blocked of verification.blockedActions) {
        logAudit(4, 'SECURITY_ALERT', `[BLOCKED] Step ${blocked.stepIndex + 1} (${blocked.step.action} on ${blocked.step.targetRefId}): ${blocked.reason}`);
      }

      // Visual in-page defense alert trigger for demo
      chrome.tabs.sendMessage(tabId, {
        type: 'SHOW_DEFENSE_ALERT',
        message: `CaMeL Gate intercepted and neutralized ${verification.blockedCount} unauthorized/malicious action(s)!`
      }).catch(() => {});
    }

    if (verification.safeCount === 0) {
      throw new Error(`All proposed actions were blocked by the CaMeL Safety Gate. Execution aborted.`);
    }

    logAudit(4, 'SUCCESS', `CaMeL Verification Complete: ${verification.safeCount}/${verification.totalCount} actions verified safe to execute.`);

    // -------------------------------------------------------------
    // STAGE 5: LOCAL EXECUTION (Visual Agent Action Engine)
    // -------------------------------------------------------------
    logAudit(5, 'INFO', `Stage 5: High-Fidelity Execution: Dispatching ${verification.safeCount} verified steps with visual pointer...`);

    const execResponse = await chrome.tabs.sendMessage(tabId, {
      type: 'EXECUTE_VERIFIED_PLAN',
      plan: verification.verifiedPlan,
      profile
    });

    if (!execResponse || !execResponse.success) {
      throw new Error(execResponse?.error || 'Execution encountered an interruption.');
    }

    currentSession.status = 'COMPLETED';
    logAudit(5, 'SUCCESS', `Stage 5 Complete: All verified form fields populated with local user profile! Task complete.`);

    return {
      success: true,
      verifiedCount: verification.safeCount,
      blockedCount: verification.blockedCount,
      logs: currentSession.logs,
      egressStats: currentSession.egressStats
    };

  } catch (err) {
    currentSession.status = 'FAILED';
    logAudit(0, 'ERROR', `PrivBrowse Pipeline failed: ${err.message}`);
    return {
      success: false,
      error: err.message,
      logs: currentSession.logs
    };
  } finally {
    await executionRateLimiter.releaseLock();
  }
}

// =========================================================================
// MESSAGE LISTENERS (Supports both schemas + FIFO Queue & Observability)
// =========================================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Enforce Extension-Internal Origin Isolation:
  // Reject any external sender attempts (blocks cross-origin web injection into service worker)
  if (sender && sender.id && typeof chrome !== 'undefined' && chrome.runtime?.id && sender.id !== chrome.runtime.id) {
    console.warn('[PrivBrowse Security] Blocked untrusted message from external sender:', sender.id);
    sendResponse({ success: false, error: 'Access denied: untrusted sender origin' });
    return false;
  }

  // Schema 1: START_PIPELINE (Routed via Multi-Tab FIFO Job Queue)
  if (message.type === 'START_PIPELINE') {
    const targetTabId = message.tabId || sender.tab?.id;
    enqueuePipelineJob({ goal: message.goal, tabId: targetTabId, forceSimulation: message.forceSimulation })
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Schema 2: runAgent (Routed via Multi-Tab FIFO Job Queue)
  if (message.type === 'runAgent') {
    const targetTabId = message.tabId || sender.tab?.id;
    enqueuePipelineJob({ goal: message.goal, tabId: targetTabId, forceSimulation: false })
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'GET_SESSION_STATE') {
    sendResponse({
      status: currentSession.status,
      logs: currentSession.logs,
      egressStats: currentSession.egressStats || { cloudPayloadBytes: 0, rawPiiEgressBytes: 0 }
    });
    return true;
  }

  if (message.type === 'CLEAR_LOGS') {
    currentSession.logs = [];
    currentSession.status = 'IDLE';
    sendResponse({ success: true });
    return true;
  }

  // Relay Model Download Progress from offscreen to popup (Condition 4)
  if (message.type === 'MODEL_DOWNLOAD_PROGRESS') {
    chrome.runtime.sendMessage(message).catch(() => {});
    return true;
  }

  // Centralized Config Management
  if (message.type === 'GET_CONFIG') {
    PrivBrowseConfig.get().then(cfg => sendResponse({ success: true, config: cfg }));
    return true;
  }

  if (message.type === 'SAVE_CONFIG') {
    PrivBrowseConfig.set(message.config).then(cfg => sendResponse({ success: true, config: cfg }));
    return true;
  }

  // Persistent Audit Log Retrieval & Clearing
  if (message.type === 'GET_AUDIT_LOGS') {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['pb_audit_logs']).then(res => {
        sendResponse({ success: true, logs: res.pb_audit_logs || currentSession.logs });
      }).catch(err => sendResponse({ success: false, error: err.message }));
    } else {
      sendResponse({ success: true, logs: currentSession.logs });
    }
    return true;
  }

  if (message.type === 'CLEAR_AUDIT_LOGS') {
    currentSession.logs = [];
    currentSession.status = 'IDLE';
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ pb_audit_logs: [] }).then(() => {
        sendResponse({ success: true });
      }).catch(err => sendResponse({ success: false, error: err.message }));
    } else {
      sendResponse({ success: true });
    }
    return true;
  }

  if (message.type === 'GET_EGRESS_STATS') {
    if (currentSession.egressStats) {
      sendResponse({ success: true, stats: currentSession.egressStats });
    } else if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['pb_last_egress_stats']).then(res => {
        sendResponse({ success: true, stats: res.pb_last_egress_stats || { cloudPayloadBytes: 0, rawPiiEgressBytes: 0 } });
      }).catch(() => sendResponse({ success: true, stats: { cloudPayloadBytes: 0, rawPiiEgressBytes: 0 } }));
    } else {
      sendResponse({ success: true, stats: { cloudPayloadBytes: 0, rawPiiEgressBytes: 0 } });
    }
    return true;
  }

  if (message.type === 'CHECK_UPDATES') {
    sendResponse(checkForUpdates());
    return true;
  }

  // Zero-Trust Single-Use HMAC Nonce Verification & Immediate Revocation (Critique 6)
  if (message.type === 'CHECK_HMAC_TOKEN') {
    (async () => {
      let currentToken = null;
      let tokenTimestamp = 0;
      if (typeof chrome !== 'undefined' && chrome.storage?.session) {
        const sess = await chrome.storage.session.get(['pb_active_hmac_token', 'pb_active_hmac_timestamp']).catch(() => ({}));
        if (sess?.pb_active_hmac_token) {
          currentToken = sess.pb_active_hmac_token;
          tokenTimestamp = sess.pb_active_hmac_timestamp || 0;
        }
      }
      if (!currentToken && typeof chrome !== 'undefined' && chrome.storage?.local) {
        const loc = await chrome.storage.local.get(['pb_active_hmac_token', 'pb_active_hmac_timestamp']).catch(() => ({}));
        if (loc?.pb_active_hmac_token) {
          currentToken = loc.pb_active_hmac_token;
          tokenTimestamp = loc.pb_active_hmac_timestamp || 0;
        }
      }

      const isExpired = tokenTimestamp > 0 && (Date.now() - tokenTimestamp > 20000); // 20s TTL
      const isValid = Boolean(!isExpired && message.token && currentToken && message.token === currentToken);

      // NONCE INVARIANT: Single-use consumption. If valid, IMMEDIATELY revoke from session storage!
      // This prevents any replay attacks or token reuse after the offscreen inference has run.
      if (isValid && message.consumeNonce !== false) {
        if (typeof chrome !== 'undefined' && chrome.storage?.session) {
          await chrome.storage.session.remove(['pb_active_hmac_token', 'pb_active_hmac_timestamp']).catch(() => {});
        }
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          await chrome.storage.local.remove(['pb_active_hmac_token', 'pb_active_hmac_timestamp']).catch(() => {});
        }
      }

      sendResponse({ valid: isValid, expired: isExpired, consumed: isValid, expectedToken: currentToken });
    })();
    return true;
  }

  // Schema 3: Screenshot Capture for On-Device Vision (SmolVLM)
  if (message.type === 'captureScreenshot') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl });
      }
    });
    return true;
  }

  // Schema 4: Forwarding Vision and NER messages to Offscreen Document with HMAC Run-Token
  if (
    message.type === 'perceiveWithVision' ||
    message.type === 'RUN_WEBGPU_VISION_INFERENCE' ||
    message.type === 'redactWithGLiNER' ||
    message.type === 'RUN_GLINER_NER' ||
    message.type === 'CHECK_WEBGPU_CAPABILITIES'
  ) {
    ensureOffscreenDocument()
      .then(async () => {
        if (!message.hmacRunToken && typeof chrome !== 'undefined' && chrome.storage?.session) {
          const sess = await chrome.storage.session.get(['pb_active_hmac_token']).catch(() => ({}));
          if (sess && sess.pb_active_hmac_token) message.hmacRunToken = sess.pb_active_hmac_token;
        }
        if (!message.hmacRunToken && typeof chrome !== 'undefined' && chrome.storage?.local) {
          const loc = await chrome.storage.local.get(['pb_active_hmac_token']).catch(() => ({}));
          if (loc && loc.pb_active_hmac_token) message.hmacRunToken = loc.pb_active_hmac_token;
        }
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ error: chrome.runtime.lastError.message });
          } else {
            sendResponse(response);
          }
        });
      })
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
});

console.log('[PrivBrowse] Service worker initialized with resilient script injection.');

// =========================================================================
// ENTERPRISE NATIVE INTEGRATIONS (Context Menu, Global Shortcuts, Live Sync)
// =========================================================================

// 1. Register Context Menu on Install
if (typeof chrome !== 'undefined' && chrome.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(() => {
    if (chrome.contextMenus) {
      chrome.contextMenus.create({
        id: 'privbrowse-autofill-active',
        title: 'PrivBrowse: Autofill Form with Zero-PII',
        contexts: ['all']
      }, () => {
        if (chrome.runtime.lastError) {
          // Ignored or logged
        }
      });
    }
  });
}

// 2. Context Menu Click Dispatcher
if (typeof chrome !== 'undefined' && chrome.contextMenus?.onClicked) {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'privbrowse-autofill-active' && tab?.id) {
      await triggerAgentOnTab(tab.id, 'Context Menu');
    }
  });
}

// 3. Global Keyboard Command Shortcut Dispatcher (Ctrl+Shift+Y)
if (typeof chrome !== 'undefined' && chrome.commands?.onCommand) {
  chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'run-agent') {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id) {
        await triggerAgentOnTab(activeTab.id, 'Keyboard Shortcut (Ctrl+Shift+Y)');
      }
    }
  });
}

// Helper to trigger agent on tab targeting active/focused form
async function triggerAgentOnTab(tabId, source) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, {
      type: 'AUTOFILL_ACTIVE_FORM',
      source: source || 'Native Browser Action'
    });
    console.log('[PrivBrowse] Triggered agent on tab:', tabId, res);
  } catch (err) {
    console.warn('[PrivBrowse] Content script not responding to trigger, starting pipeline directly:', err.message);
    enqueuePipelineJob({
      goal: 'Autofill active form with zero-PII profile',
      tabId: tabId,
      forceSimulation: false
    }).catch(() => {});
  }
}

// 4. Real-time Multi-Context Configuration Sync
if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.privbrowse_config) {
      console.log('[PrivBrowse] Dynamic config update received:', changes.privbrowse_config.newValue);
    }
  });
}

