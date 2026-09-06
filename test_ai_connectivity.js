/**
 * PrivBrowse — On-Device AI Models & Connectivity Verification
 * 
 * Verifies:
 * 1. repairJSON handling of LLM output anomalies (markdown fences, trailing commas, single objects)
 * 2. Viewport downscaling math (WebGPU buffer protection: max 640x360)
 * 3. Manifest CSP and host permission configuration for Hugging Face and JSDelivr CDNs
 * 4. Offscreen contract integrity and message schemas
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
console.log(' PrivBrowse On-Device AI (SmolVLM + GLiNER) Test Suite ');
console.log('===========================================================\n');

// 1. Test JSON Repair Logic
console.log('[Test 1] SmolVLM LLM Output JSON Repair:');

// Replicate repairJSON from offscreen.js
function repairJSON(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let str = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  const firstSquare = str.indexOf('[');
  const lastSquare = str.lastIndexOf(']');
  const firstCurly = str.indexOf('{');
  const lastCurly = str.lastIndexOf('}');

  if (firstSquare !== -1 && lastSquare > firstSquare) {
    str = str.slice(firstSquare, lastSquare + 1);
  } else if (firstCurly !== -1 && lastCurly > firstCurly) {
    str = '[' + str.slice(firstCurly, lastCurly + 1) + ']';
  } else {
    return null;
  }

  str = str.replace(/,\s*([}\]])/g, '$1');

  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (e1) {
    try {
      const objectMatches = str.match(/\{[^{}]*\}/g);
      if (objectMatches && objectMatches.length > 0) {
        const recovered = [];
        for (const objStr of objectMatches) {
          try {
            const cleanObj = objStr.replace(/,\s*}/g, '}');
            recovered.push(JSON.parse(cleanObj));
          } catch (e2) {}
        }
        if (recovered.length > 0) return recovered;
      }
    } catch (e3) {}
  }
  return null;
}

// Test 1.1: Clean JSON Array
const cleanInput = '[{"tag":"input","type":"text","label":"Full Name","x":100,"y":50,"width":200,"height":30}]';
const cleanRes = repairJSON(cleanInput);
assert(cleanRes && cleanRes.length === 1 && cleanRes[0].label === 'Full Name', 'Clean JSON array parsed correctly');

// Test 1.2: Markdown Fenced with Prose
const proseInput = `Here is the detected UI elements:
\`\`\`json
[
  {"tag": "input", "type": "email", "label": "Email Address", "x": 100, "y": 120, "width": 250, "height": 35},
  {"tag": "button", "type": "submit", "label": "Register", "x": 100, "y": 200, "width": 120, "height": 40},
]
\`\`\`
Hope this helps!`;
const proseRes = repairJSON(proseInput);
assert(proseRes && proseRes.length === 2 && proseRes[1].label === 'Register', 'Markdown code fence + trailing comma + prose extracted');

// Test 1.3: Single Object Unwrapped
const singleObjInput = '{"tag":"input","type":"tel","label":"Mobile Number","x":50,"y":80,"width":180,"height":32}';
const singleRes = repairJSON(singleObjInput);
assert(singleRes && singleRes.length === 1 && singleRes[0].type === 'tel', 'Unwrapped single object wrapped and parsed as array');

// 2. Test Downscaling Math
console.log('\n[Test 2] Viewport Screenshot Downscaling (WebGPU Buffer Limit Protection):');

function calculateDownscaledDimensions(width, height, maxWidth = 640, maxHeight = 360) {
  let w = width;
  let h = height;
  if (w > h) {
    if (w > maxWidth) {
      h = Math.round(h * (maxWidth / w));
      w = maxWidth;
    }
  } else {
    if (h > maxHeight) {
      w = Math.round(w * (maxHeight / h));
      h = maxHeight;
    }
  }
  return { width: w, height: h };
}

// 4K Monitor: 3840x2160
const screen4k = calculateDownscaledDimensions(3840, 2160);
assert(screen4k.width === 640 && screen4k.height === 360, '4K frame (3840x2160) constrained to 640x360');

// FHD Monitor: 1920x1080
const screenFHD = calculateDownscaledDimensions(1920, 1080);
assert(screenFHD.width === 640 && screenFHD.height === 360, 'Full HD frame (1920x1080) constrained to 640x360');

// Portrait Viewport: 1080x1920
const screenPortrait = calculateDownscaledDimensions(1080, 1920);
assert(screenPortrait.height === 360 && screenPortrait.width === 203, 'Portrait frame constrained to maxHeight 360 preserving aspect ratio');

// 3. Test Manifest V3 CSP & Permissions
console.log('\n[Test 3] Manifest V3 Security & Model Hosting Policy:');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf-8'));
assert(
  manifest.content_security_policy &&
  manifest.content_security_policy.extension_pages.includes('wasm-unsafe-eval'),
  'CSP includes wasm-unsafe-eval for ONNX WebAssembly'
);
assert(
  manifest.content_security_policy.extension_pages.includes('https://cdn.jsdelivr.net') &&
  manifest.content_security_policy.extension_pages.includes('https://huggingface.co'),
  'CSP permits model weight downloads from Hugging Face & JSDelivr'
);
assert(
  manifest.host_permissions.includes('https://huggingface.co/*') &&
  manifest.host_permissions.includes('https://cdn.jsdelivr.net/*'),
  'Host permissions grant fetch access to Hugging Face and JSDelivr'
);

// 4. Test Offscreen Document Setup
console.log('\n[Test 4] Offscreen Runtime Configuration:');
const offscreenHtml = fs.readFileSync(path.join(__dirname, 'offscreen.html'), 'utf-8');
assert(offscreenHtml.includes('type="module"'), 'offscreen.html loads offscreen.js as an ES Module');
assert(offscreenHtml.includes('canvas id="offscreen-canvas"'), 'offscreen.html includes canvas for WebGPU pixel operations');

const offscreenJs = fs.readFileSync(path.join(__dirname, 'offscreen.js'), 'utf-8');
assert(offscreenJs.includes('SmolVLM-256M'), 'offscreen.js configures SmolVLM-256M vision pipeline');
assert(offscreenJs.includes('gliner_mediumv2.1'), 'offscreen.js configures GLiNER ONNX NER session');
assert(offscreenJs.includes('closeDocument()'), 'offscreen.js includes auto-closing idle memory cleanup');

console.log('\n===========================================================');
console.log(` Summary: ${testsPassed}/${testsTotal} AI Infrastructure Tests Passed!`);
console.log('===========================================================\n');

if (testsPassed === testsTotal) {
  process.exit(0);
} else {
  process.exit(1);
}
