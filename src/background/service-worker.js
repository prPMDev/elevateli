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
    // Open LinkedIn tabs have no content script after an install, and a dead one after an update or
    // reload, so popup messages to them go nowhere. Inject the current one unless the tab already
    // loaded it; OverlayManager.initialize() replaces the overlay a dead script left behind.
    if (details.reason === 'install' || details.reason === 'update') {
      const { js, css } = chrome.runtime.getManifest().content_scripts[0];
      for (const { id } of await chrome.tabs.query({ url: 'https://www.linkedin.com/*' })) {
        const target = { tabId: id };
        chrome.scripting.executeScript({ target, func: () => typeof OverlayManager !== 'undefined' })
          .then(([probe]) => probe?.result || Promise.all([
            chrome.scripting.insertCSS({ target, files: css }),
            chrome.scripting.executeScript({ target, files: js })
          ]))
          .catch(() => {}); // tab closed or not scriptable (error page)
      }
    }

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
    return createExperienceOverallPrompt(content, enhancedConfig);
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
  
  throw new Error(`No prompt for section: ${sectionName}`);
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
</critical_rules>

<position_details>
Title: ${experience.title}
Company: ${experience.company}${experience.companyDetails?.size ? ` (${experience.companyDetails.size} employees)` : ''}
Industry: ${experience.companyDetails?.industry || 'Not specified'}
Duration: ${experience.employment?.duration || 'Not specified'} ${experience.employment?.isCurrent ? '(CURRENT ROLE)' : ''}
Dates: ${experience.employment?.startDate || 'Unknown'} - ${experience.employment?.endDate || 'Unknown'}
Role Position: ${Number.isInteger(context.position) ? `#${context.position + 1} of ${context.totalRoles} total roles` : 'Unknown'}
Visibility Level: ${context.position < 3 ? 'PREMIUM (top 3 - most visible)' : context.position < 10 ? 'Standard (requires scrolling)' : 'Hidden (requires expansion)'}
</position_details>

<role_description_full>
Character Count: ${experience.description?.length || 0}

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

Fill in these fields:
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

Fill in these fields: score, positiveInsight (what works, quoting their roles), gapAnalysis (what is weak),
specificFeedback (one weak line and its rewrite), actionItems (specific improvements).

NOTE: This is a fallback analysis. Individual role analysis would provide better insights.`;

  return prompt;
}

// Create specialized prompt for overall experience analysis
function createExperienceOverallPrompt(experienceData, config) {
  const totalMonths = experienceData.totalMonths || 0;
  const yearsOfExperience = Math.floor(totalMonths / 12);
  const totalRoles = experienceData.totalRoles || experienceData.count || 0;
  
  const prompt = `You are an expert career coach analyzing LinkedIn profiles for ${config.targetRole} positions at the ${config.seniorityLevel} level.

<context>
Analysis Date: ${config.currentDate || new Date().toISOString().split('T')[0]}
Target Role: ${config.targetRole}  
Seniority Level: ${config.seniorityLevel}
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
</critical_rules>

<profile_overview>
Total Experience: ${yearsOfExperience} years across ${totalRoles} roles
Average Tenure: ${experienceData.averageTenure ? Math.round(experienceData.averageTenure) + ' months per role' : 'Unknown'}
Current Status: ${experienceData.hasCurrentRole ? 'Currently employed' : 'Not currently employed'}
Career Start: ${experienceData.experiences?.[experienceData.experiences.length - 1]?.employment?.startDate || 'Unknown'}
Industry Changes: ${experienceData.industryChanges || 0}
</profile_overview>

<career_trajectory>
${experienceData.experiences && experienceData.experiences.length > 0 ? 
  experienceData.experiences.slice(0, 5).map((exp, idx) => 
    `${idx + 1}. ${exp.title} at ${exp.company} (${exp.duration || 'Duration not specified'})${exp.employment?.startDate ? ' - Started ' + exp.employment.startDate : ''}`
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
Dates: ${exp.employment?.startDate || 'Unknown'} - ${exp.employment?.endDate || 'Unknown'}
FULL DESCRIPTION (${exp.description?.length || 0} chars):
${exp.description || '[NO DESCRIPTION PROVIDED]'}
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

Fill in these fields:
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

Fill in these fields:
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

Fill in these fields:
{
  "score": <integer 0-10>,
  "positiveInsight": "<150-250 chars acknowledging what's working in their first impression>",
  "gapAnalysis": "<150-250 chars identifying weaknesses, quoting their actual headline>",
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

3. Provide two distinct assessments:
   - positiveInsight: What's working well (quote specific strong content)
   - gapAnalysis: Major weaknesses throughout, including the first 2-3 lines and the story's flow (quote weak phrases)

4. For action items:
   - If opening is weak: Show exact rewrite
   - If claims lack evidence: Quote the claim and suggest specific metrics
   - If flow is poor: Identify the disconnect and suggest restructuring
</analysis_task>

Fill in these fields:
{
  "score": <integer 0-10>,
  "positiveInsight": "<150-250 chars quoting their ACTUAL strong content like 'Your mention of leading $50M initiatives shows...'>"",
  "gapAnalysis": "<150-250 chars identifying weaknesses by quoting actual weak phrases>",
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
  const visibleSkillsCount = skillsData.visibleCount || 0;
  
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
</critical_rules>

<profile_status>
Completeness Score: ${completenessScore}%
Has Major Gaps: ${hasCompletenessIssues ? 'YES - Focus on critical issues only' : 'NO - Can provide strategic advice'}
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

Fill in these fields:
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

// Parse section analysis response. Providers return SECTION_SCHEMA JSON; slicing to the outer
// braces also covers local models that ignore the schema and wrap the JSON in prose or fences.
// A reply without a numeric score throws, so the section is reported as failed rather than scored.
function parseSectionAnalysis(response) {
  try {
    const parsed = JSON.parse(response.slice(response.indexOf('{'), response.lastIndexOf('}') + 1));
    const score = parseFloat(parsed.score); // NaN for a missing score; keeps 0 and "7"
    if (Number.isFinite(score)) {
      const actionItems = parsed.actionItems || [];
      return {
        score: Math.min(10, Math.max(0, score)),
        positiveInsight: parsed.positiveInsight || '',
        gapAnalysis: parsed.gapAnalysis || '',
        actionItems,
        specificFeedback: parsed.specificFeedback || null,
        recommendations: actionItems
      };
    }
  } catch {
    // Not JSON: falls through to the parse error below
  }
  throw Object.assign(new Error('AI response could not be read'), { errorType: 'RESPONSE_PARSE_ERROR' });
}

// The openai provider talks to any OpenAI-compatible server; the user can point it at Ollama or LM Studio
const OPENAI_URL = 'https://api.openai.com/v1';
const openaiBaseUrl = async (url) =>
  (url || (await chrome.storage.local.get('aiBaseUrl')).aiBaseUrl || OPENAI_URL).replace(/\/+$/, '');

// Every section prompt asks for this shape; each provider enforces it as JSON-schema output.
// No minimum/maximum: Anthropic rejects them, and parseSectionAnalysis clamps the score.
const STR = { type: 'string' };
const SECTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['score', 'positiveInsight', 'gapAnalysis', 'specificFeedback', 'actionItems'],
  properties: {
    score: { type: 'integer', description: '0-10' },
    positiveInsight: STR,
    gapAnalysis: STR,
    specificFeedback: {
      type: 'object',
      additionalProperties: false,
      required: ['originalLine', 'suggestion', 'why'],
      properties: { originalLine: STR, suggestion: STR, why: STR }
    },
    actionItems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['category', 'action', 'impact', 'priority', 'quotedContent', 'element'],
        properties: {
          category: STR,
          action: STR,
          impact: STR,
          priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          quotedContent: STR,
          element: { type: 'string', description: "'photo', 'headline' or 'banner' for first-impression items, else ''" }
        }
      }
    }
  }
};

// Call AI provider
async function callAIProvider(provider, apiKey, prompt, model) {
  
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
  
  if (!model) throw new Error('No AI model selected');
  const baseUrl = await openaiBaseUrl();

  const config = {
    openai: {
      url: `${baseUrl}/chat/completions`,
      headers: {
        'Authorization': `Bearer ${cleanApiKey}`,
        'Content-Type': 'application/json'
      },
      body: {
        model: model,
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: 8192,
        // api.openai.com gets no temperature: gpt-5.5+, GPT-6 and o-series reject it
        ...(baseUrl !== OPENAI_URL && { temperature: 0.1 }),
        response_format: { type: 'json_schema', json_schema: { name: 'section_analysis', strict: true, schema: SECTION_SCHEMA } }
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
        max_tokens: 8192, // no temperature: Claude 4.7+ rejects anything but 1
        output_config: { format: { type: 'json_schema', schema: SECTION_SCHEMA } }
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
          maxOutputTokens: 8192,
          responseFormat: { text: { mimeType: 'application/json', schema: SECTION_SCHEMA } }
        }
      }
    }
  };
  
  const providerConfig = config[provider];
  if (!providerConfig) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  
  try {
    const response = await fetch(providerConfig.url, {
      method: 'POST',
      headers: providerConfig.headers,
      body: JSON.stringify(providerConfig.body),
      // Local models and reasoning models take minutes; stay under Chrome's 5-minute limit per event
      signal: AbortSignal.timeout(180000)
    });

    if (!response.ok) {
      // Keep the provider's own message (e.g. "credit balance is too low"); HTTP/2 has no statusText
      const body = await response.json().catch(() => ({}));
      const s = response.status;
      throw Object.assign(new Error(body.error?.message || `API error ${s}`), {
        errorType: s === 401 || s === 403 ? 'AUTH' : s === 429 ? 'RATE_LIMIT' : s >= 500 ? 'SERVICE_UNAVAILABLE' : 'PROVIDER_ERROR'
      });
    }
    
    const data = await response.json();
    return processProviderResponse(provider, data, model);
    
  } catch (error) {
    if (error.name === 'TimeoutError') {
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
      return data.content?.find(block => block.type === 'text')?.text || '';
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
  // No apiKey in the request = reload models with the saved key, which only ever goes to the saved base URL
  if (action === 'testApiKey') {
    (async () => testApiKey(request.provider, request.apiKey || await getDecryptedApiKey(), request.apiKey && request.baseUrl))().then(result => {
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
        const result = await testApiKey(provider, apiKey);
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
      // Counted per section call; an analysis makes about 10. ponytail: send a run id from content if per-run limits matter
      'analysis': { limit: 300, window: 300000 }  // ~30 analyses per 5 minutes
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

// List the provider's models. Doubles as the key check: a GET, so no tokens are spent.
async function testApiKey(provider, apiKey, baseUrl) {
  const rateCheck = rateLimiter.canMakeRequest('test', provider);
  if (!rateCheck.allowed) {
    return {
      success: false,
      error: `Rate limit exceeded. Please wait ${rateCheck.waitTime} seconds before testing again.`
    };
  }

  const key = typeof apiKey === 'string' ? apiKey.trim().replace(/[^\x20-\x7E]/g, '') : '';
  if (!key) return { success: false, error: 'API key is required' };
  baseUrl = await openaiBaseUrl(baseUrl);

  const [url, headers] = {
    openai: [`${baseUrl}/models`, { 'Authorization': `Bearer ${key}` }],
    anthropic: ['https://api.anthropic.com/v1/models?limit=1000', {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    }],
    gemini: ['https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { 'x-goog-api-key': key }]
  }[provider] || [];
  if (!url) return { success: false, error: 'Unknown provider' };

  try {
    const response = await fetch(url, { headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = [401, 403].includes(response.status) ? 'Invalid API key'
        : response.status === 429 ? 'Rate limit exceeded'
        : data.error?.message || `API error ${response.status}`;
      return { success: false, error };
    }

    const list = provider === 'gemini'
      ? (data.models || [])
          .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
          .map(m => ({ id: m.name.replace(/^models\//, '') }))
      : (data.data || [])
          // Hide models on their way out (Anthropic: lifecycle, OpenAI: shutdown_date) or without JSON-schema output (Anthropic)
          .filter(m => m.capabilities?.structured_outputs?.supported !== false && m.lifecycle !== 'deprecated' && !m.shutdown_date)
          .sort((a, b) => (b.created || 0) - (a.created || 0)); // OpenAI newest first; Anthropic already is
    // ponytail: OpenAI/Gemini lists don't say which models can chat, so drop the non-chat ones by name. A wrong pick only errors on analysis.
    const models = list.map(m => m.id)
      .filter(id => !/embed|tts|whisper|dall-e|davinci|babbage|moderation|audio|realtime|transcribe|image|search|sora/.test(id));
    return { success: true, models };
  } catch (error) {
    console.error('Test API key error', error);
    return { success: false, error: error.message || 'Connection failed' };
  }
}

// Handle individual section analysis request
async function handleSectionAnalysis(request, sendResponse) {
  const { section, data, context } = request;
  const sectionStartTime = Date.now();

  try {
    // Read settings at call time, not from the content script's snapshot: provider, key and model then always match
    const { aiProvider, aiModel, targetRole, customRole, seniorityLevel, customInstructions } = await chrome.storage.local.get(
      ['aiProvider', 'aiModel', 'targetRole', 'customRole', 'seniorityLevel', 'customInstructions']
    );
    const apiKey = await getDecryptedApiKey();
    
    if (!aiProvider || !apiKey) {
      sendResponse({ 
        success: false, 
        error: 'API key or provider not configured' 
      });
      return;
    }
    
    // Check rate limit
    const rateCheck = rateLimiter.canMakeRequest('analysis');
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
      targetRole: (targetRole === 'other' ? customRole : targetRole) || 'general professional',
      seniorityLevel: seniorityLevel || 'any level',
      customInstructions: customInstructions || ''
    };


    const prompt = createSectionPrompt(section, data, config, context);

    // Regular text-only analysis
    const response = await callAIProvider(aiProvider, apiKey, prompt, aiModel);
    
    
    
    // Parse the response
    const analysis = parseSectionAnalysis(response);

    sendResponse({
      success: true,
      section: section,
      score: analysis.score,
      insight: analysis.positiveInsight,
      positiveInsight: analysis.positiveInsight,
      gapAnalysis: analysis.gapAnalysis,
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
      error: error.message || 'Section analysis failed',
      errorType: error.errorType
    });
  }
}

// Handle synthesis analysis request: the content score is the weighted average of the section scores
function handleSynthesisAnalysis(request, sendResponse) {
  const { sectionScores } = request;
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
  const hasExperienceOverall = typeof sectionScores?.experience_overall?.score === 'number';
  if (experienceScores.length > 0 && !hasExperienceOverall) {
    const avgExperienceScore = experienceScores.reduce((a, b) => a + b, 0) / experienceScores.length;
    totalScore += avgExperienceScore * weights.experience_role;
    totalWeight += weights.experience_role;
  }
  
  // No section scored: fail instead of inventing a 5 that would be shown and cached as the content score
  if (!totalWeight) {
    sendResponse({ success: false, error: 'AI could not score any section' });
    return;
  }
  const finalScore = Math.round((totalScore / totalWeight) * 10) / 10;
  
  sendResponse({ success: true, finalScore, sectionScores });
}


}
