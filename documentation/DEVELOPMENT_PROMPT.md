# ElevateLI - Development Prompt

## Purpose of This Document
This prompt is designed to help you (the user) craft effective prompts for Claude Code, which is now directly editing the codebase. Use this document to understand the project context and current state before giving instructions to Claude Code.

## How to Use This Document
1. Read this to understand what the project is about
2. Check recent changes in CHANGELOG.md
3. Review current status in PROJECT_STATUS.md
4. Use CLAUDE_CODE_CONTEXT.md for immediate priorities
5. Ask Claude "What recent work has been done on ElevateLI?" for memory context
6. Craft clear, specific prompts for Claude Code based on this context

## Project Overview
A Chrome extension that analyzes LinkedIn profiles providing two scores:
1. **Completeness Score** (0-100%) - Calculated locally, no AI needed
2. **Content Quality Score** (1-10) - Requires user's own AI API key (OpenAI/Anthropic)

**Project Owner**: Prashant (prash) - Senior Product Manager
**Target Users**: Technical sourcers, senior PMs, directors viewing LinkedIn profiles
**Key Approach**: BYOAI (Bring Your Own AI) - users provide their own API keys

## Key Reference Documents
- **README.md** - User-facing documentation and features
- **CHANGELOG.md** - All version updates and fixes (check what's been done)
- **PROJECT_STATUS.md** - Current implementation state and blockers
- **PROJECT_PLAN.md** - Development phases and roadmap
- **CLAUDE_CODE_CONTEXT.md** - Immediate priorities for Claude Code
- **scoring-architecture.md** - Weighted scoring system design

## Current Development Setup
- **Claude Code** is now making direct edits to the codebase
- Running from WSL at: `/mnt/c/Users/prash/OneDrive/Desktop/AI Learning/LinkedIn-Optimizer-BYOAI`
- All changes are immediate - review with `git diff` before committing

## Project Context from Memory

### Recent Work Through Claude (July 4, 2025)
- **ProfileScoreCalculator**: Fixed integration - now uses weighted scoring (About 30%, Experience 30%, Skills 20%)
- **Rebranding**: In progress from "LinkedIn Optimizer" to "ElevateLI"
- **UI/UX Improvements**:
  - Removed jarring overlay - updates happen in injected panel
  - Popup redesigned with 3 states: No API key, API disabled, AI enabled
  - Dashboard reorganized: Overview, Settings, History tabs
- **Bug Fixes**:
  - AI no longer runs when disabled
  - Role mapping fixed (PM = Product Manager, not Project Manager)
  - About section extraction fixed (was showing 0 chars despite extracting 969)
- **Feature Additions**:
  - 30+ role options with "Other" custom input
  - Cache-first strategy (AI costs $0.05/analysis)
  - Section-by-section analysis UI

### Claude Code Integration
- Running from WSL: `/mnt/c/Users/prash/OneDrive/Desktop/AI Learning/LinkedIn-Optimizer-BYOAI`
- Direct file access - all edits are immediate
- Has fixed syntax errors and implemented weighted scoring

**Note**: Check with Claude's memory for complete context about recent work and decisions made during development sessions.

### Key Architectural Decisions
- **Manifest V3**: No dynamic imports allowed - all extractors bundled in analyzer.js
- **Cache-First**: AI analysis cached for 7 days to reduce costs
- **Progressive Disclosure**: Show simple info first, details on demand
- **Modular Extractors**: Separate extraction logic but bundled due to Chrome restrictions
- **Local Only**: No external servers - all data in Chrome storage
- **Weighted Scoring**: About/Experience sections worth 30% each, Skills 20%
- **Score Capping**: Missing critical sections cap max score (no About = max 7/10)

## Recent Changes (Check CHANGELOG.md for full history)
- ProfileScoreCalculator integrated (weighted scoring now works)
- Rebranding from "LinkedIn Optimizer" to "ElevateLI" in progress
- UI improvements: removed overlay, updates happen in injected panel
- Role selection expanded with 30+ options including "Other" with custom input
- Bug fixes: AI running when disabled, role mapping (PM = Product Manager)
## Where to Find Code
- **Main extraction logic**: `extension/content/analyzer.js` (1100+ lines)
- **Service worker**: `extension/background/service-worker.js` 
- **Popup**: `extension/popup/`
- **Dashboard**: `extension/options/` (3 tabs: Summary, Settings, Logs)
- **Manifest**: `extension/manifest.json`

## Documentation Structure
- `documentation/LINKEDIN_DOM_ANALYSIS.md` - DOM research and selectors
- `documentation/UI_FIXES_ROADMAP.md` - UI improvement priorities
- `MODULAR_EXTRACTION_ROADMAP.md` - Refactoring plan
- `full-report-strategy.md` - Section-by-section analysis approach
- `PROJECT_STATUS.md` - Current implementation status
- `PROJECT_PLAN.md` - Development phases and progress
- `CHANGELOG.md` - Version history and fixes
- `README.md` - User-facing documentation

## Recent Updates (July 4, 2025 - Part 3)
### Completed in This Session:
- ✅ **Cache-First AI Strategy Implemented**
  - Added "Enable AI Analysis" toggle in popup (OFF by default)
  - Service worker checks `enableAI` flag before running AI
  - Returns cached results when available
  - Badge shows "(AI Off)" when disabled
  - Force refresh via "Run New Analysis" button bypasses cache
- ✅ **Section-by-Section Analysis UI**
  - Added section cards to dashboard (About, Experience, Skills)
  - Each section can be analyzed individually (~$0.01-0.02 vs $0.05)
  - AboutExtractor successfully bundled into analyzer.js
  - Full text extraction working for About section

### UI Issues to Fix:
1. **Dashboard - Recommendations Text**:
   - Current: "Major recommendations" (incorrect)
   - Should be: "Recommendations:"
   - Location: `options.js` line ~96

2. **Dashboard - Section Analysis Buttons**:
   - Current: "Analyze About/Experience/Skills" buttons
   - Should: Auto-analyze and show scores when visiting dashboard
   - Remove buttons, show scores directly

3. **Popup - Cache Indicator**:
   - Current: "Last analyzed by AI (Recently)"
   - Should show: Actual timestamp (e.g., "2 hours ago", "Yesterday")
   - Missing: Proper cache age formatting

4. **Popup - Cost Text Placement**:
   - Text "~$0.05 per analysis • Results cached for 7 days" appears misaligned
   - Should be part of help text under toggle

## Recent Updates (July 4, 2025 - Parts 1 & 2)
### Completed Previously:
- ✅ ExperienceExtractor fully implemented with tech stack detection
- ✅ SkillsExtractor captures endorsements, categories, proficiency levels
- ✅ ProfileExtractor now calls all extractors (was only doing discovery)
- ✅ Fixed logs display to handle new data structures
- ✅ Open to Work extraction added
- ✅ Background tab extraction without visible tabs
- ✅ AI temperature reduced to 0.2 for consistency

## What Was Accomplished Previously
1. **Fixed "Show all" detection** - Updated selectors to match LinkedIn's new footer structure
2. **Added new scoring criteria**:
   - Featured section (+5 points)
   - 500+ connections (+5 points)  
   - Activity recency (dynamic +1 to +7 points)
3. **Auto-run AI analysis** when toggle enabled on page load
4. **Profile now shows 100% complete** with proper scoring algorithm
5. **Major UI/UX Improvements**:
   - **Popup Clarity (RICE: 570)** - Clear two-score display with explanations
   - **Trust Indicators (RICE: 288)** - Privacy badges and cost estimates
   - **Visual Improvements** - Better formatting, borders, spacing
   - **Completeness Focus** - Yellow box showing missing items with progress
   - **Progressive Disclosure** - Show 2 recommendations, expand for more
   - **Smart Minimize** - Badge changes color to indicate minimized state
6. **Fixed Extension Context Errors** - Added safe wrappers for all Chrome API calls

## Latest Updates (July 4, 2025 Session - Part 2)
### Section-by-Section Analysis Implementation
1. **About Section Extractor** - Created modular extraction:
   - `extension/content/extractors/about-extractor.js` - Modular extractor template
   - Modified `getAboutInfo()` to return full text, not just char count
   - Sends full About text to AI for detailed analysis

2. **Custom Instructions Integration**:
   - Added to Settings UI (needs implementation in `options.html`)
   - Basic instructions: 5-point scoring rubric (Hook, Value, Achievements, Keywords, CTA)
   - Custom instructions: Coach feedback appended to base prompt
   - Handler in `service-worker.js`: `handleSectionAnalysis()` and `buildSectionPrompt()`

3. **Weighted Scoring Architecture**:
   - `scoring-architecture.md` - Complete scoring system design
   - Section weights: About 30%, Experience 30%, Skills 20%, Headline 10%, Others 5%
   - Critical section caps: Missing About (max 7/10), Experience (max 6/10)
   - Dynamic calculation only includes existing sections

### Architecture Decisions
1. **Modular but Bundled**: Due to Chrome Manifest V3 restrictions, extractors must be bundled into analyzer.js
2. **Progressive Enhancement**: Quick overall analysis first, then section-by-section on demand
3. **Score Capping**: Missing critical sections cap the maximum possible score
4. **Storage Structure**: Section scores stored separately with timestamps

## Latest Updates (July 4, 2025 Session - Part 1)
### Critical Fixes
1. **AI overlay not appearing** - Fixed by removing waitForElement for non-existent carousel, changed to setTimeout injection
2. **Skills extraction returning 0** - Fixed with updated selectors in `getSkillsInfo()`, added multiple fallback strategies
3. **"Chrome APIs not available" error** - Fixed by using safe wrapper functions in init()
4. **Timestamp display** - Changed from relative ("just now") to exact format: DD Mon YYYY HH:MM:SS AM/PM

### UI Enhancements
1. **Header text hierarchy**:
   - Title: "LinkedIn Optimizer Analysis" (18px)
   - Stats: "Completeness: X%" and "Quality Score (AI): X/10" (14px)
   - Minimize button: 14px
2. **Minimized view** - Shows green success badge when profile is 100% complete
3. **Reduced whitespace** - Recommendation padding reduced from 8px to 4px
4. **Fixed overflow** - Added box-sizing: border-box to prevent border overflow

### Architecture Insights
1. **AI prompt structure** - Sends only metadata (char counts, section counts) not full text
2. **"View Full Report" limitation** - Currently shows same data as overlay, needs enhancement
3. **Custom instructions** - Only passes Target Role, needs full integration

## Previous July 2025 Session Updates
1. **UI Fixes Completed (4/7 high-priority)**:
   - ✅ **Recommendation spacing (RICE: 480)** - Reduced padding to 8px, improved readability
   - ✅ **Collapse/expand (RICE: 420)** - Added smooth animations, state persistence, badge color feedback
   - ✅ **Popup score sync (RICE: 380)** - Real-time updates via storage listener
   - ✅ **Completeness path clarity (RICE: 320)** - Added step-by-step actions, time estimates, point values

2. **Bug Fixes**:
   - Fixed skills count showing 0 instead of actual count (added `count` property for compatibility)
   - Fixed orphaned code fragment causing "response is not defined" error
   - Fixed UI whitespace and overflow issues
   - Fixed button positioning outside overlay boundaries

3. **UI Refinements**:
   - Reduced font sizes (13px→12px) for compact display
   - Wrapped score badge to prevent whitespace
   - Changed overflow handling for better content display
   - Tightened spacing throughout (margins, padding)

## Scoring Algorithm (115-122 points)
**High**: Photo (15), Experience ≥1 (20)  
**Medium**: Headline ≥100 (10), About ≥800 (10), Experience ≥2 (10), Skills ≥15 (10)  
**Low**: Education (5), Location (5), Banner (5), Top Skills ≥3 (5), Recommendations (5)  
**Minimal**: Certifications (3), Projects (2), Featured (5), 500+ Connections (5)  
**Activity**: ≤3mo (7), ≤6mo (5), ≤12mo (3), >1yr (1)

## Immediate Work Needed

### 1. Fix UI Text and Formatting Issues (Quick Wins)
**Tasks**:
1. Change "Major recommendations" to "Recommendations:" in dashboard
2. Fix cache timestamp display to show relative time ("2 hours ago")
3. Align cost text properly under AI toggle
4. Remove section analysis buttons, show scores directly

**Files**:
- `options.js` - Fix recommendations header text
- `popup.js` - Implement proper cache age formatting
- `popup.html` - Fix text alignment

### 2. Implement Auto-Analysis for Sections
**Problem**: Users must click "Analyze" for each section

**Solution**:
```javascript
async function autoAnalyzeSections() {
  const sections = ['about', 'experience', 'skills'];
  for (const section of sections) {
    if (!sectionScores[section]) {
      await analyzeSectionHandler(section);
    }
  }
}
```

### 2. Fix Section Analysis UX
**Current Issues**:
- Manual "Analyze" buttons require extra clicks
- Section scores not persisting properly
- No auto-analysis when visiting dashboard

**Implementation**:
1. **Auto-analyze on dashboard load**:
   ```javascript
   // In options.js loadSummary()
   if (profileData && !sectionScores.about) {
     await autoAnalyzeSections();
   }
   ```
2. **Remove manual buttons** - Replace with loading indicators
3. **Cache section scores** with profile data
4. **Show scores immediately** if cached

### 3. Complete Custom Instructions
**Current State**:
- UI exists in Settings but textarea not visible
- Base prompts hardcoded in service-worker.js
- No way for coaches to customize scoring

**Implementation**:
1. Fix custom instructions textarea visibility
2. Store custom instructions in Chrome storage
3. Append to base prompts in `buildSectionPrompt()`
4. Add examples/templates for coaches

### 4. Complete ProfileScoreCalculator
**Status**: Architecture defined but not implemented
- Weighted scoring system designed
- Critical section caps defined
- Service worker has placeholder class

**Implementation**:
- Complete `ProfileScoreCalculator.calculateOverallScore()` method
- Apply section weights dynamically
- Implement score capping for missing sections

### 5. Complete Remaining UI Fixes
- **Cancel Analysis Button (RICE: 350)** - Add ability to abort expensive AI operations
- **Popup Analysis Status (RICE: 300)** - Show progress during 2-10s analysis wait
- **Error Handling (RICE: 290)** - Display specific error messages (rate limits, network issues)

### 3. Optimize Data Extraction
**Current Issues**:
- Only extracting visible content (missing data behind "Show all" links)
- Single-pass extraction is inefficient for large profiles
- No caching mechanism (re-extracts on every page load)

**Solutions**:
- Implement deep extraction using `detailsUrls` already discovered
- Add modular extractors for each section (Experience, Skills, etc.)
- Cache extracted data for 7 days with versioning
- Progressive extraction: Quick scan → Deep dive on demand

### 3. Optimize AI Usage
**Current Issues**:
- Sending entire profile for analysis (expensive)
- No section-specific feedback
- Single tier pricing (~$0.05 per full analysis)

**Solutions**:
- Tiered analysis: Basic ($0.01), Standard ($0.05), Deep ($0.15)
- Section-by-section analysis with targeted prompts
- Smart caching of AI responses
- Batch multiple sections in single API call

## Immediate Priorities (from CLAUDE_CODE_CONTEXT.md)
1. Complete rebranding to ElevateLI
2. Fix popup UI confusion (multiple analyze buttons)
3. Dashboard shows cached data only (no auto-analysis)
4. Fix About section showing 0 chars despite extracting 969
5. Improve injected panel design per LinkedIn design standards

## How to Prompt Claude Code Effectively

### For Bug Fixes:
```bash
claude-code fix "Specific issue: [describe bug]. Expected: [correct behavior]. File: [if known]"
```

### For UI/UX Changes:
```bash
claude-code redesign "Component: [popup/dashboard/panel]. Requirements: [specific changes]"
```

### For New Features:
```bash
claude-code implement "Feature: [description]. Location: [where to add]. Behavior: [how it should work]"
```

### For Analysis:
```bash
claude-code analyze "Check: [what to investigate]. Report: [what information needed]"
```

## Current Architecture Constraints
- Chrome Manifest V3 (no dynamic imports)
- All extractors must be bundled in analyzer.js
- Cache-first approach (AI costs $0.05/analysis)
- Local storage only (no external servers)
- Progressive disclosure UI pattern

## Key Reminder
This document exists to help you craft effective prompts for Claude Code. Before giving Claude Code any instruction:
1. Understand the current state (check recent updates)
2. Know what's already been done (see CHANGELOG.md)
3. Identify the right approach (bug fix vs redesign vs new feature)
4. Give clear, specific instructions

Claude Code has direct access to edit all files, so be precise about what you want changed.