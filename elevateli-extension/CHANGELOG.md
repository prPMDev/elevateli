# Changelog

All notable changes to ElevateLI will be documented in this file.

## [0.5.0] - 2025-01-11

### Added
- **AI Insights Display in UI**: Complete integration of AI-powered career coaching feedback
  - Holistic 2-3 sentence assessments per section
  - Specific actionable improvements with "what" to do and "how" to do it
  - Line-by-line feedback for experience sections with before/after examples
  - Human-like coaching tone from experienced career advisor perspective
- **Enhanced AI Integration**:
  - Clear role-based prompting for better AI responses
  - Structured JSON output with positiveInsight and actionItems
  - Context-aware instructions considering career progression
  - Token usage tracking and cost monitoring
- **Persistent Cache**: Removed cache expiration - analysis results now saved indefinitely
- **Simplified Popup UI**:
  - Reorganized into two clear sections: Target Role Settings and AI Provider Settings
  - Combined provider and model selection into single dropdown
  - Reduced font sizes and whitespace for more compact interface
  - Added "Built with ❤️ for job seekers everywhere" footer message
  - Removed Anthropic option (not yet supported)
- **Enhanced Overlay UI**:
  - AI analysis status and elapsed time now display on single line with proper baseline alignment
  - Changed loading spinner from circle (⟳) to hourglass (⏳) for better clarity
  - Reduced banner padding and whitespace for more compact design
  - Temporarily hidden section-by-section score display for cleaner interface

### Fixed
- **Model Selection Persistence**: GPT-4o now properly saved and used (was showing "model: null")
- **API Key Encoding**: Added validation to prevent non-ASCII character errors
- **Field Mapping Issues**: 
  - Service worker now sends both 'insight' and 'positiveInsight' fields
  - Analyzer properly passes all AI fields (actionItems, specificFeedback)
  - Synthesis includes sectionScores in result object
- **UI Display Issues**:
  - AI insights no longer show "undefined." in UI
  - About section now shows insights from profile_intro analysis
  - Removed generic "Improves experience role quality from X/10" text
  - Fixed popup showing "Checking your profile..." indefinitely
- **Security Improvements**: Replaced innerHTML usage with DOM manipulation methods
- **Cache Loading**: Fixed AI insights not displaying when loaded from cache (sectionScores missing)

### Improved
- **Data Flow Debugging**: Added extensive logging at service worker, analyzer, and UI boundaries
- **Error Handling**: Better validation and error messages for API issues
- **Code Quality**: Added helper methods for DOM manipulation to avoid security issues
- **Popup Profile Detection**: Now fetches fresh userProfile data instead of using stale settings
- **UI Alignment**: Left-aligned profile status, removed "Last analyzed" line
- **State Management**: Added delays between state transitions to ensure UI synchronization
- **Status Display**: Combined AI analysis progress with elapsed time on single line

### Technical
- Enhanced `sendResponse` in service worker to include all AI fields
- Updated `analyzeSection` to properly map response fields
- Fixed `synthesizeResults` to include sectionScores
- Added `updateButtonContent()` and `createScoreBlock()` DOM helper methods
- Improved field consistency across content script and service worker boundaries
- Updated `checkProfileStatus()` to fetch latest userProfile from storage
- Simplified provider/model handling with combined dropdown value format

## [0.4.9] - 2025-01-10

### Fixed
- **Experience Section AI Analysis**: Added detailed debugging to troubleshoot experience roles not being analyzed
  - Enhanced logging in `extractDeep()` method to track extraction progress
  - Added structured experience data logging in service worker
  - Created fallback prompt for when experience section can't be broken into roles
  - Added timing and performance metrics for each section analysis

### Technical
- Enhanced `ExperienceExtractor.extractDeep()` with step-by-step logging
- Added detailed section analysis logging in service worker
- Created `createExperienceSectionPrompt()` for fallback analysis
- Added experience role details logging (achievements, responsibilities, skills)
- Enhanced synthesis logging to track experience score averaging

## [0.4.8] - 2025-01-09

### Added
- **Progressive Improvement System**: New unified view with gamification elements
  - Section-by-section analysis with star ratings (1-5 stars)
  - Positive reinforcement shown first for each section
  - Maximum 2 improvement bullets per section to avoid overwhelm
  - Dynamic coaching summaries based on profile completeness and quality
  - Re-engagement prompts to motivate continued improvement
- **Smart Recommendation Transformer**: Intelligently categorizes and prioritizes improvements
  - Analyzes missing items and AI recommendations together
  - Groups improvements by profile section (Photo, Headline, About, Experience, Skills, Recommendations)
  - Shows what's working well before suggesting improvements
- **Recommendation Perception Analysis**: 
  - Analyzes HOW existing recommendations are perceived (generic vs specific, credible vs weak)
  - Uses AI scores to determine if recommendations effectively validate expertise
  - Provides specific guidance on improving recommendation quality, not just quantity
  - Shows whether current recommendations create the right impression for target role
  - Clearly indicates when using default ratings due to limited visible data
  - Shows 1-star rating when quality can't be analyzed (not 3-star)
  - Falls back to cached analysis when current analysis fails
  - Acknowledges LinkedIn's limitation of only showing 2-3 visible recommendations
  - No longer suggests "Show all" since that navigates away from profile
- **Enhanced User Experience**:
  - Cleaner UI without gray box overlay - content flows naturally
  - Progress indicators showing percentage to profile excellence
  - Motivational messaging adapted to user's current progress level
- **OpenAI Model Selection**: Users can now choose between gpt-4o and gpt-4o-mini for cost/quality balance
- **Improved AI Analysis**:
  - Increased token limits to 4000 for better, more detailed AI responses
  - 5-minute timeout with elapsed time display during AI analysis
  - Better error handling for API failures

### Fixed
- **"No SW" Error**: Added Chrome API checks to prevent extension context errors
- **Content Score Display**: Fixed issue where content score would show as 0.0
- **UI State Management**: "Enable AI" toggle no longer shows incorrectly after successful analysis
- **API Response Handling**: Better parsing of AI responses with improved error recovery

### Technical
- Added `transformToProgressiveFormat()` method to unify recommendation data
- Implemented `analyzeSections()` for section-specific rating calculations
- Created `renderStars()` helper for visual gamification
- Added `generateCoachingSummary()` for personalized encouragement
- Implemented `generateReEngagementPrompt()` for progress-based motivation
- Enhanced `analyzeRecommendationPerception()` with cache fallback logic
- Added `isDefaultRating` flag to indicate when analysis was incomplete
- Improved `ANALYSIS_FAILED_CACHE_FALLBACK` state to support unified view
- Added Chrome runtime checks before all Chrome API calls
- Fixed content score calculation in synthesis scoring
- Improved elapsed time tracking for AI analysis timeout

## [0.4.7] - 2025-01-09

### Changed
- **Simplified Expanded View UI**: Removed clutter from the expanded analysis view
  - Removed "ElevateLI Analysis" header text (redundant since user knows what extension they're using)
  - Removed "Last analyzed" timestamp from expanded view (still shown in collapsed view)
  - Removed dismiss button (close button now in collapsed view for cleaner interface)
- **Cleaner Interface**: These changes align with the planned UI redesign (v0.5.0) for a more streamlined experience

### Technical
- Updated overlay-manager.js to remove header elements
- Moved close button functionality to collapsed view
- This is a step towards the full UI redesign planned in UI_REDESIGN_SPEC.md

## [0.4.6] - 2025-01-09

### Fixed
- **Cache Clearing Issue**: Fixed bug where AI analysis wouldn't run after first use
  - Cache key mismatch between CacheManager (uses `cache_`) and popup.js (was using `aiCache_`)
  - Now properly clears cached results when user clicks "Reset Analysis"
- **User Guidance**: Added helpful messages when clearing cache
  - Instructs users to click "Analyze" for fresh analysis
  - Suggests updating API key if AI analysis fails on reuse
- **API Key Reuse**: Improved handling of stored API keys for subsequent analyses

### Improved
- Better error recovery flow when AI analysis fails
- Clearer instructions for users experiencing analysis issues

## [0.4.5] - 2025-01-08
Minor version bump for stability improvements.

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