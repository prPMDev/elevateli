/**
 * Completeness Scorer Module for ElevateLI
 * Calculates profile completeness score based on section data
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
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
    
    // LinkedIn character limits (2025)
    this.characterLimits = {
      headline: 220,
      about: 2600,
      experienceDescription: 2000
    };
    
    // Content depth thresholds
    this.contentDepthThresholds = {
      headline: {
        excellent: 0.75,  // 165+ chars
        good: 0.50,       // 110+ chars
        minimum: 0.30     // 66+ chars
      },
      about: {
        excellent: 0.60,  // 1560+ chars
        good: 0.40,       // 1040+ chars
        minimum: 0.20     // 520+ chars
      },
      experienceDescription: {
        excellent: 0.40,  // 800+ chars
        good: 0.25,       // 500+ chars
        minimum: 0.15     // 300+ chars
      }
    };
    
    // Section-specific rules
    this.rules = {
      photo: {
        check: (data) => data.exists || data === true,
        points: 5,
        getMessage: () => "Add a professional photo"
      },
      
      headline: {
        check: (data) => data && data.charCount >= 50,
        getScore: function(data) {
          if (!data || !data.exists || !data.charCount) return 0;
          const utilization = data.charCount / this.characterLimits.headline;
          
          if (utilization >= this.contentDepthThresholds.headline.excellent) return 1.0;
          if (utilization >= this.contentDepthThresholds.headline.good) return 0.8;
          if (utilization >= this.contentDepthThresholds.headline.minimum) return 0.5;
          return 0.2;
        },
        points: 10,
        getMessage: function(data) {
          if (!data || !data.exists || !data.charCount) return "Add a professional headline";
          const full = Math.round(this.characterLimits.headline * this.contentDepthThresholds.headline.excellent);
          return `Headline is ${data.charCount} characters. ${full}+ gets full credit.`;
        }
      },
      
      about: {
        check: (data) => {
          // Must have actual content, not just the section existing
          return data && data.exists && data.charCount >= 800;
        },
        getScore: function(data) {
          if (!data || !data.exists || !data.charCount) return 0;
          const utilization = data.charCount / this.characterLimits.about;
          
          if (utilization >= this.contentDepthThresholds.about.excellent) return 1.0;
          if (utilization >= this.contentDepthThresholds.about.good) return 0.75;
          if (utilization >= this.contentDepthThresholds.about.minimum) return 0.4;
          if (utilization >= 0.1) return 0.2;
          return 0;
        },
        points: 20,
        getMessage: function(data) {
          if (!data || !data.exists || !data.charCount) return "Add an About section";
          const full = Math.round(this.characterLimits.about * this.contentDepthThresholds.about.excellent);
          return `About is ${data.charCount} characters. ${full}+ gets full credit.`;
        }
      },
      
      experience: {
        check: (data) => {
          if (!data || !data.exists || data.count === 0) return false;
          if (data.count < 2) return false;
          if (!data.hasCurrentRole) return false;
          // Check average description length (aim for 150+ chars per role)
          // Only check if we have the data
          if (data.averageDescriptionLength !== undefined) {
            return data.averageDescriptionLength >= 150;
          }
          // Fallback - if we have 2+ roles and current role, consider it complete
          return true;
        },
        getScore: function(data) {
          if (!data || !data.exists || data.count === 0) return 0;
          
          // Base scoring components
          const hasRoles = data.count >= 2 ? 0.3 : (data.count === 1 ? 0.15 : 0);
          const hasCurrent = data.hasCurrentRole ? 0.2 : 0;
          
          // Content depth scoring
          let contentScore = 0;
          if (data.averageDescriptionLength !== undefined) {
            const avgUtilization = data.averageDescriptionLength / this.characterLimits.experienceDescription;
            if (avgUtilization >= this.contentDepthThresholds.experienceDescription.excellent) {
              contentScore = 0.3;
            } else if (avgUtilization >= this.contentDepthThresholds.experienceDescription.good) {
              contentScore = 0.2;
            } else if (avgUtilization >= this.contentDepthThresholds.experienceDescription.minimum) {
              contentScore = 0.1;
            }
          }
          
          // Recency bonus - only for a current role
          const recencyScore = data.hasCurrentRole ? 0.2 : 0;
          
          const score = hasRoles + hasCurrent + contentScore + recencyScore;
          return Math.min(score, 1.0);
        },
        points: 25,
        getMessage: function(data) {
          if (!data || !data.exists || data.count === 0) return "Add your work experience";
          if (data.count === 1) return "Add more work experiences (at least 2)";
          if (!data.hasCurrentRole) return "Update with your current position";
          const empty = data.emptyRoles || [];
          if (empty.length) {
            return `Add a description to your ${empty.slice(0, 2).join(' and ')} role${empty.length > 1 ? 's' : ''}` +
              (empty.length > 2 ? ` (+${empty.length - 2} more empty)` : '');
          }
          const full = Math.round(this.characterLimits.experienceDescription * this.contentDepthThresholds.experienceDescription.excellent);
          return `Role descriptions average ${data.averageDescriptionLength} characters. ${full}+ per role gets full credit. Add one measurable result to each.`;
        }
      },
      
      skills: {
        check: (data) => data && data.count >= 10,
        points: 15,
        getMessage: function(data) {
          if (!data || !data.exists || data.count === 0) return "Add relevant skills";
          if (data.count < 5) return "Add more skills (aim for 10+)";
          if (data.count < 10) return `Add ${10 - data.count} more skills`;
          return "Optimize your skills section";
        }
      },
      
      education: {
        check: (data) => data && data.count >= 1,
        points: 10,
        getMessage: function(data) {
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
        points: 10,
        getMessage: function(data) {
          if (!data || !data.exists || data.count === 0) return "Request at least one recommendation";
          if (data.isCurrentlyEndorsed === false) return "Request a recent recommendation (within 2 years)";
          if (data.count < 3) return "Request more recommendations (aim for 3+)";
          return "Keep recommendations current";
        }
      },
      
      certifications: {
        check: (data) => data && data.count >= 1,
        points: 3,
        getMessage: () => "Add relevant certifications"
      },
      
      projects: {
        check: (data) => data && data.count >= 1,
        points: 2,
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
    
    // Process each section
    for (const [section, weight] of Object.entries(this.weights)) {
      const data = sectionData[section];
      const rule = this.rules[section];
      
      
      totalPoints += weight;
      
      if (rule && data !== undefined) {
        try {
          // Use getScore if available for graduated scoring, otherwise fall back to check
          const scoreMultiplier = rule.getScore ? rule.getScore.call(this, data) : (rule.check(data) ? 1 : 0);
          
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
              message: rule.getMessage.call(this, data),
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
      } else {
        // Section not found or no rule
        breakdown[section] = {
          weight,
          earned: 0,
          passed: false,
          data: null
        };
        
        recommendations.push({
          section,
          priority: 'high',
          message: `Add ${section} section`,
          impact: weight,
          weight: weight
        });
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