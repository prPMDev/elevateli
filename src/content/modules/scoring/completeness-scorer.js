/**
 * Completeness Scorer Module for ElevateLI
 * Calculates profile completeness score based on section data
 */

/**
 * The target role and level as copy reads them ("Senior Product Manager"), always followed by "roles", "work" or
 * "job posts". '' for no role (blank or the old "general"). Founder and custom roles get no level prefix.
 * Top-level so the overlay can reuse it (this file loads first).
 */
function roleLabel(settings) {
  const { targetRole, seniorityLevel, customRole } = settings || {};
  if (targetRole === 'entrepreneur') return 'Founder';
  if (targetRole === 'other') return (customRole || '').trim();
  const role = { 'product-manager': 'Product Manager', 'software-engineer': 'Software Engineer', 'data-scientist': 'Data Scientist',
    designer: 'Designer', marketing: 'Marketing', sales: 'Sales', consultant: 'Consultant' }[targetRole];
  const level = { entry: 'Entry-level', mid: 'Mid-level', senior: 'Senior', lead: 'Lead', director: 'Director-level' }[seniorityLevel];
  return role ? (level ? `${level} ${role}` : role) : '';
}

class ProfileCompletenessCalculator {
  constructor() {
    const fmt = n => n.toLocaleString('en-US');

    // Section weights (total = 100)
    this.weights = {
      photo: 5,
      headline: 10,
      about: 20,
      experience: 25,
      skills: 15,
      education: 10,
      recommendations: 10,
      certifications: 3,
      projects: 2
    };
    
    // Section-specific rules. Character thresholds are shares of LinkedIn's limits:
    // headline 220 (75/50/30%), About 2600 (60/40/20/10%), role description 2000 (40/25/15%).
    // getMessage(data, role) gets roleLabel() ('' for no role). Tips carry no closing period and no trailing parenthetical:
    // the overlay adds " ({gainText})." after them.
    this.rules = {
      photo: {
        check: (data) => data.exists, // throws on null (extractor error), so the catch skips the gap
        getMessage: () => 'Add a clear, recent headshot as your profile photo'
      },
      
      headline: {
        getScore: (data) => {
          if (!data || !data.exists || !data.charCount) return 0;
          const n = data.charCount;
          return n >= 165 ? 1.0 : n >= 110 ? 0.8 : n >= 66 ? 0.5 : 0.2;
        },
        getMessage: (data, role) => {
          const result = role ? `a result that matters for ${role} roles` : "a result you're known for";
          // LinkedIn requires a headline, so none usually means it wasn't read
          if (!data || !data.exists || !data.charCount) {
            return `ElevateLI couldn't read your headline. If it's empty, add one with your focus area and ${result}`;
          }
          const n = data.charCount;
          if (165 - n < 20) return `Add a few more words to your headline: ${fmt(n)} characters now, 165+ gets full credit`;
          return `Expand your headline from ${fmt(n)} to 165+ characters: add your focus area and ${result}`;
        }
      },
      
      about: {
        getScore: (data) => {
          if (!data || !data.exists || !data.charCount) return 0;
          const n = data.charCount;
          return n >= 1560 ? 1.0 : n >= 1040 ? 0.75 : n >= 520 ? 0.4 : n >= 260 ? 0.2 : 0;
        },
        getMessage: (data, role) => {
          if (!data || !data.exists || !data.charCount) {
            return `Add an About section: what you do, 2–3 results, and the ${role ? `${role} ` : ''}work you want to be known for`;
          }
          const n = data.charCount;
          if (1560 - n < 150) return `Add a sentence or two to your About section: ${fmt(n)} characters now, 1,560+ gets full credit`;
          return `Expand your About section from ${fmt(n)} to 1,560+ characters with 2–3 results ${role ? `that fit ${role} roles` : 'from your recent work'}`;
        }
      },
      
      experience: {
        getScore: (data) => {
          // An existing section has at least one role and always sets averageDescriptionLength
          if (!data?.exists) return 0;
          const avg = data.averageDescriptionLength;
          // Roles, current role, description depth, then a recency bonus for the current role.
          // Sums to at most 1.0; keep the order, since regrouping the two 0.2 terms changes the float result.
          return (data.count >= 2 ? 0.3 : 0.15) +
            (data.hasCurrentRole ? 0.2 : 0) +
            (avg >= 800 ? 0.3 : avg >= 500 ? 0.2 : avg >= 300 ? 0.1 : 0) +
            (data.hasCurrentRole ? 0.2 : 0);
        },
        getMessage: (data) => {
          if (!data?.exists) return 'Add your work history, starting with your current or most recent role';
          if (data.count === 1) return 'Add more of your work history, such as an earlier job, internship or volunteer role';
          // A Career break entry is not read as a role (experience.js rows()), so the tip doesn't offer it
          if (!data.hasCurrentRole) {
            return 'Add what you\'re doing now to Experience with an end date of Present (tick "I am currently working in this role"). Freelance work counts';
          }
          const avg = fmt(data.averageDescriptionLength);
          const empty = data.emptyRoles || [];
          if (empty.length) {
            // By company; "Title at Company" when that company has several empty roles
            const names = [...new Set(empty.map(({ title, company }) =>
              !company ? title : empty.filter(other => other.company === company).length > 1 ? `${title} at ${company}` : company))];
            const parts = names.length > 3 ? [...names.slice(0, 2), `${names.length - 2} more`] : names;
            const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
            const one = names.length === 1;
            return `Add ${one ? 'a description' : 'descriptions'} to your ${list} role${one ? '' : 's'}: what you owned and one measurable result. ` +
              `Full credit needs an average of 800+ characters per role${data.averageDescriptionLength ? `; yours average ${avg}` : ''}`;
          }
          return `Expand your role descriptions from an average of ${avg} to 800+ characters: add one measurable result to each`;
        }
      },
      
      skills: {
        check: (data) => data && data.count >= 10,
        getMessage: (data, role) => {
          const which = role ? `the ones ${role} job posts ask for` : "the ones in job posts you're targeting";
          const k = 10 - (data?.count || 0);
          if (k === 10) return `Add at least 10 skills, starting with ${which}`;
          return `Add ${k} more skill${k > 1 ? 's' : ''} to reach 10, starting with ${which}`;
        }
      },

      education: {
        check: (data) => data && data.count >= 1,
        getMessage: () => 'Add your education: a degree, bootcamp or other program'
      },
      
      recommendations: {
        check: (data) => {
          if (!data || !data.exists || data.count === 0) return false;
          // A recent one (within 2 years) when dates were read, else any
          if (data.isCurrentlyEndorsed !== undefined) return data.isCurrentlyEndorsed;
          return data.count >= 1;
        },
        getMessage: (data, role) => {
          const about = role ? `a result relevant to ${role} roles` : 'a specific result you delivered';
          // count is received only
          if (data?.count && data.isCurrentlyEndorsed === false) return `None of your recommendations is from the last 2 years. Ask a recent manager or teammate for one about ${about}`;
          return `Ask a recent manager or teammate for a recommendation about ${about}`;
        }
      },

      certifications: {
        check: (data) => data && data.count >= 1,
        getMessage: (data, role) => role
          ? `If you hold certifications relevant to ${role} roles, add them under Licenses & certifications`
          : 'If you hold any certifications, add them under Licenses & certifications'
      },

      projects: {
        check: (data) => data && data.count >= 1,
        getMessage: (data, role) => `Add 1–2 projects ${role ? `relevant to ${role} roles` : 'that show your work'}, with links where you can`
      }
    };
  }
  
  /**
   * Calculate completeness for all sections
   * @param {Object} sectionData - Data for all sections
   * @param {Object} [settings] - { targetRole, seniorityLevel, customRole }: tips name the target role when one is set
   * @returns {Object} Complete scoring result
   */
  calculate(sectionData, settings) {
    const role = roleLabel(settings);
    const breakdown = {};
    const recommendations = [];
    let earnedPoints = 0;
    let totalPoints = 0;
    
    // Process each section. Every weight has a rule, and runExtractors sets every key (null on error).
    for (const [section, weight] of Object.entries(this.weights)) {
      const data = sectionData[section];
      const rule = this.rules[section];

      totalPoints += weight;

      try {
        // Use getScore if available for graduated scoring, otherwise fall back to check
        const scoreMultiplier = rule.getScore ? rule.getScore(data) : (rule.check(data) ? 1 : 0);

        const points = weight * scoreMultiplier;
        earnedPoints += points;
        const passed = scoreMultiplier >= 0.5; // Consider >= 50% as "passed"

        breakdown[section] = {
          weight,
          earned: points,
          passed,
          scoreMultiplier,
          data: this.summarizeData(data)
        };

        // No tip for a section whose extractor failed (null): ElevateLI didn't measure it. Headline says it couldn't read it.
        if (scoreMultiplier < 1 && (data != null || section === 'headline')) {
          recommendations.push({
            section,
            priority: this.getPriority(section, weight, scoreMultiplier),
            message: rule.getMessage(data, role),
            impact: weight * (1 - scoreMultiplier),
            weight: weight,
            currentScore: scoreMultiplier
          });
        }
      } catch (error) {
        // Set default values for this section
        breakdown[section] = {
          weight,
          earned: 0,
          passed: false,
          scoreMultiplier: 0,
          data: null
        };
        // Continue processing other sections
      }
    }
    
    // Sort recommendations by impact
    recommendations.sort((a, b) => b.impact - a.impact);
    
    const percentage = Math.round((earnedPoints / totalPoints) * 100);
    
    
    
    return {
      score: percentage,
      earnedPoints,
      totalPoints,
      breakdown,
      recommendations: recommendations.slice(0, 5), // Top 5 recommendations
      allRecommendations: recommendations,
      isOptimized: percentage >= 85,
      level: this.getLevel(percentage)
    };
  }
  
  /**
   * Get priority level for a section
   * @param {string} section - Section name
   * @param {number} weight - Section weight
   * @returns {string} Priority level
   */
  getPriority(section, weight, scoreMultiplier = 0) {
    // Factor in both weight and how much improvement is needed
    const potentialGain = weight * (1 - scoreMultiplier);
    
    if (potentialGain >= 15) return 'critical';
    if (potentialGain >= 8) return 'high';
    if (potentialGain >= 4) return 'medium';
    return 'low';
  }
  
  /**
   * Get completeness level
   * @param {number} percentage - Completeness percentage
   * @returns {string} Level name
   */
  getLevel(percentage) {
    if (percentage >= 90) return 'excellent';
    if (percentage >= 75) return 'good';
    if (percentage >= 60) return 'fair';
    if (percentage >= 40) return 'needs_work';
    return 'poor';
  }
  
  /**
   * Summarize section data for storage
   * @param {Object} data - Section data
   * @returns {Object} Summary
   */
  summarizeData(data) {
    if (!data) return null;
    
    return {
      exists: data.exists || false,
      count: data.count || 0,
      charCount: data.charCount || 0,
      hasContent: data && (data.exists || data.count > 0 || data.charCount > 0)
    };
  }
}