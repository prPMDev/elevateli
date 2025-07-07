// Scoring Architecture for Section-by-Section Analysis

class ProfileScoreCalculator {
  // Section weights (when present)
  static SECTION_WEIGHTS = {
    about: 0.30,      // 30%
    experience: 0.30, // 30%
    skills: 0.20,     // 20%
    headline: 0.10,   // 10%
    education: 0.05,  // 5%
    recommendations: 0.05 // 5%
  };
  
  // Critical sections - missing these caps the score
  static CRITICAL_SECTIONS = {
    about: { required: true, maxScoreWithout: 7 },
    experience: { required: true, maxScoreWithout: 6 },
    skills: { required: false, maxScoreWithout: 9 },
    recommendations: { required: false, maxScoreWithout: 8 }
  };
  
  static calculateOverallScore(sectionScores) {
    let totalWeight = 0;
    let weightedSum = 0;
    let maxPossibleScore = 10;
    
    // Check critical sections and apply caps
    for (const [section, rules] of Object.entries(this.CRITICAL_SECTIONS)) {
      if (!sectionScores[section]?.exists) {
        maxPossibleScore = Math.min(maxPossibleScore, rules.maxScoreWithout);
      }
    }
    
    // Calculate weighted average of existing sections
    for (const [section, data] of Object.entries(sectionScores)) {
      if (data.exists && data.score !== null) {
        const weight = this.SECTION_WEIGHTS[section] || 0;
        weightedSum += data.score * weight;
        totalWeight += weight;
      }
    }
    
    // Base score from weighted average
    let baseScore = totalWeight > 0 ? (weightedSum / totalWeight) : 0;
    
    // Apply cap from missing critical sections
    const finalScore = Math.min(baseScore, maxPossibleScore);
    
    return {
      overallScore: Math.round(finalScore * 10) / 10,
      baseScore: Math.round(baseScore * 10) / 10,
      maxPossibleScore,
      sectionScores,
      missingCritical: Object.entries(this.CRITICAL_SECTIONS)
        .filter(([section, rules]) => !sectionScores[section]?.exists)
        .map(([section, rules]) => ({ section, impact: 10 - rules.maxScoreWithout }))
    };
  }
}

// Example:
// Has: Headline (9/10), Skills (8/10)
// Missing: About, Experience, Recommendations

// Base calculation: (9*0.10 + 8*0.20) / 0.30 = 8.3/10
// But missing About caps at 7, missing Experience caps at 6
// Final score: 6/10 (capped by missing Experience)

// Display: "AI Score: 6/10 ⚠️ Missing critical sections"