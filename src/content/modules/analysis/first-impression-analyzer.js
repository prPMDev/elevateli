/**
 * First Impression Analyzer Module for ElevateLI
 * Handles unified analysis of all first impression elements (headline, photo, banner, etc.)
 * [CRITICAL_PATH:FIRST_IMPRESSION_CORE] - P0: Unified first impression analysis
 */

const FirstImpressionAnalyzer = {
  // Configuration for all first impression elements
  elements: {
    headline: { 
      weight: 0.4, 
      required: true,
      extractor: 'headline',
      aiHandler: 'createHeadlinePrompt',
      description: 'Professional headline text'
    },
    photo: { 
      weight: 0.3, 
      required: false, 
      extractor: 'photo',
      description: 'Profile photo existence'
    },
    banner: { 
      weight: 0.2, 
      required: false, 
      extractor: 'banner',
      description: 'Background banner customization'
    },
    openToWork: { 
      weight: 0.1, 
      required: false,
      extractor: 'metadata',
      impact: 'Increases recruiter reach by 40%',
      description: 'Open to work badge visibility'
    }
  },
  
  /**
   * Build unified data package for first impression analysis
   * [CRITICAL_PATH:FIRST_IMPRESSION_DATA] - P0: Must include all visual elements
   */
  buildFirstImpressionData(extractedData) {
    const data = {
      headline: extractedData.headline?.text || '',
      headlineCharCount: extractedData.headline?.charCount || 0,
      photo: {
        exists: extractedData.photo?.exists || false,
        hasPhoto: extractedData.photo?.exists || false
      },
      banner: {
        exists: extractedData.banner?.exists || false,
        isCustomBanner: extractedData.banner?.isCustomBanner || false
      },
      metadata: {
        openToWork: extractedData.openToWork?.enabled || false,
        openToWorkDetails: extractedData.openToWork?.details || null,
        creatorMode: extractedData.creatorMode?.enabled || false,
        connectionCount: extractedData.connections?.count || 0,
        verified: extractedData.verified || false
      }
    };
    
    return data;
  },
  
  /**
   * Calculate unified score from individual element scores
   * [CRITICAL_PATH:UNIFIED_SCORING] - P0: Must properly weight all elements
   */
  calculateUnifiedScore(elementScores) {
    let totalWeight = 0;
    let weightedSum = 0;
    const scoreDetails = [];
    
    Object.entries(elementScores).forEach(([element, score]) => {
      if (score !== null && score !== undefined && this.elements[element]) {
        const config = this.elements[element];
        const weight = config.weight;
        
        weightedSum += score * weight;
        totalWeight += weight;
        
        scoreDetails.push({
          element,
          score,
          weight,
          contribution: score * weight
        });
      }
    });
    
    const finalScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;
    
    return finalScore;
  },
  
  /**
   * Generate collated summary message based on scores
   */
  generateSummary(elementScores, improvements) {
    const hasPhoto = elementScores.photo !== null && elementScores.photo !== undefined;
    const hasCustomBanner = elementScores.banner !== null && elementScores.banner !== undefined;
    const headlineScore = elementScores.headline || 0;
    const photoScore = elementScores.photo || 0;
    
    // Calculate average of available elements
    const scores = Object.values(elementScores).filter(s => s !== null && s !== undefined);
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    
    // Generate appropriate summary based on scores
    if (avgScore >= 8) {
      if (hasPhoto && hasCustomBanner) {
        return "Excellent first impression with professional headline, photo, and custom banner.";
      } else if (hasPhoto) {
        return "Strong professional presence with excellent headline and photo.";
      } else {
        return "Excellent headline that makes a strong first impression.";
      }
    } else if (avgScore >= 6) {
      if (hasPhoto && photoScore >= 4) {
        return "Good headline and photo with room for improvement.";
      } else if (hasPhoto) {
        return "Decent first impression but photo and headline need work.";
      } else {
        return "Good headline but missing profile photo limits your visibility.";
      }
    } else if (avgScore >= 4) {
      if (!hasPhoto) {
        return "Headline needs work and profile photo is missing.";
      } else {
        return "First impression needs significant improvement across headline and visuals.";
      }
    } else {
      return "Weak first impression - urgent improvements needed for headline and visuals.";
    }
  },
  
  /**
   * Merge improvements from different elements into unified list
   */
  mergeImprovements(elementResults) {
    const improvements = [];
    
    // Process each element's improvements
    Object.entries(elementResults).forEach(([element, result]) => {
      if (result && result.improvements) {
        result.improvements.forEach(imp => {
          improvements.push({
            ...imp,
            source: element,
            sourceLabel: this.elements[element]?.description || element
          });
        });
      }
    });
    
    // Sort by priority and limit
    improvements.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
    });
    
    return improvements.slice(0, 5); // Max 5 improvements
  },
  
  /**
   * Check if an element should be analyzed
   */
  shouldAnalyzeElement(element, data, hasVisionAI) {
    const config = this.elements[element];
    
    if (!config) return false;
    
    // Vision AI no longer used
    
    // Check if element exists
    switch (element) {
      case 'headline':
        return !!data.headline;
      case 'photo':
        return data.photo?.exists || !data.photo?.exists; // Analyze if missing too
      case 'banner':
        return data.banner?.isCustomBanner; // Only analyze custom banners
      case 'openToWork':
        return true; // Always check this metadata
      default:
        return false;
    }
  },
  
  /**
   * Get missing elements that impact first impression
   */
  getMissingElements(data) {
    const missing = [];
    
    if (!data.photo?.exists) {
      missing.push({
        element: 'photo',
        message: 'Add a professional photo',
        impact: 'Profiles with photos get 21x more views',
        priority: 'high'
      });
    }
    
    if (!data.banner?.isCustomBanner) {
      missing.push({
        element: 'banner',
        message: 'Add a custom background banner',
        impact: 'Showcase your brand and stand out',
        priority: 'medium'
      });
    }
    
    if (!data.metadata?.openToWork && data.metadata?.openToWork !== undefined) {
      missing.push({
        element: 'openToWork',
        message: 'Consider enabling "Open to Work" badge',
        impact: 'Increases recruiter visibility by 40%',
        priority: 'medium'
      });
    }
    
    return missing;
  }
};

// Export for use in analyzer
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FirstImpressionAnalyzer;
}