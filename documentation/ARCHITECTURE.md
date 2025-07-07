# ElevateLI Architecture Documentation

## Overview
ElevateLI uses a modular architecture designed for maintainability, performance, and Chrome Extension Manifest V3 compatibility.

## Directory Structure
```
extension/
├── content/                    # Content script modules
│   ├── analyzer.js            # Bundled output (generated)
│   ├── analyzer-main.js       # Entry point
│   ├── modules/               # Core functionality
│   │   ├── constants.js       # Configuration values
│   │   ├── state.js          # State management
│   │   ├── memoryManager.js  # Memory leak prevention
│   │   ├── domUtils.js       # DOM helpers
│   │   ├── chromeUtils.js    # Chrome API wrappers
│   │   ├── profileDiscovery.js # Section discovery
│   │   ├── profileExtractor.js # Main extraction
│   │   └── uiComponents.js    # UI injection
│   ├── extractors/            # Section extractors
│   │   ├── base-extractor.js  # Base class
│   │   ├── about.js          # About section
│   │   ├── experience.js     # Work experience
│   │   ├── skills.js         # Skills & endorsements
│   │   ├── education.js      # Education
│   │   ├── certifications.js # Certifications
│   │   ├── recommendations.js # Recommendations
│   │   ├── featured.js       # Featured content
│   │   ├── headline.js       # Professional headline
│   │   └── projects.js       # Projects
│   ├── core/                  # Core utilities
│   │   ├── cache-manager.js  # Cache management
│   │   └── logger.js         # Logging system
│   ├── ui/                    # UI components
│   │   └── overlay-manager.js # Overlay management
│   ├── scoring/               # Scoring logic
│   │   ├── completeness-scorer.js # Completeness
│   │   └── quality-scorer.js  # Quality scoring
│   └── build.ps1/build.sh    # Build scripts
├── background/                # Service worker
│   └── service-worker.js     # AI calls, caching
├── popup/                     # Extension popup
│   ├── popup.html           
│   ├── popup.js             
│   └── popup.css            
└── options/                   # Settings page
    ├── options.html         
    ├── options.js           
    └── options.css          
```

## Module Descriptions

### Core Modules

#### constants.js
- All configuration values (timings, thresholds, colors)
- DOM selectors for LinkedIn elements
- API endpoints and model configurations
- Centralized for easy updates

#### state.js
- Extension state management
- Tracks navigation, extraction status
- Single source of truth
- State reset and update functions

#### memoryManager.js
- Prevents memory leaks in long-running pages
- Manages event listeners, timeouts, intervals
- Centralized cleanup function
- Critical for SPA navigation

#### domUtils.js
- DOM manipulation helpers
- Safe element selection
- Wait for element with timeout
- LinkedIn profile detection
- Debounce utilities

#### chromeUtils.js
- Safe Chrome API wrappers
- Handles context invalidated errors
- Promise-based storage access
- Message passing helpers
- Runtime checks

#### profileDiscovery.js
- Quick profile section scanning (~50ms)
- Identifies available sections
- Calculates completeness score
- Minimal DOM reads for performance

#### profileExtractor.js
- Orchestrates full extraction (~500ms)
- Cache coordination
- Calls individual extractors
- Aggregates results
- Triggers AI analysis

#### uiComponents.js
- Score badge injection
- Analysis overlay creation
- UI state updates
- Event handlers
- Visual feedback

### Extractors

Each extractor follows the same pattern:
- Extends BaseExtractor class
- Implements extract() method
- Handles multiple DOM structures
- Returns standardized data format
- Includes error handling

### Supporting Modules

#### cache-manager.js
- 7-day default cache (configurable)
- Cache invalidation on content change
- Storage quota management
- Performance optimization

#### logger.js
- Configurable log levels
- Performance timing
- Module-specific logging
- Production/debug modes

#### overlay-manager.js
- LinkedIn overlay UI
- Progressive state updates
- Animation management
- Responsive design

## Data Flow

1. **Page Load**
   - analyzer-main.js initializes
   - Checks if LinkedIn profile page
   - Injects score badge

2. **Quick Scan (50ms)**
   - ProfileDiscovery scans sections
   - Calculates completeness score
   - Updates badge immediately

3. **Full Extraction (500ms)**
   - User clicks analyze or cache expired
   - ProfileExtractor coordinates extractors
   - Each extractor processes its section
   - Results aggregated and cached

4. **AI Analysis**
   - Service worker receives extracted data
   - Checks cache first
   - Calls AI API if needed
   - Returns quality score and insights

## Build Process

Due to Manifest V3 restrictions on dynamic imports:

1. **Development**: Work with individual modules
2. **Build**: Run `build.ps1` (Windows) or `build.sh` (Unix)
3. **Output**: Creates bundled `analyzer.js`
4. **Deploy**: Load extension with bundled file

## Performance Considerations

- **Lazy Loading**: Only extract when needed
- **Progressive Enhancement**: Show completeness first
- **Cache First**: Check cache before extraction
- **Debouncing**: Prevent excessive DOM reads
- **Memory Management**: Clean up on navigation

## Security

- **No innerHTML**: All DOM manipulation via safe methods
- **Input Sanitization**: All user inputs validated
- **API Key Encryption**: Stored securely in Chrome storage
- **Content Security Policy**: Strict CSP enforced
- **No External Dependencies**: Self-contained

## Testing

- **Unit Tests**: Each module can be tested independently
- **Integration Tests**: Test module interactions
- **Manual Testing**: Use debug-utils.js for development
- **Performance Testing**: Built-in timing logs

## Future Improvements

1. **TypeScript Migration**: Add type safety
2. **Web Workers**: Offload heavy processing
3. **Virtual DOM**: For complex UI updates
4. **Module Federation**: When Chrome supports it
5. **Automated Testing**: Jest/Puppeteer suite