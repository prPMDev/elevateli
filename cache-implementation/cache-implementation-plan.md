# Cache-First AI Implementation Plan

## Problem
AI analysis runs on every profile visit at $0.05 per analysis

## Solution
1. **Disable Auto-AI** (Already done - code is commented out)
2. **Add Manual Toggle** in popup
3. **Implement Cache Layer** (Partially exists)
4. **Add UI Indicators** for cached results

## Files to Modify

### 1. popup.html - Add AI toggle
```html
<!-- Add to Personal Profile Analysis section -->
<div class="control-group">
  <label class="toggle">
    <input type="checkbox" id="enableAI">
    <span class="slider"></span>
    <span class="label">Enable AI Analysis</span>
  </label>
  <div class="help-text">AI costs ~$0.05 per analysis. Results are cached.</div>
</div>
```

### 2. popup.js - Handle toggle state
```javascript
// Load toggle state
chrome.storage.local.get(['enableAI'], (data) => {
  document.getElementById('enableAI').checked = data.enableAI || false;
});

// Save toggle state
document.getElementById('enableAI').addEventListener('change', (e) => {
  chrome.storage.local.set({ enableAI: e.target.checked });
});
```

### 3. service-worker.js - Enhance cache
- Cache is already implemented
- Just need to ensure it respects enableAI setting
- Add cache duration settings

### 4. analyzer.js - Update badge for cache
- Show "Cached" indicator
- Show cache age
- Add refresh button

## Cache Key Strategy
Already implemented:
- Profile ID + content hash (about, experience, skills, headline char counts)
- Default 7-day cache duration

## UI Changes
1. Badge shows cached indicator
2. Overlay shows "Last analyzed X days ago"
3. "Refresh Analysis" button for manual update
4. Settings for cache duration
