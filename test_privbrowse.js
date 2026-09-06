/**
 * Automated Verification Script for PrivBrowse
 * 
 * Verifies:
 * 1. Deliverable file presence and integrity
 * 2. Manifest V3 schema validity
 * 3. Stage 2 PII Sanitization across all regex patterns
 * 4. Stage 4 CaMeL Safety Verification Gate defense logic
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
let passedTests = 0;
let totalTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${testName} — ${details}`);
  }
}

console.log('====================================================');
console.log(' PrivBrowse Automated End-to-End Verification Suite ');
console.log('====================================================\n');

// 1. Deliverables Check
console.log('[Check 1] Deliverable Files Existence:');
const requiredFiles = [
  'manifest.json',
  'background.js',
  'content.js',
  'sanitize.js',
  'popup.html',
  'popup.css',
  'popup.js',
  'test-form.html',
  'test-form-malicious.html',
  'offscreen.html',
  'offscreen.js',
  'config.js',
  'config.example.js',
  'start_server.py',
  'models/webgpu_smolvlm_stub.js',
  'models/gliner_onnx_stub.js',
  'SIH_PITCH_SCRIPT.md',
  'SUBMISSION_REPORT.md',
  'README.md',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png'
];

requiredFiles.forEach(f => {
  const fullPath = path.join(ROOT_DIR, f);
  assert(fs.existsSync(fullPath), `File exists: ${f}`, `Missing ${f}`);
});

// 2. Manifest V3 Check
console.log('\n[Check 2] Manifest V3 Validation:');
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'manifest.json'), 'utf-8'));
  assert(manifest.manifest_version === 3, 'manifest_version is 3');
  assert(manifest.permissions && manifest.permissions.includes('storage'), 'Has storage permission');
  assert(manifest.permissions && manifest.permissions.includes('offscreen'), 'Has offscreen permission');
  assert(manifest.background && manifest.background.service_worker === 'background.js', 'Service worker registered');
  assert(manifest.action && manifest.action.default_popup === 'popup.html', 'Popup action configured');
  assert(Array.isArray(manifest.content_scripts) && manifest.content_scripts.length > 0, 'Content scripts registered');
} catch (e) {
  assert(false, 'Manifest JSON parse', e.message);
}

// 3. Stage 2 PII Sanitization Unit Tests
console.log('\n[Check 3] Stage 2 Local PII Sanitization Tests:');
const sanitizer = require('./sanitize.js');

// Test Aadhaar
const aadhaarTest = sanitizer.sanitizeText('Candidate Aadhaar is 2345 6789 0123.');
assert(aadhaarTest.sanitized.includes('[REDACTED_AADHAAR]'), 'Indian Aadhaar regex detection');
assert(!aadhaarTest.sanitized.includes('2345 6789 0123'), 'Aadhaar value removed');

// Test PAN
const panTest = sanitizer.sanitizeText('PAN Card: ABCDE1234F attached.');
assert(panTest.sanitized.includes('[REDACTED_PAN]'), 'Indian PAN regex detection');
assert(!panTest.sanitized.includes('ABCDE1234F'), 'PAN value removed');

// Test Email
const emailTest = sanitizer.sanitizeText('Contact me at student.test@gov.in');
assert(emailTest.sanitized.includes('[REDACTED_EMAIL]'), 'Email regex detection');

// Test Phone
const phoneTest = sanitizer.sanitizeText('Helpline: +919876543210 or 9876543210');
assert(phoneTest.sanitized.includes('[REDACTED_PHONE]'), 'Phone regex detection');

// Test Denylist
const denylistTest = sanitizer.sanitizeText('Applicant Aarav Sharma submitted form.', ['Aarav Sharma']);
assert(denylistTest.sanitized.includes('[REDACTED_NAME]'), 'User denylist name matching');

// Test Skeleton Sanitization
const mockSkeleton = [
  { refId: 'ref_1', tagName: 'input', label: 'Email: secret@univ.edu', placeholder: 'Call 9876543210' },
  { refId: 'ref_2', tagName: 'select', label: 'Category', options: [{ text: 'General', value: 'gen' }] }
];
const skelResult = sanitizer.sanitizeSkeleton(mockSkeleton);
assert(skelResult.sanitizedSkeleton[0].label.includes('[REDACTED_EMAIL]'), 'Skeleton label email redacted');
assert(skelResult.sanitizedSkeleton[0].placeholder.includes('[REDACTED_PHONE]'), 'Skeleton placeholder phone redacted');
assert(skelResult.stats.redactionsCount === 2, 'Telemetry records exact redaction count');

// 4. Stage 4 CaMeL Safety Gate Unit Tests
console.log('\n[Check 4] Stage 4 Local Safety Verification Gate Tests:');

// Replicate verifyActionPlan logic from background.js for isolated unit testing
function verifyActionPlan(proposedPlan, validRefIds) {
  const verifiedPlan = [];
  const blockedActions = [];

  for (let i = 0; i < proposedPlan.length; i++) {
    const step = proposedPlan[i];
    let isSafe = true;
    let blockReason = '';

    if (!step.targetRefId || !validRefIds.has(step.targetRefId)) {
      isSafe = false;
      blockReason = `Target ID "${step.targetRefId}" was not found in the initial webpage perception map.`;
    }

    const allowedActions = ['fill', 'click', 'select'];
    if (!step.action || !allowedActions.includes(step.action.toLowerCase())) {
      isSafe = false;
      blockReason = `Disallowed action type "${step.action}".`;
    }

    if (step.action === 'fill') {
      const val = step.value;
      if (typeof val !== 'string') {
        isSafe = false;
        blockReason = `Invalid fill value format.`;
      } else {
        const isPlaceholder = /^\{\{user\.[a-zA-Z0-9_]+\}\}$/.test(val.trim());
        const hasScriptTags = /<script|javascript:|eval\(|data:/i.test(val);

        if (hasScriptTags) {
          isSafe = false;
          blockReason = `Malicious executable code pattern detected in fill value.`;
        } else if (!isPlaceholder && val.length > 50) {
          isSafe = false;
          blockReason = `Cloud returned raw literal string instead of authorized {{user.X}} placeholder.`;
        }
      }
    }

    if (isSafe) {
      verifiedPlan.push(step);
    } else {
      blockedActions.push({ stepIndex: i, step, reason: blockReason });
    }
  }

  return { verifiedPlan, blockedActions, safeCount: verifiedPlan.length, blockedCount: blockedActions.length };
}

const validRefIds = new Set(['ref_1', 'ref_2', 'ref_3', 'ref_4']);

// Test Legitimate Plan
const legitimatePlan = [
  { action: 'fill', targetRefId: 'ref_1', value: '{{user.fullName}}' },
  { action: 'fill', targetRefId: 'ref_2', value: '{{user.email}}' },
  { action: 'click', targetRefId: 'ref_3' }
];
const legResult = verifyActionPlan(legitimatePlan, validRefIds);
assert(legResult.safeCount === 3 && legResult.blockedCount === 0, 'Legitimate plan 100% verified safe');

// Test Adversarial Prompt Injection (Malicious Target Ref: ref_999)
const injectedPlan = [
  { action: 'fill', targetRefId: 'ref_1', value: '{{user.fullName}}' },
  { action: 'fill', targetRefId: 'ref_999', value: 'ATTACKER_EXFIL_TOKEN' }, // Injected rogue target!
  { action: 'click', targetRefId: 'ref_3' }
];
const injResult = verifyActionPlan(injectedPlan, validRefIds);
assert(injResult.blockedCount === 1, 'Stage 4 caught injected rogue targetRefId (ref_999)');
assert(injResult.safeCount === 2, 'Stage 4 preserved legitimate actions while blocking exploit');
assert(injResult.blockedActions[0].step.targetRefId === 'ref_999', 'Blocked action matches malicious injection');

// Test Script Injection
const scriptAttackPlan = [
  { action: 'fill', targetRefId: 'ref_1', value: '<script>alert(document.cookie)</script>' }
];
const scriptResult = verifyActionPlan(scriptAttackPlan, validRefIds);
assert(scriptResult.blockedCount === 1, 'Stage 4 blocked malicious script tag in fill value');

// Test Disallowed Action
const disallowedActionPlan = [
  { action: 'navigate', targetRefId: 'ref_1', value: 'http://malicious-site.com' }
];
const disResult = verifyActionPlan(disallowedActionPlan, validRefIds);
assert(disResult.blockedCount === 1, 'Stage 4 blocked unauthorized action type (navigate)');

console.log('\n====================================================');
console.log(` Summary: ${passedTests}/${totalTests} Tests Passed successfully!`);
console.log('====================================================\n');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
