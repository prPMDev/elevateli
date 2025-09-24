#!/usr/bin/env node

/**
 * Script to switch between regular and safe versions for Chrome Web Store
 * Usage: node build/switch-to-safe.js [--safe|--regular]
 */

const fs = require('fs');
const path = require('path');

const mode = process.argv[2] || '--safe';

if (mode === '--safe') {
  console.log('🛡️  Switching to SAFE version (Chrome Web Store compliant)...\n');
  
  // Update manifest.json to use safe popup
  const manifestPath = path.join(__dirname, '..', 'manifest.json');
  let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  
  // Update popup HTML
  if (manifest.action && manifest.action.default_popup) {
    manifest.action.default_popup = 'src/popup/popup-safe.html';
  }
  
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('✅ Updated manifest.json to use popup-safe.html');
  
  // Run safe build
  console.log('\n📦 Building safe analyzer bundle...');
  require('./build-analyzer-safe.js');
  
  console.log('\n✅ Successfully switched to SAFE version!');
  console.log('🛡️  All innerHTML usage has been removed');
  console.log('📋 Ready for Chrome Web Store submission');
  
} else if (mode === '--regular') {
  console.log('⚡ Switching to REGULAR version (development)...\n');
  
  // Update manifest.json to use regular popup
  const manifestPath = path.join(__dirname, '..', 'manifest.json');
  let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  
  // Update popup HTML
  if (manifest.action && manifest.action.default_popup) {
    manifest.action.default_popup = 'src/popup/popup.html';
  }
  
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('✅ Updated manifest.json to use popup.html');
  
  // Run regular build
  console.log('\n📦 Building regular analyzer bundle...');
  require('./build-analyzer.js');
  
  console.log('\n✅ Successfully switched to REGULAR version!');
  console.log('⚡ Using original implementation');
  
} else {
  console.error('❌ Invalid mode. Use --safe or --regular');
  process.exit(1);
}

console.log('\n📌 Next steps:');
console.log('1. Reload the extension in Chrome');
console.log('2. Test all functionality');
console.log('3. Check console for any errors');