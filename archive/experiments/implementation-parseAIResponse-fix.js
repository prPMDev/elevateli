// UPDATE service-worker.js parseAIResponse function (around line 1400)
// REPLACE the existing parseAIResponse function with this:

function parseAIResponse(aiText, profileData) {
  // Extract content score
  const scoreMatch = aiText.match(/CONTENT_SCORE:\s*(\d+)/i);
  const rawScore = scoreMatch ? parseInt(scoreMatch[1]) : 7;
  
  // Extract analysis sections from AI response
  const sections = {
    about: { 
      exists: !!profileData?.about?.exists, 
      score: profileData?.about?.charCount > 150 ? (rawScore * 0.9) : (rawScore * 0.5) 
    },
    experience: { 
      exists: profileData?.experience?.count > 0, 
      score: profileData?.experience?.count >= 3 ? rawScore : (rawScore * 0.7) 
    },
    skills: { 
      exists: profileData?.skills?.totalCount > 0, 
      score: profileData?.skills?.totalCount >= 5 ? rawScore : (rawScore * 0.6) 
    },
    headline: { 
      exists: !!profileData?.headline?.exists, 
      score: profileData?.headline?.charCount > 50 ? rawScore : (rawScore * 0.5) 
    },
    education: { 
      exists: profileData?.education?.count > 0, 
      score: profileData?.education?.count > 0 ? rawScore : 0 
    },
    recommendations: { 
      exists: profileData?.recommendations?.count > 0, 
      score: profileData?.recommendations?.count >= 2 ? rawScore : (rawScore * 0.3) 
    }
  };
  
  // Calculate weighted score using ProfileScoreCalculator
  const scoreResult = ProfileScoreCalculator.calculateOverallScore(sections);
  
  // Extract analysis text
  const analysisMatch = aiText.match(/ANALYSIS:\s*([\s\S]+)/i);
  let summary = analysisMatch ? analysisMatch[1].trim() : aiText;
  
  // Add warning about missing critical sections
  if (scoreResult.missingCritical.length > 0) {
    const capWarning = `\n\n⚠️ **Score Impact**: Missing ${scoreResult.missingCritical.map(m => m.section).join(', ')} caps your score at ${scoreResult.maxPossibleScore}/10.`;
    summary = summary.replace(/\*\*Summary\*\*/, '**Summary**' + capWarning);
  }
  
  return {
    contentScore: scoreResult.overallScore,
    summary: summary,
    scoreDetails: scoreResult,
    rawScore: rawScore
  };
}

// ALSO UPDATE the two places that call parseAIResponse to pass profileData:
// 1. In analyzeWithOpenAI: 
//    const { contentScore, summary } = parseAIResponse(responseText, profileData);
// 2. In analyzeWithAnthropic:
//    const { contentScore, summary } = parseAIResponse(responseText, profileData);
