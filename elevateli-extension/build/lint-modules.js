#!/usr/bin/env node

/**
 * Lint all modules before building
 * This catches additional issues that syntax validation might miss
 */

const { exec } = require('child_process');
const path = require('path');

const modulesPath = path.join(__dirname, '..', 'src', 'content', 'modules');

console.log('🔍 Running ESLint on modules...\n');

// Note: This requires ESLint to be installed
// Run: npm install --save-dev eslint
const eslintCommand = `npx eslint "${modulesPath}" --ext .js --format compact`;

exec(eslintCommand, (error, stdout, stderr) => {
  if (stdout) {
    console.log(stdout);
  }
  
  if (stderr) {
    console.error(stderr);
  }
  
  if (error) {
    console.error('\n❌ ESLint found issues');
    console.log('\nTo fix automatically fixable issues, run:');
    console.log(`npx eslint "${modulesPath}" --ext .js --fix`);
    process.exit(1);
  } else {
    console.log('✅ ESLint validation passed\n');
  }
});