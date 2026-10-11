/* Background Service Worker for ElevateLI */

// Import crypto manager module
importScripts('../common/crypto-manager.js');

// Use shared crypto manager instead of local class
const cryptoUtils = CryptoManager;

// [CRITICAL_PATH:API_KEY_RETRIEVAL] - P0: Decrypts API key for all AI operations
// Helper function to get decrypted API key
async function getDecryptedApiKey() {
  try {
    // Check if Chrome storage is available
    if (!chrome || !chrome.storage || !chrome.storage.local) {
      return null;
    }
    
    const { encryptedApiKey } = await chrome.storage.local.get('encryptedApiKey');

  // If we have an encrypted key, decrypt it
  if (encryptedApiKey) {
    try {
      return await cryptoUtils.decryptApiKey(encryptedApiKey);
    } catch (error) {
      console.error('AI.PROMPTS', 'Failed to decrypt API key', error);

      // DO NOT auto-delete the key on decryption failure
      // This was causing keys to disappear from settings
      return null;
    }
  }

  return null;
  } catch (error) {
    console.error('AI.PROMPTS', 'getDecryptedApiKey error', error);
    return null;
  }
}

// Use onInstalled only for one-time setup
if (chrome && chrome.runtime && chrome.runtime.onInstalled) {
  chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
      // Open updates page on fresh install
      chrome.tabs.create({ url: 'updates.html' });
    } else if (details.reason === 'update') {
      
      // Parse version numbers
      const previousVersion = details.previousVersion || '0.0.0';
      const currentVersion = chrome.runtime.getManifest().version;
      
      // Check if this is a major or minor version update
      const [prevMajor, prevMinor] = previousVersion.split('.').map(Number);
      const [currMajor, currMinor] = currentVersion.split('.').map(Number);
      
      // Show updates page for major or minor version changes
      if (currMajor > prevMajor || (currMajor === prevMajor && currMinor > prevMinor)) {
        chrome.tabs.create({ url: 'updates.html' });
      }
    }
  });
}

// Rate limiting class defined later in file to avoid duplication

// Keep service worker alive
if (chrome && chrome.runtime && chrome.runtime.getPlatformInfo) {
  const keepAlive = () => setInterval(() => {
    if (chrome && chrome.runtime && chrome.runtime.getPlatformInfo) {
      chrome.runtime.getPlatformInfo(() => {
        // Keep alive ping
      });
    }
  }, 20e3);
  
  if (chrome.runtime.onStartup) {
    chrome.runtime.onStartup.addListener(keepAlive);
  }
  keepAlive();
}

// Create section-specific prompt
function createSectionPrompt(sectionName, content, config, context = {}) {
  // Add current date to config for all prompts
  const enhancedConfig = {
    ...config,
    currentDate: new Date().toISOString().split('T')[0] // Format: "2025-01-19"
  };
  
  // Special handling for experience roles
  if (sectionName === 'experience_role' && typeof content === 'object') {
    return createExperienceRolePrompt(content, enhancedConfig, context);
  }
  
  // Special handling for overall experience analysis
  if (sectionName === 'experience_overall' && typeof content === 'object') {
    return createExperienceOverallPrompt(content, enhancedConfig, context);
  }
  
  // Special handling for experience section (fallback)
  if (sectionName === 'experience' && typeof content === 'object') {
    return createExperienceSectionPrompt(content, config);
  }
  
  // Special handling for recommendations
  if (sectionName === 'recommendations' && typeof content === 'object') {
    return createRecommendationsPrompt(content, enhancedConfig, context);
  }
  
  // Special handling for first impression (headline + photo + banner)
  if (sectionName === 'first_impression' && typeof content === 'object') {
    return createFirstImpressionPrompt(content, enhancedConfig);
  }
  
  // Special handling for standalone about section
  // Content script sends an object ({ text, charCount, ... })
  if (sectionName === 'about') {
    return createAboutPrompt(content?.text, enhancedConfig);
  }
  
  // Special handling for skills
  if (sectionName === 'skills' && typeof content === 'object') {
    return createSkillsPrompt(content, enhancedConfig, context);
  }
  
  // Default prompt for other sections
  const basePrompt = `You are an extremely experienced career coach specializing in helping professionals transition to ${config.targetRole} at the ${config.seniorityLevel} level. You have 20+ years of experience optimizing LinkedIn profiles for maximum impact.

⚠️ CRITICAL ANALYSIS RULES:
1. ALWAYS quote specific text from the profile when giving feedback
2. NEVER give generic advice like "add skills X, Y, Z" without analyzing what's already there
3. Your feedback must reference ACTUAL CONTENT from their profile
4. If you can't find specific content to quote, say so explicitly

Analyze this ${sectionName} section with the following approach:
1. First acknowledge what's working (quote specific content that's effective)
2. Identify gaps by analyzing what's actually written (not what's missing)
3. Provide specific improvements to existing content (not generic additions)

Target role: ${config.targetRole}
Seniority level: ${config.seniorityLevel}
${config.customInstructions ? `Additional context: ${config.customInstructions}` : ''}

${sectionName.toUpperCase()} CONTENT:
${typeof content === 'object' ? JSON.stringify(content, null, 2) : content}

Provide your coaching analysis in EXACT JSON format:

{
  "score": 7,
  "positiveInsight": "Your headline effectively highlights your expertise in 'API and platform integration' which is crucial for a product manager role, and your experience with 'Oracle' adds credibility.",
  "gapAnalysis": "However, your About section currently says 'Passionate about technology' which is too generic. The phrase doesn't differentiate you from thousands of other candidates.",
  "specificFeedback": {
    "originalLine": "[Quote exact text from their profile here]",
    "suggestion": "[Your improved version of that specific text]",
    "why": "[Explain why this change makes it more compelling]"
  },
  "actionItems": [
    {
      "category": "Content Depth",
      "action": "Replace 'Passionate about technology' with metrics like '40% adoption increase via API strategies'",
      "impact": "Differentiates you from generic profiles",
      "priority": "high",
      "quotedContent": "Your current text says: '[actual quote]'"
    },
    {
      "category": "Quantitative Evidence", 
      "action": "Add specific metrics: users (50K→150K), revenue ($2M), or efficiency gains (40% faster)",
      "impact": "Shows measurable business value",
      "priority": "high",
      "quotedContent": "Currently reads: '[actual quote]'"
    }
  ]
}

IMPORTANT: 
- Score 0-10 where 10 is perfect for landing the target role
- MUST quote actual text in positiveInsight, gapAnalysis, and actionItems
- specificFeedback is REQUIRED and must quote real content
- Each actionItem MUST include "quotedContent" field with actual text
- ActionItems based on score:
  * Score 9-10: Provide 0-1 improvement ONLY if absolutely critical (most 9-10 scores need NO improvements)
  * Score 7-8: Provide 1-2 impactful improvements
  * Score 0-6: Provide EXACTLY 2 critical improvements
- CRITICAL actionItem structure (NEW FORMAT):
  * "category": Improvement area (30-50 chars) - WHAT aspect needs work
  * "action": Specific steps to take (100-150 chars) - HOW to improve it  
  * "impact": Why it matters (50-80 chars) - Business/career impact
  * Examples:
    - GOOD: category="Content Depth", action="Replace generic phrases with specific metrics", impact="Makes profile stand out"
    - BAD: category="Add metrics", action="This improves your profile", impact="Better visibility"
    - GOOD: category="Leadership Evidence", action="Request 2 recommendations from direct reports", impact="Shows 360° management skills"
    - BAD: category="Get recommendation from peer", action="Ask someone to recommend you", impact="More recommendations"
- Keep positiveInsight between 200-300 characters for complete, meaningful feedback
- Focus on improving what's there, not adding generic content`;

  return basePrompt;
}

// Create specialized prompt for experience roles using Anthropic best practices
function createExperienceRolePrompt(experience, config, context = {}) {
  const prompt = `You are an expert career coach analyzing individual LinkedIn experience entries for ${config.targetRole} positions at the ${config.seniorityLevel} level.

<context>
Analysis Date: ${config.currentDate || new Date().toISOString().split('T')[0]}
Target Role: ${config.targetRole}
Seniority Level: ${config.seniorityLevel}
Custom Instructions: ${config.customInstructions || 'None provided'}
</context>

<critical_rules>
⚠️ YOU MUST FOLLOW THESE RULES:
1. READ THE FULL DESCRIPTION FIRST - Identify what IS already present before suggesting additions
2. NEVER suggest adding metrics/achievements that already exist in the description
3. SCORING FEEDBACK APPROACH:
   - Scores 0-6: START with the most critical gap, then acknowledge strengths
   - Scores 7-10: START with specific strengths, END with 1-2 refinements to reach 10/10
4. Quote EXACT phrases from their description when giving feedback
5. If description mentions "$50M revenue" don't ask to "add revenue metrics" - suggest how to enhance it
6. Give SPECIFIC improvements: "Move your $50M ARR metric to the first line" not "Add metrics"
7. Consider role recency - weight recent roles (< 2 years) more heavily
8. MUST return valid JSON only - no markdown, no extra text
</critical_rules>

<position_details>
Title: ${experience.title}
Company: ${experience.company}${experience.companyDetails?.size ? ` (${experience.companyDetails.size} employees)` : ''}
Industry: ${experience.companyDetails?.industry || 'Not specified'}
Duration: ${experience.employment?.duration || 'Not specified'} ${experience.employment?.isCurrent ? '(CURRENT ROLE)' : ''}
Dates: ${experience.startDate || 'Unknown'} - ${experience.endDate || (experience.employment?.isCurrent ? 'Present' : 'Unknown')}
Role Position: ${context.position ? `#${context.position + 1} of ${context.totalRoles} total roles` : 'Unknown'}
Visibility Level: ${context.position < 3 ? 'PREMIUM (top 3 - most visible)' : context.position < 10 ? 'Standard (requires scrolling)' : 'Hidden (requires expansion)'}
</position_details>

<role_description_full>
Character Count: ${experience.description?.length || 0}
Content Quality Indicators:
- Has Quantified Achievements: ${experience.hasQuantifiedAchievements ? 'YES - READ DESCRIPTION' : 'NO'}
- Mentions Tech Stack: ${experience.hasTechStack ? 'YES - READ DESCRIPTION' : 'NO'}

FULL DESCRIPTION:
${experience.description || '[NO DESCRIPTION PROVIDED - CRITICAL GAP]'}
</role_description_full>

<analysis_task>
Analyze this individual role description:

1. FIRST, identify from the description above:
   - What specific metrics/numbers ARE already mentioned
   - What technologies/tools ARE already listed
   - What leadership/impact evidence IS already present
   - Overall narrative quality and structure

2. Score (0-10) based on:
   - Relevance to ${config.targetRole} at ${config.seniorityLevel}
   - Quality of existing content (not what's missing)
   - Impact and achievement focus
   - Clarity and specificity
   - Role recency (recent = more weight)

3. Provide feedback:
   - positiveInsight: Quote specific strong content from their description
   - gapAnalysis: Identify weak areas using their actual words
   - specificFeedback: Pick their weakest sentence and rewrite it
   - actionItems: Based on score level (see rules above)

4. For high scores (7+):
   - Acknowledge what's working with specific quotes
   - Provide 1-2 refinements to reach 10/10
   - Focus on repositioning/enhancing existing content
</analysis_task>

Return ONLY valid JSON with this exact structure:
{
  "score": <integer 0-10>,
  "positiveInsight": "<200-300 chars quoting their ACTUAL strong content like 'Your mention of leading $50M ARR product shows...' or acknowledging specific achievements>",
  "gapAnalysis": "<150-250 chars identifying weak areas by quoting their actual phrases that need improvement>",
  "specificFeedback": {
    "originalLine": "<Exact weak sentence from their description>",
    "suggestion": "<Rewritten version with specific improvements>",
    "why": "<50-100 chars explaining the improvement>"
  },
  "actionItems": [
    {
      "category": "<'Impact Metrics'|'Strategic Context'|'Leadership Evidence'|'Technical Depth'|'10/10 Optimization'>",
      "action": "<SPECIFIC action based on their actual content - if metrics exist, suggest repositioning; if missing, be specific>",
      "impact": "<How this helps position for ${config.targetRole}>",
      "priority": "<'high'|'medium'|'low'>",
      "quotedContent": "<Exact quote from their description this feedback addresses>"
    }
  ]
}`;

  return prompt;
}

// Create prompt for experience section (when not broken into individual roles)
function createExperienceSectionPrompt(experienceData, config) {
  const prompt = `You are a LinkedIn profile optimization expert. Analyze this experience section overview.

TARGET ROLE: ${config.targetRole}
SENIORITY LEVEL: ${config.seniorityLevel}

EXPERIENCE OVERVIEW:
- Total Roles: ${experienceData.count || 0}
- Total Months of Experience: ${experienceData.totalMonths || 0}
- Has Current Role: ${experienceData.hasCurrentRole ? 'Yes' : 'No'}
- Visible Roles: ${experienceData.visibleCount || 0}

Analyze the overall experience section and provide:
1. A score from 0-10 for the experience section quality
2. Feedback on career progression and trajectory
3. Recommendations for improving the experience section

Respond in JSON format:
{
  "score": <number 0-10>,
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"],
  "recommendations": ["specific action 1", "specific action 2"]
}

NOTE: This is a fallback analysis. Individual role analysis would provide better insights.`;

  return prompt;
}

// Create specialized prompt for overall experience analysis
function createExperienceOverallPrompt(experienceData, config, context = {}) {
  const currentYear = new Date().getFullYear();
  const totalMonths = experienceData.totalMonths || 0;
  const yearsOfExperience = Math.floor(totalMonths / 12);
  const totalRoles = experienceData.totalRoles || experienceData.count || 0;
  
  const prompt = `You are an expert career coach analyzing LinkedIn profiles for ${config.targetRole} positions at the ${config.seniorityLevel} level.

<context>
Analysis Date: ${config.currentDate || new Date().toISOString().split('T')[0]}
Target Role: ${config.targetRole}  
Seniority Level: ${config.seniorityLevel}
Profile Completeness: ${context.completenessScore}%
Custom Instructions: ${config.customInstructions || 'None provided'}
</context>

<critical_rules>
⚠️ YOU MUST FOLLOW THESE RULES:
1. READ THE FULL DESCRIPTIONS FIRST - Identify what metrics, achievements, and details ARE already present
2. NEVER suggest adding something that's already there (e.g., if they mention "$50M ARR", don't ask them to add revenue metrics)
3. Be DIRECT and ACTIONABLE - no generic praise or fluff
4. SCORING FEEDBACK RULES:
   - Scores 0-6: START with the most critical gap, then mention strengths
   - Scores 7-10: START with what's working well, END with specific steps to reach 10/10
5. Give SPECIFIC actions: "Move your Oracle ML project mention to the first bullet" not "Highlight technical skills"
6. Focus on STRATEGIC career trajectory patterns, not individual role nitpicks
7. If they already have strong metrics, suggest how to REPOSITION or ENHANCE them, not add more
8. MUST return valid JSON only - no markdown, no additional text
</critical_rules>

<profile_overview>
Total Experience: ${yearsOfExperience} years across ${totalRoles} roles
Average Tenure: ${experienceData.averageTenure ? Math.round(experienceData.averageTenure) + ' months per role' : 'Unknown'}
Current Status: ${experienceData.hasCurrentRole ? 'Currently employed' : 'Not currently employed'}
Career Start: ${experienceData.experiences?.[experienceData.experiences.length - 1]?.startDate || 'Unknown'}
Industry Changes: ${experienceData.industryChanges || 0}
</profile_overview>

<career_trajectory>
${experienceData.experiences && experienceData.experiences.length > 0 ? 
  experienceData.experiences.slice(0, 5).map((exp, idx) => 
    `${idx + 1}. ${exp.title} at ${exp.company} (${exp.duration || 'Duration not specified'})${exp.startDate ? ' - Started ' + exp.startDate : ''}`
  ).join('\n') : 'No experience data available'}
</career_trajectory>

<recent_roles_full_content>
${experienceData.experiences && experienceData.experiences.length > 0 ? 
  experienceData.experiences.slice(0, 3).map((exp, idx) => 
    `
===== ROLE ${idx + 1} =====
Title: ${exp.title}
Company: ${exp.company}
Duration: ${exp.duration || 'Not specified'}
Dates: ${exp.startDate || 'Unknown'} - ${exp.endDate || 'Present'}
FULL DESCRIPTION (${exp.description?.length || 0} chars):
${exp.description || '[NO DESCRIPTION PROVIDED]'}

Metrics Already Present: ${exp.hasQuantifiedAchievements ? 'YES - READ ABOVE' : 'NO'}
Tech Stack Mentioned: ${exp.hasTechStack ? 'YES - READ ABOVE' : 'NO'}
`
  ).join('\n') : 'No description data available'}
</recent_roles_full_content>

<analysis_task>
Analyze the OVERALL career trajectory and experience section:

1. FIRST, carefully identify from the descriptions above:
   - What specific metrics ARE mentioned (revenue, growth %, team size, users, etc.)
   - What technologies/methodologies ARE listed
   - What leadership/impact evidence IS present
   - Career progression patterns (promotions, industry moves, increasing scope)

2. Score (0-10) based on:
   - Alignment of career trajectory with ${config.targetRole} at ${config.seniorityLevel}
   - Quality of existing content (acknowledge what's there)
   - Strategic positioning and narrative clarity
   - Evidence of increasing responsibility
   - Recency and relevance (weight recent roles more heavily)

3. Provide positiveInsight:
   - For scores 0-6: Acknowledge their journey but focus on potential
   - For scores 7-10: Celebrate specific achievements you see in their descriptions

4. Provide actionItems:
   - For scores 0-6: 3 critical improvements needed
   - For scores 7-10: 2-3 refinements to reach 10/10
   - Each action must reference ACTUAL content from above or specific gaps
   - If metrics exist, suggest repositioning: "Lead with your $50M ARR at Avalara"
   - If metrics missing, be specific: "Quantify the 'API-first products' user base or revenue impact"
</analysis_task>

Return ONLY valid JSON with this exact structure (no markdown, no extra text):
{
  "score": <integer 0-10>,
  "positiveInsight": "<200-300 chars about their ACTUAL career progression, quoting specific roles/companies/achievements from above>",
  "actionItems": [
    {
      "category": "<'Strategic Positioning'|'Career Narrative'|'Missing Elements'|'Content Enhancement'|'10/10 Optimization'>",
      "action": "<SPECIFIC action based on content above - never generic>",
      "impact": "<How this helps reach 10/10 for ${config.targetRole} at ${config.seniorityLevel}>",
      "priority": "<'high'|'medium'|'low'>"
    }
  ]
}`;

  return prompt;
}

// Create specialized prompt for recommendations using Anthropic best practices
function createRecommendationsPrompt(recommendationsData, config, context = {}) {
  const recommendationCount = recommendationsData.count || recommendationsData.receivedCount || 0;
  const currentYear = new Date().getFullYear();
  
  
  const prompt = `You are an expert LinkedIn profile optimizer analyzing recommendations for ${config.targetRole} positions at the ${config.seniorityLevel} level.

<context>
Analysis Date: ${config.currentDate || new Date().toISOString().split('T')[0]}
Target Role: ${config.targetRole}
Seniority Level: ${config.seniorityLevel}
Custom Instructions: ${config.customInstructions || 'None provided'}
</context>

<critical_rules>
⚠️ YOU MUST FOLLOW THESE RULES:
1. READ ALL RECOMMENDATION CONTENT FIRST before providing feedback
2. If they have recent recommendations (< 6 months), acknowledge this as exceptional
3. SCORING FEEDBACK APPROACH:
   - Scores 0-6: Focus on critical gaps, but acknowledge any positives
   - Scores 7-10: START with strengths, END with refinements to reach 10/10
4. Quote EXACT content from recommendations when discussing them
5. Give SPECIFIC actions: "Request recommendation from your manager John at Avalara" not "Get more recommendations"
6. Consider recency heavily - recent recommendations (< 1 year) are highly valuable
7. Don't penalize for having 0-2 recommendations - this is increasingly common
8. MUST return valid JSON only - no markdown, no extra text
</critical_rules>

<career_context>
Current Role: ${context.currentRole ? `${context.currentRole.title} at ${context.currentRole.company}` : 'Not specified'}
Recent Companies: ${context.recentCompanies?.slice(0, 3).map(exp => exp.company).join(', ') || 'No recent data'}
Years of Experience: ${context.yearsOfExperience || 0}
</career_context>

<recommendations_overview>
Total Recommendations: ${recommendationCount}
Received: ${recommendationsData.receivedCount || 0}
Given: ${recommendationsData.givenCount || 0}
</recommendations_overview>

<recommendation_content>
${recommendationsData.recommendationChunks && recommendationsData.recommendationChunks.length > 0 ? 
recommendationsData.recommendationChunks.map(rec => `
===== RECOMMENDATION ${rec.index} =====
From: ${rec.recommender}
Their Company: ${rec.company || 'Not specified'}
Relationship: ${rec.relationship}
Date: ${rec.date}
Your Role Then: ${rec.relatedRole || 'Not matched'}

FULL TEXT:
"${rec.text}"
`).join('\n') : '[NO RECOMMENDATIONS FOUND]'}
</recommendation_content>

<analysis_task>
Analyze the recommendations section:

1. FIRST, evaluate what's present:
   - Number of recommendations and their recency
   - WHO gave them (managers vs peers vs reports)
   - Quality of content (specific vs generic praise)
   - Alignment with ${config.targetRole} positioning

2. Score (0-10) based on:
   - 0-2: No recommendations (but don't be harsh - this is common)
   - 3-4: Only old recommendations (> 2 years)
   - 5-6: Recent but generic or few in number
   - 7-8: Recent and specific with good coverage
   - 9-10: Exceptional - recent, specific, from relevant perspectives

3. Provide feedback:
   - For low scores: Focus on WHO to request from (be specific)
   - For high scores: Suggest strategic enhancements
   - Always consider recency as a major factor

4. For action items:
   - Be SPECIFIC: "Request from your manager Jane at Company X" not "Get manager recommendation"
   - Consider missing perspectives: manager, peer, direct report, client
   - If they have good recommendations, suggest how to leverage them better
</analysis_task>

Return ONLY valid JSON with this exact structure (no markdown, no extra text):
{
  "score": <integer 0-10>,
  "positiveInsight": "<150-250 chars acknowledging what they have, even if it's 0>",
  "gapAnalysis": "<150-250 chars on what's missing or could be improved>",
  "specificFeedback": {
    "originalLine": "<Quote from a recommendation OR describe the gap>",
    "suggestion": "<Specific improvement action>",
    "why": "<50-100 chars on impact>"
  },
  "actionItems": [
    {
      "category": "<'Strategic Requests'|'Perspective Gaps'|'Content Enhancement'|'10/10 Optimization'>",
      "action": "<SPECIFIC action with names/companies when possible>",
      "impact": "<How this helps for ${config.targetRole}>",
      "priority": "<'high'|'medium'|'low'>",
      "quotedContent": "<Quote from recommendations OR describe the specific gap>"
    }
  ]
}`;

  return prompt;
}

// [CRITICAL_PATH:FIRST_IMPRESSION_AI] - P0: AI analysis for unified first impression
// Create specialized prompt for first impression (headline + photo + banner)
function createFirstImpressionPrompt(firstImpressionData, config) {
  
  const prompt = `You are an expert LinkedIn profile optimizer analyzing first impressions for ${config.targetRole} positions at the ${config.seniorityLevel} level.

<context>
Analysis Date: ${config.currentDate || new Date().toISOString().split('T')[0]}
Target Role: ${config.targetRole}
Seniority Level: ${config.seniorityLevel}
Custom Instructions: ${config.customInstructions || 'None provided'}
</context>

<critical_rules>
⚠️ YOU MUST FOLLOW THESE RULES:
1. Quote the EXACT headline text when giving feedback
2. SCORING FEEDBACK APPROACH:
   - Scores 0-6: START with critical gaps, then acknowledge strengths
   - Scores 7-10: START with what's working, END with refinements to reach 10/10
3. Analyze how all elements work together for first impression
4. Don't penalize for default banner - it's common and professional
5. MUST return valid JSON only - no markdown, no extra text
</critical_rules>

<first_impression_data>
HEADLINE: "${firstImpressionData.headline || '[NO HEADLINE - CRITICAL GAP]'}"
Character Count: ${firstImpressionData.headlineCharCount || 0} of 220 maximum
Profile Photo: ${firstImpressionData.photo?.exists ? 'Present ✓' : 'MISSING - Critical gap'}
Background Banner: ${firstImpressionData.banner?.isCustomBanner ? 'Custom (good!)' : 'Default (normal, not a weakness)'}
Open to Work: ${firstImpressionData.metadata?.openToWork ? 'Enabled' : 'Not enabled'}
Creator Mode: ${firstImpressionData.metadata?.creatorMode ? 'Enabled' : 'Not enabled'}
Connection Count: ${firstImpressionData.metadata?.connectionCount || 'Not visible'}
</first_impression_data>

<analysis_task>
Analyze the first impression elements:

1. FIRST, evaluate what's present:
   - Headline quality and relevance to ${config.targetRole}
   - Profile photo presence (critical for trust)
   - Banner customization (nice-to-have, not critical)
   - Open to Work badge implications

2. Score (0-10) based on:
   - Headline clarity and positioning (weighs heavily)
   - Photo presence (missing = cap at 5)
   - Overall professional presentation
   - NOTE: Default banner is NORMAL, don't penalize heavily

3. Provide feedback:
   - Quote the exact headline when discussing it
   - For scores 7-10: Celebrate strengths, suggest refinements
   - For scores 0-6: Focus on critical gaps first
</analysis_task>

Return ONLY valid JSON with this exact structure (no markdown, no extra text):
{
  "score": <integer 0-10>,
  "positiveInsight": "<150-250 chars acknowledging what's working in their first impression>",
  "headlineAnalysis": "<150-250 chars analyzing their actual headline quoted>",
  "gapAnalysis": "<150-250 chars identifying weaknesses>",
  "overallImpression": "<150-250 chars on unified first impression impact>",
  "actionItems": [
    {
      "category": "<'Profile Photo'|'Headline Enhancement'|'Visual Branding'|'10/10 Optimization'>",
      "action": "<SPECIFIC action based on gaps identified>",
      "impact": "<How this improves first impression for ${config.targetRole}>",
      "priority": "<'critical'|'high'|'medium'|'low'>",
      "quotedContent": "<Quote their headline or describe the gap>",
      "element": "<'photo'|'headline'|'banner'>"
    }
  ]
}`;

  return prompt;
}

// [CRITICAL_PATH:ABOUT_SECTION_AI] - P0: Standalone About section analysis
// Create specialized prompt for About section only using Anthropic best practices
function createAboutPrompt(aboutContent, config) {
  
  const prompt = `You are an expert LinkedIn profile optimizer analyzing About sections for ${config.targetRole} positions at the ${config.seniorityLevel} level.

<context>
Analysis Date: ${config.currentDate || new Date().toISOString().split('T')[0]}
Target Role: ${config.targetRole}
Seniority Level: ${config.seniorityLevel}
Custom Instructions: ${config.customInstructions || 'None provided'}
</context>

<critical_rules>
⚠️ YOU MUST FOLLOW THESE RULES:
1. READ THE ENTIRE ABOUT SECTION FIRST before providing feedback
2. Quote EXACT phrases from their About section when discussing issues
3. NEVER use placeholder text like "[opening line]" - use their ACTUAL words
4. SCORING FEEDBACK APPROACH:
   - Scores 0-6: START with critical opening issues, then other gaps
   - Scores 7-10: START with what's working, END with refinements to reach 10/10
5. Focus on the opening 2-3 lines as CRITICAL (visible before "see more" click)
6. Give SPECIFIC rewrites: Show exactly how to improve weak sentences
7. If they have metrics, suggest how to position them better, don't ask to add metrics
8. MUST return valid JSON only - no markdown, no extra text
</critical_rules>

<about_section_content>
Character Count: ${aboutContent?.length || 0} of 2600 maximum
Opening Lines (most visible): ${aboutContent?.substring(0, 200) || 'NO CONTENT'}

FULL ABOUT SECTION:
${aboutContent || '[NO ABOUT SECTION PROVIDED - CRITICAL GAP]'}
</about_section_content>

<analysis_task>
Analyze the About section for strategic positioning:

1. FIRST, identify from the content above:
   - What metrics/achievements ARE already mentioned
   - Quality of the opening hook (first 2-3 lines)
   - Narrative flow and coherence
   - Alignment with ${config.targetRole} at ${config.seniorityLevel}

2. Score (0-10) based on:
   - Opening hook effectiveness (weighs heavily)
   - Specificity and evidence provided
   - Narrative clarity and flow
   - Positioning for target role
   - Professional tone and personal brand

3. Provide four distinct assessments:
   - positiveInsight: What's working well (quote specific strong content)
   - openingAssessment: Analysis of first 2-3 lines effectiveness
   - gapAnalysis: Major weaknesses throughout (quote weak phrases)
   - flowAnalysis: How well the story flows from beginning to end

4. For action items:
   - If opening is weak: Show exact rewrite
   - If claims lack evidence: Quote the claim and suggest specific metrics
   - If flow is poor: Identify the disconnect and suggest restructuring
</analysis_task>

Return ONLY valid JSON with this exact structure (no markdown, no extra text):
{
  "score": <integer 0-10>,
  "positiveInsight": "<150-250 chars quoting their ACTUAL strong content like 'Your mention of leading $50M initiatives shows...'>"",
  "openingAssessment": "<150-250 chars analyzing their actual opening lines effectiveness>",
  "gapAnalysis": "<150-250 chars identifying weaknesses by quoting actual weak phrases>",
  "flowAnalysis": "<150-250 chars on narrative structure and transitions>",
  "specificFeedback": {
    "originalLine": "<Quote their weakest sentence exactly>",
    "suggestion": "<Rewritten version with improvements>",
    "why": "<50-100 chars explaining the improvement>"
  },
  "actionItems": [
    {
      "category": "<'Opening Hook'|'Metric Specificity'|'Narrative Flow'|'Value Proposition'|'10/10 Refinement'>",
      "action": "<SPECIFIC action quoting their actual content and showing how to improve it>",
      "impact": "<How this helps position for ${config.targetRole}>",
      "priority": "<'critical'|'high'|'medium'|'low'>",
      "quotedContent": "<Exact quote from their About section this addresses>"
    }
  ]
}`;

  return prompt;
}

// Create specialized prompt for skills section
function createSkillsPrompt(skillsData, config, context = {}) {
  
  
  
  
  // Add completeness context for conditional generic advice
  const completenessScore = context.completenessScore || 100;
  const hasCompletenessIssues = completenessScore < 95;
  const visibleSkillsCount = skillsData.skills?.filter(s => s.visibilityTier === 'top3' || s.visibilityTier === 'visible').length || skillsData.visibleCount || 0;
  const hasEndorsementIssues = visibleSkillsCount > 0 && skillsData.endorsedSkillsCount === 0;
  
  const prompt = `You are an expert LinkedIn profile optimizer analyzing skills for ${config.targetRole} positions at the ${config.seniorityLevel} level.

<context>
Analysis Date: ${config.currentDate || new Date().toISOString().split('T')[0]}
Target Role: ${config.targetRole}
Seniority Level: ${config.seniorityLevel}
Profile Completeness: ${completenessScore}%
Custom Instructions: ${config.customInstructions || 'None provided'}
</context>

<critical_rules>
⚠️ YOU MUST FOLLOW THESE RULES:
1. READ THE FULL SKILLS LIST FIRST - Identify what skills ARE already present AND their endorsement status
2. NEVER suggest adding skills that already exist in their list
3. ENDORSEMENT REALITY CHECK:
   - Having ANY endorsements with recency (< 6 months) = OUTSTANDING validation, top tier
   - Having ANY endorsements (even 1) = EXCELLENT credibility signal
   - 0 endorsements = Normal and common, not a weakness
   - 1 endorsement = Strong validation, especially if recent
   - 2-3 endorsements = Exceptional, rare achievement
   - 5+ endorsements = Extremely rare, top 1% of profiles
   - CRITICAL: If someone has 1 recent endorsement, this is BETTER than 10 old endorsements
   - Most professionals have ZERO endorsements - having even 1 puts you ahead
4. SCORING FEEDBACK APPROACH:
   - Scores 0-4: Missing critical skills or poor alignment
   - Scores 5-7: Good skills but could optimize positioning or get more endorsements
   - Scores 8-10: Strong skills with endorsements - focus on refinements only
5. Quote EXACT skill names and endorsement counts (e.g., "Your 'Product Management' with 1 recent endorsement...")
6. If skill has ANY endorsements, celebrate them - don't ask for more unless there's a strategic reason
7. DO NOT give mechanical repositioning advice with position numbers
8. Focus on skill quality: "Consider making 'Data Analysis' more prominent" not "Move from #8 to #3"
9. Focus on LinkedIn UI reality: Only some skills are visible without clicking "Show all"
10. MUST return valid JSON only - no markdown, no extra text
</critical_rules>

<profile_status>
Completeness Score: ${completenessScore}%
Has Major Gaps: ${hasCompletenessIssues ? 'YES - Focus on critical issues only' : 'NO - Can provide strategic advice'}
Endorsement Status: ${hasEndorsementIssues ? 'CRITICAL - Visible skills lack endorsements' : 'OK'}
Visible Skills Count: ${visibleSkillsCount} (without clicking "Show all")
</profile_status>

<career_context>
Current Role: ${context.currentRole ? `${context.currentRole.title} at ${context.currentRole.company}` : 'Not specified'}
Years of Experience: ${context.yearsOfExperience || 0} years
</career_context>

<skills_overview>
Total Skills: ${skillsData.count || skillsData.skills?.length || 0}
Visible Without Clicking: ${visibleSkillsCount}
Hidden Behind "Show all": ${Math.max(0, (skillsData.count || 0) - visibleSkillsCount)}
Total Endorsements: ${skillsData.totalEndorsements || 0}
Skills with Endorsements: ${skillsData.endorsedSkillsCount || 0}
</skills_overview>

<top_3_most_visible_skills>
${skillsData.skills?.slice(0, 3).map((s, i) => 
  `${i + 1}. "${s.name || s}" - ${s.endorsementCount || 0} endorsements`
).join('\n') || 'No skills data available'}
</top_3_most_visible_skills>

<all_skills_full_list>
${skillsData.skills ? 
  skillsData.skills.slice(0, 30).map((s, i) => {
    const visibility = i < 3 ? '[MOST PROMINENT]' : i < visibleSkillsCount ? '[VISIBLE]' : '[REQUIRES EXPANSION]';
    return `"${s.name}" ${visibility} - ${s.endorsementCount || 0} endorsements`;
  }).join('\n') :
  'No detailed skills data available'}
${skillsData.skills?.length > 30 ? `\n... and ${skillsData.skills.length - 30} more skills` : ''}

</all_skills_full_list>

<analysis_task>
Analyze the skills section for quality and relevance:

1. FIRST, identify from the full list above:
   - What skills ARE already present (don't suggest adding them)
   - Which skills have endorsements vs which don't
   - How well the most prominent skills align with ${config.targetRole}
   - Any redundant skills (e.g., "Excel" + "Microsoft Office")

2. Score (0-10) based on:
   - Relevance of MOST PROMINENT skills to ${config.targetRole} (weighs heavily)
   - Endorsement presence (ANY endorsements = good, recent = excellent)
   - Overall skill set completeness for ${config.seniorityLevel}
   - SCORING GUIDE:
     * 9-10: Most prominent skills perfectly aligned with role + have recent endorsements
     * 8-9: Most prominent skills perfectly aligned with role + any endorsements OR excellent alignment without endorsements
     * 6-7: Skills well aligned but could enhance visibility or lacks endorsements
     * 4-5: Skills exist but poor relevance for target role
     * 0-3: No skills or completely misaligned with role
   - CRITICAL: Recent endorsements (< 6 months) automatically add +2 to score

3. Provide feedback:
   - If they have recent endorsements (< 6 months), START with: "Outstanding! Your recent endorsements show active validation"
   - If most prominent skills are already perfect for the role, acknowledge this
   - For scores 7-10: Celebrate achievements first, focus on skill quality not positions
   - Focus on skill relevance and endorsement quality, not mechanical reordering

4. For action items:
   - CRITICAL: Check if score >= 9. If yes, provide 0-1 improvements MAX (or none if perfect)
   - DO NOT suggest repositioning skills that are already most prominent
   - Focus on: Adding missing critical skills, getting endorsements for unendorsed skills, or highlighting hidden gems
   - If skills are well-positioned and endorsed, suggest strategic additions instead
   - Avoid mechanical position swapping - focus on strategic improvements
   - Example good feedback: "Consider highlighting your 'Data Analysis' skill more prominently"
   - Example bad feedback: "Move skill from position #1 to #1" (meaningless)
</analysis_task>

Return ONLY valid JSON with this exact structure (no markdown, no extra text):
{
  "score": <integer 0-10>,
  "positiveInsight": "<200-300 chars acknowledging their ACTUAL skills like 'Your top skill Product Management with 45 endorsements shows...'>",
  "gapAnalysis": "<150-250 chars identifying issues with specific skills quoted from their list>",
  "specificFeedback": {
    "originalLine": "<Quote their actual top 3 skills>",
    "suggestion": "<How to improve the top 3 positioning>",
    "why": "<50-100 chars explaining impact>"
  },
  "actionItems": [
    {
      "category": "<'Strategic Positioning'|'Endorsement Building'|'Skill Optimization'|'10/10 Refinement'>",
      "action": "<SPECIFIC action referencing their actual skills by name>",
      "impact": "<How this helps for ${config.targetRole} at ${config.seniorityLevel}>",
      "priority": "<'high'|'medium'|'low'>",
      "quotedContent": "<Exact skill names and endorsement counts from their list>"
    }
  ]
}`;

  return prompt;
}

// Parse section analysis response
function parseSectionAnalysis(response, sectionName) {
  try {
    // Try to parse as JSON first
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Handle both old and new formats
      const actionItems = parsed.actionItems || parsed.recommendations || [];
      const improvements = parsed.improvements || [];
      
      // Validate that AI included specific quotes
      
      
      
      // Validate actionItems have quotedContent
      const validatedActionItems = actionItems.map(item => {
        return item;
      });
      
      
      return {
        score: Math.min(10, Math.max(0, parsed.score || 5)),
        // New format with positiveInsight and gapAnalysis
        positiveInsight: parsed.positiveInsight || parsed.strengths?.[0] || '',
        gapAnalysis: parsed.gapAnalysis || '',
        // Legacy format support
        insight: parsed.insight || parsed.feedback || `${parsed.strengths?.join('. ')}. ${improvements.join('. ')}`,
        strengths: parsed.strengths || [],
        improvements: improvements,
        actionItems: validatedActionItems,
        specificFeedback: parsed.specificFeedback || null,
        // Keep backwards compatibility
        recommendations: validatedActionItems.map(item => 
          typeof item === 'string' ? item : (item.what || item.text || item)
        )
      };
    }
  } catch (error) {
    console.error('AI.PARSING', 'Failed to parse response', error, {
      section: sectionName,
      responsePreview: response.substring(0, 200)
    });
  }
  
  // Fallback parsing
  return {
    score: null,
    errorType: 'RESPONSE_PARSE_ERROR',
    positiveInsight: '',
    gapAnalysis: '',
    insight: response.substring(0, 200),
    strengths: [],
    improvements: [],
    actionItems: [],
    recommendations: []
  };
}

// Synthesize final analysis from section analyses
async function synthesizeFinalAnalysis(sectionAnalyses, config) {
  
  // Separate experience roles from other sections
  const experienceRoles = [];
  const otherSections = {};
  
  for (const [section, analysis] of Object.entries(sectionAnalyses)) {
    if (section === 'experience_role') {
      experienceRoles.push(analysis);
    } else {
      otherSections[section] = analysis;
    }
  }
  
  // Analyze career trajectory if we have experience data
  let careerInsights = '';
  if (experienceRoles.length > 0) {
    careerInsights = analyzeCareerTrajectory(experienceRoles);
  }
  
  // Collect all recommendations and improvements
  const allRecommendations = [];
  const insights = {
    strengths: [],
    improvements: [],
    careerTrajectory: careerInsights
  };
  
  // Process all sections
  for (const [section, analysis] of Object.entries(sectionAnalyses)) {
    // Handle experience_roles array
    if (section === 'experience_roles' && Array.isArray(analysis)) {
      analysis.forEach((roleAnalysis, index) => {
        // Use actionItems if available
        if (roleAnalysis.actionItems?.length > 0) {
          roleAnalysis.actionItems.forEach(item => {
            const priority = item.priority || (roleAnalysis.score < 5 ? 'critical' : roleAnalysis.score < 7 ? 'high' : 'medium');
            
            allRecommendations.push({
              section: `experience_role_${index + 1}`,
              priority: priority,
              action: {
                what: item.what || 'Improve experience description',
                why: item.why || item.how || 'Review and update this role description',
                how: item.how || 'Add specific achievements and impact'
              }
            });
          });
        }
        // Fallback to recommendations
        else if (roleAnalysis.recommendations?.length > 0) {
          roleAnalysis.recommendations.forEach(rec => {
            const basePriority = roleAnalysis.score < 5 ? 'critical' : roleAnalysis.score < 7 ? 'high' : 'medium';
            
            allRecommendations.push({
              section: `experience_role_${index + 1}`,
              priority: basePriority,
              action: {
                what: typeof rec === 'string' ? rec : (rec.text || rec.action?.what || 'Improve experience description'),
                why: rec.why || rec.action?.why || rec.how || 'Add specific achievements and impact',
                how: rec.how || rec.action?.how || rec.example || 'Add specific achievements and impact'
              }
            });
          });
        }
      });
      continue;
    }
    
    if (!analysis.exists) {
      allRecommendations.push({
        section,
        priority: 'critical',
        action: {
          what: `Add ${section} section to your profile`,
          why: `Missing ${section} significantly impacts profile completeness`,
          how: `Navigate to your LinkedIn profile and add content to the ${section} section`
        }
      });
    } else {
      // Add strengths
      if (analysis.strengths?.length > 0) {
        insights.strengths.push(...analysis.strengths.map(s => `${section}: ${s}`));
      } else if (analysis.insights?.strengths?.length > 0) {
        insights.strengths.push(...analysis.insights.strengths.map(s => `${section}: ${s}`));
      }
      
      // Add improvements as recommendations
      const improvements = analysis.improvements || analysis.insights?.improvements || [];
      if (improvements.length > 0) {
        improvements.forEach(improvement => {
          // For experience roles, prioritize recent ones
          const isRecentRole = section === 'experience_role' && analysis.recencyScore > 0.8;
          const basePriority = analysis.score < 5 ? 'critical' : analysis.score < 7 ? 'high' : 'medium';
          const priority = isRecentRole && basePriority === 'medium' ? 'high' : basePriority;
          
          allRecommendations.push({
            section,
            priority,
            action: {
              what: improvement,
              why: `Important for ${section} section${isRecentRole ? ' (Current/Recent Role - Higher Impact)' : ''}`,
              how: analysis.recommendations?.[0] || 'Review and update this section'
            }
          });
        });
      }
      
      // Add action items if they exist
      if (analysis.actionItems?.length > 0) {
        analysis.actionItems.forEach((item) => {
          // Use priority from action item if available, otherwise calculate
          const priority = item.priority || (analysis.score < 5 ? 'critical' : analysis.score < 7 ? 'high' : 'medium');
          
          allRecommendations.push({
            section,
            priority,
            action: {
              what: item.what || item.text || `Improve ${section}`,
              why: item.why || item.how || 'Review and update this section',
              how: item.how || item.example || 'Review and update this section'
            }
          });
        });
      }
      
      // Fallback to old recommendations format
      else if (analysis.recommendations?.length > 0) {
        analysis.recommendations.forEach((rec) => {
          const isRecentRole = section === 'experience_role' && analysis.recencyScore > 0.8;
          const basePriority = analysis.score < 5 ? 'critical' : analysis.score < 7 ? 'high' : 'medium';
          const priority = isRecentRole && basePriority === 'medium' ? 'high' : basePriority;
          
          allRecommendations.push({
            section,
            priority,
            action: {
              what: typeof rec === 'string' ? rec : (rec.text || rec.action?.what || `${section} improvement`),
              why: rec.why || rec.action?.why || `Improves ${section} quality score from ${analysis.score}/10`,
              how: rec.how || rec.action?.how || rec.example || 'Review and update this section'
            }
          });
        });
      }
    }
  }
  
  // Sort and categorize recommendations
  const categorized = {
    critical: allRecommendations.filter(r => r.priority === 'critical').slice(0, 3),
    important: allRecommendations.filter(r => r.priority === 'high').slice(0, 3),
    niceToHave: allRecommendations.filter(r => r.priority === 'medium').slice(0, 3)
  };
  
  const result = {
    recommendations: categorized,
    insights: {
      strengths: insights.strengths.slice(0, 3).join('. '),
      improvements: insights.improvements.slice(0, 3).join('. '),
      careerTrajectory: insights.careerTrajectory
    },
    summary: `Analysis complete. Found ${allRecommendations.length} recommendations across ${Object.keys(sectionAnalyses).length} sections.`
  };
  
  
  return result;
}

// Analyze career trajectory from experience roles
function analyzeCareerTrajectory(experienceRoles) {
  if (experienceRoles.length === 0) return 'No experience data available for trajectory analysis.';
  
  // Sort by recency (assuming they come in order)
  const sortedRoles = [...experienceRoles].sort((a, b) => (b.recencyScore || 0) - (a.recencyScore || 0));
  
  // Calculate average scores
  const avgScore = sortedRoles.reduce((sum, role) => sum + (role.score || 0), 0) / sortedRoles.length;
  const recentScore = sortedRoles[0]?.score || 0;
  const scoreTrajectory = recentScore > avgScore ? 'improving' : recentScore < avgScore ? 'declining' : 'stable';
  
  // Analyze progression patterns
  const hasUpwardProgression = sortedRoles.some((role, i) => {
    if (i === sortedRoles.length - 1) return false;
    const current = role.title?.toLowerCase() || '';
    const previous = sortedRoles[i + 1]?.title?.toLowerCase() || '';
    return current.includes('senior') && !previous.includes('senior') ||
           current.includes('lead') && !previous.includes('lead') ||
           current.includes('director') && !previous.includes('director');
  });
  
  // Build insights
  let insights = `Career Analysis: ${sortedRoles.length} roles analyzed. `;
  
  if (scoreTrajectory === 'improving') {
    insights += 'Profile quality is improving over time - recent roles are better documented. ';
  } else if (scoreTrajectory === 'declining') {
    insights += 'Recent roles need more detail - earlier positions are better documented. ';
  }
  
  if (hasUpwardProgression) {
    insights += 'Clear career progression visible through role titles. ';
  }
  
  if (sortedRoles[0]?.hasQuantifiedAchievements) {
    insights += 'Current role includes quantified achievements (excellent). ';
  } else {
    insights += 'Current role lacks quantified achievements (high priority improvement). ';
  }
  
  return insights;
}

// Call AI provider
async function callAIProvider(provider, apiKey, prompt, model = null) {
  
  // Clean and validate API key
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('Invalid API key');
  }
  
  // Remove any non-printable characters and trim whitespace
  const cleanApiKey = apiKey.trim().replace(/[^\x20-\x7E]/g, '');
  
  // Check if key was significantly altered (might indicate encoding issues)
  
  if (!cleanApiKey) {
    throw new Error('API key is empty after cleaning');
  }
  
  // Get model from storage if not provided
  if (!model) {
    const settings = await chrome.storage.local.get(['aiModel', 'aiProvider']);
    model = settings.aiModel;
    if (!model) {
      const defaults = { openai: 'gpt-4.1-nano', anthropic: 'claude-haiku-4-5-20251001', gemini: 'gemini-2.5-flash-lite' };
      model = defaults[provider] || 'gemini-2.5-flash-lite';
    }
  }

  const config = {
    openai: {
      url: 'https://api.openai.com/v1/chat/completions',
      headers: {
        'Authorization': `Bearer ${cleanApiKey}`,
        'Content-Type': 'application/json'
      },
      body: {
        model: model,
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: 4000,
        temperature: 0.1
      }
    },
    anthropic: {
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'x-api-key': cleanApiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: {
        model: model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4000,
        temperature: 0.1
      }
    },
    gemini: {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      headers: {
        'x-goog-api-key': cleanApiKey,
        'Content-Type': 'application/json'
      },
      body: {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4000
        }
      }
    }
  };
  
  const providerConfig = config[provider];
  if (!providerConfig) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  
  // Add timeout to prevent hanging requests
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
  
  try {
    const response = await fetch(providerConfig.url, {
      method: 'POST',
      headers: providerConfig.headers,
      body: JSON.stringify(providerConfig.body),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return processProviderResponse(provider, data, model);
    
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      console.error('AI.PROMPTS', 'Request timeout', new Error('API request timed out after 30 seconds'));
      throw new Error('Request timeout - API not responding');
    }
    
    throw error;
  }
  
  // Helper function to process provider response
  function processProviderResponse(provider, data, model) {

    // Extract content based on provider
    if (provider === 'openai') {
      return data.choices?.[0]?.message?.content || '';
    } else if (provider === 'anthropic') {
      return data.content?.[0]?.text || '';
    } else if (provider === 'gemini') {
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    return '';
  }
}

// Message handler
if (chrome && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // SECURITY: Validate message sender
  if (!sender || sender.id !== chrome.runtime.id) {
    return false;
  }
  
  const { action } = request;
  
  
  // Handle test API key
  if (action === 'testApiKey') {
    testApiKey(request.provider, request.apiKey, request.model).then(result => {
      sendResponse(result);
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  
  
  // [CRITICAL_PATH:API_KEY_ENCRYPTION_HANDLER] - P0: Handles API key encryption requests from popup
  // Handle API key encryption with better error handling
  if (action === 'encryptApiKey') {
    cryptoUtils.encryptApiKey(request.apiKey).then(async (encryptedKey) => {
      // Get installationId from storage
      const { installationId } = await chrome.storage.local.get('installationId');
      sendResponse({ 
        success: true, 
        encryptedApiKey: encryptedKey,
        installationId: installationId || null
      });
    }).catch(error => {
      console.error('AI.PROMPTS', 'Encryption failed', error);
      sendResponse({ 
        success: false, 
        error: error.message || 'Failed to encrypt API key',
        details: {
          errorName: error.name,
          errorStack: error.stack
        }
      });
    });
    return true;
  }
  
  // [CRITICAL_PATH:API_KEY_CLEAR_HANDLER] - P0: Securely removes all API key data
  // Handle API key clearing
  if (action === 'clearApiKey') {
    cryptoUtils.clearApiKey().then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      console.error('AI.PROMPTS', 'Failed to clear API key', error);
      sendResponse({ 
        success: false, 
        error: error.message || 'Failed to clear API key'
      });
    });
    return true;
  }
  
  // Handle individual section analysis
  if (action === 'analyzeSection') {
    handleSectionAnalysis(request, sendResponse);
    return true;
  }
  
  // Handle synthesis of section scores
  if (action === 'synthesizeAnalysis') {
    handleSynthesisAnalysis(request, sendResponse);
    return true;
  }
  
  // Handle API key validation
  if (action === 'validateApiKey') {
    (async () => {
      try {
        // Use provider and API key from request (during setup)
        // OR fall back to storage (for later validation)
        let provider = request.provider;
        let apiKey = request.apiKey;
        
        // If not provided in request, get from storage
        if (!provider || !apiKey) {
          const stored = await chrome.storage.local.get('aiProvider');
          provider = provider || stored.aiProvider;
          apiKey = apiKey || await getDecryptedApiKey();
        }
        
        if (!provider || !apiKey) {
          sendResponse({ 
            success: false, 
            error: 'API key or provider not configured' 
          });
          return;
        }
        
        // Use the existing testApiKey function
        const result = await testApiKey(provider, apiKey, null);
        sendResponse(result);
      } catch (error) {
        console.error('AI.PROMPTS', 'API key validation error', error);
        sendResponse({ 
          success: false, 
          error: error.message || 'Validation failed' 
        });
      }
    })();
    return true;
  }
  
  // Handle popup open request
  if (action === 'openPopup') {
    chrome.action.openPopup();
    sendResponse({ success: true });
    return true;
  }
  
  // Default response for unknown actions
  sendResponse({ success: false, error: 'Unknown action' });
  return true;
});

// API Rate Limiter
class RateLimiter {
  constructor() {
    this.requests = new Map();
    this.limits = {
      'api': { limit: 10, window: 60000 },        // 10 API calls per minute
      'test': { limit: 5, window: 60000 },        // 5 test calls per minute
      'analysis': { limit: 30, window: 300000 }   // 30 analyses per 5 minutes
    };
  }

  canMakeRequest(type, identifier = 'global') {
    const config = this.limits[type] || this.limits['api'];
    const key = `${type}:${identifier}`;
    const now = Date.now();
    
    // Get request history
    const requests = this.requests.get(key) || [];
    
    // Filter to requests within the time window
    const recentRequests = requests.filter(t => now - t < config.window);
    
    // Check if under limit
    if (recentRequests.length >= config.limit) {
      const oldestRequest = recentRequests[0];
      const waitTime = Math.ceil((config.window - (now - oldestRequest)) / 1000);
      return { allowed: false, waitTime };
    }
    
    // Add current request
    recentRequests.push(now);
    this.requests.set(key, recentRequests);
    
    // Clean old entries periodically
    if (Math.random() < 0.1) { // 10% chance to clean
      this.cleanOldEntries();
    }
    
    return { allowed: true };
  }

  cleanOldEntries() {
    const now = Date.now();
    for (const [key, requests] of this.requests.entries()) {
      const [type] = key.split(':');
      const config = this.limits[type] || this.limits['api'];
      const recentRequests = requests.filter(t => now - t < config.window);
      
      if (recentRequests.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, recentRequests);
      }
    }
  }

  reset(type = null, identifier = null) {
    if (type && identifier) {
      this.requests.delete(`${type}:${identifier}`);
    } else if (type) {
      for (const key of this.requests.keys()) {
        if (key.startsWith(`${type}:`)) {
          this.requests.delete(key);
        }
      }
    } else {
      this.requests.clear();
    }
  }
}

// Create rate limiter instance
const rateLimiter = new RateLimiter();

// Test API Key function
async function testApiKey(provider, apiKey, model) {
  try {
    // Check rate limit
    const rateCheck = rateLimiter.canMakeRequest('test', provider);
    if (!rateCheck.allowed) {
      return {
        success: false,
        error: `Rate limit exceeded. Please wait ${rateCheck.waitTime} seconds before testing again.`
      };
    }

    // Normalize provider string
    provider = provider?.toLowerCase()?.trim();
    
    // Clean and validate API key
    if (!apiKey || typeof apiKey !== 'string') {
      return { success: false, error: 'Invalid API key format' };
    }
    
    // Remove any non-printable characters and trim whitespace
    const cleanApiKey = apiKey.trim().replace(/[^\x20-\x7E]/g, '');
    
    // Check if key was significantly altered (might indicate encoding issues)
    
    if (!cleanApiKey) {
      return { success: false, error: 'API key is empty or contains only invalid characters' };
    }
    
    const testPrompt = 'Say "API key validated successfully" in exactly 5 words.';
    
    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cleanApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model || 'gpt-4.1-nano',
          messages: [{ role: 'user', content: testPrompt }],
          max_completion_tokens: 20,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        const errorData = await response.json();

        if (response.status === 401) {
          return { success: false, error: 'Invalid API key' };
        } else if (response.status === 429) {
          return { success: false, error: 'Rate limit exceeded' };
        } else if (response.status === 404 && errorData.error?.code === 'model_not_found') {
          return { success: false, error: `Model "${model}" not available for your account` };
        } else {
          return { success: false, error: errorData.error?.message || 'API request failed' };
        }
      }

      const data = await response.json();
      return { success: true, message: 'OpenAI API key is valid' };

    } else if (provider === 'gemini') {
      const testModel = model || 'gemini-2.5-flash-lite';
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${testModel}:generateContent`,
        {
          method: 'POST',
          headers: { 'x-goog-api-key': cleanApiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: testPrompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 20 }
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();

        if (response.status === 400 && errorData.error?.message?.includes('API key')) {
          return { success: false, error: 'Invalid API key' };
        } else if (response.status === 403) {
          return { success: false, error: 'Invalid API key or Gemini API not enabled' };
        } else if (response.status === 429) {
          return { success: false, error: 'Rate limit exceeded' };
        } else {
          return { success: false, error: errorData.error?.message || 'API request failed' };
        }
      }

      const data = await response.json();
      return { success: true, message: 'Gemini API key is valid' };

    } else if (provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': cleanApiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: model || 'claude-haiku-4-5-20251001',
          messages: [{ role: 'user', content: testPrompt }],
          max_tokens: 20,
          temperature: 0.1
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        
        if (response.status === 401) {
          return { success: false, error: 'Invalid API key' };
        } else if (response.status === 429) {
          return { success: false, error: 'Rate limit exceeded' };
        } else {
          return { success: false, error: errorData.error?.message || 'API request failed' };
        }
      }
      
      const data = await response.json();
      return { success: true, message: 'Anthropic API key is valid' };
    }
    
    return { success: false, error: 'Unknown provider' };
    
  } catch (error) {
    console.error('AI.PROMPTS', 'Test API key error', error, {
      errorType: error.name,
      errorMessage: error.message,
      errorStack: error.stack
    });
    return { success: false, error: error.message || 'Connection failed' };
  }
}

// Handle individual section analysis request
async function handleSectionAnalysis(request, sendResponse) {
  const { section, data, context, settings } = request;
  const sectionStartTime = Date.now();

  try {
    
    
    // Get provider and API key
    const { aiProvider } = await chrome.storage.local.get('aiProvider');
    const apiKey = await getDecryptedApiKey();
    
    if (!aiProvider || !apiKey) {
      sendResponse({ 
        success: false, 
        error: 'API key or provider not configured' 
      });
      return;
    }
    
    // Check rate limit
    const rateCheck = rateLimiter.canMakeRequest('analysis', request.profileId || 'unknown');
    if (!rateCheck.allowed) {
      sendResponse({
        success: false,
        error: `Rate limit exceeded. Please wait ${rateCheck.waitTime} seconds.`,
        errorType: 'RATE_LIMIT',
        retryAfter: rateCheck.waitTime
      });
      return;
    }
    
    // Create section-specific prompt
    const config = {
      provider: aiProvider,
      apiKey: apiKey,
      targetRole: settings?.targetRole || 'general professional',
      seniorityLevel: settings?.seniorityLevel || 'any level',
      customInstructions: settings?.customInstructions || ''
    };
    
    
    const prompt = createSectionPrompt(section, data, config, context);
    
    
    const model = settings?.aiModel || null;
    
    // Regular text-only analysis
    const response = await callAIProvider(aiProvider, apiKey, prompt, model);
    
    
    
    // Parse the response
    const analysis = parseSectionAnalysis(response, section);
    
    
    
    sendResponse({
      success: true,
      section: section,
      score: analysis.score,
      insight: analysis.positiveInsight || analysis.insight,  // Prefer positiveInsight
      positiveInsight: analysis.positiveInsight,  // Include the actual field
      gapAnalysis: analysis.gapAnalysis,
      strengths: analysis.strengths,
      improvements: analysis.improvements,
      actionItems: analysis.actionItems,
      specificFeedback: analysis.specificFeedback,
      // Flattened into synthesis-failure fallback recommendations (analyzer-base)
      recommendations: analysis.recommendations
    });
    
  } catch (error) {
    const sectionElapsed = Date.now() - sectionStartTime;
    console.error('SECTIONS.EXPERIENCE', 'Error analyzing section', error, {
      section,
      elapsedMs: sectionElapsed
    });
    sendResponse({
      success: false,
      error: error.message || 'Section analysis failed'
    });
  }
}

// Handle synthesis analysis request
async function handleSynthesisAnalysis(request, sendResponse) {
  const { sectionScores, sectionRecommendations, targetRole, seniorityLevel, customInstructions } = request;
  
  try {
    
    // Calculate weighted average score from section results
    let totalScore = 0;
    let totalWeight = 0;
    const weights = {
      first_impression: 0.20,   // 20% - First impression (headline + photo + banner)
      about: 0.25,              // 25% - Standalone about section
      experience_role: 0.30,    // 30% - All experience roles combined
      experience_overall: 0.30, // 30% - Overall experience (alternative to role-by-role)
      skills: 0.15,             // 15% - Skills
      recommendations: 0.10     // 10% - Recommendations
    };
    
    // Track experience scores separately to average them
    const experienceScores = [];
    
    
    Object.entries(sectionScores || {}).forEach(([sectionType, result]) => {
      
      if (sectionType === 'experience_roles' && Array.isArray(result)) {
        // Handle array of experience roles
        result.forEach(role => {
          if (role && role.score !== undefined && role.score !== null) {
            experienceScores.push(role.score);
          }
        });
      } else if (sectionType === 'experience_overall' && result && result.score !== undefined && result.score !== null) {
        // Handle overall experience score
        totalScore += result.score * weights.experience_overall;
        totalWeight += weights.experience_overall;
      } else if (result && result.score !== undefined && result.score !== null) {
        // Process other sections normally
        const weight = weights[sectionType] || 0.1;
        totalScore += result.score * weight;
        totalWeight += weight;
      }
    });
    
    // Add averaged experience score ONLY if we didn't already use experience_overall
    const hasExperienceOverall = sectionScores?.experience_overall?.score !== undefined;
    if (experienceScores.length > 0 && !hasExperienceOverall) {
      const avgExperienceScore = experienceScores.reduce((a, b) => a + b, 0) / experienceScores.length;
      totalScore += avgExperienceScore * weights.experience_role;
      totalWeight += weights.experience_role;
    }
    
    // Calculate final score
    const finalScore = totalWeight > 0 ? Math.round((totalScore / totalWeight) * 10) / 10 : 5;
    
    
    // Use the existing synthesizeFinalAnalysis function for recommendations
    const config = {
      targetRole: targetRole || 'general professional',
      seniorityLevel: seniorityLevel || 'any level',
      customInstructions: customInstructions || ''
    };
    
    const synthesis = await synthesizeFinalAnalysis(sectionScores || {}, config);
    
    
    // Return the response with calculated score
    const responseData = {
      success: true,
      finalScore: finalScore,
      synthesis: synthesis.summary,
      overallRecommendations: synthesis.recommendations,
      careerNarrative: synthesis.insights,
      sectionScores: sectionScores
    };
    
    sendResponse(responseData);
  } catch (error) {
    console.error('AI.PROMPTS', 'Synthesis error', error);
    sendResponse({
      success: false,
      error: error.message || 'Failed to synthesize analysis'
    });
  }
}


}
