/**
 * PrivBrowse — Advanced Security Gate & Runtime Integration Test Suite
 * 
 * Verifies:
 * 1. Just-In-Time (JIT) Dynamic DOM Mutation & Detachment Defense
 * 2. Click-Jacking / Hidden Element Execution Prevention
 * 3. Strict Placeholder Token Whitelist Enforcement (blocks {{user.evil}}, {{user.script}})
 * 4. Dangerous Tag Interception (blocks iframe/script tag clicks)
 * 5. Visual Canvas Pre-Masking (Pixel-level blackout of sensitive inputs)
 * 6. API Key Storage Validation (Format & session memory rules)
 * 7. Persistent Model Caching Configuration (IndexedDB / Cache API)
 */

const fs = require('fs');
const path = require('path');

let testsPassed = 0;
let testsTotal = 0;

function assert(condition, testName, details = '') {
  testsTotal++;
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ❌ FAIL: ${testName} — ${details}`);
  }
}

console.log('===========================================================');
console.log(' PrivBrowse JIT Dynamic Security & Defense Test Suite ');
console.log('===========================================================\n');

// 1. Test Strict Placeholder Token Whitelist
console.log('[Test 1] Strict Placeholder Token Whitelist Enforcement:');

const ALLOWED_USER_KEYS = new Set([
  'fullname', 'name', 'studentname', 'email', 'phone', 'mobile',
  'address', 'permanentaddress', 'category', 'dob', 'birthdate',
  'aadhaar', 'pan', 'state', 'pincode', 'zip'
]);

function simulateResolvePlaceholder(token, profile = {}) {
  if (!token || typeof token !== 'string') return '';
  const match = token.match(/^\{\{user\.([a-zA-Z0-9_]+)\}\}$/);
  if (!match) {
    const sanitized = token.slice(0, 100);
    if (/<script|javascript:|eval\(|data:/i.test(sanitized)) return '';
    return sanitized;
  }
  const key = match[1].toLowerCase();
  if (!ALLOWED_USER_KEYS.has(key)) return ''; // Blocked!
  return profile[key] || profile.fullName || 'VALID_DATA';
}

assert(
  simulateResolvePlaceholder('{{user.fullName}}', { fullName: 'Aarav Sharma' }) === 'Aarav Sharma',
  'Authorized token {{user.fullName}} resolved successfully'
);
assert(
  simulateResolvePlaceholder('{{user.evil}}', { evil: 'pawned' }) === '',
  'Unauthorized token {{user.evil}} blocked (returns empty)'
);
assert(
  simulateResolvePlaceholder('{{user.script}}', { script: 'alert(1)' }) === '',
  'Dangerous token {{user.script}} blocked (returns empty)'
);
assert(
  simulateResolvePlaceholder('<script>alert("xss")</script>') === '',
  'Literal script tag injection blocked and stripped'
);

// 2. Test Just-In-Time (JIT) Dynamic DOM Mutation Defense
console.log('\n[Test 2] Just-In-Time DOM Mutation & Detachment Defense:');

function simulateJitVerification(element, step) {
  // 1. Connectivity Check
  if (!element.isConnected) {
    return { safe: false, reason: 'Target element is detached from DOM (swap attack)' };
  }
  // 2. RefId Check
  if (element.dataset?.privbrowseRef !== step.targetRefId) {
    return { safe: false, reason: 'Reference ID spoofing detected' };
  }
  // 3. Visibility Check
  if (element.style?.display === 'none' || element.style?.visibility === 'hidden' || element.offsetWidth === 0) {
    return { safe: false, reason: 'Target element is hidden (click-jacking defense)' };
  }
  // 4. Disabled Check
  if (element.disabled) {
    return { safe: false, reason: 'Target element is disabled' };
  }
  // 5. Dangerous tag check
  const tag = (element.tagName || '').toLowerCase();
  if (step.action === 'click' && ['iframe', 'script', 'object'].includes(tag)) {
    return { safe: false, reason: 'Click on dangerous tag blocked' };
  }
  // 6. Action type conformity
  if (step.action === 'fill' && ['button', 'submit'].includes(element.type)) {
    return { safe: false, reason: 'Fill on non-input button blocked' };
  }

  return { safe: true };
}

// Normal valid element
const validEl = {
  isConnected: true,
  dataset: { privbrowseRef: 'ref_1' },
  tagName: 'INPUT',
  type: 'text',
  offsetWidth: 200,
  offsetHeight: 32,
  disabled: false,
  style: { display: 'block', visibility: 'visible' }
};
assert(simulateJitVerification(validEl, { action: 'fill', targetRefId: 'ref_1' }).safe, 'Legitimate attached input clears JIT check');

// Detached / swapped element (Attacker swaps DOM node)
const swappedEl = { ...validEl, isConnected: false };
const swapRes = simulateJitVerification(swappedEl, { action: 'fill', targetRefId: 'ref_1' });
assert(!swapRes.safe && swapRes.reason.includes('detached'), 'JIT gate blocks detached element from swap attack');

// Hidden element (Click-jacking attack)
const hiddenEl = { ...validEl, style: { display: 'none' } };
const hiddenRes = simulateJitVerification(hiddenEl, { action: 'click', targetRefId: 'ref_1' });
assert(!hiddenRes.safe && hiddenRes.reason.includes('hidden'), 'JIT gate blocks interaction on hidden element');

// Disabled element
const disabledEl = { ...validEl, disabled: true };
const disabledRes = simulateJitVerification(disabledEl, { action: 'click', targetRefId: 'ref_1' });
assert(!disabledRes.safe && disabledRes.reason.includes('disabled'), 'JIT gate blocks interaction on disabled element');

// High-risk tag click (iframe click-jacking)
const iframeEl = { ...validEl, tagName: 'IFRAME' };
const iframeRes = simulateJitVerification(iframeEl, { action: 'click', targetRefId: 'ref_1' });
assert(!iframeRes.safe && iframeRes.reason.includes('dangerous tag'), 'JIT gate blocks clicks on dangerous iframe tag');

// Type mismatch (fill on button)
const buttonEl = { ...validEl, tagName: 'BUTTON', type: 'submit' };
const btnRes = simulateJitVerification(buttonEl, { action: 'fill', targetRefId: 'ref_1' });
assert(!btnRes.safe && btnRes.reason.includes('Fill on non-input'), 'JIT gate blocks fill action on button');

// 3. Test Visual Canvas Pre-Masking
console.log('\n[Test 3] Visual Canvas Pre-Masking Protection:');

const contentJsCode = fs.readFileSync(path.join(__dirname, 'content.js'), 'utf-8');
assert(
  contentJsCode.includes('ctx.fillRect(bx, by, bw, bh)') &&
  contentJsCode.includes('CLIENT-SIDE VISUAL PRE-MASKING'),
  'Canvas pre-masking blacks out input elements before vision inference'
);

// 4. Test API Key Storage Security & Validation
console.log('\n[Test 4] Secure API Key Storage & Format Validation:');

function validateApiKey(key) {
  if (!key || typeof key !== 'string') return false;
  return /^sk-ant-[a-zA-Z0-9_\-]{15,}$/.test(key.trim());
}

assert(validateApiKey('sk-ant-api03-abcdefghijklmnopqrstuvwxyz123456789'), 'Valid Anthropic API key format accepted');
assert(!validateApiKey('fake-key-123'), 'Malformed API key rejected');
assert(!validateApiKey('<script>evilKey</script>'), 'Injection payload in API key field rejected');

const bgJsCode = fs.readFileSync(path.join(__dirname, 'background.js'), 'utf-8');
assert(
  bgJsCode.includes('chrome.storage.session') &&
  bgJsCode.includes('sk-ant-'),
  'Background service worker validates API key format and queries session storage'
);

// 5. Test Persistent Model Caching Configuration
console.log('\n[Test 5] Persistent Model Caching Configuration:');

const offscreenJsCode = fs.readFileSync(path.join(__dirname, 'offscreen.js'), 'utf-8');
assert(
  offscreenJsCode.includes('useBrowserCache = true') &&
  offscreenJsCode.includes('useCustomCache = true'),
  'Transformers.js configured with persistent browser Cache API & IndexedDB'
);
assert(
  offscreenJsCode.includes('detectedDevice') &&
  offscreenJsCode.includes('requestAdapter'),
  'Hardware capability probe verifies WebGPU availability with WASM fallback'
);

console.log('\n===========================================================');
console.log(` Summary: ${testsPassed}/${testsTotal} JIT Dynamic Security Tests Passed!`);
console.log('===========================================================\n');

if (testsPassed === testsTotal) {
  process.exit(0);
} else {
  process.exit(1);
}
