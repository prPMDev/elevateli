/**
 * ElevateLI Analyzer Base
 * Main orchestrator for LinkedIn profile analysis
 * Expects these modules to be available: Logger, CacheManager, OverlayManager, extractors, scorers
 */

// Note: Constants SELECTORS, TIMINGS, ExtensionState are assumed to be already defined
// from previously loaded modules in the concatenated analyzer.js

/* ============================================
 * ANALYZER CLASS
 * ============================================ */
class Analyzer {
  constructor() {
    // Available extractors (will be defined in separate files)
    this.extractors = {
      photo: typeof PhotoExtractor !== 'undefined' ? PhotoExtractor : null,
      headline: typeof HeadlineExtractor !== 'undefined' ? HeadlineExtractor : null,
      about: typeof AboutExtractor !== 'undefined' ? AboutExtractor : null,
      experience: typeof ExperienceExtractor !== 'undefined' ? ExperienceExtractor : null,
      skills: typeof SkillsExtractor !== 'undefined' ? SkillsExtractor : null,
      education: typeof EducationExtractor !== 'undefined' ? EducationExtractor : null,
      recommendations: typeof RecommendationsExtractor !== 'undefined' ? RecommendationsExtractor : null,
      certifications: typeof CertificationsExtractor !== 'undefined' ? CertificationsExtractor : null,
      projects: typeof ProjectsExtractor !== 'undefined' ? ProjectsExtractor : null,
      featured: typeof FeaturedExtractor !== 'undefined' ? FeaturedExtractor : null
    };
    
    this.profileId = null;
    this.isOwn = false;
    this.settings = {};
    this.cacheManager = null;
  }
  
  /**
   * Initialize the analyzer
   * @param {string} profileId - LinkedIn profile ID
   * @param {boolean} isOwn - Whether this is the user's own profile
   * @param {Object} settings - Extension settings
   */
  async init(profileId, isOwn, settings) {
    this.profileId = profileId;
    this.isOwn = isOwn;
    this.settings = settings;
    
    // Initialize cache manager with no expiration
    this.cacheManager = new CacheManager(null);
    
    // Log initialization settings for debugging
    Logger.info('[Analyzer] Initialized with settings:', {
      profileId: this.profileId,
      isOwn: this.isOwn,
      enableAI: this.settings.enableAI,
      hasApiKey: !!(this.settings.apiKey || this.settings.encryptedApiKey),
      aiProvider: this.settings.aiProvider,
      settingsKeys: Object.keys(this.settings)
    });
    
    // Log extractor status
    Logger.info('[Analyzer] Extractor load status:', {
      loaded: Object.keys(this.extractors).filter(key => this.extractors[key] !== null),
      missing: Object.keys(this.extractors).filter(key => this.extractors[key] === null),
      total: Object.keys(this.extractors).length
    });
  }
  
  /**
   * Run the analysis
   * @param {boolean} forceRefresh - Force refresh even if cached
   */
  async analyze(forceRefresh = false) {
    // Development mode configuration
    const TIMEOUTS = {
      ANALYSIS_TOTAL: 300000,  // 5 minutes timeout
      SECTION_TIMEOUT: 60000,  // 60 seconds per section
      SYNTHESIS_TIMEOUT: 60000, // 60 seconds for synthesis
      DEVELOPMENT_MODE: true   // Enable extended timeouts
    };
    
    // Log timeout configuration
    Logger.info('[Analyzer] Timeout configuration:', TIMEOUTS);
    
    // Set analysis timeout (3 minutes for development)
    const analysisStartTime = Date.now();
    const analysisTimeout = setTimeout(() => {
      const elapsed = Math.round((Date.now() - analysisStartTime) / 1000);
      Logger.warn(`[Analyzer] Analysis timeout after ${elapsed} seconds - falling back to cache`);
      this.handleAnalysisTimeout();
    }, TIMEOUTS.ANALYSIS_TOTAL);
    
    // Store cached data for fallback (moved outside try block for catch block access)
    let cachedData = null;
    
    try {
      Logger.info('[Analyzer] Starting analysis', { 
        profileId: this.profileId, 
        isOwn: this.isOwn,
        forceRefresh,
        settings: {
          enableAI: this.settings.enableAI,
          hasApiKey: !!(this.settings.apiKey || this.settings.encryptedApiKey),
          aiProvider: this.settings.aiProvider
        },
        timestamp: new Date().toISOString()
      });
      
      // Update overlay state
      OverlayManager.setState(OverlayManager.states.SCANNING);
      
      // Check cache first (unless forced refresh)
      if (!forceRefresh) {
        cachedData = await this.cacheManager.get(this.profileId);
        if (cachedData && cachedData.completeness !== undefined) {
          Logger.info('[Analyzer] Using cached data');
          
          clearTimeout(analysisTimeout);
          OverlayManager.setState(OverlayManager.states.CACHE_LOADED, {
            ...cachedData,
            fromCache: true,
            // Only mark AI as disabled if there's no content score
            aiDisabled: cachedData.contentScore === undefined || cachedData.contentScore === null
          });
          
          return { success: true, fromCache: true, data: cachedData };
        }
      } else {
        // Even on force refresh, get cached data for fallback
        cachedData = await this.cacheManager.get(this.profileId);
      }
      
      // Run extractors
      const extractedData = await this.runExtractors();
      
      // Calculate completeness
      Logger.info('[Analyzer] Transitioning to CALCULATING state');
      OverlayManager.setState(OverlayManager.states.CALCULATING);
      
      // Add a small delay to ensure UI updates
      await new Promise(resolve => setTimeout(resolve, 100));
      
      Logger.info('[Analyzer] Starting completeness calculation');
      const completenessData = await this.calculateCompleteness(extractedData);
      Logger.info('[Analyzer] Completeness calculation complete:', {
        score: completenessData?.score,
        hasData: !!completenessData
      });
      
      // Prepare result
      const result = {
        profileId: this.profileId,
        completeness: completenessData.score,
        completenessData: completenessData,
        extractedData: extractedData,
        timestamp: new Date().toISOString()
      };
      
      // Store partial results for timeout handling
      this.analysisResults = result;
      
      // Run AI analysis if enabled
      const hasApiKey = this.settings.apiKey || this.settings.encryptedApiKey;
      
      // Pre-check logging for debugging
      Logger.info('[Analyzer] Pre-AI check:', {
        enableAI: this.settings.enableAI,
        enableAIType: typeof this.settings.enableAI,
        apiKey: !!this.settings.apiKey,
        encryptedApiKey: !!this.settings.encryptedApiKey,
        hasApiKey: !!hasApiKey,
        aiProvider: this.settings.aiProvider,
        aiProviderType: typeof this.settings.aiProvider,
        condition: !!(this.settings.enableAI && hasApiKey && this.settings.aiProvider)
      });
      
      if (this.settings.enableAI && hasApiKey && this.settings.aiProvider) {
        Logger.info('[Analyzer] Starting AI analysis', {
          enableAI: this.settings.enableAI,
          hasApiKey: !!hasApiKey,
          aiProvider: this.settings.aiProvider
        });
        
        // Pre-flight API key validation
        Logger.info('[Analyzer] Validating API key before AI analysis');
        const validationResult = await this.validateApiKey();
        
        if (!validationResult.isValid) {
          Logger.error('[Analyzer] API key validation failed:', validationResult.error);
          result.aiError = {
            message: validationResult.error || 'Invalid Key',
            type: 'validation_failed',
            requiresConfig: true
          };
          
          // Skip AI analysis but continue with completeness results
          Logger.info('[Analyzer] Skipping AI analysis due to invalid API key');
        } else {
          // API key is valid, proceed with AI analysis
          Logger.info('[Analyzer] Transitioning to AI_ANALYZING state');
          OverlayManager.setState(OverlayManager.states.AI_ANALYZING);
          
          // Add a small delay to ensure UI updates
          await new Promise(resolve => setTimeout(resolve, 100));
          
          const aiResult = await this.runAIAnalysis(extractedData);
          if (aiResult.success) {
          result.contentScore = aiResult.score;
          result.recommendations = aiResult.recommendations;
          result.insights = aiResult.insights;
          result.sectionScores = aiResult.sectionScores;
          
          // For distributed analysis, sectionScores might be nested differently
          if (!result.sectionScores && aiResult.synthesis) {
            result.sectionScores = aiResult.synthesis.sectionScores || aiResult.sectionScores;
          }
          
          // Add detailed logging for debugging cache issue
          console.log('[Analyzer] AI Result sectionScores check:', {
            hasSectionScores: !!result.sectionScores,
            sectionScoreKeys: result.sectionScores ? Object.keys(result.sectionScores) : [],
            aiResultKeys: Object.keys(aiResult),
            aiResultHasSectionScores: !!aiResult.sectionScores,
            synthesisKeys: aiResult.synthesis ? Object.keys(aiResult.synthesis) : []
          });
          
          // Use console.log to ensure it's visible
          console.log('[Analyzer] AI analysis complete - setting result:', {
            contentScore: result.contentScore,
            hasRecommendations: !!result.recommendations,
            recommendationType: typeof result.recommendations,
            recommendationStructure: result.recommendations ? Object.keys(result.recommendations) : null,
            insightsType: typeof result.insights
          });
          
          Logger.info('[Analyzer] AI Result Details:', {
            score: aiResult.score,
            recommendations: aiResult.recommendations,
            insights: aiResult.insights,
            fullResult: aiResult
          });
          
          // Add specific logging for recommendations
          Logger.info('[Analyzer] Recommendations being set in result:', {
            hasRecommendations: !!aiResult.recommendations,
            recommendationsType: typeof aiResult.recommendations,
            isArray: Array.isArray(aiResult.recommendations),
            recommendationsStructure: aiResult.recommendations ? Object.keys(aiResult.recommendations) : null,
            criticalCount: aiResult.recommendations?.critical?.length || 0,
            importantCount: aiResult.recommendations?.important?.length || 0,
            niceToHaveCount: aiResult.recommendations?.niceToHave?.length || 0
          });
          
          // Added focused logging for AI recommendations structure
          Logger.info('[Analyzer] AI Result Structure Check:', {
            hasRecommendations: !!aiResult.recommendations,
            recommendationType: Array.isArray(aiResult.recommendations) ? 'array' : 'object',
            recommendationKeys: aiResult.recommendations ? Object.keys(aiResult.recommendations) : [],
            firstRecommendation: aiResult.recommendations?.[0] || aiResult.recommendations?.critical?.[0],
            recommendationCount: Array.isArray(aiResult.recommendations) ? aiResult.recommendations.length : 
                               (aiResult.recommendations?.critical?.length || 0) + 
                               (aiResult.recommendations?.important?.length || 0) + 
                               (aiResult.recommendations?.niceToHave?.length || 0)
          });
          
          Logger.info('[Analyzer] AI analysis successful:', {
            contentScore: result.contentScore,
            hasRecommendations: !!result.recommendations,
            hasInsights: !!result.insights,
            hasSectionScores: !!result.sectionScores
          });
        } else {
          Logger.error('[Analyzer] AI analysis failed:', aiResult.error);
          // Don't fail the whole analysis, just note AI failed
          result.aiError = {
            message: aiResult.error,
            type: aiResult.errorType,
            retryAfter: aiResult.retryAfter
          };
        }
        } // Close the validation else block
      } else {
        Logger.info('[Analyzer] Skipping AI analysis', {
          enableAI: this.settings.enableAI,
          hasApiKey: !!hasApiKey,
          aiProvider: this.settings.aiProvider
        });
      }
      
      // Save to cache
      await this.cacheManager.save(this.profileId, result, extractedData);
      
      // Clear timeout on success
      clearTimeout(analysisTimeout);
      
      // Log total analysis time
      const totalTime = Date.now() - analysisStartTime;
      Logger.info('[Analyzer] Analysis completed', {
        totalTimeMs: totalTime,
        totalTimeSec: Math.round(totalTime / 1000),
        fromCache: !!cachedData && !forceRefresh,
        aiAnalysisRun: !!(this.settings.enableAI && hasApiKey && this.settings.aiProvider),
        completenessScore: result.completeness,
        contentScore: result.contentScore
      });
      
      // Update overlay with final results
      // If AI failed but we have completeness, show complete state with error
      let finalState;
      if (result.aiError && this.settings.enableAI) {
        // Check if it's a validation error
        if (result.aiError.type === 'validation_failed') {
          finalState = OverlayManager.states.COMPLETE;
          // Add a specific message for API key errors
          result.apiKeyError = true;
          result.apiKeyErrorMessage = result.aiError.message;
        } else {
          finalState = OverlayManager.states.ERROR;
        }
      } else {
        finalState = OverlayManager.states.COMPLETE;
      }
      
      // Add logging to debug what's being passed to the overlay
      Logger.info('[Analyzer] Setting overlay state to:', finalState, {
        hasRecommendations: !!result.recommendations,
        recommendationsType: typeof result.recommendations,
        completeness: result.completeness,
        contentScore: result.contentScore,
        hasInsights: !!result.insights,
        resultKeys: Object.keys(result)
      });
      
      // Log what we're passing to overlay manager
      const overlayData = {
        ...result,
        // Only mark AI as disabled if there's no content score
        aiDisabled: result.contentScore === undefined || result.contentScore === null
      };
      
      // Use console.log to ensure visibility
      console.log('[Analyzer] CRITICAL - Passing to OverlayManager:', {
        finalState: finalState,
        completeness: overlayData.completeness,
        contentScore: overlayData.contentScore,
        hasRecommendations: !!overlayData.recommendations,
        recommendationsType: typeof overlayData.recommendations,
        recommendationsCount: Array.isArray(overlayData.recommendations) ? overlayData.recommendations.length : 0,
        hasInsights: !!overlayData.insights,
        allKeys: Object.keys(overlayData)
      });
      
      Logger.info('[Analyzer] Passing to OverlayManager:', {
        completeness: overlayData.completeness,
        contentScore: overlayData.contentScore,
        hasRecommendations: !!overlayData.recommendations,
        recommendationsType: typeof overlayData.recommendations,
        recommendationsCount: Array.isArray(overlayData.recommendations) ? overlayData.recommendations.length : 0,
        hasInsights: !!overlayData.insights,
        allKeys: Object.keys(overlayData)
      });
      
      OverlayManager.setState(finalState, overlayData);
      
      return { success: true, data: result };
      
    } catch (error) {
      Logger.error('[Analyzer] Analysis failed:', error);
      clearTimeout(analysisTimeout);
      
      // If we have cached data, fall back to it
      if (cachedData && cachedData.completeness !== undefined) {
        Logger.info('[Analyzer] Falling back to cached data after error');
        
        OverlayManager.setState(OverlayManager.states.ANALYSIS_FAILED_CACHE_FALLBACK, {
          ...cachedData,
          fromCache: true,
          analysisError: error.message,
          message: 'Analysis couldn\'t complete. Showing cached results. Please try again in a few minutes.',
          // Only mark AI as disabled if there's no content score
          aiDisabled: cachedData.contentScore === undefined || cachedData.contentScore === null
        });
        
        return { success: true, fromCache: true, fallback: true, data: cachedData };
      } else {
        // No cache available, show error
        OverlayManager.setState(OverlayManager.states.ERROR, {
          message: error.message
        });
        return { success: false, error: error.message };
      }
    } finally {
      // Always ensure buttons are re-enabled
      OverlayManager.resetButtons();
    }
  }
  
  /**
   * Calculate total years of experience
   * @param {Object} experienceData - Experience data from extractor
   * @returns {number} Years of experience
   */
  calculateYearsOfExperience(experienceData) {
    if (!experienceData?.experiences?.length) return 0;
    
    // Find earliest start date
    let earliestStart = new Date();
    experienceData.experiences.forEach(exp => {
      if (exp.startDate) {
        const startDate = new Date(exp.startDate);
        if (startDate < earliestStart) {
          earliestStart = startDate;
        }
      }
    });
    
    const now = new Date();
    const years = (now - earliestStart) / (1000 * 60 * 60 * 24 * 365.25);
    return Math.round(years * 10) / 10; // Round to 1 decimal
  }
  
  /**
   * Extract career progression pattern
   * @param {Object} experienceData - Experience data from extractor
   * @returns {string} Career progression type
   */
  extractCareerProgression(experienceData) {
    if (!experienceData?.experiences?.length) return 'unknown';
    
    const titles = experienceData.experiences.map(exp => exp.title?.toLowerCase() || '');
    
    // Check for management progression
    const hasManagementProgression = titles.some((title, idx) => {
      const prevTitles = titles.slice(idx + 1);
      return (title.includes('manager') || title.includes('director') || title.includes('vp')) &&
             prevTitles.some(t => !t.includes('manager') && !t.includes('director'));
    });
    
    if (hasManagementProgression) return 'ic_to_management';
    
    // Check for senior progression
    const hasSeniorProgression = titles.some((title, idx) => {
      const prevTitles = titles.slice(idx + 1);
      return (title.includes('senior') || title.includes('lead') || title.includes('principal')) &&
             prevTitles.some(t => !t.includes('senior') && !t.includes('lead'));
    });
    
    if (hasSeniorProgression) return 'junior_to_senior';
    
    // Check if lateral moves
    const uniqueRoles = new Set(titles.map(t => t.replace(/(senior|lead|jr|junior|principal)/g, '').trim()));
    if (uniqueRoles.size > 2) return 'diverse_lateral';
    
    return 'specialized';
  }

  /**
   * Handle analysis timeout
   */
  async handleAnalysisTimeout() {
    try {
      // Check if we have partial results (completeness score)
      if (this.analysisResults && this.analysisResults.completeness !== undefined) {
        Logger.info('[Analyzer] Analysis timeout - showing partial results (completeness only)');
        
        // Create partial results object
        const partialResults = {
          completeness: this.analysisResults.completeness,
          completenessData: this.analysisResults.completenessData,
          extractedData: this.analysisResults.extractedData,
          contentScore: 0, // No AI score available
          recommendations: null, // No AI recommendations
          insights: {
            summary: 'Analysis timed out. Showing completeness score only.',
            aiError: {
              type: 'timeout',
              message: 'AI analysis took too long. Try again for full analysis.'
            }
          },
          timestamp: Date.now(),
          isPartial: true
        };
        
        // Show partial results in the UI
        OverlayManager.setState(OverlayManager.states.COMPLETE, partialResults);
        
        // Don't cache partial results
        Logger.info('[Analyzer] Not caching partial results from timeout');
        return;
      }
      
      // Try to get cached data as fallback
      const cachedData = await this.cacheManager.get(this.profileId);
      
      if (cachedData && cachedData.completeness !== undefined) {
        Logger.info('[Analyzer] Analysis timeout - returning to cached data');
        
        OverlayManager.setState(OverlayManager.states.ANALYSIS_FAILED_CACHE_FALLBACK, {
          ...cachedData,
          fromCache: true,
          analysisError: 'Analysis timeout',
          message: 'Analysis is taking longer than expected. Showing cached results. Please try again later.'
        });
      } else {
        // No partial results or cache available
        OverlayManager.setState(OverlayManager.states.ERROR, {
          message: 'Analysis timeout. Please try again.'
        });
      }
    } catch (error) {
      Logger.error('[Analyzer] Error handling timeout:', error);
      OverlayManager.setState(OverlayManager.states.ERROR, {
        message: 'Analysis timeout. Please try again.'
      });
    }
  }
  
  /**
   * Validate API key before running AI analysis
   */
  async validateApiKey() {
    return new Promise((resolve) => {
      safeSendMessage({
        action: 'validateApiKey'
      }, (response) => {
        if (response && response.success) {
          resolve({ isValid: true });
        } else {
          resolve({ 
            isValid: false, 
            error: response?.error || 'API key validation failed'
          });
        }
      });
    });
  }
  
  /**
   * Run all extractors
   */
  async runExtractors() {
    Logger.info('[Analyzer] Running extractors');
    const results = {};
    
    // Update scan progress
    const sections = Object.keys(this.extractors).map(name => ({
      name,
      status: 'pending',
      itemCount: 0
    }));
    
    OverlayManager.updateScanProgress(sections);
    
    // Run extractors in parallel
    const promises = Object.entries(this.extractors).map(async ([name, extractor]) => {
      if (!extractor) {
        Logger.warn(`[Analyzer] ${name} extractor not loaded`);
        return { name, data: null };
      }
      
      try {
        // Update status to scanning
        sections.find(s => s.name === name).status = 'scanning';
        OverlayManager.updateScanProgress(sections);
        
        // Run scan
        const scanResult = await extractor.scan();
        
        // Update status to complete
        const section = sections.find(s => s.name === name);
        section.status = 'complete';
        section.itemCount = scanResult.totalCount || scanResult.count || 0;
        OverlayManager.updateScanProgress(sections);
        
        // Run extraction if section exists
        if (scanResult.exists) {
          Logger.info(`[Analyzer] Extracting ${name} section`);
          OverlayManager.setState(OverlayManager.states.EXTRACTING);
          OverlayManager.updateExtractionProgress(name);
          
          // Small delay to ensure UI updates
          await new Promise(resolve => setTimeout(resolve, 50));
          
          const extractResult = await extractor.extract();
          return { name, data: extractResult };
        }
        
        return { name, data: scanResult };
        
      } catch (error) {
        Logger.error(`[Analyzer] ${name} extraction failed:`, error);
        return { name, data: null, error: error.message };
      }
    });
    
    const extractorResults = await Promise.all(promises);
    
    // Compile results
    extractorResults.forEach(({ name, data }) => {
      results[name] = data;
    });
    
    Logger.info('[Analyzer] Extraction complete', { 
      sections: Object.keys(results).filter(k => results[k]?.exists).length,
      experienceData: results.experience,
      experienceExists: results.experience?.exists,
      experienceCount: results.experience?.count,
      allSections: Object.keys(results),
      existingSections: Object.keys(results).filter(k => results[k]?.exists)
    });
    
    return results;
  }
  
  /**
   * Calculate completeness score
   */
  async calculateCompleteness(extractedData) {
    try {
      if (typeof ProfileCompletenessCalculator !== 'undefined') {
        const calculator = new ProfileCompletenessCalculator();
        const result = calculator.calculate(extractedData);
        Logger.info('[Analyzer] Completeness calculated:', {
          score: result?.score,
          recommendationsCount: result?.recommendations?.length
        });
        return result;
      }
      
      // Fallback calculation
      Logger.warn('[Analyzer] ProfileCompletenessCalculator not available, using fallback');
      return {
        score: 50,
        recommendations: [],
        breakdown: {}
      };
    } catch (error) {
      Logger.error('[Analyzer] Error calculating completeness:', error);
      // Return a basic result on error
      return {
        score: 0,
        recommendations: [],
        breakdown: {},
        error: error.message
      };
    }
  }
  
  /**
   * Run distributed AI analysis (section by section)
   */
  async runDistributedAIAnalysis(extractedData) {
    const startTime = Date.now();
    Logger.info('[Analyzer] Starting distributed AI analysis (Sequential Mode)', {
      sections: Object.keys(extractedData).filter(k => extractedData[k]?.exists),
      timestamp: new Date().toISOString(),
      experienceData: extractedData?.experience,
      experienceExists: extractedData?.experience?.exists,
      experienceCount: extractedData?.experience?.count,
      allSections: Object.keys(extractedData)
    });
    
    // Pre-flight API key validation before showing any UI
    Logger.info('[Analyzer] Validating API key before distributed analysis');
    const validationResult = await this.validateApiKey();
    
    if (!validationResult.isValid) {
      Logger.error('[Analyzer] API key validation failed in distributed analysis:', validationResult.error);
      return {
        success: false,
        error: validationResult.error || 'Invalid Key',
        errorType: 'validation_failed',
        requiresConfig: true
      };
    }
    
    const sectionResults = {};
    const sectionRecommendations = {};
    const sections = [];
    
    // Build list of sections to analyze
    // 1. Profile Intro
    if (extractedData.headline || extractedData.about) {
      // Build rich context for profile intro
      Logger.info('[Analyzer] Building profile intro context from extracted data:', {
        hasHeadline: !!extractedData.headline,
        hasAbout: !!extractedData.about,
        hasExperience: !!extractedData.experience,
        hasSkills: !!extractedData.skills,
        skillsStructure: extractedData.skills ? Object.keys(extractedData.skills) : null
      });
      
      const profileContext = {
        // Core data
        headline: extractedData.headline,
        about: extractedData.about,
        photo: extractedData.photo,
        topSkills: extractedData.skills?.skills ? extractedData.skills.skills.slice(0, 10).map(s => s.name || s.skill || s) : [],
        
        // Career context
        totalExperience: extractedData.experience?.experiences?.length || 0,
        currentRole: extractedData.experience?.experiences?.[0] || null,
        yearsOfExperience: this.calculateYearsOfExperience(extractedData.experience),
        careerProgression: this.extractCareerProgression(extractedData.experience),
        
        // Profile completeness context
        profileSections: {
          hasPhoto: extractedData.photo?.exists || false,
          hasHeadline: extractedData.headline?.exists || false,
          hasAbout: extractedData.about?.exists || false,
          hasExperience: (extractedData.experience?.count || 0) > 0,
          hasEducation: (extractedData.education?.count || 0) > 0,
          hasSkills: (extractedData.skills?.count || 0) > 0,
          hasCertifications: (extractedData.certifications?.count || 0) > 0,
          hasRecommendations: (extractedData.recommendations?.count || 0) > 0
        },
        
        // Skills context
        totalSkillsCount: extractedData.skills?.totalCount || extractedData.skills?.count || 0,
        skillsWithEndorsements: extractedData.skills?.skills ? extractedData.skills.skills.filter(s => (s.endorsementCount || s.endorsements || 0) > 0).length : 0,
        
        // Additional metadata
        targetRole: this.settings.targetRole || 'Product Manager',
        seniorityLevel: this.settings.seniorityLevel || 'mid'
      };
      
      // Log the built context before sending
      Logger.info('[Analyzer] Profile intro context built:', {
        hasHeadline: !!profileContext.headline,
        hasAbout: !!profileContext.about,
        topSkillsCount: profileContext.topSkills?.length || 0,
        yearsOfExperience: profileContext.yearsOfExperience,
        careerProgression: profileContext.careerProgression
      });
      
      sections.push({
        type: 'profile_intro',
        name: 'Profile Introduction',
        data: profileContext
      });
    }
    
    // 2. Experience Roles
    // Check if experience exists and has count > 0
    if (extractedData.experience?.exists && extractedData.experience?.count > 0) {
      // Need to run extractDeep to get individual experiences for AI analysis
      Logger.info('[Analyzer] Running deep extraction for experience section', {
        experienceData: extractedData.experience,
        hasExtractor: !!this.extractors.experience,
        extractorMethods: this.extractors.experience ? Object.getOwnPropertyNames(this.extractors.experience) : [],
        extractorType: typeof this.extractors.experience
      });
      
      try {
        // Run deep extraction to get detailed experiences
        const experienceExtractor = this.extractors.experience;
        Logger.info('[Analyzer] Experience extractor found:', {
          exists: !!experienceExtractor,
          type: typeof experienceExtractor,
          hasExtractDeep: experienceExtractor && typeof experienceExtractor.extractDeep === 'function'
        });
        
        if (experienceExtractor && typeof experienceExtractor.extractDeep === 'function') {
          Logger.info('[Analyzer] Calling extractDeep on experience extractor');
          const deepExperienceData = await experienceExtractor.extractDeep();
          Logger.info('[Analyzer] Deep extraction result:', {
            hasData: !!deepExperienceData,
            dataType: typeof deepExperienceData,
            hasExperiences: !!deepExperienceData?.experiences,
            experienceCount: deepExperienceData?.experiences?.length || 0,
            dataKeys: deepExperienceData ? Object.keys(deepExperienceData) : [],
            firstExperience: deepExperienceData?.experiences?.[0] ? {
              title: deepExperienceData.experiences[0].title,
              company: deepExperienceData.experiences[0].company,
              hasDescription: !!deepExperienceData.experiences[0].description
            } : null
          });
          
          if (deepExperienceData.experiences && deepExperienceData.experiences.length > 0) {
            // Add each experience role as a separate section for analysis
            deepExperienceData.experiences.forEach((exp, index) => {
              sections.push({
                type: 'experience_role',
                name: `Experience Role ${index + 1} of ${deepExperienceData.experiences.length}`,
                data: exp,
                context: {
                  position: index,
                  totalRoles: deepExperienceData.experiences.length,
                  previousRole: deepExperienceData.experiences[index - 1],
                  nextRole: deepExperienceData.experiences[index + 1]
                }
              });
            });
            
            Logger.info('[Analyzer] Added experience roles for AI analysis:', {
              count: deepExperienceData.experiences.length,
              firstRole: deepExperienceData.experiences[0]?.title
            });
          } else {
            Logger.warn('[Analyzer] No experiences found in deep extraction data', {
              deepDataStructure: deepExperienceData
            });
          }
        } else {
          Logger.warn('[Analyzer] Experience extractor not found or extractDeep not a function', {
            extractorExists: !!experienceExtractor,
            extractorType: typeof experienceExtractor,
            hasExtractDeep: experienceExtractor && typeof experienceExtractor.extractDeep
          });
        }
      } catch (error) {
        Logger.error('[Analyzer] Failed to extract deep experience data:', {
          message: error.message,
          stack: error.stack,
          extractorState: {
            exists: !!this.extractors.experience,
            type: typeof this.extractors.experience
          }
        });
        // Fallback: analyze experience as a single section
        sections.push({
          type: 'experience',
          name: `Experience (${extractedData.experience.count} roles)`,
          data: extractedData.experience
        });
      }
    }
    
    // 3. Skills
    if (extractedData.skills) {
      sections.push({
        type: 'skills',
        name: `Skills (${extractedData.skills.totalCount || extractedData.skills.count || 0} total)`,
        data: extractedData.skills
      });
    }
    
    // 4. Recommendations
    if (extractedData.recommendations) {
      sections.push({
        type: 'recommendations',
        name: `Recommendations (${extractedData.recommendations.count || 0} total)`,
        data: extractedData.recommendations
      });
    }
    
    const totalSections = sections.length;
    Logger.info(`[Analyzer] Will analyze ${totalSections} sections sequentially`);
    
    // Analyze sections sequentially
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const stepNumber = i + 1;
      const sectionStartTime = Date.now();
      
      try {
        // Update UI with current section
        Logger.info(`[AI Analysis] Starting section ${stepNumber}/${totalSections}: ${section.name}`);
        OverlayManager.updateAIProgress('analyzing', `${section.name} (Step ${stepNumber} of ${totalSections})`);
        
        // Log data size being sent
        const dataSize = JSON.stringify(section.data).length;
        Logger.info(`[AI Analysis] Data size for ${section.name}: ${dataSize} bytes`);
        
        // Analyze the section
        const result = await this.analyzeSection(section.type, section.data, section.context);
        
        // Log completion
        const sectionElapsed = Date.now() - sectionStartTime;
        Logger.info(`[AI Analysis] Completed ${section.name} in ${sectionElapsed}ms - Score: ${result.score || 'N/A'}`);
        
        if (result.success) {
          // Handle multiple experience roles
          if (section.type === 'experience_role') {
            if (!sectionResults.experience_roles) {
              sectionResults.experience_roles = [];
              sectionRecommendations.experience_roles = [];
            }
            sectionResults.experience_roles.push(result);
            sectionRecommendations.experience_roles.push(...(result.recommendations || []));
          } else {
            sectionResults[section.type] = result;
            sectionRecommendations[section.type] = result.recommendations || [];
          }
          
          // Update UI with section score
          OverlayManager.updateSectionScore(section.type, result.score);
        } else {
          // Properly handle error objects
          const errorMessage = typeof result.error === 'object' ? 
            JSON.stringify(result.error) : 
            (result.error || 'Unknown error');
          Logger.warn(`[AI Analysis] Failed to analyze ${section.name}: ${errorMessage}`);
        }
        
      } catch (error) {
        Logger.error(`[AI Analysis] Error analyzing ${section.name}:`, error);
      }
    }
    
    // 5. Synthesize all results
    Logger.info('[AI Analysis] Starting synthesis of all sections');
    OverlayManager.updateAIProgress('synthesizing', 'Synthesizing results...');
    
    const synthesisStartTime = Date.now();
    const synthesis = await this.synthesizeResults(sectionResults, sectionRecommendations);
    
    const synthesisElapsed = Date.now() - synthesisStartTime;
    const totalElapsed = Date.now() - startTime;
    
    Logger.info(`[AI Analysis] Synthesis completed in ${synthesisElapsed}ms`);
    Logger.info(`[AI Analysis] Total distributed analysis time: ${totalElapsed}ms (${Math.round(totalElapsed / 1000)}s)`);
    
    console.log('[AI Analysis] Synthesis result to return:', {
      success: synthesis?.success,
      score: synthesis?.score,
      hasRecommendations: !!synthesis?.recommendations,
      recommendationType: typeof synthesis?.recommendations,
      synthesisKeys: synthesis ? Object.keys(synthesis) : null
    });
    
    return synthesis;
  }
  
  /**
   * Analyze individual section
   */
  async analyzeSection(sectionType, data, context = {}) {
    return new Promise((resolve) => {
      safeSendMessage({
        action: 'analyzeSection',
        section: sectionType,
        data: data,
        context: context,
        settings: this.settings
      }, (response) => {
        if (response && response.success) {
          resolve({
            success: true,
            section: sectionType,
            score: response.score,
            analysis: response.analysis,
            recommendations: response.recommendations,
            insights: response.insights,
            // Include all AI analysis fields
            positiveInsight: response.insight,
            strengths: response.strengths,
            improvements: response.improvements,
            actionItems: response.actionItems,
            specificFeedback: response.specificFeedback
          });
        } else {
          // Ensure error is always a string
          let errorMessage = 'Section analysis failed';
          if (response?.error) {
            errorMessage = typeof response.error === 'object' ? 
              JSON.stringify(response.error) : 
              String(response.error);
          }
          resolve({
            success: false,
            section: sectionType,
            error: errorMessage
          });
        }
      });
    });
  }
  
  /**
   * Synthesize all section results
   */
  async synthesizeResults(sectionResults, sectionRecommendations) {
    console.log('[Analyzer] synthesizeResults called with:', {
      sectionCount: Object.keys(sectionResults).length,
      sections: Object.keys(sectionResults)
    });
    
    return new Promise((resolve) => {
      console.log('[Analyzer] Sending synthesizeAnalysis request');
      safeSendMessage({
        action: 'synthesizeAnalysis',
        sectionScores: sectionResults,
        sectionRecommendations: sectionRecommendations
      }, (response) => {
        console.log('[Analyzer] Synthesis callback fired, response:', response);
        Logger.info('[Analyzer] Synthesis response received:', {
          success: response?.success,
          hasFinalScore: response?.finalScore !== undefined,
          finalScore: response?.finalScore,
          hasOverallRecommendations: !!response?.overallRecommendations,
          overallRecommendationsType: typeof response?.overallRecommendations,
          hasRecommendations: !!response?.recommendations,
          recommendationsType: typeof response?.recommendations,
          responseKeys: response ? Object.keys(response) : []
        });
        
        if (response && response.success) {
          const result = {
            success: true,
            score: response.finalScore,
            synthesis: response.synthesis,
            recommendations: response.overallRecommendations || response.recommendations || [],
            insights: response.careerNarrative,
            sectionScores: response.sectionScores
          };
          
          console.log('[Analyzer] Synthesis success, returning:', {
            score: result.score,
            hasRecommendations: !!result.recommendations,
            recommendationStructure: result.recommendations,
            hasSectionScores: !!result.sectionScores,
            sectionScoreKeys: result.sectionScores ? Object.keys(result.sectionScores) : 'none'
          });
          
          Logger.info('[Analyzer] Synthesis result to return:', {
            score: result.score,
            hasRecommendations: !!result.recommendations,
            recommendationsLength: Array.isArray(result.recommendations) ? result.recommendations.length : 0,
            recommendationsType: typeof result.recommendations
          });
          
          resolve(result);
        } else {
          // Fallback: calculate weighted average
          const weights = {
            profile_intro: 0.25,
            experience: 0.40,
            skills: 0.20,
            recommendations: 0.15
          };
          
          let totalScore = 0;
          let totalWeight = 0;
          
          Object.entries(sectionResults).forEach(([section, result]) => {
            const weight = weights[section] || 0.1;
            totalScore += (result.score || 0) * weight;
            totalWeight += weight;
          });
          
          resolve({
            success: true,
            score: totalWeight > 0 ? totalScore / totalWeight : 5,
            recommendations: Object.values(sectionRecommendations).flat(),
            insights: { message: 'Synthesis unavailable, showing section results' }
          });
        }
      });
    });
  }
  
  /**
   * Run AI analysis (legacy monolithic approach)
   */
  async runAIAnalysis(extractedData) {
    // Try distributed approach first
    try {
      const distributedResult = await this.runDistributedAIAnalysis(extractedData);
      if (distributedResult.success) {
        return distributedResult;
      }
    } catch (error) {
      Logger.warn('[Analyzer] Distributed analysis failed, falling back to monolithic', error);
    }
    
    // Fallback to original monolithic approach
    Logger.info('[Analyzer] Using monolithic AI analysis', {
      hasData: !!extractedData,
      dataKeys: Object.keys(extractedData || {}),
      settingsKeys: Object.keys(this.settings || {})
    });
    
    return new Promise((resolve) => {
      safeSendMessage({
        action: 'analyzeWithAI',
        data: extractedData,
        settings: this.settings
      }, (response) => {
        Logger.info('[Analyzer] AI analysis response received', {
          success: response?.success,
          hasScore: !!response?.score,
          error: response?.error,
          errorType: response?.errorType
        });
        
        if (response && response.success) {
          Logger.info('[Analyzer] Full AI response:', response);
          // Extract from analysis object if present (new format), otherwise use direct fields (legacy)
          const analysis = response.analysis || response;
          resolve({
            success: true,
            score: analysis.overallScore || analysis.score,
            recommendations: analysis.recommendations,
            insights: analysis.insights,
            sectionScores: analysis.sectionScores,
            summary: analysis.summary
          });
        } else {
          resolve({
            success: false,
            error: response?.error || 'AI analysis failed',
            errorType: response?.errorType,
            retryAfter: response?.retryAfter
          });
        }
      });
    });
  }
}