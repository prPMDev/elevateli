# ElevateLI - Changelog

## [v0.4.0] - January 7, 2025
### Added
- 🏗️ **Modular Architecture Implementation**:
  - Split monolithic 3000+ line analyzer.js into focused modules
  - 9 core modules for clear separation of concerns
  - 10 specialized extractors for each profile section
  - Build system to bundle modules for Manifest V3 compatibility
  - Memory manager module prevents leaks with centralized cleanup
  - State management module for consistent extension state
  - Chrome utils module with safe API wrappers
  - DOM utils module for reliable element manipulation
  
### Changed
- 📁 **Code Organization**:
  - `/modules/` - Core functionality modules
  - `/extractors/` - Profile section extractors
  - `/core/` - Cache and logging utilities
  - `/ui/` - UI management components
  - `/scoring/` - Scoring logic modules
  - Each module has single responsibility
  - Improved error handling and logging throughout

### Technical Details
- **Module Structure**: ES6 modules with import/export
- **Build Process**: PowerShell/Bash scripts concatenate modules
- **Backwards Compatible**: Same functionality, better organization
- **Performance**: No impact on runtime performance
- **Maintainability**: Much easier to debug and extend

## [v0.3.4] - January 7, 2025
### Added
- 🚀 **Cache-First Strategy**:
  - Intelligent cache checking before any data extraction
  - Skips full extraction when valid cache exists
  - Only runs quick completeness check for cached profiles
  - Reduces page load time from ~5s to ~1s
  - Shows cache age indicator (e.g., "2 days ago")
- 📋 **Structured AI Response Format**:
  - Standardized JSON schema for all AI providers
  - Consistent parsing with detailed section scores
  - Structured recommendations with what/why/how format
  - Machine-readable format for future features
  - Fallback to text parsing for backward compatibility
- 🎯 **Recommendations in Overlay**:
  - Shows top 3 recommendations directly in LinkedIn overlay
  - Clean formatting with numbered items
  - "View all X recommendations" link to dashboard
  - Parses both JSON and legacy text formats

### Fixed
- 🐛 **Extraction Efficiency**:
  - Fixed issue where full extraction ran even with valid cache
  - Cache-first approach prevents unnecessary DOM parsing
  - AI-disabled users now see cached quality scores
  - Proper cache validation with timestamp checks

### Changed
- 🧹 **Major Codebase Cleanup (40% reduction)**:
  - Removed 15+ orphaned files from previous implementations
  - Deleted: analyzer-old.js, analyzer-fix.js, analyzer-modular.js, etc.
  - Removed unused modular directories: extractors/, ui/, utils/, modules/
  - Cleaned up placeholder icons and unused manifest files
  - Streamlined to essential files only: analyzer.js, service-worker.js, UI files
- 📝 **Documentation Updates**:
  - Added Cache-First Strategy section to README
  - Added Structured AI Response Format documentation
  - Included JSON response schema example
  - Updated with performance benefits and technical details

## [v0.3.3] - January 7, 2025
### Added
- 🎨 **Professional UI Redesign** (LinkedIn/Meta Design Principles):
  - Visual gauge displays for Completeness and Quality scores
  - Card-based layout for insights and recommendations
  - Consistent design system with focus states and transitions
  - ElevateLI logo integration across dashboard and overlay
- 🚀 **Simplified LinkedIn Overlay**:
  - Single-line minimalist design showing only essentials
  - Clean white background with subtle shadow
  - Responsive layout with logo, scores, and actions
  - Removed complex expand/collapse functionality
- 📊 **Enhanced Dashboard Design**:
  - Visual score gauges with color-coded progress
  - Unified action bar for export/refresh
  - Professional typography with font smoothing
  - Improved section analysis cards with hover states

### Fixed
- 🐛 **Skills/Experience Extraction**:
  - Now clicks "Show all" modals to extract complete data
  - Fixed extraction of 53 skills (was only showing 4 visible)
  - Proper handling of all experience entries
- 🐛 **Timestamp Display**:
  - Fixed "Invalid Date" errors in overlay and popup
  - Handles both ISO string and numeric timestamps
  - Fallback to "Recently" for malformed dates
- 🐛 **Service Worker URL Handling**:
  - Fixed "Cannot read properties of undefined" errors
  - Proper URL resolution for all request types
- 🐛 **Duplicate UI Elements**:
  - Removed redundant Analyze button from popup
  - Cleaned up duplicate export buttons

### Changed
- 🎨 **Design System Updates**:
  - Primary color: LinkedIn blue (#0a66c2)
  - Border radius: 6-8px throughout
  - Form inputs with focus states and transitions
  - Professional color palette for scores (green/yellow/red)
- 📝 **Critical Sections Cap Explanation**:
  - Added clear documentation in README
  - Updated thought evolution with scoring rationale
  - Examples showing how caps affect final scores

## [v0.3.2] - January 5, 2025
### Added
- ✨ **Section-by-Section Analysis**:
  - Individual section analysis cards in dashboard
  - Per-section quality scores and recommendations
  - Cost estimates per section (~$0.01-0.02)
  - Section-specific prompts for focused analysis
- 💰 **Batch Section Analysis**:
  - Select multiple sections for combined analysis
  - 30-40% cost savings vs individual calls
  - "Select All" checkbox with dynamic cost estimation
  - Single API call for multiple sections
- 📊 **Export Functionality**:
  - Export full analysis report to PDF
  - Export analysis data to CSV format
  - Includes all scores, recommendations, and metadata
- 🔍 **Enhanced Extraction Logging**:
  - Added [EXTRACT-LOG] tags for debugging
  - Detailed logging for About, Experience, and Skills
  - Shows exact content being extracted

### Fixed
- 🎯 **UX: Cached Results Always Visible**:
  - Fixed issue where cached AI results weren't shown when AI disabled
  - Users now always see insights they've paid for
  - Better respects user investment in AI analysis
- 🔒 **Complete DOM Security**:
  - Converted `formatRecommendations()` to return DOM elements
  - Converted `formatCompletenessIssues()` to use safe DOM manipulation
  - Added `createMarkdownElement()` for safe markdown rendering
  - Eliminated all innerHTML usage with dynamic content

### Changed
- 🎨 **Service Worker Enhancement**:
  - Fixed section analysis to use section-specific prompts
  - Added batch analysis handler for cost optimization
  - Improved message handling for section requests

## [v0.3.1] - July 5, 2025
### Security
- 🔐 **Fixed Critical XSS Vulnerabilities**:
  - Replaced innerHTML with DOM manipulation methods in analyzer.js
  - Fixed security issues in badge creation and AI status updates
  - Converted overlay structure to use createElement for security
  - Fixed innerHTML usage in options.js (test results, custom role handling)
  - Added TODOs for remaining innerHTML usage in formatting functions
- 🔧 **Code Quality Improvements**:
  - Added comprehensive section headers and table of contents to analyzer.js
  - Improved code organization with clear section boundaries
  - Standardized message format across extension with backward compatibility
  - Fixed async message handling patterns (already had proper `return true`)

### Changed
- 📝 **Better Code Documentation**:
  - Added section headers for all major code blocks
  - Created table of contents at top of analyzer.js
  - Consistent formatting for section separators

### Pending
- ⚠️ **Remaining Security Tasks**:
  - formatRecommendations() still returns HTML strings
  - formatCompletenessIssues() still returns HTML strings
  - formatMarkdownInline() needs DOM-based replacement

## [v0.3.0] - July 5, 2025
### Changed
- 🎯 **Direct Role Passing to AI**:
  - Removed role mapping - roles now passed directly to AI
  - Fixed "pm" being interpreted as "Project Manager" instead of "Product Manager"
  - Added Product Manager-specific instructions to focus on strategy, not project management
- 📋 **Expanded Role List**:
  - Added 30+ roles including support, technical, and creative positions
  - Simplified design roles: Product Designer, UX/UI Designer, Graphic Designer
  - Added "Other" option with custom text input
  - Full list includes: Product/Program/Project Managers, various Engineers, Designers, Analysts, Support roles, and more

### Fixed
- ✅ **Open to Work Data**: Now properly included in AI prompts when available
- ✅ **Custom Role Support**: Users can enter any role not in the predefined list

## [v0.2.9] - July 4, 2025 (Part 6)
### Changed
- 🎨 **Rebranded to ElevateLI**:
  - Changed all instances of "LinkedIn Optimizer" to "ElevateLI"
  - Updated manifest.json with new name
  - Added logo placeholders in popup and options pages
  - Updated icon references to use placeholder names

## [v0.2.8] - July 4, 2025 (Part 5)
### Changed
- 🎯 **Progress Overlay Removed**: 
  - Replaced modal progress overlay with in-place badge updates
  - Less intrusive user experience
  - All status updates now shown directly in the injected badge
- 🎨 **Enhanced Badge UI**:
  - Two-line display: Completeness on top, AI status below
  - Contextual links based on state:
    - "Add API key for quality score" → Opens settings
    - "Enable AI for quality score" → Opens popup
  - Real-time status updates during analysis
- 🧹 **About Section Logging Cleanup**:
  - Removed all console.log statements for about extraction
  - About section now extracting correctly (956 chars detected)
  - Kept only error logging for debugging

### Fixed
- ✅ **About Section Extraction Complete**: Now properly extracts ~1000 character about sections
- ✅ **Badge State Management**: Properly shows different states based on API key and AI toggle

## [v0.2.7] - July 4, 2025 (Part 4)
### Added
- 🎨 **Progressive Popup UI**:
  - Two-state design: AI Disabled vs AI Enabled
  - AI Disabled: Hero completeness score with enable prompt
  - AI Enabled: Dual scores, cache status, analyze button
  - AI toggle accessible in both states
- 📊 **About Section Debug Logging**:
  - Scanner tries multiple selectors for DOM changes
  - ProfileCompletenessCalculator logs data structure
  - calculateCompleteness handles multiple formats

### Fixed
- ✅ **ProfileScoreCalculator Integration**:
  - Now properly called in parseAIResponse
  - Weighted scoring active: About 30%, Experience 30%, Skills 20%
  - Critical section caps working (no About = max 7/10)
- ✅ **Service Worker AI Checks**:
  - Section analysis now respects enableAI toggle
  - Prevents unwanted API calls when AI disabled
- ✅ **About CharCount Handling**:
  - Supports direct charCount, text.length, string formats
  - Handles nested structures (about.basic.about)
  - Debug logging to diagnose extraction issues
- ✅ **About Section Extraction** (DOM Update):
  - Fixed extraction for LinkedIn's new compound classes
  - Now uses `[class*="inline-show-more-text"]` selector
  - Handles classes like `inline-show-more-text--is-collapsed`
  - Text found in `span[aria-hidden="true"]` within these elements
  - Fixed async/sync mismatch in getAboutInfo() function
- ✅ **Popup UI Polish**:
  - Shows "--/10" when no quality score available
  - Date format: "Last analyzed: 15 Dec 2024"
  - "Refresh" → "Analyze" button
  - Checkbox: "Show scores on LinkedIn profile"
- ✅ **Custom Instructions**: Made textarea visible in options

### Changed
- 🔄 **Cache Status Display**: From relative time to absolute date format
- 🔄 **Quality Score Display**: Always shows /10 suffix for consistency
- 🔄 **Button Labels**: More descriptive action-oriented text

## [v0.2.6] - July 4, 2025 (Part 3)
### Added
- 🎚️ **Enable AI Analysis Toggle**:
  - OFF by default (no automatic charges)
  - Service worker checks enableAI flag
  - Badge shows "(AI Off)" when disabled
  - Returns cached results when available
- 📊 **Section-by-Section Analysis UI**:
  - Dashboard cards for About, Experience, Skills sections
  - Individual analysis buttons (~$0.01-0.02 vs $0.05 full)
  - AboutExtractor successfully bundled into analyzer.js
  - Full text extraction for About section
- 🏗️ **ProfileScoreCalculator Architecture**:
  - Weighted scoring: About 30%, Experience 30%, Skills 20%
  - Critical section caps (missing About caps at 7/10)
  - Class defined but NOT YET INTEGRATED

### Identified (Not Fixed)
- 🐛 **Dashboard Text**: "Major recommendations" should be "Recommendations:"
- 🐛 **Cache Timestamps**: Shows "Recently" instead of actual time
- 🐛 **Section Buttons**: Should auto-analyze instead of manual buttons
- 🐛 **Custom Instructions**: Textarea exists but not visible
- 🐛 **ProfileScoreCalculator**: Defined but never called in parseAIResponse

## [v0.2.5] - July 4, 2025 (Session 2)
### Added
- 💰 **Cache-First AI Strategy** (Complete):
  - 7-day default cache (configurable 1-30 days)
  - Manual refresh via "Run New Analysis" button
  - Cache key: profileId + content hash
  - Saves ~$0.05 per repeat visit
- 🎛️ **Cache Management UI**:
  - Enable/disable toggle in Settings
  - Duration slider (1-30 days)
  - Cache statistics (profiles, size, oldest)
  - Clear all cache button
- 🔄 **Progress Overlay**:
  - Shows during extraction with real-time updates
  - "Analyzing profile..." → "Completeness calculated..." → "Requesting AI analysis..."
  - Timing metrics: Discovery ~50ms, Full extraction ~500ms
- 📝 **Sequential Analysis**:
  - AI follows LinkedIn section order
  - Photo → Headline → About → Experience → Skills → Recommendations
  - "Additional Findings" section for full report

### Changed
- 🌡️ **Temperature**: Reduced to 0.1 (from 0.2) for consistent AI responses
- 🎯 **Target Role**: Fixed "pm" → "Product Manager" (not "project manager")
- 🎁 **Cache Indicators**: "Last analyzed by AI (X days ago)" without icons
- 🎨 **UI Consistency**: "Quality Score (AI)" used everywhere
- 🚀 **Auto-AI Disabled**: No more automatic $0.05 charges on every visit

### Fixed
- 🐛 **Open to Work**: Now extracted and included in AI analysis
- 🐛 **Progress UI**: Error handling cleans up overlay on failure
- 🐛 **Popup Cache Status**: Shows when viewing cached results

## [v0.2.4] - July 4, 2025 (Part 3)
### Added
- ✅ **Complete Data Extractors**:
  - ExperienceExtractor with tech stack detection, quantified achievements, duration calculations
  - SkillsExtractor with endorsements, categories, proficiency levels, pinned status
  - Open to Work extraction for target roles and work preferences
- 🛡️ **Background Tab Extraction** - Fetches detail pages without visible tabs
- 🎯 **Cache-First AI Strategy** (Design Phase):
  - AI opt-in by default (no automatic costs)
  - 7-30 day configurable cache duration
  - Profile change detection via content hash

### Fixed
- 🐛 **ProfileExtractor** - Now actually calls individual extractors (was only discovery)
- 🐛 **Logs Display** - Shows extracted data counts correctly for new data structures
- 🐛 **AI Provider Info** - Now saved and displayed in dashboard

### Changed
- 🌡️ **AI Temperature** - Reduced from 0.7 to 0.2 for consistent responses
- 📝 **AI Prompts** - Include full role names and Open to Work status

## [v0.2.3] - July 4, 2025
### Fixed
- 🐛 **AI overlay not appearing** - Removed waitForElement for non-existent carousel, using setTimeout instead
- 🐛 **Skills extraction returning 0** - Updated selectors with multiple fallback strategies
- 🐛 **"Chrome APIs not available" error** - Using safe wrapper functions throughout
- 🐛 **UI overflow issues** - Added box-sizing: border-box to prevent border overflow

### Changed
- ⏰ **Timestamp format** - From relative ("just now") to exact: DD Mon YYYY HH:MM:SS AM/PM
- 🏷️ **UI labels** - "Complete" → "Completeness", "AI Quality" → "Quality Score (AI)"
- 📐 **Font sizes** - Title: 18px, Stats: 14px, Button: 14px
- 📏 **Whitespace** - Reduced recommendation padding from 8px to 4px

### Added
- ✨ **Minimized view enhancement** - Shows green success badge when profile is 100% complete
- 📋 **Section analysis strategy** - Documented approach for deep per-section analysis

## [Unreleased]
### Fixed
- Fixed recommendation spacing in overlay (RICE: 480) - increased padding and margins for better readability
- Implemented proper collapse/expand with animations and state persistence (RICE: 420)
- Added popup score sync for real-time updates (RICE: 380)
- Enhanced completeness path clarity (RICE: 320) - added specific actions, time estimates, points, and visual hierarchy

## Version 1.1.1 - Skills Extraction Fix (December 2024)

### Fixed
- 🐛 **Skills Extraction Now Works Properly**:
  - Fixed issue where only 2 visible skills were extracted
  - Added automatic "Show all X skills" button clicking
  - Implemented 1.5 second wait for dynamic content loading  
  - Now extracts ALL skills (10-50+) instead of just top 2-3
  - Made getSkills() async to handle dynamic content properly

### Added
- ✅ Test script (test-skills-extraction.js) for verifying extraction in DevTools
- ✅ Better skill filtering to exclude endorsement counts and non-skill text
- ✅ Multiple fallback selectors for LinkedIn DOM variations

### Technical Details
- Changed getSkills() from sync to async function
- Added MutationObserver-like wait pattern for content loading
- Improved selector specificity for skill items (.pvs-entity, li.pvs-list__paged-list-item)
- Enhanced filtering regex to exclude "X endorsements", "University of...", etc.

## Version 1.1.0 - AI Integration Update (July 2025)

### Added
- ✅ **Real AI Integration**: 
  - OpenAI API integration with GPT-4o, GPT-4o-mini, and O3 models
  - Anthropic API integration with Claude Opus, Sonnet, and Haiku
  - Dynamic prompt building based on profile data and target role
  
- ✅ **API Key Validation**:
  - Test button to validate API keys before use
  - Visual feedback for valid/invalid keys
  - Provider-specific validation endpoints

- ✅ **Enhanced Dashboard**:
  - Shows exact local time of analysis
  - Displays AI provider and model used
  - Shows query structure sent to AI

- ✅ **Better Error Handling**:
  - Fallback to mock data clearly labeled
  - Console logging for debugging
  - Specific error messages for API failures

### Fixed
- 🐛 Profile extraction selectors updated for better LinkedIn compatibility
- 🐛 Content score now uses real AI instead of hardcoded values
- 🐛 Badge displays actual AI scores instead of dummy data
- 🐛 Analysis overlay shows real AI feedback

### Changed
- 📝 Updated OpenAI models to latest (GPT-4o family)
- 📝 Updated Anthropic models to current versions
- 📝 Mock data now clearly marked with [MOCK DATA - API ERROR]
- 📝 Improved profile data extraction with debug logging

### Technical Details
- Added `buildAnalysisPrompt()` for structured AI queries
- Added `parseAIResponse()` for extracting scores from AI
- Added `testApiKey()` for API validation
- Updated service worker with proper error handling

## Known Issues
- Profile extraction may miss some LinkedIn DOM variations
- Rate limiting protection not yet implemented
- No retry logic for transient API failures

## Next Release Plans
- Rate limiting and retry logic
- Usage tracking and cost estimation
- Photo analysis via Vision APIs
- Resume comparison feature
