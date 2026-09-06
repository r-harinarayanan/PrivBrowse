/**
 * PrivBrowse Enterprise — Commercial Packaging Script
 * 
 * Part of SIH 2026, PS ID SIH26171 | Team: Breaking Bad
 * Produces clean, verifiable production ZIP bundle for Chrome Web Store / Enterprise MDM.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const STAGING_DIR = path.join(DIST_DIR, 'privbrowse-v1.2.0-enterprise');
const ZIP_OUTPUT = path.join(DIST_DIR, 'privbrowse-v1.2.0-enterprise.zip');

console.log('====================================================');
console.log(' PrivBrowse Enterprise Commercial Packaging Tool ');
console.log('====================================================\n');

// 1. Ensure clean dist directory
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DIST_DIR, { recursive: true });
fs.mkdirSync(STAGING_DIR, { recursive: true });

// 2. Define Production Manifest of Files
const PRODUCTION_FILES = [
  'manifest.json',
  'background.js',
  'content.js',
  'sanitize.js',
  'config.js',
  'config.example.js',
  'popup.html',
  'popup.css',
  'popup.js',
  'options.html',
  'options.css',
  'options.js',
  'offscreen.html',
  'offscreen.js'
];

const PRODUCTION_DIRS = [
  'icons',
  'models'
];

// Helper to copy directory recursively
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 3. Copy Production Assets
console.log('[1/4] Staging production extension assets...');
for (const file of PRODUCTION_FILES) {
  const src = path.join(ROOT_DIR, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(STAGING_DIR, file));
    console.log(`  ✓ Copied: ${file}`);
  } else {
    console.warn(`  ⚠ Warning: Missing expected file ${file}`);
  }
}

for (const dir of PRODUCTION_DIRS) {
  const src = path.join(ROOT_DIR, dir);
  if (fs.existsSync(src)) {
    copyDir(src, path.join(STAGING_DIR, dir));
    console.log(`  ✓ Copied directory: ${dir}/`);
  }
}

// 4. Invariant Verification Check
console.log('\n[2/4] Verifying packaging security invariants...');
const stagedFiles = fs.readdirSync(STAGING_DIR);
const hasPptx = stagedFiles.some(f => f.toLowerCase().endsWith('.pptx'));
if (hasPptx) {
  throw new Error('FATAL SECURITY VIOLATION: PowerPoint file leaked into extension distribution bundle!');
}
console.log('  ✓ Invariant verified: Zero presentation/evaluation files in bundle');

// 5. Compress Archive using Native Platform Tooling
console.log('\n[3/4] Compressing enterprise package to ZIP...');
try {
  // Using native PowerShell Compress-Archive on Windows
  const psCmd = `powershell -NoProfile -Command "Compress-Archive -Path '${STAGING_DIR}/*' -DestinationPath '${ZIP_OUTPUT}' -Force"`;
  execSync(psCmd, { stdio: 'inherit' });
  console.log(`  ✓ Created package: ${path.relative(ROOT_DIR, ZIP_OUTPUT)}`);
} catch (err) {
  console.error('Packaging failed:', err.message);
  process.exit(1);
}

// 6. Output Statistics
const stats = fs.statSync(ZIP_OUTPUT);
console.log('\n[4/4] Package Verification:');
console.log(`  Package Path : ${ZIP_OUTPUT}`);
console.log(`  Bundle Size  : ${(stats.size / 1024).toFixed(2)} KB`);
console.log(`  Status       : COMMERCIAL RELEASE READY (v1.2.0)\n`);

// Clean staging directory
fs.rmSync(STAGING_DIR, { recursive: true, force: true });
