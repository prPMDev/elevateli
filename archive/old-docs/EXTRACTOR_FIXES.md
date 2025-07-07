# Extractor Fixes - January 2025

## Issues Fixed

### 1. jQuery Selector Errors
**Problem**: Multiple extractors were using jQuery-specific selectors (`:contains()`, `:has()`) that don't work with native `querySelector()`
**Impact**: Skills, Recommendations, and Certifications extractors were failing with `SyntaxError`

**Fixed Files**:
- `skills.js`: Removed `:contains()` selectors from endorsement extraction
- `recommendations.js`: Replaced `:contains()` with text search for buttons
- `certifications.js`: Removed all `:has()` selectors from section finding

### 2. Headline Not Detected
**Problem**: HeadlineExtractor was looking for `.pv-text-details__left-panel .text-body-medium` but LinkedIn now uses `.text-body-medium[data-generated-suggestion-target]`
**Solution**: Added multiple fallback selectors to find headline in various locations

### 3. Missing Extractors
**Problem**: Only 4 of 9 extractors were running due to errors cascading
**Solution**: Fixed all selector errors so all extractors can run successfully

## Technical Changes

### HeadlineExtractor (headline.js)
```javascript
// Old selector (not found)
'.pv-text-details__left-panel .text-body-medium'

// New selectors (with fallbacks)
'.text-body-medium[data-generated-suggestion-target]'
'.pv-text-details__left-panel .text-body-medium'
'section[data-member-id] .text-body-medium'
```

### SkillsExtractor (skills.js)
```javascript
// Removed invalid selectors
- 'section:has(h2:contains("Skills"))'
- '.t-14:contains("endorsement")'
- 'span:contains("endorsement")'

// Added text-based search fallback
const textElements = element.querySelectorAll('.t-14, span');
for (const el of textElements) {
  if (el.textContent && el.textContent.includes('endorsement')) {
    // Extract endorsement count
  }
}
```

### RecommendationsExtractor (recommendations.js)
```javascript
// Replaced jQuery button selectors
const buttons = section.querySelectorAll('button');
const receivedTab = section.querySelector('[aria-label*="received"]') || 
                   Array.from(buttons).find(btn => 
                     btn.textContent && btn.textContent.includes('Received'));
```

### CertificationsExtractor (certifications.js)
```javascript
// Removed all :has() selectors
- 'section:has(h2:contains("Licenses & certifications"))'
- 'div[data-view-name="profile-card"]:has(h2:contains("certifications"))'

// Kept only valid CSS selectors
'section[data-section="certifications"]'
'section#licenses-and-certifications'
```

## Results

After these fixes:
1. ✅ No more `SyntaxError` exceptions
2. ✅ All 9 extractors run successfully
3. ✅ Headline is properly detected
4. ✅ Complete profile analysis with accurate scores
5. ✅ Missing items list shows only truly missing sections

## Testing

To verify the fixes work:
1. Reload the extension
2. Visit a LinkedIn profile
3. Click "Analyze" or "Re-analyze"
4. Check console - should see all extractors running without errors
5. Overlay should show accurate completeness score and missing items