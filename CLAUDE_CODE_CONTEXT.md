# LinkedIn Optimizer - Current Status for Claude Code

## Critical Priority 🔴
**ProfileScoreCalculator NOT INTEGRATED** - The weighted scoring system exists but isn't used!

### Fix Required:
In `extension/background/service-worker.js`:
1. Find `parseAIResponse` function (~line 1400)
2. Update it to use ProfileScoreCalculator.calculateOverallScore()
3. Add `profileData` parameter to the two calls in analyzeWithOpenAI and analyzeWithAnthropic

Without this fix, all sections count equally instead of proper weights (About 30%, Experience 30%, Skills 20%).

## UI Fixes Needed 🟡
1. **Dashboard** (`extension/options/options.js` ~line 96):
   - Change: "Major recommendations" → "Recommendations:"
   
2. **Popup** (`extension/popup/popup.js`):
   - Fix cache timestamp to show "Today", "Yesterday", "3 days ago" instead of "Recently"
   
3. **Settings** (`extension/options/options.html`):
   - Make custom instructions textarea visible (currently hidden)
   
4. **Dashboard Section Cards**:
   - Auto-analyze sections on load instead of manual buttons

## Architecture Constraints ⚠️
- **Manifest V3**: No dynamic imports allowed
- **Bundling**: All extractors must be in analyzer.js (not separate files)
- **Chrome APIs**: Use safe wrappers to prevent context errors
- **Local Only**: No external servers, all data in Chrome storage

## Current Implementation ✅
- Cache-first AI strategy (7-day default)
- Enable AI toggle (OFF by default)
- Section UI cards in dashboard
- AboutExtractor bundled and working
- Weighted scoring architecture designed (but not integrated!)

## Testing Checklist
After fixes:
1. Profile missing About section should cap at 7/10
2. Profile missing Experience should cap at 6/10
3. Cache timestamps should show proper age
4. Dashboard should auto-analyze sections

## File Locations
- Service Worker: `extension/background/service-worker.js`
- Dashboard: `extension/options/options.js`
- Popup: `extension/popup/popup.js`
- Analyzer: `extension/content/analyzer.js`
- Scoring Logic: `scoring-architecture.md`
