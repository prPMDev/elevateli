# Implementation Checklist for Section-by-Section Analysis

## ✅ Completed
- [x] AboutExtractor bundled into analyzer.js
- [x] Message handler for extractSectionData added
- [x] Service worker has analyzeSection handler
- [x] buildSectionPrompt function implemented for About section

## 📋 Next Steps (In Order)

### 1. Add ProfileScoreCalculator to service-worker.js
- [ ] Copy the ProfileScoreCalculator class from profile-score-calculator-implementation.js
- [ ] Update handleSectionAnalysis to store section scores
- [ ] Add getSectionScores message handler
- [ ] Update AI analysis functions to support sectionPrompt

### 2. Update Dashboard UI (options.html)
- [ ] Add custom instructions textarea to Settings tab:
```html
<div class="form-group">
  <label for="customInstructions">
    <span>Custom AI Instructions (Optional)</span>
    <small>Add specific requirements for AI analysis (e.g., industry focus, tone)</small>
  </label>
  <textarea 
    id="customInstructions" 
    rows="4" 
    placeholder="Example: Focus on B2B SaaS experience, emphasize data-driven decision making..."
  ></textarea>
</div>
```

- [ ] Add section scores display to Summary tab:
```html
<div id="sectionScores" class="section-scores">
  <h3>Section Analysis</h3>
  <div class="score-grid">
    <!-- Dynamically populated -->
  </div>
  <button id="analyzeAllSections">Analyze All Sections</button>
</div>
```

### 3. Update options.js to handle section analysis
- [ ] Add custom instructions save/load functionality
- [ ] Add section analysis trigger buttons
- [ ] Display section scores with visual indicators
- [ ] Show overall weighted score with cap warnings

### 4. Test the Flow
- [ ] Navigate to LinkedIn profile
- [ ] Click "View Full Report" in dashboard
- [ ] Verify About section extracts full text
- [ ] Confirm AI returns section-specific score (1-10)
- [ ] Check that overall score updates with weighted calculation
- [ ] Verify custom instructions are applied to prompts

### 5. Add Remaining Section Extractors
- [ ] ExperienceExtractor (extract bullet points, achievements)
- [ ] SkillsExtractor (check for endorsements, categorization)
- [ ] HeadlineExtractor (keyword analysis)
- [ ] EducationExtractor (relevance to target role)
- [ ] RecommendationsExtractor (quality and recency)

## File Locations
- Main extraction: `extension/content/analyzer.js`
- Service worker: `extension/background/service-worker.js`
- Dashboard UI: `extension/options/options.html`
- Dashboard JS: `extension/options/options.js`
- Implementation guide: `profile-score-calculator-implementation.js`

## Key Architecture Decisions
1. **Bundled extractors** - Chrome Manifest V3 blocks dynamic imports
2. **Weighted scoring** - 30% About, 30% Experience, 20% Skills, 10% Headline, 5% Others
3. **Score capping** - Missing About caps at 7/10, missing Experience at 6/10
4. **Progressive analysis** - Quick overall first, then section-by-section on demand