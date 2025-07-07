# ElevateLI - Development Prompt

## Context
Building an open-source Chrome extension for LinkedIn profile optimization.  
**Root**: `C:\Users\prash\OneDrive\Desktop\AI Learning\LinkedIn-Optimizer-BYOAI`

## Project Overview
A Chrome extension that analyzes LinkedIn profiles providing two scores:
1. **Completeness Score** (0-100%) - Calculated locally, no AI needed
2. **Content Quality Score** (1-10) - Requires user's own AI API key (OpenAI/Anthropic)

## Current State (July 4, 2025 - Part 3)

### Completed in This Session ✅
1. **Enable AI Analysis Toggle**
   - OFF by default (no automatic $0.05 charges)
   - Shows "(AI Off)" in badge when disabled
   - Returns cached results when available
   - Force refresh still works via "Run New Analysis"

2. **Section-by-Section Analysis UI**
   - Dashboard cards for About, Experience, Skills
   - Individual analysis buttons (~$0.01-0.02 each)
   - AboutExtractor bundled into analyzer.js
   - Full text extraction for About section

3. **ProfileScoreCalculator Architecture**
   - Weighted scoring system designed
   - About 30%, Experience 30%, Skills 20%, Headline 10%
   - Critical section caps (missing About = max 7/10)
   - **⚠️ Class defined but NOT INTEGRATED**

### Critical Blocker 🚫
**ProfileScoreCalculator exists but isn't called!** The parseAIResponse function needs to use it for weighted scoring. Without this, all sections count equally, making the quality score meaningless.

### Previously Completed (Parts 1-2) ✅
1. **Cache-First AI Strategy** - Saves $0.05 per repeat visit
   - 7-day default cache (configurable 1-30 days)
   - Cache key: profileId + content hash
   - Manual refresh via "Run New Analysis"
   - Auto-AI disabled by default

2. **Cache Management UI**
   - Settings: Enable/disable toggle, duration slider
   - Statistics: Cached profiles count, storage size, oldest entry
   - Clear all cache button

3. **Progress Overlay**
   - Real-time extraction feedback
   - Phase indicators with timing metrics
   - Discovery ~50ms, Full extraction ~500ms

4. **AI Improvements**
   - Temperature reduced to 0.1 for consistency
   - Sequential analysis (Photo→Headline→About→Experience→Skills)
   - Target role mapping fixed (pm → Product Manager)
   - Open to Work included in analysis

5. **UI Consistency**
   - "Quality Score (AI)" used everywhere
   - "Last analyzed by AI (X days ago)" indicators
   - No icon characters (removed 📦)

### Documentation Updated
- PROJECT_STATUS.md - Current implementation, next steps
- PROJECT_PLAN.md - Added Phase 4, updated metrics
- CHANGELOG.md - Added v0.2.5 with all changes

## Next Priority: Complete Section-by-Section Analysis

### 1. Implement Weighted Scoring System
**Reference**: `scoring-architecture.md`
- About (30%), Experience (30%), Skills (20%), Headline (10%), Others (5%)
- Critical sections cap maximum score when missing
- ProfileScoreCalculator class partially implemented

### 2. Section Analysis UI
- Add "Analyze Section" buttons in dashboard
- Show individual section scores
- Custom instructions textarea per section
- Progress indicators for each section

### 3. Full Report View
**Current**: Shows only top 5 recommendations
**Needed**: 
- All findings from AI analysis
- Section-by-section breakdown
- Export to PDF/CSV
- Shareable report link

## File Structure
- **Main logic**: `extension/content/analyzer.js` (2300+ lines)
- **Service worker**: `extension/background/service-worker.js` (with cache)
- **Settings UI**: `extension/options/` (3 tabs)
- **Popup**: `extension/popup/`
- **Extractors**: Bundled in analyzer.js (AboutExtractor, ExperienceExtractor, SkillsExtractor)

## Technical Constraints
- Chrome Manifest V3 (no dynamic imports)
- Extractors must be bundled, not separate files
- Use safe Chrome API wrappers to prevent errors
- Local storage for all data (no external servers)

## Performance Targets
- Completeness: <100ms (achieved: ~50ms)
- Full extraction: <1s (achieved: ~500ms)
- AI response: <3s (varies by provider)
- Cache hit: Instant

## Testing Checklist
- [ ] Cache invalidates on profile changes
- [ ] Progress overlay handles errors gracefully
- [ ] Sequential analysis maintains order
- [ ] All target roles map correctly
- [ ] Cache statistics update accurately

## Future Enhancements
1. **Profile Change Detection** - Notify when cache is stale
2. **Batch Analysis** - Analyze multiple profiles
3. **Team Analytics** - Company-wide insights
4. **Weekly Reports** - Scheduled analysis
5. **Industry Benchmarking** - Compare to similar roles