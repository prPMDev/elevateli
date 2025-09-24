/**
 * Syntax validation utility for JavaScript modules
 * Validates each module file before bundling to catch syntax errors early
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ANSI color codes for terminal output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

/**
 * Validate JavaScript syntax of a file
 * @param {string} filePath - Path to the JavaScript file
 * @returns {Object} Validation result with success flag and error details
 */
function validateFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Remove import/export statements as the build script does
    content = content.replace(/^import\s+.*?from\s+['"].*?['"];?\s*$/gm, '');
    content = content.replace(/^export\s+{[^}]+};?\s*$/gm, '');
    content = content.replace(/^export\s+(const|let|var|function|class)/gm, '$1');
    content = content.replace(/^export\s+default\s+/gm, '');
    
    // Try to create a script from the content
    // This will throw if there are syntax errors
    new vm.Script(content, {
      filename: filePath,
      displayErrors: false
    });
    
    return {
      success: true,
      filePath
    };
  } catch (error) {
    // Extract useful error information
    const errorInfo = {
      success: false,
      filePath,
      error: error.message,
      line: null,
      column: null
    };
    
    // Try to extract line and column from error message
    const match = error.stack.match(/:(\d+):(\d+)/);
    if (match) {
      errorInfo.line = parseInt(match[1]);
      errorInfo.column = parseInt(match[2]);
    }
    
    return errorInfo;
  }
}

/**
 * Validate all modules in the build order
 * @param {Array} moduleOrder - Array of module paths to validate
 * @param {string} basePath - Base path for modules
 * @returns {Object} Validation summary
 */
function validateModules(moduleOrder, basePath) {
  console.log(`${colors.blue}🔍 Validating JavaScript syntax...${colors.reset}\n`);
  
  const results = [];
  let hasErrors = false;
  
  moduleOrder.forEach((modulePath, index) => {
    const fullPath = path.join(basePath, modulePath);
    const result = validateFile(fullPath);
    
    if (result.success) {
      console.log(`${colors.green}✓${colors.reset} ${modulePath}`);
    } else {
      hasErrors = true;
      console.log(`${colors.red}✗${colors.reset} ${modulePath}`);
      console.log(`  ${colors.yellow}Error:${colors.reset} ${result.error}`);
      if (result.line) {
        console.log(`  ${colors.yellow}Location:${colors.reset} Line ${result.line}, Column ${result.column}`);
      }
      console.log('');
    }
    
    results.push(result);
  });
  
  return {
    hasErrors,
    results,
    totalFiles: moduleOrder.length,
    errorCount: results.filter(r => !r.success).length
  };
}

/**
 * Get code snippet around error location
 * @param {string} filePath - Path to file
 * @param {number} errorLine - Line number of error
 * @param {number} context - Number of lines to show before/after error
 */
function getErrorContext(filePath, errorLine, context = 3) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Apply same transforms as validateFile
    content = content.replace(/^import\s+.*?from\s+['"].*?['"];?\s*$/gm, '');
    content = content.replace(/^export\s+{[^}]+};?\s*$/gm, '');
    content = content.replace(/^export\s+(const|let|var|function|class)/gm, '$1');
    content = content.replace(/^export\s+default\s+/gm, '');
    
    const lines = content.split('\n');
    
    const startLine = Math.max(0, errorLine - context - 1);
    const endLine = Math.min(lines.length, errorLine + context);
    
    console.log(`\n${colors.yellow}Code context:${colors.reset}`);
    
    for (let i = startLine; i < endLine; i++) {
      const lineNum = i + 1;
      const marker = lineNum === errorLine ? '>' : ' ';
      const lineColor = lineNum === errorLine ? colors.red : colors.reset;
      
      console.log(`${lineColor}${marker} ${lineNum.toString().padStart(4, ' ')} | ${lines[i]}${colors.reset}`);
    }
    console.log('');
  } catch (error) {
    // Ignore errors in getting context
  }
}

// Export for use in build script
module.exports = {
  validateFile,
  validateModules,
  getErrorContext
};

// If run directly, validate the standard module order
if (require.main === module) {
  // Import module order from build script
  const buildConfig = require('./build-analyzer.js');
  const moduleOrder = buildConfig.moduleOrder || [
    'constants.js',
    'state.js',
    'chromeUtils.js',
    'memoryManager.js',
    'domUtils.js',
    'profileDiscovery.js',
    'core/debug-config.js',
    'core/smart-logger.js',
    'core/logger.js',
    'core/cache-manager.js',
    'extractors/base-extractor.js',
    'extractors/photo.js',
    'extractors/headline.js',
    'extractors/about.js',
    'extractors/experience.js',
    'extractors/skills.js',
    'extractors/education.js',
    'extractors/recommendations.js',
    'extractors/certifications.js',
    'extractors/projects.js',
    'extractors/featured.js',
    'scoring/completeness-scorer.js',
    'scoring/quality-scorer.js',
    'ui/overlay-manager.js',
    'analyzer-base.js',
    'analyzer-main.js'
  ];
  
  const basePath = path.join(__dirname, '..', 'src', 'content', 'modules');
  const validation = validateModules(moduleOrder, basePath);
  
  console.log('\n' + '='.repeat(50));
  
  if (validation.hasErrors) {
    console.log(`${colors.red}❌ Syntax validation failed!${colors.reset}`);
    console.log(`Found ${validation.errorCount} error(s) in ${validation.totalFiles} files\n`);
    
    // Show detailed error context for each error
    validation.results.filter(r => !r.success).forEach(result => {
      console.log(`${colors.red}Error in ${result.filePath}:${colors.reset}`);
      if (result.line) {
        getErrorContext(result.filePath, result.line);
      }
    });
    
    process.exit(1);
  } else {
    console.log(`${colors.green}✅ All ${validation.totalFiles} modules have valid syntax!${colors.reset}\n`);
    process.exit(0);
  }
}