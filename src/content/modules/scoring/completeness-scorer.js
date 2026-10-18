/**
 * Completeness Scorer Module for ElevateLI
 * Calculates profile completeness score based on section data
 */

class ProfileCompletenessCalculator {
  constructor() {
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
    // getMessage(data, role) gets domUtils' targetRoleLabel() ('' for no role) and returns { message, why }: what to change
    // on the profile and why it helps. Never the thresholds, counts or points: the overlay shows the gain as a chip.
    this.rules = {
      photo: {
        check: (data) => data.exists, // throws on null (extractor error), so the catch skips the gap
        getMessage: () => ({
          message: 'Add a clear, recent headshot, with your face filling most of the frame.',
          why: "It helps people you've met recognize you in search results and invites."
        })
      },

      headline: {
        getScore: (data) => {
          if (!data || !data.exists || !data.charCount) return 0;
          const n = data.charCount;
          return n >= 165 ? 1.0 : n >= 110 ? 0.8 : n >= 66 ? 0.5 : 0.2;
        },
        getMessage: (data, role) => {
          const why = 'It shows under your name in search results, posts and invites.';
          if (!data.exists || !data.charCount) {
            return { why, message: role ? `Add a headline that says what you do and the ${role} work you want next.`
              : 'Add a headline that says what you do and what you want to be known for.' };
          }
          if (data.charCount < 66) {
            return { why, message: 'Add your focus to your headline, like the area you specialize in, ' +
              (role ? `so people hiring for ${role} roles can find you.` : 'so people can tell what you do at a glance.') };
          }
          return { why, message: role ? `Add a result that matters for ${role} roles to your headline, like a product you shipped or a metric you moved.`
            : "Add a result you're known for to your headline, like a product you shipped or a metric you moved." };
        }
      },

      about: {
        getScore: (data) => {
          if (!data || !data.exists || !data.charCount) return 0;
          const n = data.charCount;
          return n >= 1560 ? 1.0 : n >= 1040 ? 0.75 : n >= 520 ? 0.4 : n >= 260 ? 0.2 : 0;
        },
        getMessage: (data, role) => {
          const why = "It's where people who visit your profile get your story in your own words.";
          const result = role ? `one result that matters for ${role} roles` : "one result you're proud of";
          if (!data.exists || !data.charCount) return { why, message: `Write an About section that says what you do, who it's for, and ${result}.` };
          if (data.charCount < 1040) return { why, message: `Build out your About section with what you do, who it's for, and ${result}.` };
          return { why, message: role ? `Add one more result to your About section, ideally one that matters for ${role} roles.`
            : 'Add one more result to your About section, with what you did and what changed.' };
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
        getMessage: (data, role) => {
          if (!data.exists) {
            return { message: 'Add your work history to Experience, starting with your current or most recent role.',
              why: role ? `It's where people check whether your background fits ${role} roles.` : "It's where people look to see what you've actually done." };
          }
          // A Career break entry is not read as a role (experience.js rows()), so the tips don't offer it
          const outdated = role ? `Without a current role, your profile looks out of date when people consider you for ${role} roles.`
            : 'Without a current role, your profile looks out of date.';
          // Empty roles by company; "Title at Company" when that company has several
          const empty = data.emptyRoles || [];
          const names = [...new Set(empty.map(({ title, company }) =>
            !company ? title : empty.filter(other => other.company === company).length > 1 ? `${title} at ${company}` : company))];
          if (data.count === 1) {
            if (!data.hasCurrentRole) {
              return { why: outdated, message: 'Add what you\'re doing now to Experience, such as freelance, contract or advisory work, or tick "I am currently working in this role" on your current job, then add your earlier roles.' };
            }
            const why = role ? `Earlier roles show the experience you bring to ${role} roles.` : "A single role doesn't show how your experience has grown.";
            if (names.length) return { why, message: `Add your earlier roles to Experience, and describe your ${names[0]} role: what you owned and one outcome.` };
            if (data.averageDescriptionLength < 800) return { why, message: "Add your earlier roles to Experience, and one more outcome to your current role's description." };
            return { why, message: 'Add your earlier roles to Experience, such as a previous job, internship or contract work.' };
          }
          if (!data.hasCurrentRole) {
            return { why: outdated, message: 'Add what you\'re doing now to Experience, such as freelance, contract or advisory work, or tick "I am currently working in this role" if your current job is already listed.' };
          }
          // Two or more roles with a current one fall short only on description depth
          if (names.length) {
            const [a, b] = names;
            return {
              message: names.length === 1 ? `Add a short description to your ${a} role: what you owned and one outcome.`
                : names.length === 2 ? `Add a short description to your ${a} and ${b} roles: what you owned and one outcome.`
                : `Add a short description to each role that's missing one, starting with ${a} and ${b}: what you owned and one outcome.`,
              why: role ? `A title alone doesn't show the scope and results ${role} roles call for.` : "A title alone doesn't show what you actually did."
            };
          }
          return { message: 'Add one concrete result to each role description, starting with your most recent: a metric you moved or something you shipped.',
            why: role ? `For ${role} roles, results say more than a list of duties.` : 'Results show what changed because of your work.' };
        }
      },

      skills: {
        check: (data) => data && data.count >= 10,
        getMessage: (data, role) => data.count ? {
          message: role ? `Add a few more skills you use regularly, especially ones ${role} job posts mention.`
            : 'Add a few more skills you use regularly, like tools and methods from your recent work.',
          why: 'Matching the words in the job posts you want helps the right people find you.'
        } : {
          message: role ? `Add the skills you use most to your profile, starting with the ones ${role} job posts ask for.`
            : "Add the skills you use most to your profile: tools, methods and the areas you're known for.",
          why: 'Listing them helps people who search by skill find you.'
        }
      },

      education: {
        check: (data) => data && data.count >= 1,
        getMessage: () => ({
          message: 'Add your education: a degree, bootcamp or other program you completed.',
          why: 'It lets alumni from your schools find you.'
        })
      },

      recommendations: {
        check: (data) => {
          if (!data || !data.exists || data.count === 0) return false;
          // A recent one (within 2 years) when dates were read, else any
          if (data.isCurrentlyEndorsed !== undefined) return data.isCurrentlyEndorsed;
          return data.count >= 1;
        },
        // count is received only
        getMessage: (data, role) => data.count && data.isCurrentlyEndorsed === false ? {
          message: role ? `Ask a recent manager or teammate for a new recommendation about work that matters for ${role} roles.`
            : 'Ask a recent manager or teammate for a new recommendation about your latest work.',
          why: 'It shows how you work today.'
        } : {
          message: role ? `Ask a recent manager or teammate for a recommendation about a result that matters for ${role} roles.`
            : 'Ask a recent manager or teammate for a recommendation about a specific result you delivered.',
          why: "Someone who saw your work firsthand adds proof your own words can't."
        }
      },

      certifications: {
        check: (data) => data && data.count >= 1,
        getMessage: (data, role) => ({
          message: role ? `Add any certifications relevant to ${role} roles under Licenses & certifications.`
            : 'Add any certifications you hold under Licenses & certifications.',
          why: 'A credential is quick proof of a skill.'
        })
      },

      projects: {
        check: (data) => data && data.count >= 1,
        getMessage: (data, role) => ({
          message: `Add a project ${role ? `relevant to ${role} roles` : 'that shows your work'}: what you built, what came of it, and a link if there is one.`,
          why: 'It lets people see your work, not just read about it.'
        })
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
    const role = targetRoleLabel(settings);
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

        // No tip for a section whose extractor failed (null): ElevateLI didn't measure it
        if (scoreMultiplier < 1 && data != null) {
          recommendations.push({
            section,
            priority: this.getPriority(section, weight, scoreMultiplier),
            ...rule.getMessage(data, role), // message, why
            impact: weight * (1 - scoreMultiplier),
            // Graduated sections: one step may earn only part of the gain, so the chip says "up to"
            upTo: !!rule.getScore,
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