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
    
    // Section-specific rules
    this.rules = {
      photo: {
        check: (data) => data.exists || data === true,
        points: 5,
        getMessage: () => "Add a professional photo"
      },
      
      headline: {
        check: (data) => data.charCount >= 50,
        points: 10,
        getMessage: (data) => {
          if (!data.exists) return "Add a professional headline";
          if (data.charCount < 30) return "Expand your headline (minimum 50 characters)";
          if (data.isGeneric) return "Make your headline more specific and value-focused";
          return "Optimize your headline with keywords";
        }
      },
      
      about: {
  // Section weights (total = 100)
  weights: {
    photo: 5,
    headline: 10,
    about: 20,
    experience: 25,
    skills: 15,
    education: 10,
    recommendations: 10,
    certifications: 3,
    projects: 2
  },
  
  // Section-specific rules
  rules: {
    photo: {
      check: (data) => data.exists || data === true,
      points: 5,
      getMessage: () => "Add a professional photo"
    },
    
    headline: {
      check: (data) => data.charCount >= 50,
      points: 10,
      getMessage: (data) => {
        if (!data.exists) return "Add a professional headline";
        if (data.charCount < 30) return "Expand your headline (minimum 50 characters)";
        if (data.isGeneric) return "Make your headline more specific and value-focused";
        return "Optimize your headline with keywords";
      }
    },
    
    about: {
      check: (data) => data.charCount >= 800,
      points: 20,
      getMessage: (data) => {
        if (!data.exists || data.charCount === 0) return "Add an About section";
        if (data.charCount < 400) return "Expand your About section (aim for 800+ characters)";
        if (data.charCount < 800) return "Add more detail to your About section";
        return "Enhance your About section";
      }
    },
    
    experience: {
      check: (data) => data.count >= 2,
      points: 25,
      getMessage: (data) => {
        if (!data.exists || data.count === 0) return "Add your work experience";
        if (data.count === 1) return "Add more work experiences (at least 2)";
        if (!data.hasCurrentRole) return "Update with your current position";
        return "Enhance experience descriptions";
      }
    },
    
    skills: {
      check: (data) => data.count >= 15,
      points: 15,
      getMessage: (data) => {
        if (!data.exists || data.count === 0) return "Add relevant skills";
        if (data.count < 5) return "Add more skills (aim for 15+)";
        if (data.count < 15) return `Add ${15 - data.count} more skills`;
        return "Optimize your skills section";
      }
    },
    
    education: {
      check: (data) => data.count >= 1,
      points: 10,
      getMessage: (data) => {
        if (!data.exists || data.count === 0) return "Add your education";
        return "Complete your education details";
      }
    },
    
    recommendations: {
      check: (data) => data.count >= 1,
      points: 10,
      getMessage: (data) => {
        if (!data.exists || data.count === 0) return "Request at least one recommendation";
        if (data.count < 3) return "Request more recommendations (aim for 3+)";
        return "Request recent recommendations";
      }
    },
    
    certifications: {
      check: (data) => data.count >= 1,
      points: 3,
      getMessage: () => "Add relevant certifications"
    },
    
    projects: {
      check: (data) => data.count >= 1,
      points: 2,
      getMessage: () => "Showcase projects you've worked on"
    }
  },
  
  /**
   * Calculate completeness for all sections
   * @param {Object} sectionData - Data for all sections
   * @returns {Object} Complete scoring result
   */
  calculate(sectionData) {
    const startTime = Date.now();
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
        const passed = rule.check(data);
        const points = passed ? weight : 0;
        earnedPoints += points;
        
        breakdown[section] = {
          weight,
          earned: points,
          passed,
          data: this.summarizeData(data)
        };
        
        if (!passed) {
          recommendations.push({
            section,
            priority: this.getPriority(section, weight),
            message: rule.getMessage(data),
            impact: weight
          });
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
          impact: weight
        });
      }
    }
    
    // Sort recommendations by impact
    recommendations.sort((a, b) => b.impact - a.impact);
    
    const percentage = Math.round((earnedPoints / totalPoints) * 100);
    
    console.log(`[CompletenessScorer] Calculated in ${Date.now() - startTime}ms`);
    
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
  },
  
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
  },
  
  /**
   * Get priority level for a section
   * @param {string} section - Section name
   * @param {number} weight - Section weight
   * @returns {string} Priority level
   */
  getPriority(section, weight) {
    if (weight >= 20) return 'critical';
    if (weight >= 10) return 'high';
    if (weight >= 5) return 'medium';
    return 'low';
  },
  
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
  },
  
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
      hasContent: BaseExtractor.hasContent(data)
    };
  },
  
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
};