// Add this to service-worker.js after the RateLimiter class

class ProfileScoreCalculator {
  static SECTION_WEIGHTS = {
    about: 0.30,
    experience: 0.30,
    skills: 0.20,
    headline: 0.10,
    education: 0.05,
    recommendations: 0.05
  };
  
  static CRITICAL_SECTIONS = {
    about: { required: true, maxScoreWithout: 7 },
    experience: { required: true, maxScoreWithout: 6 },
    skills: { required: false, maxScoreWithout: 9 },
    recommendations: { required: false, maxScoreWithout: 8 }
  };
  
  static calculateOverallScore(aiAnalysis) {
    // Extract section scores from AI response
    const sectionScores = {
      about: { exists: !!aiAnalysis.sections?.about, score: aiAnalysis.sections?.about?.score || 0 },
      experience: { exists: !!aiAnalysis.sections?.experience, score: aiAnalysis.sections?.experience?.score || 0 },
      skills: { exists: !!aiAnalysis.sections?.skills, score: aiAnalysis.sections?.skills?.score || 0 },
      headline: { exists: !!aiAnalysis.sections?.headline, score: aiAnalysis.sections?.headline?.score || 0 },
      education: { exists: !!aiAnalysis.sections?.education, score: aiAnalysis.sections?.education?.score || 0 },
      recommendations: { exists: !!aiAnalysis.sections?.recommendations, score: aiAnalysis.sections?.recommendations?.score || 0 }
    };
    
    let totalWeight = 0;
    let weightedSum = 0;
    let maxPossibleScore = 10;
    
    // Check critical sections and apply caps
    for (const [section, rules] of Object.entries(this.CRITICAL_SECTIONS)) {
      if (!sectionScores[section].exists) {
        maxPossibleScore = Math.min(maxPossibleScore, rules.maxScoreWithout);
      }
    }
    
    // Calculate weighted average of existing sections
    for (const [section, data] of Object.entries(sectionScores)) {
      if (data.exists && data.score > 0) {
        const weight = this.SECTION_WEIGHTS[section] || 0;
        weightedSum += data.score * weight;
        totalWeight += weight;
      }
    }
    
    // Normalize weights to account for missing sections
    const baseScore = totalWeight > 0 ? (weightedSum / totalWeight) : 0;
    const finalScore = Math.min(baseScore, maxPossibleScore);
    
    return {
      overallScore: Math.round(finalScore * 10) / 10,
      baseScore: Math.round(baseScore * 10) / 10,
      maxPossibleScore,
      sectionScores,
      missingCritical: Object.entries(this.CRITICAL_SECTIONS)
        .filter(([section]) => !sectionScores[section].exists)
        .map(([section, rules]) => ({ 
          section, 
          impact: 10 - rules.maxScoreWithout,
          message: `Missing ${section} caps score at ${rules.maxScoreWithout}/10`
        }))
    };
  }
}

// Update the AI analysis processing (around line 800-900)
// Replace the simple score extraction with:

async function processAIResponse(parsedData, profileData) {
  const sections = {};
  
  // Extract section-specific insights if available
  if (parsedData.sections) {
    for (const [section, data] of Object.entries(parsedData.sections)) {
      sections[section] = {
        score: data.score || 0,
        insights: data.insights || []
      };
    }
  }
  
  // Calculate weighted overall score
  const scoreResult = ProfileScoreCalculator.calculateOverallScore({
    sections,
    score: parsedData.score // fallback
  });
  
  return {
    ...parsedData,
    score: scoreResult.overallScore,
    scoreDetails: scoreResult,
    sections,
    recommendations: parsedData.recommendations || []
  };
}
