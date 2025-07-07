# AI Analysis Architecture - Section by Section Approach

## Overview
This document outlines the architecture for implementing AI-powered section analysis for LinkedIn profiles, starting with the About section and expanding to other sections progressively.

## Design Philosophy

### Core Principles
1. **Start Simple**: Begin with single section (About) analysis
2. **Build on Success**: Each section analysis is independent but can build on others
3. **User Control**: Users bring their own AI API keys
4. **Progressive Enhancement**: Add sections without breaking existing functionality
5. **Leverage Existing Work**: Reuse extraction infrastructure already in place

## Current State Analysis

### What's Already Working
1. **Complete Extraction Pipeline**
   - All extractors successfully pulling data
   - Three-phase extraction: scan() → extract() → extractDeep()
   - Skills: 53 total (2 visible, 51 behind "Show all")
   - About: 956 characters extracted
   - Experience: 10 items extracted
   - Recommendations: 10 items extracted

2. **Scoring Infrastructure**
   - ProfileCompletenessCalculator: Working (local calculation)
   - ProfileScoreCalculator: Ready but needs AI integration
   - Section weights already defined

3. **UI State Management**
   - Progressive states: SCANNING → EXTRACTING → CALCULATING → AI_ANALYZING
   - OverlayManager handles all UI updates
   - Cache infrastructure ready

4. **Missing Pieces**
   - `analyzeWithAI` handler in service-worker.js
   - API key encryption/storage consistency
   - Section-specific AI prompts

## Implementation Plan

### Phase 1: About Section Analysis (Week 1)

#### Objective
Implement AI analysis for About section only as proof of concept.

#### Technical Requirements
```javascript
// 1. Add handler in service-worker.js
if (request.action === 'analyzeAboutSection') {
  handleAboutAnalysis(request, sendResponse);
  return true;
}

// 2. About section analyzer
const AboutAnalyzer = {
  async analyze(aboutData, context) {
    const prompt = this.buildPrompt(aboutData, context);
    const response = await callAI(prompt);
    return this.parseResponse(response);
  },
  
  buildPrompt(aboutData, context) {
    return `Analyze this LinkedIn About section for a ${context.seniority} ${context.role}:

Text (${aboutData.charCount} characters):
"${aboutData.text}"

Evaluate:
1. Professional narrative clarity
2. Value proposition strength
3. Keyword optimization for ${context.role}
4. Quantified achievements presence
5. Call-to-action effectiveness

Return JSON with:
- score (1-10)
- strengths (array)
- improvements (array with specific examples)
- missingKeywords (array)`;
  }
};
```

#### UI Changes
- Add "Analyze About Section" button in overlay
- Show results inline below About section
- Display: Score gauge + top 3 improvements

### Phase 2: Core Sections Analysis (Week 2-3)

#### Section Priority Order
1. **Experience** - Validates claims, shows progression
2. **Skills** - Technical validation, keyword matching
3. **Recommendations** - Social proof, third-party validation

#### Implementation Pattern
```javascript
// Generic section analyzer
class SectionAnalyzer {
  constructor(sectionName) {
    this.section = sectionName;
    this.promptTemplates = {
      experience: this.experiencePrompt,
      skills: this.skillsPrompt,
      recommendations: this.recommendationsPrompt
    };
  }
  
  async analyze(sectionData, context) {
    // Common analysis pipeline
    const prompt = this.buildPrompt(sectionData, context);
    const response = await this.callAI(prompt);
    const parsed = this.parseResponse(response);
    
    // Cache results
    await this.cacheResults(parsed);
    
    return parsed;
  }
}
```

### Phase 3: Orchestration Layer (Week 4)

#### Smart Analysis Orchestrator
```javascript
class AnalysisOrchestrator {
  constructor() {
    this.analyzers = {
      about: new AboutAnalyzer(),
      experience: new ExperienceAnalyzer(),
      skills: new SkillsAnalyzer(),
      recommendations: new RecommendationsAnalyzer()
    };
  }
  
  async analyzeProfile(profileData, settings) {
    const strategy = this.determineStrategy(profileData, settings);
    
    switch(strategy) {
      case 'sequential':
        return await this.sequentialAnalysis(profileData, settings);
      case 'parallel':
        return await this.parallelAnalysis(profileData, settings);
      case 'smart':
        return await this.smartAnalysis(profileData, settings);
    }
  }
  
  determineStrategy(profileData, settings) {
    // If user wants quick results: parallel
    // If user wants deep insights: sequential with context
    // If some sections missing: smart adaptive
    return settings.analysisDepth || 'smart';
  }
}
```

## Technical Architecture

### Data Flow
```
1. User clicks "Analyze Section"
2. Check if section data already extracted
3. If not, run extractDeep() for that section
4. Prepare data for AI (format, truncate if needed)
5. Add user context (role, seniority, custom instructions)
6. Send to AI with section-specific prompt
7. Parse structured response
8. Update UI with results
9. Cache analysis results
```

### Service Worker Updates

```javascript
// service-worker.js additions

// Section analysis handlers
const sectionAnalyzers = {
  about: new AboutSectionAnalyzer(),
  experience: new ExperienceSectionAnalyzer(),
  skills: new SkillsSectionAnalyzer(),
  recommendations: new RecommendationsSectionAnalyzer()
};

async function handleSectionAnalysis(request, sendResponse) {
  const { section, data, context } = request;
  
  try {
    // Get API configuration
    const apiKey = await getDecryptedApiKey();
    const { aiProvider, aiModel } = await chrome.storage.local.get(['aiProvider', 'aiModel']);
    
    if (!apiKey || !aiProvider) {
      throw new Error('AI not configured');
    }
    
    // Get section analyzer
    const analyzer = sectionAnalyzers[section];
    if (!analyzer) {
      throw new Error(`No analyzer for section: ${section}`);
    }
    
    // Run analysis
    const result = await analyzer.analyze(data, context, {
      apiKey,
      provider: aiProvider,
      model: aiModel
    });
    
    sendResponse({ success: true, result });
    
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}
```

### Prompt Engineering Guidelines

#### About Section Prompt
```
Focus Areas:
- Professional narrative (clear story?)
- Value proposition (what unique value?)
- Target audience (who is this for?)
- Keywords (role-specific terms?)
- Structure (bullets vs paragraphs?)
- Length (too short/long?)
- Call to action (contact info?)
```

#### Experience Section Prompt
```
Focus Areas:
- Role progression (growing responsibility?)
- Achievement quantification (numbers/metrics?)
- Skill demonstration (concrete examples?)
- Gap explanations (career breaks?)
- Keyword optimization (industry terms?)
- Action verbs (strong language?)
```

#### Skills Section Prompt
```
Focus Areas:
- Relevance to target role
- Skill categories balance
- Missing critical skills
- Overrepresented skills
- Endorsement patterns
- Emerging vs legacy skills
```

## UI/UX Considerations

### Section Analysis UI
```
┌─────────────────────────────────────┐
│ About                               │
│ 956 characters                      │
│ ┌─────────────┐                     │
│ │ Analyze with │                    │
│ │     AI      │                     │
│ └─────────────┘                     │
│                                     │
│ [After analysis:]                   │
│ Score: 7.5/10 ━━━━━━━━○○           │
│                                     │
│ Top Improvements:                   │
│ • Add quantified achievements       │
│ • Include leadership examples       │
│ • Stronger opening statement        │
└─────────────────────────────────────┘
```

### Progressive Disclosure
1. Initially show just "Analyze" button
2. After analysis, show score and top 3 improvements
3. Click "See all recommendations" for full list
4. Cache indicator shows if using previous analysis

## Implementation Checklist

### Week 1: About Section MVP
- [ ] Add `analyzeAboutSection` handler in service-worker.js
- [ ] Create AboutSectionAnalyzer class
- [ ] Build About-specific prompt template
- [ ] Add "Analyze About" button to UI
- [ ] Implement result display in overlay
- [ ] Test with OpenAI and Anthropic

### Week 2: Core Sections
- [ ] Implement ExperienceSectionAnalyzer
- [ ] Implement SkillsSectionAnalyzer
- [ ] Implement RecommendationsSectionAnalyzer
- [ ] Add UI buttons for each section
- [ ] Create section-specific prompts

### Week 3: Integration
- [ ] Build AnalysisOrchestrator
- [ ] Implement caching strategy
- [ ] Add progress indicators
- [ ] Handle API failures gracefully
- [ ] Add cost estimates per section

### Week 4: Polish
- [ ] Optimize prompts based on testing
- [ ] Add batch analysis option
- [ ] Implement export functionality
- [ ] Performance optimization
- [ ] User feedback collection

## Cost Considerations

### Per-Section Estimates (GPT-4o)
- About: ~500-1000 tokens ($0.005-0.01)
- Experience: ~1000-2000 tokens ($0.01-0.02)
- Skills: ~300-500 tokens ($0.003-0.005)
- Recommendations: ~500-1000 tokens ($0.005-0.01)
- Total Full Analysis: ~$0.03-0.05

### Optimization Strategies
1. Cache aggressively (7-day default)
2. Only analyze changed sections
3. Batch multiple sections in one call when possible
4. Use GPT-4o-mini for non-critical sections

## Success Metrics

1. **Technical Success**
   - All section analyzers working independently
   - <3s response time per section
   - 95%+ cache hit rate for returning users
   - Graceful handling of API failures

2. **User Success**
   - 80%+ find recommendations actionable
   - 50%+ analyze multiple sections
   - Clear understanding of scores
   - Positive feedback on suggestions

## Future Enhancements

1. **Cross-Section Intelligence**
   - Coherence analysis across sections
   - Identify contradictions
   - Suggest unified messaging

2. **Competitive Analysis**
   - Compare to similar profiles
   - Industry benchmarking
   - Percentile rankings

3. **Progress Tracking**
   - Score history over time
   - Implementation tracking
   - A/B testing suggestions

## Conclusion

This architecture provides a clear path from single-section analysis to full profile intelligence. By starting with the About section, we can validate the approach, refine prompts, and build user confidence before expanding to other sections. The modular design ensures each piece can be developed, tested, and deployed independently while building toward a comprehensive analysis system.