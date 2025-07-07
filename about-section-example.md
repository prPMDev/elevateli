// About Section Implementation Example

// 1. User visits LinkedIn profile
// 2. ProfileSectionDiscovery extracts full About text
// 3. User clicks "View Full Report" 
// 4. Dashboard sends About text to AI with both basic + custom instructions

// Example AI Request:
{
  section: "about",
  data: {
    text: "Senior Product Manager with 10+ years...", // Full text
    charCount: 1847,
    hasQuantifiedAchievement: true
  },
  settings: {
    targetRole: "Product Manager",
    customInstructions: "Focus on B2B SaaS experience, emphasize data-driven decision making"
  }
}

// AI Response:
{
  score: 7,
  breakdown: {
    hook: 1,      // "Generic opening, doesn't grab attention"
    value: 2,     // "Clear PM value proposition"
    achievements: 2, // "Good metrics (10+ years, 30% growth)"
    keywords: 1,  // "Missing key PM terms: roadmap, stakeholder, agile"
    cta: 1       // "No clear call to action"
  },
  improvements: [
    "1. Hook: Start with your biggest achievement - 'Led product strategy that generated $5M ARR...' instead of generic title",
    "2. Keywords: Add PM-specific terms like 'product roadmap', 'user research', 'A/B testing', 'stakeholder management'",
    "3. CTA: End with 'Open to discussing product strategy and growth opportunities. Connect or email at...'"
  ]
}