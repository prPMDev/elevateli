# Best Practices for LinkedIn Extractor Development

## Core Principles

### 1. Always Check the Anchor+Sibling Pattern First
LinkedIn's DOM structure frequently separates section markers (anchors) from their content. This is the #1 cause of extraction failures.

```javascript
// ❌ WRONG - Assumes content is inside the section
const section = document.querySelector('#skills');
const items = section.querySelectorAll('.skill-item'); // Often returns 0!

// ✅ CORRECT - Check anchor and siblings
const anchor = document.querySelector('div#skills.pv-profile-card__anchor');
if (anchor) {
  let sibling = anchor.nextElementSibling;
  while (sibling && siblingIndex < 5) {
    // Check sibling for actual content
    const items = sibling.querySelectorAll('[data-field="skill_card_skill_topic"]');
    if (items.length > 0) {
      section = sibling;
      break;
    }
    sibling = sibling.nextElementSibling;
    siblingIndex++;
  }
}
```

### 2. Use Multiple Selection Strategies
LinkedIn changes their DOM frequently. Always have fallbacks.

```javascript
const selectors = [
  // Direct selection
  'section[data-section="skills"]',
  '#skills',
  
  // Anchor patterns
  '#skills.pv-profile-card__anchor + div',
  '#skills ~ div',
  
  // LinkedIn-specific classes
  'div[data-view-name="profile-card"][id*="skills"]'
];
```

### 3. Extract "Show All" Counts Without Clicking
Clicking is slow and can fail. Extract counts from link text instead.

```javascript
// Look for the pattern: "Show all N items"
const showAllLink = section.querySelector('a[href*="/details/skills"]');
if (showAllLink) {
  const linkText = showAllLink.textContent || '';
  const patterns = [
    /Show\s+all\s+(\d+)\s+skills?/i,
    /(\d+)\s+skills?/i,
    /All\s+(\d+)/i
  ];
  
  for (const pattern of patterns) {
    const match = linkText.match(pattern);
    if (match) {
      totalCount = parseInt(match[1]);
      break;
    }
  }
}
```

### 4. Use Data Attributes When Available
LinkedIn uses specific data attributes that are more stable than classes.

```javascript
// Good - specific data attributes
'[data-field="skill_card_skill_topic"]'
'[data-view-name="profile-card"]'

// Less reliable - generic classes that change
'.pvs-list__item'
'.artdeco-list__item'
```

### 5. Handle Multiple ID Variations
LinkedIn is inconsistent with IDs, especially for certifications.

```javascript
const anchorIds = [
  'licenses_and_certifications',
  'certifications', 
  'licenses-and-certifications'
];

for (const anchorId of anchorIds) {
  const anchor = document.querySelector(`div#${anchorId}.pv-profile-card__anchor`);
  if (anchor) {
    // Found it!
    break;
  }
}
```

## Debugging Strategies

### 1. Make Extractors Available in Console
Essential for debugging extraction issues.

```javascript
// In your extractor file
window.ElevateLI = window.ElevateLI || {};
window.ElevateLI.SkillsExtractor = SkillsExtractor;

// Then in console:
const extractor = window.ElevateLI.SkillsExtractor;
const result = await extractor.scan();
```

### 2. Add Strategic Logging
Log at key decision points, not everywhere.

```javascript
Logger.info(`[${this.name}] Starting scan v2 - CUSTOM SECTION FINDER`);
Logger.info(`[${this.name}] Sibling ${index}: skills=${skillCount}, showAll=${!!showAllLink}`);
Logger.info(`[${this.name}] Found section at sibling ${index} with ${itemCount} items`);
```

### 3. Log DOM Structure When Debugging
When extraction fails, log what you're actually seeing.

```javascript
if (items.length === 0) {
  Logger.info('[Extractor] No items found, section HTML:', 
    section.innerHTML.substring(0, 500));
  Logger.info('[Extractor] Section classes:', section.className);
  Logger.info('[Extractor] Section ID:', section.id);
}
```

## Performance Optimization

### 1. Parallel Scanning
Run all extractors simultaneously in the scan phase.

```javascript
// Good - parallel execution
const scanPromises = extractors.map(e => e.scan());
const scanResults = await Promise.all(scanPromises);

// Bad - sequential execution
for (const extractor of extractors) {
  await extractor.scan();
}
```

### 2. Three-Phase Extraction
Optimize for the common case (viewing without analysis).

```javascript
const Extractor = {
  // Phase 1: Quick existence check (< 10ms)
  async scan() {
    return { exists: true, visibleCount: 5 };
  },
  
  // Phase 2: Basic extraction for scoring (< 100ms)
  async extract() {
    return { count: 25, items: [...] };
  },
  
  // Phase 3: Deep extraction for AI (can be slower)
  async extractDeep() {
    // Click "Show all", extract everything
  }
};
```

### 3. Cache Expensive Operations
Don't re-extract data unnecessarily.

```javascript
let cachedSection = null;

async scan() {
  cachedSection = this.findSection();
  return { exists: !!cachedSection };
}

async extract() {
  const section = cachedSection || this.findSection();
  // Use cached section
}
```

## Error Handling

### 1. Graceful Degradation
Never let one extractor failure break the analysis.

```javascript
try {
  const skills = await SkillsExtractor.extract();
  data.skills = skills;
} catch (error) {
  Logger.warn('[Analyzer] Skills extraction failed:', error);
  data.skills = { exists: false, count: 0 };
}
```

### 2. Validate Extracted Data
Don't trust that extraction succeeded just because no error was thrown.

```javascript
const result = await extractor.extract();

// Validate the result
if (!result || !result.exists || result.count === 0) {
  Logger.warn('[Extractor] No data extracted despite section existing');
  // Try alternative extraction method
}
```

### 3. Retry with Backoff
Network and DOM operations can be flaky.

```javascript
async function retryWithBackoff(fn, maxAttempts = 3) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxAttempts - 1) throw error;
      
      const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

## Testing Patterns

### 1. Test Against Multiple Profile Types
- Own profile (most access)
- Connection's profile (standard view)
- Non-connection profile (limited view)
- Premium vs free accounts

### 2. Test Edge Cases
- Empty sections
- Sections with 1 item
- Sections with 100+ items
- Profiles in different languages
- Mobile vs desktop views

### 3. Mock LinkedIn's DOM for Unit Tests
```javascript
function createMockSkillsSection(skillCount = 10) {
  const html = `
    <div id="skills" class="pv-profile-card__anchor"></div>
    <div class="skills-section">
      ${Array(skillCount).fill().map((_, i) => `
        <a data-field="skill_card_skill_topic">
          <span aria-hidden="true">Skill ${i + 1}</span>
        </a>
      `).join('')}
      <a href="/details/skills">Show all ${skillCount} skills</a>
    </div>
  `;
  
  document.body.innerHTML = html;
  return document.querySelector('#skills');
}
```

## Common Pitfalls to Avoid

### 1. Don't Assume Content Structure
```javascript
// ❌ Assumes structure
const skillName = item.querySelector('.skill-name').textContent;

// ✅ Defensive coding
const skillNameEl = item.querySelector('.skill-name, [data-field="skill_name"]');
const skillName = skillNameEl ? skillNameEl.textContent.trim() : '';
```

### 2. Don't Use Broad Selectors Alone
```javascript
// ❌ Too broad, will catch unrelated items
const items = document.querySelectorAll('li');

// ✅ Scoped to section with specific attributes
const items = section.querySelectorAll('li[class*="pvs-list__item"]');
```

### 3. Don't Ignore LinkedIn's Loading States
```javascript
// Check if content is still loading
const isLoading = section.querySelector('.artdeco-loader');
if (isLoading) {
  await waitForElement(() => !section.querySelector('.artdeco-loader'));
}
```

### 4. Don't Hardcode Timeouts
```javascript
// ❌ Hardcoded timeout
await new Promise(resolve => setTimeout(resolve, 2000));

// ✅ Wait for actual condition
await waitForElement('li[data-field="skill_card_skill_topic"]', {
  timeout: 5000,
  parent: section
});
```

## Architecture Guidelines

### 1. Keep Extractors Independent
Each extractor should be self-contained and not depend on others.

### 2. Share Common Patterns via BaseExtractor
```javascript
BaseExtractor = {
  findSection(selectors, name) { /* shared logic */ },
  extractShowAllInfo(section, type) { /* shared logic */ },
  waitForElement(selector, options) { /* shared logic */ }
};
```

### 3. Use Consistent Return Structures
```javascript
// All extractors should return similar structure
{
  exists: boolean,
  count: number,
  items: Array,
  // Section-specific fields...
}
```

### 4. Document LinkedIn Patterns
When you discover a new LinkedIn pattern, document it immediately.

```javascript
/**
 * LinkedIn Pattern: Anchor + Sibling Structure
 * 
 * LinkedIn separates section markers (anchors) from content:
 * <div id="skills" class="pv-profile-card__anchor"></div>  <!-- Just marker -->
 * <div class="actual-content">                              <!-- Real content -->
 *   <ul>...skills...</ul>
 * </div>
 * 
 * Always check nextElementSibling when section appears empty!
 */
```

## Maintenance Tips

### 1. Version Your Extractors
```javascript
const SkillsExtractor = {
  name: 'skills',
  version: '2.0.0', // Bump when making breaking changes
  
  // Add changelog in comments
  // v2.0.0 - Added anchor+sibling pattern support
  // v1.0.0 - Initial implementation
};
```

### 2. Keep Fallback Strategies
```javascript
async findSection() {
  // Try strategies in order of reliability
  const strategies = [
    () => this.findByAnchorSibling(),
    () => this.findBySelectors(), 
    () => this.findByTextContent(),
    () => this.findByAriaLabel()
  ];
  
  for (const strategy of strategies) {
    const section = await strategy();
    if (section) return section;
  }
  
  return null;
}
```

### 3. Monitor Extraction Success Rates
```javascript
// Track success/failure rates
Logger.info('[Analytics] Extraction success rate:', {
  extractor: this.name,
  success: result.count > 0,
  count: result.count,
  method: extractionMethod
});
```

## Conclusion

The key to successful LinkedIn extraction is understanding their DOM patterns, especially the anchor+sibling structure. Always approach extraction with multiple strategies, graceful error handling, and extensive logging. When in doubt, inspect the DOM in real LinkedIn profiles and document any new patterns you discover.