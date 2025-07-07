# Modular Extraction Roadmap

## ✅ COMPLETED (January 7, 2025)
This roadmap has been successfully implemented. The monolithic analyzer.js has been split into a clean modular architecture.

## Implementation Summary
- **Before**: Single 3000+ line analyzer.js file
- **After**: 9 core modules + 10 specialized extractors
- **Build System**: PowerShell/Bash scripts bundle for Manifest V3
- **Performance**: No runtime impact, easier maintenance

## Current Architecture

### Phase 1: Base Infrastructure ✓
- Added extractors registry to ProfileExtractor
- Added shared utility methods (waitForElement, clickShowAll)
- Prepared for extractor loop

### Phase 2: Create Extractor Classes
```javascript
// extractors/base.js
class BaseExtractor {
  async extract() {}
  async waitForElement() {}
  async clickShowAll() {}
}

// extractors/experience.js  
class ExperienceExtractor extends BaseExtractor {
  async extract() {
    // Move experience logic from ProfileSectionDiscovery
    // Add deep extraction (job descriptions, achievements)
  }
}

// extractors/skills.js
class SkillsExtractor extends BaseExtractor {
  async extract() {
    // Fix skills section discovery
    // Click "Show all" and extract full list
    // Get endorsement counts
  }
}
```

### Phase 3: Bundle for Manifest V3
Since Chrome extensions can't use dynamic imports:
```javascript
// analyzer.js
const ExperienceExtractor = (function() {
  // Extractor code
})();

ProfileExtractor.extractors = {
  experience: new ExperienceExtractor(),
  skills: new SkillsExtractor(),
  // ...
};
```

### Phase 4: Progressive Enhancement
- Scanner runs first (2ms) for badge update
- Deep extractors run async in background
- Update UI progressively as data arrives

## Priority Extractors
1. **Skills** - Currently broken, needs fix
2. **Experience** - Has detailsUrl for deep extraction  
3. **Education** - Simple structure
4. **Certifications** - Already detects totals
5. **About** - Working, just needs cleanup

## Extraction Patterns

### Pattern 1: Count from "Show all" button/link
```javascript
const showAllLink = section.querySelector('a[href*="/details/"]');
const match = showAllLink?.textContent?.match(/Show all (\d+)/);
```

### Pattern 2: Visible items with exclusions
```javascript
const items = section.querySelectorAll('.pvs-entity, .artdeco-list__item');
const validItems = items.filter(item => !item.querySelector('.pvs-list__footer-wrapper'));
```

### Pattern 3: Deep extraction via details page
```javascript
if (detailsUrl) {
  // Future: Navigate to /details/experience
  // Extract full content
}
```

## Testing Strategy
```javascript
// Console testing for each extractor
window.LinkedInOptimizer.extractors = {
  skills: () => new SkillsExtractor().extract(),
  experience: () => new ExperienceExtractor().extract()
};
```
