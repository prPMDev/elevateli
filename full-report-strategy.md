// Enhanced Full Report Strategy

## Section-by-Section Analysis Implementation

### Quick Analysis (Current - stays the same)
```javascript
// Single API call for overlay display
{
  prompt: "Overall profile analysis",
  sections: ["summary", "5 recommendations"],
  tokens: ~1000
}
```

### Full Report Analysis (New)
```javascript
// Multiple targeted API calls for dashboard
const sectionAnalyses = [
  {
    section: "headline",
    prompt: `Analyze this headline for a ${targetRole}:
    "${headline.text}"
    
    Provide:
    1. Keyword analysis (missing high-impact keywords)
    2. 3 rewritten variations optimized for ${targetRole}
    3. Character usage optimization (${headline.charCount}/220)`,
    tokens: ~500
  },
  {
    section: "about", 
    prompt: `Analyze this About section for ${targetRole}:
    "${about.text}"
    
    Provide:
    1. Content gaps for ${targetRole}
    2. Suggested paragraph structure
    3. 5 quantifiable achievements to add
    4. Keywords missing for ${targetRole} searches`,
    tokens: ~800
  },
  {
    section: "experience",
    prompt: `Analyze these experience descriptions for ${targetRole}:
    ${experience.items.map(e => e.description).join('\n')}
    
    Provide for EACH role:
    1. Missing impact metrics
    2. 3 rewritten bullet points using STAR/CAR format
    3. Keywords to add for ${targetRole} relevance`,
    tokens: ~1200
  },
  {
    section: "skills",
    prompt: `Current skills: ${skills.list}
    Target role: ${targetRole}
    
    Provide:
    1. Top 10 missing skills for ${targetRole}
    2. Skills to remove (outdated/irrelevant)
    3. Skill endorsement priority order
    4. Skill categories to add`,
    tokens: ~600
  }
];
```

### Custom Instructions Integration

**Current**: Just passes `Target Role: ${settings.targetRole || 'Not specified'}`

**Enhanced**:
```javascript
function buildEnhancedPrompt(profileData, settings) {
  const basePrompt = buildAnalysisPrompt(profileData, settings);
  
  // Add custom instructions if provided
  if (settings.customInstructions) {
    return `${basePrompt}

ADDITIONAL CONTEXT AND REQUIREMENTS:
${settings.customInstructions}

Consider these custom requirements when scoring and providing recommendations.`;
  }
  
  return basePrompt;
}
```

### Implementation Steps:

1. **Add "Generate Full Report" button** in dashboard that triggers section analysis
2. **Store section analyses** separately in Chrome storage
3. **Display in tabs**: Overview | Headlines | About | Experience | Skills | Recommendations
4. **Cost estimate**: ~$0.15-0.25 for full analysis vs $0.02 for quick

### Dashboard UI Changes:
```javascript
// In options/dashboard.js
async function generateFullReport() {
  const sections = ['headline', 'about', 'experience', 'skills'];
  const sectionResults = {};
  
  for (const section of sections) {
    updateProgress(`Analyzing ${section}...`);
    sectionResults[section] = await analyzeSectionWithAI(section, profileData);
  }
  
  displayFullReport(sectionResults);
}
```

This makes "View Full Report" actually valuable - providing deep, actionable insights per section rather than just repeating the overlay content.