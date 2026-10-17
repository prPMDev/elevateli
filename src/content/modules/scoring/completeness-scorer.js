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
    this.rules = {
      photo: {
        check: (data) => data.exists, // throws on null (extractor error), so the catch skips the gap
        getMessage: () => "Add a professional photo"
      },
      
      headline: {
        getScore: (data) => {
          if (!data || !data.exists || !data.charCount) return 0;
          const n = data.charCount;
          return n >= 165 ? 1.0 : n >= 110 ? 0.8 : n >= 66 ? 0.5 : 0.2;
        },
        getMessage: (data) => {
          if (!data || !data.exists || !data.charCount) return "Add a professional headline";
          return `Headline is ${data.charCount} characters. 165+ gets full credit.`;
        }
      },
      
      about: {
        getScore: (data) => {
          if (!data || !data.exists || !data.charCount) return 0;
          const n = data.charCount;
          return n >= 1560 ? 1.0 : n >= 1040 ? 0.75 : n >= 520 ? 0.4 : n >= 260 ? 0.2 : 0;
        },
        getMessage: (data) => {
          if (!data || !data.exists || !data.charCount) return "Add an About section";
          return `About is ${data.charCount} characters. 1560+ gets full credit.`;
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
          if (!data?.exists) return "Add your work experience";
          if (data.count === 1) return "Add more work experiences (at least 2)";
          if (!data.hasCurrentRole) return "Update with your current position";
          const empty = data.emptyRoles || [];
          if (empty.length) {
            return `Add a description to your ${empty.slice(0, 2).join(' and ')} role${empty.length > 1 ? 's' : ''}` +
              (empty.length > 2 ? ` (+${empty.length - 2} more empty)` : '');
          }
          return `Role descriptions average ${data.averageDescriptionLength} characters. 800+ per role gets full credit. Add one measurable result to each.`;
        }
      },
      
      skills: {
        check: (data) => data && data.count >= 10,
        getMessage: (data) => {
          if (!data || !data.exists || data.count === 0) return "Add relevant skills";
          if (data.count < 5) return "Add more skills (aim for 10+)";
          if (data.count < 10) return `Add ${10 - data.count} more skills`;
          return "Optimize your skills section";
        }
      },
      
      education: {
        check: (data) => data && data.count >= 1,
        getMessage: (data) => {
          if (!data || !data.exists || data.count === 0) return "Add your education";
          return "Complete your education details";
        }
      },
      
      recommendations: {
        check: (data) => {
          if (!data || !data.exists || data.count === 0) return false;
          // A recent one (within 2 years) when dates were read, else any
          if (data.isCurrentlyEndorsed !== undefined) return data.isCurrentlyEndorsed;
          return data.count >= 1;
        },
        getMessage: (data) => {
          if (!data || !data.exists || data.count === 0) return "Request at least one recommendation";
          if (data.isCurrentlyEndorsed === false) return "Request a recent recommendation (within 2 years)";
          if (data.count < 3) return "Request more recommendations (aim for 3+)";
          return "Keep recommendations current";
        }
      },
      
      certifications: {
        check: (data) => data && data.count >= 1,
        getMessage: () => "Add relevant certifications"
      },
      
      projects: {
        check: (data) => data && data.count >= 1,
        getMessage: () => "Showcase projects you've worked on"
      }
    };
  }
  
  /**
   * Calculate completeness for all sections
   * @param {Object} sectionData - Data for all sections
   * @returns {Object} Complete scoring result
   */
  calculate(sectionData) {
    
    
    
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

        if (scoreMultiplier < 1) {
          recommendations.push({
            section,
            priority: this.getPriority(section, weight, scoreMultiplier),
            message: rule.getMessage(data),
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