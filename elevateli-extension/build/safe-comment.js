/**
 * Safe commenting utility for JavaScript code
 * Ensures multi-line statements are properly commented
 */

const fs = require('fs');
const path = require('path');

/**
 * Safely comment out a multi-line statement
 * @param {string} code - The code to comment
 * @returns {string} Properly commented code
 */
function safeComment(code) {
  const lines = code.split('\n');
  return lines.map(line => {
    // If line already starts with //, keep it
    if (line.trim().startsWith('//')) {
      return line;
    }
    // Otherwise, add // at the beginning (preserving indentation)
    const match = line.match(/^(\s*)/);
    const indent = match ? match[1] : '';
    return indent + '// ' + line.trim();
  }).join('\n');
}

/**
 * Find and comment console.log statements in a file
 * @param {string} filePath - Path to the JavaScript file
 * @param {boolean} dryRun - If true, only show what would be changed
 */
function commentConsoleLogs(filePath, dryRun = false) {
  const content = fs.readFileSync(filePath, 'utf8');
  let modified = content;
  let changeCount = 0;
  
  // Regular expression to match console.log statements (including multi-line)
  const consoleLogRegex = /console\.(log|error|warn|debug|info)\s*\([^)]*\)[;\s]*/gs;
  
  const matches = [...content.matchAll(consoleLogRegex)];
  
  if (matches.length === 0) {
    console.log(`No console statements found in ${path.basename(filePath)}`);
    return;
  }
  
  console.log(`\nProcessing ${path.basename(filePath)}:`);
  console.log(`Found ${matches.length} console statement(s)`);
  
  // Process matches in reverse order to maintain correct positions
  matches.reverse().forEach(match => {
    const statement = match[0];
    const startPos = match.index;
    const endPos = startPos + statement.length;
    
    // Check if it's already commented
    const lineStart = content.lastIndexOf('\n', startPos) + 1;
    const linePrefix = content.substring(lineStart, startPos).trim();
    
    if (linePrefix.startsWith('//')) {
      console.log('  - Already commented (skipping)');
      return;
    }
    
    const commented = safeComment(statement);
    
    if (dryRun) {
      console.log('\n  Would change:');
      console.log('  FROM:', statement.replace(/\n/g, '\n       '));
      console.log('  TO:  ', commented.replace(/\n/g, '\n       '));
    } else {
      modified = modified.substring(0, startPos) + commented + modified.substring(endPos);
      changeCount++;
    }
  });
  
  if (!dryRun && changeCount > 0) {
    fs.writeFileSync(filePath, modified);
    console.log(`\n✅ Commented out ${changeCount} console statement(s)`);
  }
}

/**
 * Process all files in a directory
 * @param {string} dirPath - Directory path
 * @param {boolean} dryRun - If true, only show what would be changed
 */
function processDirectory(dirPath, dryRun = false) {
  const files = fs.readdirSync(dirPath, { withFileTypes: true });
  
  files.forEach(file => {
    const fullPath = path.join(dirPath, file.name);
    
    if (file.isDirectory()) {
      // Recurse into subdirectories
      processDirectory(fullPath, dryRun);
    } else if (file.name.endsWith('.js')) {
      commentConsoleLogs(fullPath, dryRun);
    }
  });
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node safe-comment.js <file-or-directory> [--dry-run]');
    console.log('');
    console.log('Examples:');
    console.log('  node safe-comment.js ../src/content/modules/ui/overlay-manager.js');
    console.log('  node safe-comment.js ../src/content/modules --dry-run');
    process.exit(1);
  }
  
  const target = args[0];
  const dryRun = args.includes('--dry-run');
  
  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No files will be modified\n');
  }
  
  const targetPath = path.resolve(target);
  
  if (!fs.existsSync(targetPath)) {
    console.error(`Error: ${targetPath} does not exist`);
    process.exit(1);
  }
  
  const stats = fs.statSync(targetPath);
  
  if (stats.isDirectory()) {
    processDirectory(targetPath, dryRun);
  } else if (stats.isFile() && targetPath.endsWith('.js')) {
    commentConsoleLogs(targetPath, dryRun);
  } else {
    console.error('Error: Target must be a JavaScript file or directory');
    process.exit(1);
  }
  
  console.log('\n✨ Done!');
}

module.exports = {
  safeComment,
  commentConsoleLogs,
  processDirectory
};