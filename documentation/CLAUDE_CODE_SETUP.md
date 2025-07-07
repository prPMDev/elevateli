# Claude Code Setup & Usage Guide for LinkedIn Optimizer

## What is Claude Code?

Claude Code is an agentic command line tool that delegates coding tasks directly from your terminal. It has direct file system access to your project and can:
- Read and understand your entire codebase
- Make edits across multiple files
- Fix syntax errors automatically
- Execute terminal commands
- Run tests and debug issues

## Installation & Setup

### Prerequisites
- Node.js 18+ installed
- Terminal access (Command Prompt, PowerShell, or Git Bash on Windows)
- Your API key from Anthropic

### Installation Steps
```bash
# Install Claude Code globally
npm install -g @anthropic-ai/claude-code

# Set up your API key
claude-code auth login

# Navigate to your project
cd "C:\Users\prash\OneDrive\Desktop\AI Learning\LinkedIn-Optimizer-BYOAI"

# Initialize Claude Code in the project
claude-code init
```

## How Claude Code Gets Project Context

### Automatic Context Discovery
When you run Claude Code in a directory, it automatically:
1. **Reads key files**: `package.json`, `manifest.json`, `README.md`
2. **Scans project structure**: Identifies Chrome extension layout
3. **Analyzes recent changes**: Git history, modified files
4. **Loads documentation**: All `.md` files in `/documentation`

### Manual Context Provision
For best results with LinkedIn Optimizer:
```bash
# Tell Claude Code about the project type
claude-code context add "Chrome Extension Manifest V3 for LinkedIn profile optimization"

# Point to key documentation
claude-code context add-file DEVELOPMENT_PROMPT.md
claude-code context add-file PROJECT_STATUS.md
claude-code context add-file scoring-architecture.md
```

## Working with LinkedIn Optimizer via Claude Code

### Current Priority: Fix ProfileScoreCalculator Integration

```bash
# 1. Have Claude Code analyze the integration issue
claude-code analyze "ProfileScoreCalculator is defined in service-worker.js but never called in parseAIResponse"

# 2. Fix the parseAIResponse function
claude-code fix "Update parseAIResponse in service-worker.js to use ProfileScoreCalculator for weighted scoring"

# 3. Update the two calls to parseAIResponse
claude-code fix "Add profileData parameter to parseAIResponse calls in analyzeWithOpenAI and analyzeWithAnthropic"
```

### Common Tasks

#### 1. Fix UI Issues
```bash
# Fix dashboard text
claude-code fix "In options.js line 96, change 'Major recommendations' to 'Recommendations:'"

# Fix cache timestamps
claude-code fix "In popup.js, show actual cache age instead of 'Recently'"
```

#### 2. Complete Section Analysis
```bash
# Implement auto-analyze for sections
claude-code implement "When dashboard loads, automatically analyze About, Experience, and Skills sections"

# Make custom instructions visible
claude-code fix "In options.html, make custom instructions textarea visible"
```

#### 3. Run Tests
```bash
# Test the completeness scoring
claude-code test "Load a LinkedIn profile and verify completeness score calculation"

# Test weighted scoring
claude-code test "Verify profiles missing About section cap at 7/10"
```

### Project-Specific Commands

```bash
# Check for syntax errors
claude-code lint extension/

# Bundle extractors into analyzer.js
claude-code bundle "Merge about-extractor.js into analyzer.js"

# Update documentation after changes
claude-code update-docs "Update PROJECT_STATUS.md with completed tasks"
```

## Best Practices for This Project

### 1. Provide Context
Always mention:
- Manifest V3 constraints (no dynamic imports)
- Service worker architecture
- Local-only data (no servers)
- Bring Your Own AI approach (user's API keys)

### 2. Test Incrementally
```bash
# After each change
claude-code test-extension "Load extension and verify no errors"
```

### 3. Follow Architecture
- Extractors must be bundled into analyzer.js
- Use safe Chrome API wrappers
- Maintain cache-first strategy
- Keep UI consistent ("Quality Score (AI)")

### 4. Document Changes
```bash
# After implementing features
claude-code update "CHANGELOG.md" "Add entry for ProfileScoreCalculator fix"
```

## Troubleshooting

### Common Issues

1. **"Cannot find module"**
   ```bash
   claude-code fix "Bundle the module into analyzer.js instead of importing"
   ```

2. **"Chrome API undefined"**
   ```bash
   claude-code fix "Add safe wrapper for Chrome API call"
   ```

3. **"Uncaught promise rejection"**
   ```bash
   claude-code fix "Add proper error handling with try-catch"
   ```

### Debug Mode
```bash
# Enable verbose logging
claude-code debug --verbose

# Check what files Claude Code is reading
claude-code context list

# See recent changes
claude-code diff
```

## Next Steps with Claude Code

1. **Immediate**: Fix ProfileScoreCalculator integration
   ```bash
   claude-code implement "Integrate ProfileScoreCalculator into parseAIResponse with weighted scoring"
   ```

2. **Quick Fixes**: UI text and behavior
   ```bash
   claude-code batch-fix "Fix all UI issues listed in PROJECT_STATUS.md"
   ```

3. **Features**: Complete section analysis
   ```bash
   claude-code implement "Complete section-by-section analysis with custom instructions"
   ```

## Advanced Usage

### Multi-File Operations
```bash
# Update all references to a function
claude-code refactor "Update all parseAIResponse calls to include profileData parameter"
```

### Architecture Decisions
```bash
# Get recommendations
claude-code suggest "Best way to implement weighted scoring with section caps"
```

### Performance Optimization
```bash
# Analyze and optimize
claude-code optimize "Reduce bundle size of analyzer.js"
```

## Remember
- Claude Code has full access to your project files
- It can make changes directly - review before committing
- Use `git diff` to see all changes made
- Claude Code works best with clear, specific instructions
- Reference the existing documentation files for context
