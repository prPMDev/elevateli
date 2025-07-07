# ElevateLI

Open-source Chrome extension for LinkedIn profile optimization using your own AI keys.

## Features
- **Two-Score System**: Profile Completeness (0-100%) and Content Quality (0-10)
- **Visual Score Gauges**: Professional circular progress indicators
- **Smart Caching**: 7-day cache saves ~$0.05 per repeat visit
- **Bring Your Own AI**: Use your own OpenAI or Anthropic API keys
- **Privacy-First**: All data stored locally, no external servers
- **Modern UI Design**: LinkedIn-inspired interface with clean aesthetics
- **Intelligent Scoring**: Weighted scoring with critical section caps
- **Section Analysis**: Individual section scoring with batch optimization
- **Export Options**: Download reports as PDF or CSV
- **Modular Architecture**: Clean, maintainable codebase with separated concerns

## Installation
1. Clone this repository
2. Open Chrome → Extensions → Enable Developer Mode
3. Click "Load unpacked" → Select the `extension` folder
4. Configure your AI API key in settings

## Usage
1. Visit any LinkedIn profile
2. See the ElevateLI overlay showing completeness % (free)
3. Click "Analyze" for AI quality score ($0.05)
4. View cached results with age indicator (e.g., "2 days ago")
5. Click "View Details" to open the full dashboard

## Quick Start
### First Time Setup
1. Click extension icon → gear icon → Settings
2. Add your LinkedIn profile URL
3. Select AI provider (OpenAI/Anthropic)
4. Add your API key
5. Choose target role (PM, SWE, Designer, etc.)

### Daily Use
- **AI Off**: See completeness score only (free)
- **AI On**: See both scores, analyze on demand
- **Cache**: Results saved for 7 days by default

## Configuration
- **AI Providers**: 
  - OpenAI: GPT-4o, GPT-4o-mini, O3 (Beta)
  - Anthropic: Claude Opus, Sonnet, Haiku
- **Target Roles**: PM, SWE, Designer, Data, Marketing, Sales
- **Cache Duration**: 1-30 days (default: 7)
- **Custom Instructions**: Add personalized analysis criteria

## Scoring System

### Quality Score Calculation
The extension uses a sophisticated weighted scoring system that ensures profiles have substantial content:

**Section Weights:**
- About Section: 30%
- Experience: 30% 
- Skills: 20%
- Headline: 10%
- Education: 5%
- Recommendations: 5%

**Critical Section Caps:**
Missing critical sections limits your maximum possible score:
- No About section → Max score: 7/10
- No Experience → Max score: 6/10
- No Skills → Max score: 9/10
- No Recommendations → Max score: 8/10

**Example:** A profile with excellent Headline (9/10) and Skills (8/10) but missing About and Experience sections would score only 6/10 (not 8.3/10) due to the Experience cap.

## Cache-First Strategy
The extension uses an intelligent cache-first approach to minimize costs and improve performance:

**How it works:**
1. **Cache Check First**: Before extracting any data, checks if valid cached analysis exists
2. **Skip Extraction**: If cache is valid (within duration), only runs quick completeness check
3. **Smart Refresh**: Full extraction only happens when cache expires or user forces refresh
4. **Performance Boost**: Pages load 3-5x faster with cached data

**Benefits:**
- Reduces page load time from ~5s to ~1s
- Prevents unnecessary DOM parsing
- Saves API costs on repeat visits
- Shows cached age indicator (e.g., "2 days ago")

## Structured AI Response Format
The extension uses a standardized JSON response format for consistent, parseable AI analysis:

**Response Structure:**
```json
{
  "overallScore": { "score": 8.5, "grade": "B+", "percentage": 85 },
  "sectionScores": {
    "about": { "exists": true, "score": 9, "weight": 0.30 },
    "experience": { "exists": true, "score": 8, "weight": 0.30 }
  },
  "recommendations": {
    "critical": [
      {
        "section": "about",
        "action": {
          "what": "Add quantified achievements",
          "why": "Increases profile views by 40%",
          "how": "Include 3-5 metrics with % or $ impact"
        }
      }
    ]
  },
  "insights": {
    "strengths": ["Strong technical skills", "Clear career progression"],
    "gaps": ["Missing quantified results", "Generic headline"]
  }
}
```

**Benefits:**
- Consistent parsing across AI providers
- Structured recommendations with what/why/how
- Detailed section-by-section scoring
- Machine-readable for future features

## Privacy & Security
- ✅ API keys encrypted in local Chrome storage
- ✅ No external servers or data collection
- ✅ Profile data never leaves your browser
- ✅ Open source for full transparency
- ✅ AI disabled by default (opt-in for costs)

## Cost Management
- **Completeness Score**: Free (no AI needed)
- **Quality Score**: ~$0.05 per analysis
- **Caching**: Saves 90%+ on repeat visits
- **Section Analysis**: ~$0.01-0.02 per section (coming soon)

## Modular Architecture

The extension uses a clean modular architecture for maintainability:

### Core Modules
- **constants.js**: All configuration values, selectors, and thresholds
- **state.js**: Extension state management and updates
- **memoryManager.js**: Memory leak prevention and cleanup utilities
- **domUtils.js**: DOM manipulation helpers and element waiting
- **chromeUtils.js**: Safe Chrome API wrappers with error handling
- **profileDiscovery.js**: Profile section discovery and completeness scoring
- **profileExtractor.js**: Main extraction logic with cache coordination
- **uiComponents.js**: UI injection and update functions
- **analyzer-main.js**: Entry point and module coordinator

### Specialized Extractors
- **base-extractor.js**: Base class for all extractors
- **about.js**: About section extraction
- **experience.js**: Work experience with tech stack detection
- **skills.js**: Skills with endorsements and categories
- **education.js**: Education history extraction
- **certifications.js**: Professional certifications
- **recommendations.js**: Peer recommendations
- **featured.js**: Featured content extraction
- **headline.js**: Professional headline extraction

### Supporting Modules
- **cache-manager.js**: Intelligent caching with TTL
- **logger.js**: Configurable logging system
- **overlay-manager.js**: LinkedIn overlay UI management
- **completeness-scorer.js**: Profile completeness calculation
- **quality-scorer.js**: AI-based quality scoring logic

## Contributing
Issues and PRs welcome! See documentation folder for:
- `CLAUDE.md` - Development guide for Claude Code
- `THOUGHT_EVOLUTION.md` - Product journey and decisions
- `CHANGELOG.md` - Detailed version history

## What's New (v0.3.3)
- **Professional UI Redesign**: Visual gauges, card layouts, LinkedIn-inspired design
- **Simplified Overlay**: Clean single-line view with essential information
- **Complete Data Extraction**: Fixed "Show all" clicking for skills/experience
- **Better Error Handling**: Fixed timestamp and service worker issues

## Current Status
- ✅ Weighted quality scoring with critical section caps
- ✅ AI quality analysis with 7-day caching
- ✅ Professional dashboard with visual gauges
- ✅ Multi-provider support (OpenAI/Anthropic)
- ✅ Section-by-section analysis
- ✅ Export to PDF/CSV
- ✅ Batch analysis with 30-40% cost savings
- ✅ Modern UI with consistent design system
- ✅ Modular architecture with 9 specialized modules
- 🚧 Photo analysis (GPT-4o Vision - in progress)
- 📋 Resume comparison (planned)
- 📋 Industry benchmarking (planned)