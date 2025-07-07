# ElevateLI Modular System Test Plan

## Test Objectives
1. Verify progressive UI updates work correctly
2. Ensure all extractors handle LinkedIn DOM variations
3. Test error recovery mechanisms
4. Validate performance metrics capture
5. Confirm modular architecture integration

## Test Steps

### 1. Load Extension on LinkedIn Profile
- Navigate to a LinkedIn profile page
- Verify overlay initializes automatically
- Check that overlay is injected as a card (not floating)

### 2. Progressive UI States
#### Scanning Phase
- [ ] Overlay shows "Scanning profile sections..."
- [ ] Each section shows scanning progress (pending → scanning → complete)
- [ ] Section counts appear after scanning
- [ ] Timing: ~50ms per section

#### Extraction Phase  
- [ ] Status changes to "Extracting profile data..."
- [ ] Shows which section is being extracted
- [ ] Progress updates in real-time

#### Calculation Phase
- [ ] Status changes to "Calculating scores..."
- [ ] Completeness score appears with animation
- [ ] Score bar fills progressively

#### AI Analysis Phase (if enabled)
- [ ] Status shows "AI analyzing [section]..."
- [ ] Progressive section analysis visible
- [ ] Final quality score appears

### 3. Cache Behavior
- [ ] First visit: Full analysis runs
- [ ] Second visit: Shows cached results immediately
- [ ] "Analyze" button forces refresh
- [ ] Cache timestamp displays correctly

### 4. Error Recovery
- [ ] Simulate network error - should show cached data
- [ ] Missing DOM elements - should gracefully skip
- [ ] API failure - should show completeness only

### 5. Performance Monitoring
Check console for performance logs:
```javascript
// Expected timing targets
scan_phase: < 300ms
extract_phase: < 500ms  
calculate_completeness: < 100ms
deep_extract_phase: < 1000ms (if AI enabled)
full_analysis: < 2000ms (without AI)
```

### 6. Module Integration
Verify in console:
```javascript
// Check loaded modules
window.ElevateLI.analyzer.extractors
// Should show: headline, about, experience, skills, education, etc.

// Check state
window.ElevateLI.state
// Should show: lastCompletenessResult, isExtracting, etc.

// Check performance summary
Logger.getPerformanceSummary()
```

### 7. Visual Design
- [ ] Matches LinkedIn's card design
- [ ] Smooth transitions between states
- [ ] Responsive on mobile viewport
- [ ] Color scheme matches LinkedIn blue (#0a66c2)

### 8. Edge Cases
- [ ] Profile with minimal data
- [ ] Profile with extensive experience (20+ positions)
- [ ] Skills section with 50+ skills
- [ ] Private/restricted profiles
- [ ] Own profile vs. others' profiles

## Expected Results

### Completeness Scoring
- Photo: Binary (exists/missing)
- Headline: Checks for descriptive text
- About: 800+ chars for full score
- Experience: 3+ positions with descriptions
- Skills: 15+ skills for full score
- Education: At least 1 entry

### Quality Scoring (AI)
- About: 30% weight - keyword density, clarity
- Experience: 30% weight - achievements, metrics
- Skills: 20% weight - relevance, demand
- Headline: 10% weight - keywords, clarity
- Others: 10% weight - combined

### Performance Benchmarks
- Discovery: ~50ms
- Full extraction: ~500ms
- AI analysis: ~2-3s
- Total time: < 5s with AI

## Debug Commands
```javascript
// Force analysis
ExtensionState.forceRefresh = true;
init();

// Check specific extractor
AboutExtractor.scan();
AboutExtractor.extract();
AboutExtractor.extractDeep();

// View logs
Logger.export({ level: 'ERROR' });
Logger.getSummary();

// Clear cache
CacheManager.clear();
```

## Common Issues & Solutions

1. **Overlay not appearing**
   - Check if on profile page: `isProfilePage()`
   - Verify Chrome APIs: `safeChrome()`
   - Check for errors: `Logger.export({ level: 'ERROR' })`

2. **Extraction failures**
   - LinkedIn DOM changed - check selectors
   - Use BaseExtractor.findSection() with multiple strategies
   - Enable debug logging: `Logger.currentLevel = 'DEBUG'`

3. **Performance issues**
   - Check performance metrics: `Logger.getPerformanceSummary()`
   - Look for slow extractors
   - Verify parallel scanning

4. **AI not running**
   - Check settings.enableAI
   - Verify API key is set
   - Must be own profile
   - Check service worker logs