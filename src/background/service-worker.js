/* Background Service Worker for ElevateLI */

// [CRITICAL_PATH:API_KEY_ENCRYPTION] - P0: API key security
// The key is stored only as encryptedApiKey: base64 of salt (16 bytes) + iv (12 bytes) + AES-GCM ciphertext,
// under a PBKDF2 key from a random per-install installationId
async function getOrCreatePassphrase() {
  const { installationId } = await chrome.storage.local.get('installationId');
  if (installationId) return installationId;
  const newId = crypto.randomUUID() + '-' + Date.now();
  await chrome.storage.local.set({ installationId: newId });
  return newId;
}

async function generateKey(passphrase, salt) {
  const passphraseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    passphraseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptApiKey(apiKey) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await generateKey(await getOrCreatePassphrase(), salt);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(apiKey));
  return btoa(String.fromCharCode(...salt, ...iv, ...new Uint8Array(encrypted)));
}

// Corrupt data or a changed installationId throws (atob or subtle.decrypt)
async function decryptApiKey(encryptedData) {
  const bytes = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
  const key = await generateKey(await getOrCreatePassphrase(), bytes.slice(0, 16));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(16, 28) }, key, bytes.slice(28)));
}

// [CRITICAL_PATH:API_KEY_RETRIEVAL] - P0: Decrypts API key for all AI operations
// Callers read encryptedApiKey in the same storage get as the provider, model and base URL,
// so a settings save in between can't pair the old key with the new server
async function getDecryptedApiKey(encryptedApiKey) {
  if (!encryptedApiKey) return null;
  try {
    return await decryptApiKey(encryptedApiKey);
  } catch (error) {
    console.error('Failed to decrypt API key', error); // never delete the key here: that made saved keys vanish
    return null;
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  // Open LinkedIn tabs have no content script after an install, and a dead one after an update or
  // reload, so popup messages to them go nowhere. Inject the current one unless the tab already
  // loaded it; OverlayManager.initialize() replaces the overlay a dead script left behind.
  if (details.reason === 'install' || details.reason === 'update') {
    const { js, css } = chrome.runtime.getManifest().content_scripts[0];
    const reinject = id => {
      const target = { tabId: id };
      chrome.scripting.executeScript({ target, func: () => typeof OverlayManager !== 'undefined' })
        .then(([probe]) => probe?.result || Promise.all([
          chrome.scripting.insertCSS({ target, files: css }),
          chrome.scripting.executeScript({ target, files: js })
        ]))
        .catch(() => {}); // tab closed or not scriptable (error page)
    };
    for (const { id, status } of await chrome.tabs.query({ url: 'https://www.linkedin.com/*' })) {
      if (status === 'complete') reinject(id);
      // A tab still loading may already be past document_idle, where the new manifest scripts never run.
      // Wait for it to finish; the probe then skips tabs that did get them. 'unloaded' tabs reload fresh.
      else if (status === 'loading') {
        const onUpdated = (tabId, info) => {
          if (tabId !== id || info.status !== 'complete') return;
          chrome.tabs.onUpdated.removeListener(onUpdated);
          reinject(id);
        };
        chrome.tabs.onUpdated.addListener(onUpdated);
      }
    }
  }

  if (details.reason === 'install') chrome.tabs.create({ url: 'updates.html' });
  else if (details.reason === 'update') {
    // Show updates page for major or minor version changes
    const [pMaj, pMin] = details.previousVersion.split('.').map(Number);
    const [cMaj, cMin] = chrome.runtime.getManifest().version.split('.').map(Number);
    if (cMaj > pMaj || (cMaj === pMaj && cMin > pMin)) chrome.tabs.create({ url: 'updates.html' });
  }
});

// Keep the SW alive only while a message handler runs: a slow local model can outlast the 30 s idle timer.
// A permanent ping would keep it alive forever, and Chrome installs updates only once the SW is unloaded.
let inFlight = 0, keepAliveTimer;
function keepAliveWhile(promise) {
  if (!inFlight++) keepAliveTimer = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20e3);
  return promise.finally(() => { if (!--inFlight) clearInterval(keepAliveTimer); });
}

// Content sends an object for every section; about's text is in .text
const PROMPTS = {
  experience_overall: createExperienceOverallPrompt,
  experience: createExperienceSectionPrompt, // fallback when roles were not extracted
  recommendations: createRecommendationsPrompt,
  first_impression: createFirstImpressionPrompt,
  about: (content, config) => createAboutPrompt(content?.text, config),
  skills: createSkillsPrompt
};
function createSectionPrompt(sectionName, content, config, context = {}) {
  if (!Object.hasOwn(PROMPTS, sectionName)) throw new Error(`No prompt for section: ${sectionName}`);
  return PROMPTS[sectionName](content, { ...config, currentDate: new Date().toISOString().split('T')[0] }, context);
}

// The <context> block every section prompt but the experience fallback starts with
const contextBlock = (config, extra = '') => `<context>
Analysis Date: ${config.currentDate}
Target Role: ${config.targetRole}
Seniority Level: ${config.seniorityLevel}
${extra}Custom Instructions: ${config.customInstructions || 'None provided'}
</context>`;

// Create prompt for experience section (when not broken into individual roles)
function createExperienceSectionPrompt(experienceData, config) {
  return `You are a LinkedIn profile optimization expert. Analyze this experience section overview.

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

Reply with JSON, filling in these fields: score, positiveInsight (what works, quoting their roles) and actionItems (specific improvements).

NOTE: This is a fallback analysis. Individual role analysis would provide better insights.`;
}

// Create specialized prompt for overall experience analysis
function createExperienceOverallPrompt(experienceData, config) {
  const totalMonths = experienceData.totalMonths || 0;
  const yearsOfExperience = Math.floor(totalMonths / 12);
  const totalRoles = experienceData.totalRoles || experienceData.count || 0;
  // Older roles behind "Show all" are never read, so the totals below are then only a lower bound
  const partial = !!experienceData.hasMoreItems;

  return `You are an expert career coach analyzing LinkedIn profiles for ${config.targetRole} positions at the ${config.seniorityLevel} level.

${contextBlock(config)}

<critical_rules>
⚠️ YOU MUST FOLLOW THESE RULES:
1. READ THE FULL DESCRIPTIONS FIRST - Identify what metrics, achievements, and details ARE already present
2. NEVER suggest adding something that's already there (e.g., if they mention "$50M ARR", don't ask them to add revenue metrics)
3. Be DIRECT and ACTIONABLE - no generic praise or fluff
4. SCORING FEEDBACK RULES:
   - Scores 0-6: START with the most critical gap, then mention strengths
   - Scores 7-10: START with what's working well, END with the specific steps that would strengthen it most
5. Give SPECIFIC actions: "Move your Oracle ML project mention to the first bullet" not "Highlight technical skills"
6. Focus on STRATEGIC career trajectory patterns, not individual role nitpicks
7. If they already have strong metrics, suggest how to REPOSITION or ENHANCE them, not add more${partial ? `
8. Only their most recent roles are provided; older roles exist but were not read. Never judge the career as only as long as the roles shown` : ''}
</critical_rules>

<profile_overview>
Total Experience: ${partial ? `${yearsOfExperience}+ years in the ${totalRoles} most recent roles (older roles are not shown on the profile page)` : `${yearsOfExperience} years across ${totalRoles} roles`}
Average Tenure: ${experienceData.averageTenure ? Math.round(experienceData.averageTenure) + ' months per role' : 'Unknown'}
Current Status: ${experienceData.hasCurrentRole ? 'Currently employed' : 'Not currently employed'}
${partial ? 'Earliest Listed Role Start' : 'Career Start'}: ${experienceData.experiences?.[experienceData.experiences.length - 1]?.employment?.startDate || 'Unknown'}
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
   - For scores 7-10: Name the specific achievements you see in their descriptions

4. Provide actionItems:
   - For scores 0-6: 3 critical improvements needed
   - For scores 7-10: 2-3 refinements
   - Each action must reference ACTUAL content from above or specific gaps
   - If metrics exist, suggest repositioning: "Lead with your $50M ARR at Avalara"
   - If metrics missing, be specific: "Quantify the 'API-first products' user base or revenue impact"
</analysis_task>

Reply with JSON: fill in score, positiveInsight (their actual career progression, quoting roles, companies and achievements above) and actionItems (category: 'Strategic Positioning', 'Career Narrative', 'Missing Elements', 'Content Enhancement' or '10/10 Optimization').`;
}

// Create specialized prompt for recommendations using Anthropic best practices
function createRecommendationsPrompt(recommendationsData, config, context = {}) {
  const recommendationCount = recommendationsData.count || recommendationsData.receivedCount || 0;
  // Only the cards shown on the profile page are read (/details/recommendations is client-rendered)
  const shown = recommendationsData.recommendationChunks?.length || 0;
  const received = recommendationsData.receivedCount || 0;
  const partialNote = shown < received
    ? `\nContent shown below: ${shown} of ${received} received (only those visible on the profile page were read). Judge content quality and who wrote them only from the shown ones; do not report a perspective (manager, peer, report, client) as missing, because the unread ones may cover it.`
    : '';

  return `You are an expert LinkedIn profile optimizer analyzing recommendations for ${config.targetRole} positions at the ${config.seniorityLevel} level.

${contextBlock(config)}

<critical_rules>
⚠️ YOU MUST FOLLOW THESE RULES:
1. READ ALL RECOMMENDATION CONTENT FIRST before providing feedback
2. If they have recent recommendations (< 6 months), say so: recency counts in their favor
3. SCORING FEEDBACK APPROACH:
   - Scores 0-6: Focus on critical gaps, but acknowledge any positives
   - Scores 7-10: START with strengths, END with refinements
4. Quote EXACT content from recommendations when discussing them
5. Give SPECIFIC actions: "Request recommendation from your manager John at Avalara" not "Get more recommendations"
6. Consider recency heavily - recent recommendations (< 1 year) are highly valuable
7. Don't penalize for having 0-2 recommendations
</critical_rules>

<career_context>
Current Role: ${context.currentRole ? `${context.currentRole.title} at ${context.currentRole.company}` : 'Not specified'}
Recent Companies: ${context.recentCompanies?.slice(0, 3).map(exp => exp.company).join(', ') || 'No recent data'}
Years of Experience: ${context.yearsOfExperience || 0}
</career_context>

<recommendations_overview>
Total Recommendations: ${recommendationCount}
Received: ${received}
Given: ${recommendationsData.givenCount || 0}${partialNote}
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
   - 0-2: No recommendations (state the gap plainly, without judgment)
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

Reply with JSON: fill in score, positiveInsight (what they have, even if it's 0) and actionItems (category: 'Strategic Requests', 'Perspective Gaps', 'Content Enhancement' or '10/10 Optimization'; name people and companies when possible).`;
}

// [CRITICAL_PATH:FIRST_IMPRESSION_AI] - P0: AI analysis for unified first impression
// Create specialized prompt for first impression (headline + photo). Only these are extracted, so the
// prompt states nothing about the banner, Open to Work, Creator Mode or connections.
function createFirstImpressionPrompt(firstImpressionData, config) {
  return `You are an expert LinkedIn profile optimizer analyzing first impressions for ${config.targetRole} positions at the ${config.seniorityLevel} level.

${contextBlock(config)}

<critical_rules>
⚠️ YOU MUST FOLLOW THESE RULES:
1. Quote the EXACT headline text when giving feedback
2. SCORING FEEDBACK APPROACH:
   - Scores 0-6: START with critical gaps, then acknowledge strengths
   - Scores 7-10: START with what's working, END with refinements
3. Analyze how all elements work together for first impression
</critical_rules>

<first_impression_data>
HEADLINE: "${firstImpressionData.headline || '[NO HEADLINE - CRITICAL GAP]'}"
Character Count: ${firstImpressionData.headlineCharCount || 0} of 220 maximum
Profile Photo: ${firstImpressionData.photo?.exists ? 'Present ✓' : 'MISSING - Critical gap'}
</first_impression_data>

<analysis_task>
Analyze the first impression elements:

1. FIRST, evaluate what's present:
   - Headline quality and relevance to ${config.targetRole}
   - Profile photo presence (critical for trust)

2. Score (0-10) based on:
   - Headline clarity and positioning (weighs heavily)
   - Photo presence (missing = cap at 5)
   - Overall professional presentation

3. Provide feedback:
   - Quote the exact headline when discussing it
   - For scores 7-10: Name strengths, suggest refinements
   - For scores 0-6: Focus on critical gaps first
</analysis_task>

Reply with JSON: fill in score, positiveInsight and actionItems (category: 'Profile Photo', 'Headline Enhancement' or '10/10 Optimization'; element: 'photo' or 'headline').`;
}

// [CRITICAL_PATH:ABOUT_SECTION_AI] - P0: Standalone About section analysis
// Create specialized prompt for About section only using Anthropic best practices
function createAboutPrompt(aboutContent, config) {
  return `You are an expert LinkedIn profile optimizer analyzing About sections for ${config.targetRole} positions at the ${config.seniorityLevel} level.

${contextBlock(config)}

<critical_rules>
⚠️ YOU MUST FOLLOW THESE RULES:
1. READ THE ENTIRE ABOUT SECTION FIRST before providing feedback
2. Quote EXACT phrases from their About section when discussing issues
3. NEVER use placeholder text like "[opening line]" - use their ACTUAL words
4. SCORING FEEDBACK APPROACH:
   - Scores 0-6: START with critical opening issues, then other gaps
   - Scores 7-10: START with what's working, END with refinements
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
   - Major weaknesses throughout, including the first 2-3 lines and the story's flow

3. positiveInsight: What's working well (quote specific strong content)

4. For action items (quote the weak phrases they fix):
   - If opening is weak: Show exact rewrite
   - If claims lack evidence: Quote the claim and suggest specific metrics
   - If flow is poor: Identify the disconnect and suggest restructuring
</analysis_task>

Reply with JSON: fill in score, positiveInsight and actionItems (category: 'Opening Hook', 'Metric Specificity', 'Narrative Flow', 'Value Proposition' or '10/10 Refinement').`;
}

// Create specialized prompt for skills section
function createSkillsPrompt(skillsData, config, context = {}) {
  // Add completeness context for conditional generic advice
  const completenessScore = context.completenessScore || 100;
  const hasCompletenessIssues = completenessScore < 95;
  const visibleSkillsCount = skillsData.visibleCount || 0;
  // Only the skills shown on the profile page are read (/details/skills is client-rendered); the AI must not treat them as the whole list
  const readSkills = skillsData.skills || [];
  const totalSkills = skillsData.count || readSkills.length;
  const unreadSkills = Math.max(0, totalSkills - readSkills.length);

  return `You are an expert LinkedIn profile optimizer analyzing skills for ${config.targetRole} positions at the ${config.seniorityLevel} level.

${contextBlock(config)}

<critical_rules>
⚠️ YOU MUST FOLLOW THESE RULES:
1. READ THE VISIBLE SKILLS FIRST - Identify what skills ARE present AND their endorsement status${unreadSkills ? '. Only the visible skills were read; the rest of their list is unknown' : ''}
2. ${unreadSkills ? `NEVER claim a skill is missing or tell them to add one: ${unreadSkills} of their skills were not read. Phrase it as "if X isn't already among your skills, add it" or as "move X into your top skills"` : 'NEVER suggest adding skills that already exist in their list'}
3. ENDORSEMENTS:
   - 0 endorsements is normal, not a weakness
   - Any endorsement counts in their favor, and 1 recent endorsement (< 6 months) counts for more than 10 old ones
   - State endorsement counts as facts: never compare them with other profiles or say how rare they are
4. SCORING FEEDBACK APPROACH:
   - Scores 0-4: Missing critical skills or poor alignment
   - Scores 5-7: Good skills but could optimize positioning or get more endorsements
   - Scores 8-10: Strong skills with endorsements - focus on refinements only
5. Quote EXACT skill names and endorsement counts (e.g., "Your 'Product Management' with 1 recent endorsement...")
6. If a skill has endorsements, say so; don't ask for more unless there's a strategic reason
7. DO NOT give mechanical repositioning advice with position numbers
8. Focus on skill quality: "Make 'Data Analysis' one of your top skills" not "Move from #8 to #3"
9. Focus on LinkedIn UI reality: Only some skills are visible without clicking "Show all"
</critical_rules>

<profile_status>
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

<visible_skills>
Only these ${readSkills.length} of ${totalSkills} skills were read${unreadSkills ? `; the other ${unreadSkills} are unknown` : ''}.
${readSkills.map((s, i) => `"${s.name}" ${i < 3 ? '[MOST PROMINENT]' : '[VISIBLE]'} - ${s.endorsementCount || 0} endorsements`).join('\n') || 'No detailed skills data available'}
</visible_skills>

<analysis_task>
Analyze the skills section for quality and relevance:

1. FIRST, identify from the visible skills above:
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
   - If they have recent endorsements (< 6 months), start positiveInsight by naming those skills and their recent endorsements
   - If most prominent skills are already perfect for the role, acknowledge this
   - For scores 7-10: Name what works first, focus on skill quality not positions
   - Focus on skill relevance and endorsement quality, not mechanical reordering

4. For action items:
   - CRITICAL: Check if score >= 9. If yes, provide 0-1 improvements MAX (or none if perfect)
   - DO NOT suggest repositioning skills that are already most prominent
   - Focus on: critical skills to add (worded as rule 2 says), getting endorsements for unendorsed skills, or highlighting hidden gems
   - If skills are well-positioned and endorsed, suggest strategic additions instead
   - Avoid mechanical position swapping - focus on strategic improvements
   - Example good feedback: "Make 'Data Analysis' one of your top skills"
   - Example bad feedback: "Move skill from position #1 to #1" (meaningless)
</analysis_task>

Reply with JSON: fill in score, positiveInsight (their actual skills and endorsement counts) and actionItems (category: 'Strategic Positioning', 'Endorsement Building', 'Skill Optimization' or '10/10 Refinement'; name their actual skills).`;
}

// Parse section analysis response. Providers return SECTION_SCHEMA JSON; slicing to the outer
// braces also covers local models that ignore the schema and wrap the JSON in prose or fences.
// A reply without a numeric score throws, so the section is reported as failed rather than scored.
function parseSectionAnalysis(response, model) {
  try {
    const parsed = JSON.parse(response.slice(response.indexOf('{'), response.lastIndexOf('}') + 1));
    const score = parseFloat(parsed.score); // NaN for a missing score; keeps 0 and "7"
    if (Number.isFinite(score)) {
      // Local models that ignore the schema can send a string or object; the overlay maps over this
      const actionItems = (Array.isArray(parsed.actionItems) ? parsed.actionItems : [])
        .map(item => typeof item === 'string' ? { action: item } : item)
        .filter(item => item && typeof item === 'object');
      return {
        score: Math.min(10, Math.max(0, score)),
        positiveInsight: parsed.positiveInsight || '',
        actionItems
      };
    }
  } catch {
    // Not JSON: falls through to the parse error below
  }
  throw Object.assign(new Error(`${model} sent a reply ElevateLI couldn't read; try another model`), { errorType: 'RESPONSE_PARSE_ERROR' });
}

// The openai provider talks to any OpenAI-compatible server; the user can point it at Ollama or LM Studio.
// '' means OpenAI. Callers pass the URL that goes with their key; this never reads storage on its own.
const OPENAI_URL = 'https://api.openai.com/v1';
const openaiBaseUrl = url => (url || OPENAI_URL).replace(/\/+$/, '');

// Trim and strip the non-printable characters a pasted key can carry
const cleanKey = apiKey => typeof apiKey === 'string' ? apiKey.trim().replace(/[^\x20-\x7E]/g, '') : '';

const authHeaders = (provider, key) => ({
  openai: { 'Authorization': `Bearer ${key}` },
  anthropic: {
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true'
  },
  gemini: { 'x-goog-api-key': key }
})[provider];

// Error text in a reply body: { error: { message } } from the cloud providers, { error: '...' } from LM Studio
const bodyError = body => body?.error?.message || (typeof body?.error === 'string' ? body.error : '');

// How copy names the provider. A server URL means a local model (Ollama, LM Studio).
const providerName = (provider, baseUrl) => provider === 'openai' && openaiBaseUrl(baseUrl) !== OPENAI_URL
  ? 'your local model' : { openai: 'OpenAI', anthropic: 'Claude', gemini: 'Gemini' }[provider];
const capitalize = text => text[0].toUpperCase() + text.slice(1);
const seconds = n => `${n} second${n === 1 ? '' : 's'}`;
// Provider text can echo the key ("Incorrect API key provided: sk-…"): mask key-like tokens, keep 80 characters
function quote(text) {
  text = text.replace(/\b(sk-|AIza)\S*|[\w-]{30,}/g, '…');
  return `"${text.length > 80 ? text.slice(0, 79) + '…' : text}"`;
}

// What a failed provider call tells the user, decided here where the provider, base URL and HTTP status are known.
// reason: a short phrase the page wraps in its own sentence and fix ("AI analysis failed ({reason}). Click Analyze to retry.").
// error: a full sentence with the fix, for the key field in ElevateLI settings. status 0 = no answer.
function providerError(provider, baseUrl, status, body, { timeout, offline, noAccess, retryAfter } = {}) {
  const message = bodyError(body);
  const local = provider === 'openai' && baseUrl !== OPENAI_URL;
  const name = providerName(provider, baseUrl);
  const Name = capitalize(name);
  // Gemini answers a bad key with 400 API_KEY_INVALID. A local server's 403 is OLLAMA_ORIGINS, not a key.
  const auth = !(local && status === 403) && (status === 401 || status === 403 || !!body?.error?.details?.some(d => d.reason === 'API_KEY_INVALID'));
  // OpenAI also answers an empty balance with 429; waiting won't fix that, so it keeps the provider's text
  const rateLimit = status === 429 && body?.error?.code !== 'insufficient_quota';
  const quoted = message ? `: ${quote(message)}` : '';
  const [reason, error] =
    timeout ? [`${name} took too long to respond`, `${Name} took too long to respond. ${local ? "Check that it's running, then try again." : 'Try again in a few minutes.'}`]
    : noAccess ? ['ElevateLI needs access to localhost to use your local model', 'ElevateLI needs access to localhost to use a local model. Clear the server URL, click outside the field, then enter it again and choose Allow when Chrome asks.']
    : !status ? (local
      ? [`ElevateLI couldn't reach ${baseUrl}; check that Ollama or LM Studio is running`, `Can't reach ${baseUrl}. Check that Ollama or LM Studio is running and the URL is right.`]
      : [`ElevateLI couldn't reach ${name}; check your internet connection`, offline ? "You're offline. Reconnect, then try again." : `Can't reach ${name}. Check your internet connection, then try again.`])
    : local && status === 403 ? ['your local model blocked the request (Ollama needs OLLAMA_ORIGINS=chrome-extension://*)',
      'The local server blocked the request. For Ollama, set OLLAMA_ORIGINS=chrome-extension://* and restart it.']
    // A 403 can come with a valid key (API not enabled, restricted key, region): keep the provider's text, it names the fix
    : auth ? (status === 403 && quoted ? [`${name} rejected your API key${quoted}`, `${Name} rejected this key (403)${quoted}`]
      : [`${name} rejected your API key`, `${Name} rejected this key. Check that you copied all of it.`])
    : rateLimit ? [`${name}'s rate limit was reached; wait ${retryAfter ? seconds(retryAfter) : 'a minute'}`, `${Name}'s rate limit was reached. Wait a minute, then try again.`]
    // A local server's 500 often names the cause (out of memory), which a retry won't fix
    : status >= 500 ? [`${name} is unavailable right now${local ? quoted : ''}`, `${Name} is unavailable right now${local && quoted ? quoted : '. Try again in a few minutes.'}`]
    : [`${name} returned an error${quoted}`, `${Name} returned an error (${status})${quoted || '.'}`];
  return {
    // 404: the saved model (or a local server's URL) is gone; a retry can't fix it, the quoted text names it
    errorType: !status ? 'NETWORK' : auth ? 'AUTH' : rateLimit ? 'RATE_LIMIT' : status >= 500 ? 'SERVICE_UNAVAILABLE'
      : status === 404 ? 'MODEL_NOT_FOUND' : 'PROVIDER_ERROR',
    status, reason, error, retryAfter
  };
}

// Every section prompt asks for this shape; each provider enforces it as JSON-schema output.
// The descriptions carry the per-field guidance, so prompts only name the fields and their section's values.
// No minimum/maximum: Anthropic rejects them, and parseSectionAnalysis clamps the score.
const str = description => ({ type: 'string', description });
const SECTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['score', 'positiveInsight', 'actionItems'],
  properties: {
    score: { type: 'integer', description: '0-10, where 10 is perfect for landing the target role' },
    positiveInsight: str('One or two short sentences on what already works, quoting their words. Plain statements: no scores, ratings, character counts, percentages, statistics, exclamation marks or emoji.'),
    actionItems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['category', 'action', 'impact', 'priority', 'quotedContent', 'element'],
        properties: {
          category: str('Improvement area: one of the categories the prompt lists'),
          action: str('One change to make on their own LinkedIn profile: verb first, one short sentence, naming their actual content (never generic). For a rewrite, quote their words and give the new wording. No scores, ratings like 10/10, character counts, percentages, exclamation marks or emoji.'),
          impact: str('One short sentence on why the change helps for the target role and level. No statistics, percentages, exclamation marks, emoji, claims about what recruiters think, or claims about how LinkedIn ranks or recommends profiles.'),
          priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          quotedContent: str('Exact quote from their profile this item addresses, or the specific gap'),
          element: str("'photo' or 'headline' for first-impression items, else ''")
        }
      }
    }
  }
};

// Call AI provider
async function callAIProvider(provider, apiKey, prompt, model, baseUrl) {
  const cleanApiKey = cleanKey(apiKey);
  baseUrl = openaiBaseUrl(baseUrl);
  // Thrown with the short reason; the page adds its own fix
  const fail = (status, body, options) => {
    const { reason, errorType, retryAfter } = providerError(provider, baseUrl, status, body, options);
    return Object.assign(new Error(reason), { errorType, retryAfter });
  };
  // Local servers may never show response_format's schema to the model; Ollama's docs put it in the prompt too
  if (provider === 'openai' && baseUrl !== OPENAI_URL) prompt += `\n\nReply with JSON matching: ${JSON.stringify(SECTION_SCHEMA)}`;

  const config = {
    openai: {
      url: `${baseUrl}/chat/completions`,
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
      body: {
        model: model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 8192, // no temperature: Claude 4.7+ rejects anything but 1
        output_config: { format: { type: 'json_schema', schema: SECTION_SCHEMA } }
      }
    },
    gemini: {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      body: {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
          // responseFormat.text.mimeType is an enum that rejects 'application/json'; responseJsonSchema takes plain JSON Schema
          responseMimeType: 'application/json',
          responseJsonSchema: SECTION_SCHEMA
        }
      }
    }
  };

  const providerConfig = config[provider];
  if (!providerConfig) throw Object.assign(new Error('no AI provider is selected'), { errorType: 'AUTH' });

  let response;
  try {
    response = await fetch(providerConfig.url, {
      method: 'POST',
      headers: { ...authHeaders(provider, cleanApiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify(providerConfig.body),
      // Local models and reasoning models take minutes; stay under Chrome's 5-minute limit per event
      signal: AbortSignal.timeout(180000)
    });
  } catch (error) {
    throw fail(0, null, { timeout: error.name === 'TimeoutError' });
  }

  if (!response.ok) {
    // HTTP/2 has no statusText, so the body carries the reason
    throw fail(response.status, await response.json().catch(() => ({})),
      { retryAfter: parseInt(response.headers.get('retry-after')) || undefined });
  }

  // The timeout also runs during the body read. Any other unreadable body returns '', which parseSectionAnalysis reports as a parse error.
  const data = await response.json().catch(error => {
    if (error.name === 'TimeoutError') throw fail(0, null, { timeout: true });
    return {};
  });
  return (provider === 'openai' ? data.choices?.[0]?.message?.content
    : provider === 'anthropic' ? data.content?.find(block => block.type === 'text')?.text
    : data.candidates?.[0]?.content?.parts?.[0]?.text) || '';
}

// Message handlers. Each returns its reply; a throw replies { success: false, error, errorType, retryAfter }.
const handlers = {
  // A typed key goes only to the typed base URL ('' = OpenAI). No apiKey in the request = reload models
  // with the saved key, which only ever goes to the saved base URL.
  async testApiKey({ provider, apiKey, baseUrl }) {
    if (apiKey) return testApiKey(provider, apiKey, baseUrl);
    const { encryptedApiKey, aiBaseUrl } = await chrome.storage.local.get(['encryptedApiKey', 'aiBaseUrl']);
    const key = await getDecryptedApiKey(encryptedApiKey);
    if (encryptedApiKey && !key) return { success: false, errorType: 'AUTH', reason: "ElevateLI couldn't read your saved API key",
      error: "ElevateLI couldn't read your saved key. Paste it again." };
    return testApiKey(provider, key, aiBaseUrl);
  },
  // [CRITICAL_PATH:API_KEY_ENCRYPTION_HANDLER] - P0: Handles API key encryption requests from popup
  encryptApiKey: async ({ apiKey }) => ({ success: true, encryptedApiKey: await encryptApiKey(apiKey) }),
  analyzeSection: handleSectionAnalysis,
  validateApiKey,
  // Reply with the real result: openPopup rejects when no window is focused (and is missing before Chrome 127),
  // so the caller can fall back to its own hint
  async openPopup() {
    await chrome.action.openPopup();
    return { success: true };
  }
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // SECURITY: Validate message sender
  if (sender.id !== chrome.runtime.id) return false;
  if (!Object.hasOwn(handlers, request.action)) {
    sendResponse({ success: false, error: 'Unknown action' });
    return false;
  }
  keepAliveWhile(handlers[request.action](request)).then(sendResponse, error => {
    console.error(request.action, error);
    // Only errors thrown on purpose carry an errorType; any other text is a bug's, and stays in this console
    sendResponse({ success: false, error: error.errorType ? error.message : 'something went wrong', errorType: error.errorType, retryAfter: error.retryAfter });
  });
  return true;
});

// ElevateLI's own limit: ~30 analyses (about 10 section calls each) per 5 minutes.
// ponytail: send a run id from content if per-run limits matter
let analysisCalls = [];
function checkRateLimit(now = Date.now()) {
  analysisCalls = analysisCalls.filter(t => now - t < 300000);
  if (analysisCalls.length >= 300) return { allowed: false, waitTime: Math.ceil((300000 - (now - analysisCalls[0])) / 1000) };
  analysisCalls.push(now);
  return { allowed: true };
}

// List the provider's models. Doubles as the key check: a GET, so no tokens are spent.
// A failure replies with both texts from providerError: error for the settings key field, reason for the page.
async function testApiKey(provider, apiKey, baseUrl) {
  const key = cleanKey(apiKey);
  baseUrl = openaiBaseUrl(baseUrl);

  const url = {
    openai: `${baseUrl}/models`,
    anthropic: 'https://api.anthropic.com/v1/models?limit=1000',
    gemini: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000'
  }[provider];
  if (!url) return { success: false, errorType: 'AUTH', reason: 'no AI provider is selected', error: 'Choose an AI provider.' };
  if (!key) return { success: false, errorType: 'AUTH', reason: "AI analysis isn't fully set up", error: `Paste your ${providerName(provider)} API key.` };

  let response;
  try {
    // A list answers in well under a second; a wedged local server that accepts the connection would otherwise hang the analysis
    response = await fetch(url, { headers: authHeaders(provider, key), signal: AbortSignal.timeout(20000) });
  } catch (error) {
    console.error('Test API key error', error);
    // localhost is an optional host permission: without it the fetch fails like a stopped server
    const noAccess = /^http:\/\/(localhost|127\.0\.0\.1)\b/.test(baseUrl) &&
      !await chrome.permissions.contains({ origins: ['http://localhost/*', 'http://127.0.0.1/*'] });
    return { success: false, ...providerError(provider, baseUrl, 0, null, { timeout: error.name === 'TimeoutError', offline: !navigator.onLine, noAccess }) };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { success: false, ...providerError(provider, baseUrl, response.status, data) };

  const list = provider === 'gemini'
    ? (data.models || [])
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => ({ id: m.name.replace(/^models\//, '') }))
    : (data.data || [])
        // Hide models on their way out (Anthropic: lifecycle, OpenAI: shutdown_date) or without JSON-schema output (Anthropic)
        .filter(m => m.capabilities?.structured_outputs?.supported !== false && m.lifecycle !== 'deprecated' && !m.shutdown_date)
        .sort((a, b) => (b.created || 0) - (a.created || 0)); // OpenAI newest first; Anthropic already is
  // ponytail: OpenAI/Gemini lists don't say which models can chat, so drop the non-chat ones by name. A wrong pick only errors on analysis.
  // Also dropped: Gemma on the Gemini API (no JSON-schema output) and OpenAI families not served on /chat/completions.
  const unusable = provider === 'gemini' ? /gemma/ : provider === 'openai' && baseUrl === OPENAI_URL ? /codex|-pro\b|computer-use|^o1/ : null;
  const models = list.map(m => m.id)
    .filter(id => !/embed|tts|whisper|dall-e|davinci|babbage|moderation|audio|realtime|transcribe|image|search|sora/.test(id) && !unusable?.test(id));
  // A 200 can still be no list: LM Studio answers a wrong path with 200 + an error, Ollama with nothing pulled sends []
  if (!models.length) {
    const local = provider === 'openai' && baseUrl !== OPENAI_URL;
    const reason = local ? `no models found at ${new URL(baseUrl).host}` : `${providerName(provider)} returned no chat models for this key`;
    const fix = !local ? '' : bodyError(data) ? ' Check that the URL ends in /v1.' : ' Download one in Ollama or LM Studio, then reopen settings.';
    return { success: false, errorType: 'PROVIDER_ERROR', reason, error: `${capitalize(reason)}.${fix}` };
  }
  return { success: true, models };
}

// Handle individual section analysis request
async function handleSectionAnalysis({ section, data, context }) {
  // Read settings at call time, not from the content script's snapshot, and in one get: provider, model,
  // base URL and key then always match
  const { enableAI, aiProvider, aiModel, aiBaseUrl, encryptedApiKey, targetRole, customRole, seniorityLevel, customInstructions } = await chrome.storage.local.get(
    ['enableAI', 'aiProvider', 'aiModel', 'aiBaseUrl', 'encryptedApiKey', 'targetRole', 'customRole', 'seniorityLevel', 'customInstructions']
  );
  // Turning AI off in the popup only writes storage; stop here so a running analysis sends no more profile text
  if (!enableAI) return { success: false, error: 'AI analysis was turned off' };
  const apiKey = await getDecryptedApiKey(encryptedApiKey);
  if (!aiProvider || !apiKey) return { success: false, errorType: 'AUTH', error: "AI analysis isn't fully set up" };
  if (!aiModel) return { success: false, errorType: 'AUTH', error: 'no AI model is selected' };

  const rateCheck = checkRateLimit();
  if (!rateCheck.allowed) {
    const name = providerName(aiProvider, aiBaseUrl);
    return {
      success: false,
      // ElevateLI's own limit, not the provider's; a local model has none
      error: name === 'your local model'
        ? `ElevateLI paused after many requests in a few minutes; wait ${seconds(rateCheck.waitTime)}`
        : `ElevateLI paused to stay under ${name}'s rate limit; wait ${seconds(rateCheck.waitTime)}`,
      errorType: 'RATE_LIMIT',
      retryAfter: rateCheck.waitTime
    };
  }

  const config = {
    // The prompt reads a role in words: product-manager -> product manager
    targetRole: (targetRole === 'other' ? customRole : targetRole !== 'general' && targetRole?.replace(/-/g, ' ')) || 'general professional',
    seniorityLevel: seniorityLevel || 'any level',
    customInstructions: customInstructions || ''
  };
  const prompt = createSectionPrompt(section, data, config, context);
  const analysis = parseSectionAnalysis(await callAIProvider(aiProvider, apiKey, prompt, aiModel, aiBaseUrl), aiModel);
  return {
    success: true,
    section,
    score: analysis.score,
    insight: analysis.positiveInsight,
    actionItems: analysis.actionItems
  };
}

// The saved provider, model, base URL and key, from one read. Auto-save can store a key before a model is picked.
// The page wraps error in its own sentence, so a failure replies with the short reason.
async function validateApiKey() {
  const { aiProvider, aiModel, aiBaseUrl, encryptedApiKey } = await chrome.storage.local.get(['aiProvider', 'aiModel', 'aiBaseUrl', 'encryptedApiKey']);
  const apiKey = await getDecryptedApiKey(encryptedApiKey);
  if (!aiProvider || !apiKey) return { success: false, errorType: 'AUTH', error: "AI analysis isn't fully set up" };
  if (!aiModel) return { success: false, errorType: 'AUTH', error: 'no AI model is selected' };
  const result = await testApiKey(aiProvider, apiKey, aiBaseUrl);
  return result.success ? result : { ...result, error: result.reason };
}

