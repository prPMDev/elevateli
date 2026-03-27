/**
 * ElevateLI Analyzer Base
 * Main orchestrator for LinkedIn profile analysis
 * Expects these modules to be available: Logger, CacheManager, OverlayManager, extractors, scorers
 */


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
    
    // Phase completion tracking
    this.phaseCompleted = {
      overlayInitialized: false,
      complianceChecked: false,
      cacheRestored: false,
      extractionComplete: false,
      scoringComplete: false,
      aiAnalysisComplete: false
    };
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
    
    // Initialize cache manager (infinite persistence)
    this.cacheManager = new CacheManager();
    
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
   * Wait for a specific phase to complete
   * @param {string} phase - Phase name to wait for
   * @param {number} timeout - Maximum wait time in milliseconds
   * @returns {Promise<boolean>} - True if phase completed, false if timeout
   */
  async waitForPhaseCompletion(phase, timeout = 30000) {
    return new Promise((resolve) => {
      // Check if already completed
      if (this.phaseCompleted[phase]) {
        resolve(true);
        return;
      }
      
      let elapsed = 0;
      const checkInterval = 100;
      
      const intervalId = setInterval(() => {
        if (this.phaseCompleted[phase]) {
          clearInterval(intervalId);
          resolve(true);
        } else if (elapsed >= timeout) {
          clearInterval(intervalId);
          Logger.warn(`[Analyzer] Phase ${phase} did not complete within ${timeout}ms`);
          resolve(false);
        }
        elapsed += checkInterval;
      }, checkInterval);
    });
  }
  
  /**
   * Mark a phase as completed
   * @param {string} phase - Phase name to mark as complete
   */
  markPhaseComplete(phase) {
    if (this.phaseCompleted.hasOwnProperty(phase)) {
      this.phaseCompleted[phase] = true;
      Logger.debug(`[Analyzer] Phase completed: ${phase}`);
    } else {
      Logger.warn(`[Analyzer] Unknown phase: ${phase}`);
    }
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
          OverlayManager.setState(OverlayManager.states.COMPLETE, {
            ...cachedData,
            fromCache: true,
            cacheRestored: true,
            // Only mark AI as disabled if there's no content score
            aiDisabled: cachedData.contentScore === undefined || cachedData.contentScore === null,
            // Pass current settings for UI logic
            settings: {
              enableAI: this.settings.enableAI,
              aiProvider: this.settings.aiProvider,
              aiModel: this.settings.aiModel
            }
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
      
      // Mark extraction as complete
      this.markPhaseComplete('extractionComplete');
      
      // Use requestAnimationFrame to ensure UI updates
      await new Promise(resolve => requestAnimationFrame(resolve));
      
      Logger.info('[Analyzer] Starting completeness calculation');
      const completenessData = await this.calculateCompleteness(extractedData);
      Logger.info('[Analyzer] Completeness calculation complete:', {
        score: completenessData?.score,
        hasData: !!completenessData
      });
      
      // Mark scoring as complete
      this.markPhaseComplete('scoringComplete');
      
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
          
          // Use enhanced error recovery with central state restoration
          Logger.info('[Analyzer] API key validation failed - attempting cache recovery');
          
          const recovered = await OverlayManager.restoreAppropriateState(this.profileId, {
            isErrorFallback: true,
            error: 'API key validation failed',
            message: validationResult.error || 'Invalid API key. Please check your settings. Showing cached results.'
          });
          
          if (recovered) {
            // Cache was restored, return early
            clearTimeout(analysisTimeout);
            return { success: true, fromCache: true, apiKeyError: true };
          }
          
          // No cache available, continue with analysis but mark error
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
          
          // Use requestAnimationFrame to ensure UI updates
          await new Promise(resolve => requestAnimationFrame(resolve));
          
          // Pass completeness score to AI analysis for conditional advice
          extractedData.completenessScore = completenessData?.score || 100;
          const aiResult = await this.runAIAnalysisWithRetry(extractedData);
          
          // Check if the AI result is actually a failure disguised as success
          // (happens when quality-scorer returns default score on error)
          const isDefaultFailureScore = aiResult.success && 
                                       aiResult.score === 5.0 && 
                                       aiResult.recommendations?.critical?.[0] === 'Unable to analyze profile quality. Please try again.';
          
          if (aiResult.success && !isDefaultFailureScore) {
          result.contentScore = aiResult.score;
          result.recommendations = aiResult.recommendations;
          result.insights = aiResult.insights;
          result.sectionScores = aiResult.sectionScores;
          
          // For distributed analysis, sectionScores might be nested differently
          if (!result.sectionScores && aiResult.synthesis) {
            result.sectionScores = aiResult.synthesis.sectionScores || aiResult.sectionScores;
          }
          
          // Add detailed logging for debugging cache issue
          SmartLogger.log('AI.RESPONSES', 'AI Result sectionScores check', {
            hasSectionScores: !!result.sectionScores,
            sectionScoreKeys: result.sectionScores ? Object.keys(result.sectionScores) : [],
            aiResultKeys: Object.keys(aiResult),
            aiResultHasSectionScores: !!aiResult.sectionScores,
            synthesisKeys: aiResult.synthesis ? Object.keys(aiResult.synthesis) : []
          });
          
          SmartLogger.log('AI.RESPONSES', 'AI analysis complete - setting result', {
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
          
          // Mark AI analysis as complete
          this.markPhaseComplete('aiAnalysisComplete');
          
          Logger.info('[Analyzer] AI analysis successful:', {
            contentScore: result.contentScore,
            hasRecommendations: !!result.recommendations,
            hasInsights: !!result.insights,
            hasSectionScores: !!result.sectionScores
          });
        } else {
          Logger.error('[Analyzer] AI analysis failed:', aiResult.error || 'Default failure score detected');
          
          // Check for cached AI data to merge with new completeness
          if (cachedData && cachedData.contentScore !== undefined) {
            Logger.info('[Analyzer] Using cached AI data after AI failure', {
              cachedContentScore: cachedData.contentScore,
              hasRecommendations: !!cachedData.recommendations
            });
            
            result.contentScore = cachedData.contentScore;
            result.recommendations = cachedData.recommendations;
            result.sectionScores = cachedData.sectionScores;
            result.insights = cachedData.insights; // Also copy insights
            // Copy any other AI-related fields that might exist
            if (cachedData.summary) result.summary = cachedData.summary;
            if (cachedData.recommendationsArray) result.recommendationsArray = cachedData.recommendationsArray;
            result.partialUpdate = true;
            result.cachedContentScore = true;
            result.aiFailedWithCache = true;
          }
          
          // Don't fail the whole analysis, just note AI failed
          result.aiError = {
            message: aiResult.error,
            type: aiResult.errorType || (aiResult.error?.toLowerCase().includes('network') ? 'NETWORK' : 'UNKNOWN'),
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
        } else if (result.partialUpdate || result.aiFailedWithCache) {
          // Handle partial updates where AI failed but we used cached data
          Logger.info('[Analyzer] Using ANALYSIS_FAILED_CACHE_FALLBACK state for partial update');
          finalState = OverlayManager.states.ANALYSIS_FAILED_CACHE_FALLBACK;
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
        // Ensure fromCache flag is set for partial updates
        fromCache: result.partialUpdate || result.cachedContentScore || result.fromCache,
        // Only mark AI as disabled if there's no content score
        aiDisabled: result.contentScore === undefined || result.contentScore === null
      };
      
      SmartLogger.log('UI.RENDERING', 'Passing to OverlayManager', {
        finalState: finalState,
        completeness: overlayData.completeness,
        contentScore: overlayData.contentScore,
        fromCache: overlayData.fromCache,
        partialUpdate: overlayData.partialUpdate,
        aiFailedWithCache: overlayData.aiFailedWithCache,
        hasRecommendations: !!overlayData.recommendations,
        recommendationsType: typeof overlayData.recommendations,
        recommendationsCount: Array.isArray(overlayData.recommendations) ? overlayData.recommendations.length : 0,
        hasInsights: !!overlayData.insights,
        hasSectionScores: !!overlayData.sectionScores,
        sectionScoreKeys: overlayData.sectionScores ? Object.keys(overlayData.sectionScores) : [],
        experienceOverall: overlayData.sectionScores?.experience_overall,
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
      
      // Use enhanced error recovery with central state restoration
      Logger.info('[Analyzer] Analysis timeout - attempting recovery');
      
      const recovered = await OverlayManager.restoreAppropriateState(this.profileId, {
        isErrorFallback: true,
        error: 'Analysis timeout',
        message: 'Analysis is taking longer than expected. Showing cached results. Please try again later.'
      });
      
      if (!recovered) {
        // Fallback if no cache available
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
        
        // Debug logging to understand scan result structure
        
        // Update status to complete
        const section = sections.find(s => s.name === name);
        section.status = 'complete';
        section.itemCount = scanResult.totalCount || scanResult.count || 0;
        OverlayManager.updateScanProgress(sections);
        
        // Debug: Check what's happening with the condition
        
        // Run extraction if section exists - match alpha version exactly
        if (scanResult.exists) {
          OverlayManager.setState(OverlayManager.states.EXTRACTING);
          OverlayManager.updateExtractionProgress(name);
          
          // Small delay to ensure UI updates
          await new Promise(resolve => setTimeout(resolve, 50));
          
          const extractResult = await extractor.extract();
            
            
          return { name, data: extractResult };
        }
        
        // Return scanResult for non-existent sections so scorer gets exists: false
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
    
    
    return results;
  }
  
  /**
   * Calculate completeness score
   */
  async calculateCompleteness(extractedData) {
    try {
      if (typeof ProfileCompletenessCalculator !== 'undefined') {
        const calculator = new ProfileCompletenessCalculator();
        
        // Debug logging to see what data is being passed
        
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
      // Check if it's a network error vs actual validation failure
      const errorMessage = validationResult.error || 'Invalid Key';
      const isNetworkError = errorMessage.toLowerCase().includes('network') || 
                            errorMessage.toLowerCase().includes('fetch') ||
                            errorMessage.toLowerCase().includes('connection');
      
      Logger.error('[Analyzer] API key validation failed in distributed analysis:', errorMessage, {
        isNetworkError: isNetworkError
      });
      
      if (isNetworkError) {
        // Don't treat network errors as API key validation failures
        return {
          success: false,
          error: errorMessage,
          errorType: 'NETWORK',
          requiresConfig: false
        };
      } else {
        return {
          success: false,
          error: errorMessage,
          errorType: 'validation_failed',
          requiresConfig: true
        };
      }
    }
    
    const sectionResults = {};
    const sectionRecommendations = {};
    const sections = [];
    
    // Build list of sections to analyze
    // [CRITICAL_PATH:FIRST_IMPRESSION_EXTRACTION] - P0: Extract all first impression data
    // 1. First Impression (Headline + Photo + Banner)
    if (extractedData.headline || extractedData.photo || extractedData.banner) {
      Logger.info('[Analyzer] Photo data before FirstImpressionAnalyzer:', {
        photoExists: extractedData.photo?.exists,
        photoUrl: extractedData.photo?.photoUrl,
        photoKeys: Object.keys(extractedData.photo || {})
      });
      
      const firstImpressionData = FirstImpressionAnalyzer.buildFirstImpressionData(extractedData);
      
      Logger.info('[Analyzer] Built first impression data:', {
        hasHeadline: !!firstImpressionData.headline,
        headlineLength: firstImpressionData.headline?.length || 0,
        hasPhoto: firstImpressionData.photo?.exists,
        hasPhotoUrl: !!firstImpressionData.photo?.url,
        photoUrl: firstImpressionData.photo?.url,
        hasCustomBanner: firstImpressionData.banner?.isCustomBanner,
        hasOpenToWork: firstImpressionData.metadata?.openToWork
      });
      
      sections.push({
        type: 'first_impression',
        name: 'First Impression',
        data: firstImpressionData
      });
    }
    
    // [CRITICAL_PATH:ABOUT_ISOLATED] - P0: About must be separate section
    // 2. About Section (separate from headline)
    if (extractedData.about?.exists || extractedData.about?.text) {
      const aboutContext = {
        text: extractedData.about?.text || '',
        charCount: extractedData.about?.charCount || 0,
        hasKeywords: extractedData.about?.hasKeywords || false,
        
        // Career context for better analysis
        currentRole: extractedData.experience?.experiences?.[0] || null,
        targetRole: this.settings.targetRole || 'general professional',
        seniorityLevel: this.settings.seniorityLevel || 'any level'
      };
      
      Logger.info('[Analyzer] Built about section data:', {
        hasText: !!aboutContext.text,
        charCount: aboutContext.charCount,
        hasKeywords: aboutContext.hasKeywords
      });
      
      sections.push({
        type: 'about',
        name: 'About',
        data: aboutContext
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
            // First, add overall experience section for high-level analysis
            sections.push({
              type: 'experience_overall',
              name: 'Overall Experience',
              data: {
                ...extractedData.experience,
                experiences: deepExperienceData.experiences,
                experienceChunks: deepExperienceData.experienceChunks,
                averageTenure: deepExperienceData.averageTenure,
                careerProgression: deepExperienceData.careerProgression,
                totalRoles: deepExperienceData.experiences.length,
                currentRole: deepExperienceData.experiences[0], // Most recent role
                hasQuantifiedAchievements: deepExperienceData.hasQuantifiedAchievements,
                hasTechStack: deepExperienceData.hasTechStack
              }
            });
            
            Logger.info('[Analyzer] Added overall experience section for AI analysis');
            
            // Then add each experience role as a separate section for detailed analysis
            deepExperienceData.experiences.forEach((exp, index) => {
              // Create a display name with company
              const companyName = exp.company || 'Unknown Company';
              const displayName = `${companyName} - ${exp.title || 'Role'}`;
              
              sections.push({
                type: 'experience_role',
                name: displayName,
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
    if (extractedData.skills?.exists && extractedData.skills?.count > 0) {
      // IMPORTANT: Not using extractDeep() for skills to avoid navigation to /details/skills
      // Using visible skills data only, which includes count info for hidden skills
      const skillsData = extractedData.skills;
      
      // UNCONDITIONAL DEBUG: Log skills data structure
      
      // Cross-reference skills with experience descriptions
      const skillsInRoles = {};
      const skillCompanyMatrix = {};
      
      if (skillsData.skills && extractedData.experience?.experiences) {
        skillsData.skills.forEach(skill => {
          const skillNameLower = skill.name.toLowerCase();
          skillsInRoles[skill.name] = [];
          skillCompanyMatrix[skill.name] = [];
          
          extractedData.experience.experiences.forEach((exp, expIndex) => {
            // Check if skill is mentioned in role description
            if (exp.description && exp.description.toLowerCase().includes(skillNameLower)) {
              skillsInRoles[skill.name].push({
                role: exp.title,
                company: exp.company,
                isCurrent: exp.employment?.isCurrent || false,
                roleIndex: expIndex
              });
              
              if (!skillCompanyMatrix[skill.name].includes(exp.company)) {
                skillCompanyMatrix[skill.name].push(exp.company);
              }
            }
          });
        });
      }
      
      // Build career context for skills analysis
      const careerContext = {
        currentRole: extractedData.experience?.experiences?.[0] || null,
        recentCompanies: extractedData.experience?.experiences?.slice(0, 3).map(exp => ({
          company: exp.company,
          title: exp.title,
          duration: exp.duration,
          isCurrent: exp.employment?.isCurrent || false
        })) || [],
        totalExperience: extractedData.experience?.experiences?.length || 0,
        yearsOfExperience: this.calculateYearsOfExperience(extractedData.experience),
        
        // Add completeness score for conditional advice
        completenessScore: extractedData.completenessScore || 100,
        
        // NEW: Skills usage context
        skillsInRoles: skillsInRoles,
        skillCompanyMatrix: skillCompanyMatrix,
        
        // Skills mentioned in current/recent roles
        currentRoleSkills: Object.keys(skillsInRoles).filter(skill => 
          skillsInRoles[skill].some(role => role.isCurrent)
        ),
        recentRoleSkills: Object.keys(skillsInRoles).filter(skill => 
          skillsInRoles[skill].some(role => role.roleIndex < 3)
        )
      };
      
      // Log skills data for debugging
      Logger.info('SKILLS.DATA', 'Skills for AI with cross-references', {
        count: skillsData?.count,
        hasArray: Array.isArray(skillsData?.skills),
        skillsWithRoleMentions: Object.keys(skillsInRoles).filter(s => skillsInRoles[s].length > 0).length,
        currentRoleSkillsCount: careerContext.currentRoleSkills.length
      });
      
      // Enhanced skills data for AI analysis
      Logger.debug('[Analyzer] Skills data prepared for AI:', {
        totalCount: skillsData?.count,
        visibleCount: skillsData?.skills?.length,
        hasMoreSkills: skillsData?.hasMoreSkills,
        hasEndorsements: skillsData?.hasEndorsements
      });
      
      // UNCONDITIONAL DEBUG: Log final skills section data
      const skillsSectionData = {
        data: skillsData,
        context: careerContext
      };
      
      sections.push({
        type: 'skills',
        name: `Skills (${skillsData.totalCount || skillsData.count || 0} total)`,
        data: skillsData,
        context: careerContext
      });
    }
    
    // [CRITICAL_PATH:RECOMMENDATIONS_AI_EXTRACTION] - P0: Must extract recommendations for AI analysis
    // 4. Recommendations - Deep extract for AI analysis
    if (extractedData.recommendations?.exists && extractedData.recommendations?.count > 0) {
      // Deep extract recommendations to get full details
      try {
        const recommendationsExtractor = this.extractors.recommendations;
        if (recommendationsExtractor && typeof recommendationsExtractor.extractDeep === 'function') {
          Logger.info('[Analyzer] Running deep extraction for recommendations', {
            basicCount: extractedData.recommendations.count,
            receivedCount: extractedData.recommendations.receivedCount,
            hasExtractor: true
          });
          
          const deepRecommendationsData = await recommendationsExtractor.extractDeep();
          
          Logger.info('[Analyzer] Deep extraction returned:', {
            exists: deepRecommendationsData?.exists,
            count: deepRecommendationsData?.count,
            receivedCount: deepRecommendationsData?.receivedCount,
            hasRecommendationChunks: !!deepRecommendationsData?.recommendationChunks,
            chunksLength: deepRecommendationsData?.recommendationChunks?.length || 0,
            hasReceived: !!deepRecommendationsData?.received,
            receivedLength: deepRecommendationsData?.received?.length || 0,
            dataKeys: deepRecommendationsData ? Object.keys(deepRecommendationsData) : []
          });
          
          if (deepRecommendationsData && deepRecommendationsData.recommendationChunks) {
            // Replace basic data with deep data
            extractedData.recommendations = deepRecommendationsData;
            Logger.info(`[Analyzer] Deep extracted ${deepRecommendationsData.recommendationChunks.length} recommendations with full details`);
          } else if (deepRecommendationsData) {
            // Even if no chunks, use the deep data
            extractedData.recommendations = deepRecommendationsData;
            Logger.info('[Analyzer] Using deep recommendations data without chunks');
          }
        }
      } catch (error) {
        Logger.error('[Analyzer] Failed to deep extract recommendations:', error);
        // Continue with basic data
      }
      
      // Build career context for recommendations analysis
      const careerContext = {
        currentRole: extractedData.experience?.experiences?.[0] || null,
        recentCompanies: extractedData.experience?.experiences?.slice(0, 3).map(exp => ({
          company: exp.company,
          title: exp.title,
          duration: exp.duration,
          isCurrent: exp.employment?.isCurrent || false
        })) || [],
        allCompanies: extractedData.experience?.experiences?.map(exp => exp.company).filter(Boolean) || [],
        totalExperience: extractedData.experience?.experiences?.length || 0,
        yearsOfExperience: this.calculateYearsOfExperience(extractedData.experience)
      };
      
      sections.push({
        type: 'recommendations',
        name: `Recommendations (${extractedData.recommendations.count || 0} total)`,
        data: extractedData.recommendations,
        context: careerContext
      });
    }
    
    const totalSections = sections.length;
    Logger.info(`[Analyzer] Will analyze ${totalSections} sections sequentially`);
    
    // Track consecutive failures for early exit
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 2;
    
    // Analyze sections sequentially
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const stepNumber = i + 1;
      const sectionStartTime = Date.now();
      
      try {
        // Update UI with current section
        Logger.info(`[AI Analysis] Starting section ${stepNumber}/${totalSections}: ${section.name}`);
        
        // Format display name based on section type
        let displayName = section.name;
        if (section.type === 'experience_role' && section.data) {
          // Format as "Senior Product Manager role at Avalara"
          const title = section.data.title || 'Role';
          const company = section.data.company || 'Unknown Company';
          displayName = `${title} role at ${company}`;
        }
        
        OverlayManager.updateAIProgress('analyzing', displayName);
        
        // Log data size being sent
        const dataSize = JSON.stringify(section.data).length;
        Logger.info(`[AI Analysis] Data size for ${section.name}: ${dataSize} bytes`);
        
        // Analyze the section with 30-second timeout
        const result = await Promise.race([
          this.analyzeSection(section.type, section.data, section.context),
          new Promise((resolve) => 
            setTimeout(() => resolve({ success: false, error: 'Section analysis timeout (30s)' }), 30000)
          )
        ]);
        
        // Log completion
        const sectionElapsed = Date.now() - sectionStartTime;
        Logger.info(`[AI Analysis] Completed ${section.name} in ${sectionElapsed}ms - Score: ${result.score || 'N/A'}`);
        
        if (result.success) {
          consecutiveFailures = 0; // Reset on success
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
          
          consecutiveFailures++;
          
          // Check for early exit condition
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            Logger.error(`[AI Analysis] ${consecutiveFailures} consecutive failures - stopping analysis`);
            
            // Use enhanced error recovery with central state restoration
            Logger.info('[AI Analysis] Network failures detected - attempting cache recovery');
            
            try {
              const recovered = await OverlayManager.restoreAppropriateState(this.profileId, {
                isErrorFallback: true,
                error: 'Network connection lost',
                message: 'Connection lost during AI analysis. Showing cached results.'
              });
              
              if (recovered) {
                // Cache was restored, return success with cache flag
                return { 
                  success: true, 
                  fromCache: true, 
                  networkError: true,
                  partialResults: sectionResults 
                };
              }
            } catch (recoveryError) {
              Logger.error('[AI Analysis] Cache recovery failed:', recoveryError);
            }
            
            // Return failure with network error indication
            return {
              success: false,
              error: 'Network connection lost - analysis stopped',
              errorType: 'NETWORK',
              partialResults: sectionResults
            };
          }
        }
        
      } catch (error) {
        Logger.error(`[AI Analysis] Error analyzing ${section.name}:`, error);
        consecutiveFailures++;
        
        // Check for early exit on exception
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          Logger.error(`[AI Analysis] ${consecutiveFailures} consecutive errors - stopping analysis`);
          
          // Use enhanced error recovery with central state restoration
          Logger.info('[AI Analysis] Multiple errors detected - attempting cache recovery');
          
          try {
            const recovered = await OverlayManager.restoreAppropriateState(this.profileId, {
              isErrorFallback: true,
              error: 'Multiple errors occurred',
              message: 'Multiple errors during AI analysis. Showing cached results.'
            });
            
            if (recovered) {
              // Cache was restored, return success with cache flag
              return { 
                success: true, 
                fromCache: true, 
                multipleErrors: true,
                partialResults: sectionResults 
              };
            }
          } catch (recoveryError) {
            Logger.error('[AI Analysis] Cache recovery failed:', recoveryError);
          }
          
          return {
            success: false,
            error: 'Multiple errors occurred - analysis stopped',
            errorType: 'NETWORK',
            partialResults: sectionResults
          };
        }
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
    
    SmartLogger.log('AI.RESPONSES', 'Synthesis result to return', {
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
    SmartLogger.log('AI.PROMPTS', 'synthesizeResults called', {
      sectionCount: Object.keys(sectionResults).length,
      sections: Object.keys(sectionResults)
    });
    
    return new Promise((resolve) => {
      SmartLogger.log('AI.PROMPTS', 'Sending synthesizeAnalysis request');
      safeSendMessage({
        action: 'synthesizeAnalysis',
        sectionScores: sectionResults,
        sectionRecommendations: sectionRecommendations
      }, (response) => {
        SmartLogger.log('AI.RESPONSES', 'Synthesis callback fired', { response });
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
          
          SmartLogger.log('AI.RESPONSES', 'Synthesis success', {
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
   * Check if an error is retriable (network errors)
   */
  isRetriableError(error) {
    const message = error?.message?.toLowerCase() || '';
    // Network errors are retriable
    if (message.includes('network') || 
        message.includes('fetch') || 
        message.includes('timeout') ||
        message.includes('failed to fetch') ||
        error.code === 'NETWORK_ERROR') {
      return true;
    }
    // Don't retry auth errors, rate limits, or validation errors
    if (message.includes('401') || 
        message.includes('403') || 
        message.includes('invalid key') ||
        message.includes('rate limit')) {
      return false;
    }
    return false;
  }

  /**
   * Get error type from error object
   */
  getErrorType(error) {
    const message = error?.message?.toLowerCase() || '';
    if (message.includes('network') || message.includes('fetch')) return 'NETWORK';
    if (message.includes('401') || message.includes('403')) return 'AUTH';
    if (message.includes('rate limit')) return 'RATE_LIMIT';
    return 'UNKNOWN';
  }

  /**
   * Run AI analysis with retry logic
   */
  async runAIAnalysisWithRetry(extractedData, maxAttempts = 4) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Show retry status if not first attempt
        if (attempt > 1) {
          // Better spacing: 5s, 15s, 30s (total ~50 seconds)
          const retryDelays = [0, 5000, 15000, 30000];
          const waitTime = retryDelays[attempt - 1] || 30000;
          Logger.info(`[Analyzer] Retrying AI analysis, attempt ${attempt}/${maxAttempts} after ${waitTime}ms`);
          
          OverlayManager.setState(OverlayManager.states.AI_RETRYING, {
            message: 'Network error. Retrying',
            attempt: attempt,
            maxAttempts: maxAttempts,
            completeness: this.analysisResults?.completeness
          });
          
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        const result = await this.runAIAnalysis(extractedData);
        
        // Success - transition back to normal state
        if (attempt > 1) {
          Logger.info(`[Analyzer] AI analysis succeeded on attempt ${attempt}`);
          OverlayManager.setState(OverlayManager.states.AI_ANALYZING);
        }
        
        return result;
        
      } catch (error) {
        lastError = error;
        Logger.warn(`[Analyzer] AI analysis attempt ${attempt} failed:`, error);
        
        // Check if it's a network error that should be retried
        if (this.isRetriableError(error) && attempt < maxAttempts) {
          continue;
        }
        // Don't retry for non-network errors
        break;
      }
    }
    
    // All retries exhausted - attempt cache recovery
    Logger.error('[Analyzer] All AI analysis retry attempts exhausted', lastError);
    
    // Use enhanced error recovery with central state restoration
    Logger.info('[Analyzer] Network error after retries - attempting cache recovery');
    
    try {
      const recovered = await OverlayManager.restoreAppropriateState(this.profileId, {
        isErrorFallback: true,
        error: 'Network error',
        message: 'Network connection failed after multiple attempts. Showing cached results.'
      });
      
      if (recovered) {
        // Cache was restored, return success with cache flag
        return { 
          success: true, 
          fromCache: true, 
          networkError: true,
          retriesExhausted: true 
        };
      }
    } catch (recoveryError) {
      Logger.error('[Analyzer] Cache recovery also failed:', recoveryError);
    }
    
    // No cache available, return error
    return {
      success: false,
      error: lastError?.message || 'Network error after multiple attempts',
      errorType: this.getErrorType(lastError),
      retriesExhausted: true
    };
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
          // Handle specific error types
          let errorMessage = response?.error || 'AI analysis failed';
          let errorType = response?.errorType || response?.type;
          
          // Check for decryption failure
          if (response?.decryptionFailed) {
            errorMessage = 'Failed to decrypt API key. Please re-enter your key in settings.';
            errorType = 'AUTH';
          }
          
          resolve({
            success: false,
            error: errorMessage,
            errorType: errorType,
            retryAfter: response?.retryAfter,
            decryptionFailed: response?.decryptionFailed
          });
        }
      });
    });
  }
}