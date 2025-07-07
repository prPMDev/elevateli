/**
 * Quality Scorer Module for ElevateLI
 * Prepares data for AI analysis and processes AI responses
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const QualityScorer = {
  // Section weights for final score calculation
  weights: {
    photo: 0.05,      // 5%
    headline: 0.10,   // 10%
    about: 0.30,      // 30%
    experience: 0.30, // 30%
    skills: 0.15,     // 15%
    education: 0.05,  // 5%
    other: 0.05       // 5% (recommendations, certifications, projects)
  },
  
  /**
   * Prepare profile data for AI analysis
   * @param {Object} profileData - Extracted profile data
   * @param {Object} settings - User settings
   * @param {Object} completenessResult - Completeness scoring result
   * @returns {Object} Prepared data for AI
   */
  prepareForAI(profileData, settings, completenessResult) {
    Logger.info('[QualityScorer] Preparing data for AI analysis');
    
    const prepared = {
      // Meta information
      targetRole: settings.targetRole || 'general professional',
      seniorityLevel: settings.seniorityLevel || 'mid-level',
      customInstructions: settings.customInstructions || '',
      
      // Profile sections
      sections: {},
      
      // Completeness context
      completenessScore: completenessResult.score,
      missingElements: completenessResult.recommendations.map(r => r.message),
      
      // Analysis instructions
      analysisType: settings.batchAnalysis ? 'batch' : 'individual'
    };
    
    // Prepare each section
    if (profileData.headline) {
      prepared.sections.headline = this.prepareHeadline(profileData.headline);
    }
    
    if (profileData.about) {
      prepared.sections.about = this.prepareAbout(profileData.about);
    }
    
    if (profileData.experience) {
      prepared.sections.experience = this.prepareExperience(profileData.experience);
    }
    
    if (profileData.skills) {
      prepared.sections.skills = this.prepareSkills(profileData.skills);
    }
    
    if (profileData.education) {
      prepared.sections.education = this.prepareEducation(profileData.education);
    }
    
    // Other sections (lower weight)
    prepared.sections.other = this.prepareOtherSections(profileData);
    
    Logger.debug('[QualityScorer] Prepared sections:', Object.keys(prepared.sections));
    
    return prepared;
  },
  
  /**
   * Prepare headline section
   * @param {Object} headline - Headline data
   * @returns {Object} Prepared headline
   */
  prepareHeadline(headline) {
    return {
      text: headline.text || '',
      charCount: headline.charCount || 0,
      hasKeywords: headline.hasKeywords || false,
      isGeneric: headline.isGeneric || false,
      analysis: {
        wordCount: headline.wordCount || 0,
        hasPipe: headline.hasPipe || false,
        hasCompany: headline.hasCompany || false,
        hasValue: headline.hasValue || false
      }
    };
  },
  
  /**
   * Prepare about section
   * @param {Object} about - About data
   * @returns {Object} Prepared about
   */
  prepareAbout(about) {
    return {
      text: about.text || '',
      charCount: about.charCount || 0,
      wordCount: about.wordCount || 0,
      paragraphs: about.paragraphs || [],
      analysis: {
        hasCallToAction: about.hasCallToAction || false,
        keywords: (about.keywords || []).slice(0, 10),
        sentiment: about.sentiment || 'neutral',
        readabilityScore: about.readabilityScore || 0
      }
    };
  },
  
  /**
   * Prepare experience section
   * @param {Object} experience - Experience data
   * @returns {Object} Prepared experience
   */
  prepareExperience(experience) {
    const experiences = experience.experiences || experience.experienceChunks || [];
    
    return {
      count: experience.count || 0,
      hasCurrentRole: experience.hasCurrentRole || false,
      totalMonths: experience.totalMonths || 0,
      experiences: experiences.slice(0, 5).map(exp => ({
        title: exp.title || '',
        company: exp.company || '',
        duration: exp.duration || '',
        description: this.truncateText(exp.description || '', 300),
        hasQuantifiedAchievements: exp.hasQuantifiedAchievements || false,
        hasTechStack: exp.hasTechStack || false
      })),
      analysis: {
        averageTenure: experience.averageTenure || 0,
        careerProgression: experience.careerProgression || 'unknown',
        hasQuantifiedAchievements: experience.hasQuantifiedAchievements || false
      }
    };
  },
  
  /**
   * Prepare skills section
   * @param {Object} skills - Skills data
   * @returns {Object} Prepared skills
   */
  prepareSkills(skills) {
    return {
      count: skills.count || 0,
      topSkills: (skills.skills || []).slice(0, 20).map(s => ({
        name: s.name,
        endorsed: s.endorsementCount > 0
      })),
      analysis: {
        hasEndorsements: skills.hasEndorsements || false,
        technicalCount: skills.technicalSkills?.length || 0,
        softSkillsCount: skills.softSkills?.length || 0,
        categories: Object.keys(skills.skillsByCategory || {})
      }
    };
  },
  
  /**
   * Prepare education section
   * @param {Object} education - Education data
   * @returns {Object} Prepared education
   */
  prepareEducation(education) {
    return {
      count: education.count || 0,
      highestDegree: education.highestDegree || 'none',
      schools: (education.schools || []).slice(0, 3).map(school => ({
        name: school.school || school.name || '',
        degree: school.degree || '',
        field: school.field || ''
      }))
    };
  },
  
  /**
   * Prepare other sections
   * @param {Object} profileData - All profile data
   * @returns {Object} Other sections summary
   */
  prepareOtherSections(profileData) {
    const other = {
      hasRecommendations: false,
      recommendationCount: 0,
      hasCertifications: false,
      certificationCount: 0,
      hasProjects: false,
      projectCount: 0,
      hasFeatured: false
    };
    
    if (profileData.recommendations?.exists) {
      other.hasRecommendations = profileData.recommendations.count > 0;
      other.recommendationCount = profileData.recommendations.receivedCount || 0;
    }
    
    if (profileData.certifications?.exists) {
      other.hasCertifications = profileData.certifications.count > 0;
      other.certificationCount = profileData.certifications.count || 0;
    }
    
    if (profileData.projects?.exists) {
      other.hasProjects = profileData.projects.count > 0;
      other.projectCount = profileData.projects.count || 0;
    }
    
    if (profileData.featured?.exists) {
      other.hasFeatured = profileData.featured.hasContent || false;
    }
    
    return other;
  },
  
  /**
   * Process AI response into structured scoring
   * @param {Object} aiResponse - Response from AI
   * @param {Object} profileData - Original profile data
   * @returns {Object} Processed scores and recommendations
   */
  processAIResponse(aiResponse, profileData) {
    Logger.info('[QualityScorer] Processing AI response');
    
    try {
      // Parse section scores
      const sectionScores = this.parseSectionScores(aiResponse.sectionScores || {});
      
      // Calculate weighted overall score
      const overallScore = this.calculateOverallScore(sectionScores);
      
      // Parse recommendations
      const recommendations = this.parseRecommendations(aiResponse.recommendations || {});
      
      // Parse insights
      const insights = this.parseInsights(aiResponse.insights || {});
      
      // Determine score cap based on missing sections
      const scoreCap = this.determineScoreCap(profileData);
      
      // Apply score cap if necessary
      const finalScore = Math.min(overallScore, scoreCap);
      
      Logger.debug('[QualityScorer] Calculated scores:', {
        raw: overallScore,
        capped: finalScore,
        cap: scoreCap
      });
      
      return {
        contentScore: finalScore,
        sectionScores: sectionScores,
        recommendations: recommendations,
        insights: insights,
        scoreCap: scoreCap,
        analysis: {
          strengths: this.identifyStrengths(sectionScores),
          weaknesses: this.identifyWeaknesses(sectionScores),
          priority: this.prioritizeImprovements(sectionScores, profileData)
        }
      };
      
    } catch (error) {
      Logger.error('[QualityScorer] Error processing AI response:', error);
      
      return {
        contentScore: 5.0,
        error: 'Failed to process AI response',
        sectionScores: {},
        recommendations: {
          critical: ['Unable to analyze profile quality. Please try again.']
        }
      };
    }
  },
  
  /**
   * Parse section scores from AI response
   * @param {Object} scores - Raw section scores
   * @returns {Object} Normalized scores
   */
  parseSectionScores(scores) {
    const normalized = {};
    
    Object.entries(scores).forEach(([section, score]) => {
      // Ensure score is between 0 and 10
      normalized[section] = Math.max(0, Math.min(10, parseFloat(score) || 0));
    });
    
    return normalized;
  },
  
  /**
   * Calculate weighted overall score
   * @param {Object} sectionScores - Section scores
   * @returns {number} Overall score
   */
  calculateOverallScore(sectionScores) {
    let totalScore = 0;
    let totalWeight = 0;
    
    Object.entries(this.weights).forEach(([section, weight]) => {
      const score = sectionScores[section];
      if (score !== undefined) {
        totalScore += score * weight;
        totalWeight += weight;
      }
    });
    
    // Normalize if not all sections were scored
    if (totalWeight > 0 && totalWeight < 1) {
      totalScore = totalScore / totalWeight;
    }
    
    return Math.round(totalScore * 10) / 10; // Round to 1 decimal
  },
  
  /**
   * Determine score cap based on missing critical sections
   * @param {Object} profileData - Profile data
   * @returns {number} Maximum possible score
   */
  determineScoreCap(profileData) {
    let cap = 10;
    
    // Critical sections that cap the score when missing
    if (!profileData.about?.exists || profileData.about?.charCount < 100) {
      cap = Math.min(cap, 7); // No meaningful About = max 7/10
    }
    
    if (!profileData.experience?.exists || profileData.experience?.count === 0) {
      cap = Math.min(cap, 6); // No experience = max 6/10
    }
    
    if (!profileData.skills?.exists || profileData.skills?.count < 5) {
      cap = Math.min(cap, 8); // Few skills = max 8/10
    }
    
    if (!profileData.headline?.exists || profileData.headline?.charCount < 30) {
      cap = Math.min(cap, 8); // Poor headline = max 8/10
    }
    
    return cap;
  },
  
  /**
   * Parse recommendations from AI response
   * @param {Object} recommendations - Raw recommendations
   * @returns {Object} Structured recommendations
   */
  parseRecommendations(recommendations) {
    const structured = {
      critical: [],
      high: [],
      medium: [],
      low: []
    };
    
    // Handle different recommendation formats
    if (Array.isArray(recommendations)) {
      structured.high = recommendations.slice(0, 5);
    } else if (typeof recommendations === 'object') {
      Object.entries(recommendations).forEach(([priority, items]) => {
        if (structured[priority] && Array.isArray(items)) {
          structured[priority] = items;
        }
      });
    }
    
    return structured;
  },
  
  /**
   * Parse insights from AI response
   * @param {Object} insights - Raw insights
   * @returns {Object} Structured insights
   */
  parseInsights(insights) {
    return {
      strengths: insights.strengths || '',
      improvements: insights.improvements || '',
      industryAlignment: insights.industryAlignment || '',
      overallAssessment: insights.overallAssessment || ''
    };
  },
  
  /**
   * Identify profile strengths
   * @param {Object} sectionScores - Section scores
   * @returns {Array<string>} Strengths
   */
  identifyStrengths(sectionScores) {
    const strengths = [];
    
    Object.entries(sectionScores).forEach(([section, score]) => {
      if (score >= 8) {
        strengths.push(`Strong ${section} section (${score}/10)`);
      }
    });
    
    return strengths;
  },
  
  /**
   * Identify profile weaknesses
   * @param {Object} sectionScores - Section scores
   * @returns {Array<string>} Weaknesses
   */
  identifyWeaknesses(sectionScores) {
    const weaknesses = [];
    
    Object.entries(sectionScores).forEach(([section, score]) => {
      if (score < 6) {
        weaknesses.push(`Weak ${section} section (${score}/10)`);
      }
    });
    
    return weaknesses;
  },
  
  /**
   * Prioritize improvements based on scores and weights
   * @param {Object} sectionScores - Section scores
   * @param {Object} profileData - Profile data
   * @returns {Array<Object>} Prioritized improvements
   */
  prioritizeImprovements(sectionScores, profileData) {
    const improvements = [];
    
    Object.entries(this.weights).forEach(([section, weight]) => {
      const score = sectionScores[section] || 0;
      const potentialGain = (10 - score) * weight;
      
      if (score < 8) {
        improvements.push({
          section,
          currentScore: score,
          weight,
          potentialGain,
          priority: potentialGain > 1 ? 'high' : potentialGain > 0.5 ? 'medium' : 'low'
        });
      }
    });
    
    // Sort by potential gain
    improvements.sort((a, b) => b.potentialGain - a.potentialGain);
    
    return improvements;
  },
  
  /**
   * Truncate text to specified length
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length
   * @returns {string} Truncated text
   */
  truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  },
  
  /**
   * Generate prompt for AI analysis
   * @param {Object} preparedData - Prepared profile data
   * @param {string} analysisType - Type of analysis
   * @returns {string} AI prompt
   */
  generatePrompt(preparedData, analysisType = 'comprehensive') {
    const prompts = {
      comprehensive: `Analyze this LinkedIn profile for a ${preparedData.targetRole} at ${preparedData.seniorityLevel} level. 
        Score each section from 0-10 based on clarity, impact, and relevance to the target role.
        Current completeness: ${preparedData.completenessScore}%.
        Missing elements: ${preparedData.missingElements.join(', ')}.
        
        Provide:
        1. Section scores (0-10) for: headline, about, experience, skills, education, other
        2. Critical recommendations (top 3 most impactful improvements)
        3. High priority recommendations (next 3-5 improvements)
        4. Brief insights on strengths and areas for improvement
        
        ${preparedData.customInstructions}`,
      
      quick: `Quick quality check for LinkedIn profile (${preparedData.targetRole}). 
        Rate overall content quality 0-10 and provide top 3 improvements.`,
      
      section: `Analyze this specific LinkedIn section and rate 0-10 for quality and impact.`
    };
    
    return prompts[analysisType] || prompts.comprehensive;
  }
};