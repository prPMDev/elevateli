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
          if (!data || !data.exists) return "Add a professional headline";
          const headlineLimit = 220; // LinkedIn headline character limit
          const utilization = data.charCount / headlineLimit;
          if (utilization < 0.30) return `Expand headline to 70+ characters (currently ${data.charCount}/220)`;
          if (utilization < 0.50) return `Add more detail to headline (aim for 110+ characters)`;
          if (utilization < 0.75) return `Optimize headline further (165+ characters recommended)`;
          return "Headline looks good - ensure keywords are included";
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
          if (!data || !data.exists || data.charCount === 0) return "Add an About section";
          const aboutLimit = 2600; // LinkedIn about section character limit
          const utilization = data.charCount / aboutLimit;
          if (utilization < 0.20) return `About section too brief (${data.charCount}/2600) - aim for 1000+ characters`;
          if (utilization < 0.40) return `Expand About section (${data.charCount}/2600) - recruiters need more detail`;
          if (utilization < 0.60) return `Good About section - consider adding more achievements`;
          return "Excellent About section depth";
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
          
          // Recency bonus - recent roles get more weight
          let recencyScore = 0.2; // Default if has current role
          if (data.hasCurrentRole) {
            recencyScore = 0.2;
          } else if (data.recentRolesCount !== undefined && data.count > 0) {
            const recencyRatio = data.recentRolesCount / data.count;
            recencyScore = recencyRatio * 0.2;
          }
          
          const score = hasRoles + hasCurrent + contentScore + recencyScore;
          return Math.min(score, 1.0);
        },
        points: 25,
        getMessage: function(data) {
          if (!data || !data.exists || data.count === 0) return "Add your work experience";
          if (data.count === 1) return "Add more work experiences (at least 2)";
          if (!data.hasCurrentRole) return "Update with your current position";
          if (data.averageDescriptionLength !== undefined && data.averageDescriptionLength < 300) {
            return `Expand experience descriptions (avg ${Math.round(data.averageDescriptionLength)} chars) - aim for 500+ per role`;
          }
          return "Enhance experience descriptions";
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
          // Check if has recent recommendations (within 2 years)
          // Fallback to basic count check if recency data not available
          if (data.isCurrentlyEndorsed !== undefined || data.hasRecentRecommendations !== undefined) {
            return data.isCurrentlyEndorsed === true || data.hasRecentRecommendations === true;
          }
          // If no recency data, just check if has any recommendations
          return data.count >= 1;
        },
        points: 10,
        getMessage: function(data) {
          if (!data || !data.exists || data.count === 0) return "Request at least one recommendation";
          // Only show recency message if we actually have the data to check
          if ((data.isCurrentlyEndorsed === false || data.hasRecentRecommendations === false) &&
              (data.isCurrentlyEndorsed !== undefined || data.hasRecentRecommendations !== undefined)) {
            return "Request a recent recommendation (within 2 years)";
          }
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
    const startTime = Date.now();
    
    // Debug: Log what data we're starting with
    console.log('[Completeness] Starting calculation with data:', {
      sections: Object.keys(sectionData),
      aboutData: sectionData.about,
      experienceData: sectionData.experience,
      headlineData: sectionData.headline,
      skillsData: sectionData.skills
    });
    
    // Debug: Log the rules and weights
    console.log('[Completeness] Using rules and weights:', {
      hasAboutGetScore: !!this.rules.about?.getScore,
      hasExperienceGetScore: !!this.rules.experience?.getScore,
      hasHeadlineGetScore: !!this.rules.headline?.getScore,
      weights: this.weights
    });
    
    const breakdown = {};
    const recommendations = [];
    let earnedPoints = 0;
    let totalPoints = 0;
    
    // Process each section
    for (const [section, weight] of Object.entries(this.weights)) {
      const data = sectionData[section];
      const rule = this.rules[section];
      
      // Debug: Log each section processing
      console.log(`[Completeness-Loop] Processing ${section}:`, {
        hasData: !!data,
        dataValue: data,
        hasRule: !!rule,
        hasGetScore: !!rule?.getScore,
        weight
      });
      
      totalPoints += weight;
      
      if (rule && data !== undefined) {
        try {
          // Use getScore if available for graduated scoring, otherwise fall back to check
          const scoreMultiplier = rule.getScore ? rule.getScore.call(this, data) : (rule.check(data) ? 1 : 0);
          console.log(`[Completeness-Loop] ${section} scoreMultiplier:`, scoreMultiplier);
          
          const points = weight * scoreMultiplier;
          earnedPoints += points;
          const passed = scoreMultiplier >= 0.5; // Consider >= 50% as "passed"
          
          // Debug logging for problem sections
          if (section === 'about' || section === 'experience' || section === 'headline') {
            console.log(`[Completeness] ${section}:`, {
              data,
              scoreMultiplier,
              points: points.toFixed(1),
              message: scoreMultiplier < 1 ? rule.getMessage(data) : 'OK'
            });
          }
          
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
          console.error(`[Completeness-ERROR] Failed to process ${section}:`, error);
          console.error(`[Completeness-ERROR] Error message:`, error.message);
          console.error(`[Completeness-ERROR] Error stack:`, error.stack);
          console.error(`[Completeness-ERROR] Data was:`, data);
          console.error(`[Completeness-ERROR] Rule was:`, rule);
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
    
    // Debug: Log final calculation
    console.log('[Completeness] Final calculation:', {
      earnedPoints,
      totalPoints,
      percentage,
      breakdownKeys: Object.keys(breakdown),
      recommendationsCount: recommendations.length
    });
    
    Logger.info(`[ProfileCompletenessCalculator] Calculated in ${Date.now() - startTime}ms`);
    
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
   * Calculate section-specific completeness
   * @param {string} section - Section name
   * @param {Object} data - Section data
   * @returns {Object} Section score
   */
  scoreSection(section, data) {
    const weight = this.weights[section];
    const rule = this.rules[section];
    
    if (!weight || !rule) {
      return {
        score: 0,
        maxScore: 0,
        percentage: 0,
        passed: false
      };
    }
    
    const passed = rule.check(data);
    const score = passed ? weight : 0;
    
    return {
      score,
      maxScore: weight,
      percentage: passed ? 100 : 0,
      passed,
      recommendation: !passed ? rule.getMessage(data) : null
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
  
  /**
   * Generate rich feedback for a section (used when completeness < 75%)
   * NOTE: Currently unused - planned for future enhancement
   * @deprecated Consider removing if not used by v1.1.0
   * @param {string} section - Section name
   * @param {Object} data - Section data
   * @returns {Object} Rich feedback with positive and improvements
   */
  generateRichFeedback(section, data) {
    const feedback = {
      positive: '',
      improvements: []
    };
    
    // Headline feedback
    if (section === 'headline' && data) {
      const util = data.charCount / this.characterLimits.headline;
      if (util >= 0.5) {
        feedback.positive = `Good headline foundation (${data.charCount} characters)`;
      } else if (util >= 0.3) {
        feedback.positive = `Headline present (${data.charCount} characters)`;
      }
      
      if (util < 0.75) {
        feedback.improvements.push({
          action: `Expand to ${Math.round(this.characterLimits.headline * 0.75)}+ characters`,
          rationale: 'Improves search visibility'
        });
      }
    }
    
    // About section feedback
    if (section === 'about' && data) {
      const util = data.charCount / this.characterLimits.about;
      if (util >= 0.4) {
        feedback.positive = `Strong About section with ${data.charCount} characters`;
      } else if (util >= 0.2) {
        feedback.positive = `About section started (${data.charCount} characters)`;
      }
      
      if (util < 0.4) {
        feedback.improvements.push({
          action: `Expand to 1000+ characters`,
          rationale: 'Recruiters spend more time on detailed profiles'
        });
      }
      
      if (data.charCount > 0 && data.charCount < 275) {
        feedback.improvements.push({
          action: `Ensure first 275 characters capture attention`,
          rationale: 'This appears before "See More" button'
        });
      }
    }
    
    // Experience feedback  
    if (section === 'experience' && data) {
      if (data.count >= 2 && data.hasCurrentRole) {
        feedback.positive = `${data.count} experiences with current role`;
      } else if (data.count >= 1) {
        feedback.positive = `${data.count} experience${data.count > 1 ? 's' : ''} documented`;
      }
      
      if (data.averageDescriptionLength && data.averageDescriptionLength < 500) {
        feedback.improvements.push({
          action: `Expand descriptions to 500+ characters per role`,
          rationale: 'Add achievements and metrics'
        });
      }
      
      if (!data.hasCurrentRole) {
        feedback.improvements.push({
          action: `Add your current position`,
          rationale: 'Current roles weighted heavily in search'
        });
      }
    }
    
    // Skills feedback
    if (section === 'skills' && data) {
      if (data.count >= 10) {
        feedback.positive = `${data.count} skills listed`;
      } else if (data.count > 0) {
        feedback.positive = `${data.count} skills added`;
      }
      
      if (data.count < 10) {
        feedback.improvements.push({
          action: `Add ${10 - data.count} more relevant skills`,
          rationale: 'Improves keyword matching'
        });
      }
    }
    
    return feedback;
  }
  
  /**
   * Get actionable recommendations
   * @param {Object} scoringResult - Complete scoring result
   * @param {Object} settings - User settings
   * @returns {Array<Object>} Prioritized recommendations
   */
  getActionableRecommendations(scoringResult, settings = {}) {
    const { targetRole, seniorityLevel } = settings;
    const recommendations = [...scoringResult.allRecommendations];
    
    // Adjust priorities based on target role
    if (targetRole) {
      recommendations.forEach(rec => {
        // Boost skills for technical roles
        if (targetRole.includes('engineer') && rec.section === 'skills') {
          rec.priority = 'critical';
        }
        // Boost experience for senior roles
        if (seniorityLevel === 'senior' && rec.section === 'experience') {
          rec.priority = 'critical';
        }
      });
    }
    
    // Group by priority
    const grouped = {
      critical: [],
      high: [],
      medium: [],
      low: []
    };
    
    recommendations.forEach(rec => {
      grouped[rec.priority].push(rec);
    });
    
    // Return top recommendations from each priority level
    return [
      ...grouped.critical.slice(0, 2),
      ...grouped.high.slice(0, 2),
      ...grouped.medium.slice(0, 1)
    ];
  }
}