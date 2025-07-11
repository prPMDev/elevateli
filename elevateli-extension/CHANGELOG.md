# Changelog

All notable changes to ElevateLI will be documented in this file.

## [0.4.4] - July 7, 2025

### New Features
- **Enhanced Profile Context for AI**: AI now receives rich metadata including years of experience, career progression, and profile completeness
- **Experience Section Analysis**: Each experience role is now individually analyzed by AI for targeted feedback
- **Improved Recommendation Display**: Fixed transformation of AI recommendations to prevent "[object Object]" display

### Improved
- Profile intro AI prompt now considers career trajectory and experience level
- Better handling of synthesis recommendations with actions array format
- Enhanced error logging for recommendation display issues
- Clearer warning messages when extension context is invalidated

### Fixed
- Syntax error from trailing commas in class methods
- Experience section not being included in AI analysis
- Recommendations displaying as "[object Object]" instead of actionable text
- Extension context validation messages now guide users to refresh the page

### Technical Improvements
- Added helper methods: `calculateYearsOfExperience()` and `extractCareerProgression()`
- Experience deep extraction now runs before AI analysis for detailed role data
- Recommendation transformation handles both cached and fresh AI response formats

## [0.4.3] - July 7, 2025

### New Features
- **Distributed AI Analysis**: Analyzes profile sections individually to avoid token limits
- **Enhanced Experience Extraction**: Captures bullet points, location, and content metrics
- **Categorized Recommendations**: Organized by effort/impact (Critical, High Impact, Nice to Have)
- **Progressive UI Updates**: Shows real-time progress during AI analysis
- **Synthesis Engine**: Combines section scores into overall analysis

### Improved
- Experience extractor now clicks "Show more" buttons for full content
- Overlay injection with retry mechanism and 6 fallback strategies
- Better error messages for different API failure types
- Dynamic AI model selection based on section complexity
- Skills data properly sent to AI for analysis

### Fixed
- JSON parsing handles markdown-wrapped responses from AI
- Token limit errors prevented with model-specific limits
- Extension context validation prevents runtime errors
- Message format mismatch between content script and service worker

## [0.4.2] - July 6, 2025

### Fixed
- AI analysis now properly communicates between content script and service worker
- Fixed message handler expecting wrong data structure
- Enhanced profile ownership detection with DOM indicators
- Consistent cache key usage with saved profile ID

### Improved
- Better error logging for AI analysis debugging
- Profile detection now checks for edit buttons and analytics access
- Faster loading when returning to own profile

## [0.4.1] - July 5, 2025

### New Features
- Redesigned popup UI with 340px width for better readability
- In-popup confirmation dialogs instead of browser alerts
- Two distinct reset options: Reset Analysis (cache) and Reset Extension (factory)
- AI configuration section with role/level settings

### Improved
- Removed redundant Analyze button from popup
- Primary blue color changed to #0856a0 (distinct from LinkedIn)
- Save Settings as primary CTA button
- AI settings disabled when toggle is off
- Better visual hierarchy with text link for dangerous actions

### Fixed
- Removed obsolete updateInstructionsBtn event listener
- API key persistence issues
- Proper validation for AI settings

## [0.4.0] - July 2025

### Major Architecture Refactor
- Complete modular redesign with separate source files
- Three-phase extraction: scan() → extract() → extractDeep()
- Progressive UI with real-time feedback
- Enhanced error recovery with retry logic
- Built-in performance monitoring

### New Features
- Module-specific logging with configurable levels
- Performance tracking for every operation
- Debug utilities for development
- Clean build process to prevent duplicates

## [0.3.4] - July 2025

### Improved
- Profile analysis now captures ALL skills, recommendations, and certifications (previously missed many)
- More accurate completeness scoring based on full profile data
- Better detection of LinkedIn's profile sections

### Fixed
- Skills section now shows all skills instead of just the first few
- Recommendations are now properly counted and analyzed
- Certifications display correctly in the analysis

## [0.3.3] - June 2025

### New Features
- Beautiful new visual design with progress gauges
- Export your analysis results as PDF or CSV
- Batch analysis mode for faster, cheaper AI processing
- "Show all" buttons automatically expand to capture complete profile data

### Improved
- Cleaner integration with LinkedIn's interface
- Better timestamp handling for "Last analyzed" dates
- Cache system now shows previous results even when AI is disabled
- More detailed section-by-section breakdowns

### Fixed
- API key storage is now more reliable
- Better error messages when something goes wrong
- Improved compatibility with different LinkedIn profile layouts

## [0.3.2] - June 2025

### Initial Release
- Completeness score (0-100%) - works without API key
- AI-powered content quality score (1-10) - requires OpenAI or Anthropic API key
- Section-by-section analysis and recommendations
- Smart 7-day caching to reduce API costs
- Support for both OpenAI and Anthropic AI providers
- Clean, non-intrusive overlay on LinkedIn profiles