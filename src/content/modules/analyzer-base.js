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
    
    
  }
  
  /**
   * Run the analysis
   * @param {boolean} forceRefresh - Force refresh even if cached
   */
  async analyze(forceRefresh = false) {
    // Development mode configuration
    const TIMEOUTS = {
      ANALYSIS_TOTAL: 1200000,  // 20 minutes: 5 sections x 190s section timeout, plus extraction and synthesis
      SECTION_TIMEOUT: 60000,  // 60 seconds per section
      SYNTHESIS_TIMEOUT: 60000, // 60 seconds for synthesis
      DEVELOPMENT_MODE: true   // Enable extended timeouts
    };
    
    
    // Set analysis timeout
    const analysisTimeout = setTimeout(() => {
      this.handleAnalysisTimeout();
    }, TIMEOUTS.ANALYSIS_TOTAL);
    
    // Store cached data for fallback (moved outside try block for catch block access)
    let cachedData = null;
    
    try {
      
      // Update overlay state
      OverlayManager.setState(OverlayManager.states.SCANNING);
      
      // Check cache first (unless forced refresh)
      if (!forceRefresh) {
        cachedData = await this.cacheManager.get(this.profileId);
        if (cachedData && cachedData.completeness !== undefined) {
          
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
      // analyzer-main cancelAnalysis(): navigation, Reset analysis or Factory Reset. Stop reading, saving and painting.
      if (this.cancelled) return { success: false, cancelled: true };

      // Calculate completeness
      OverlayManager.setState(OverlayManager.states.CALCULATING);

      const completenessData = await this.calculateCompleteness(extractedData);
      
      
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
      const hasApiKey = this.settings.encryptedApiKey;
      // Sections the AI could not score this run (named in the completion toast)
      let failedSections = [];
      
      
      if (this.settings.enableAI && hasApiKey && this.settings.aiProvider) {
        
        // Pre-flight API key validation. A failed check takes the same
        // keep-previous-AI-results path as a failed AI run below.
        const validationResult = await this.validateApiKey();
        if (this.cancelled) return { success: false, cancelled: true };

        let aiResult;
        if (!validationResult.isValid) {
          // Only a key problem is a key error. Offline, 429/5xx or a stopped local server keep the SW's own
          // message and are classified below.
          const error = validationResult.error || 'Invalid Key';
          aiResult = { success: false, error, errorType: /api key/i.test(error) ? 'validation_failed' : undefined };
        } else {
          // API key is valid, proceed with AI analysis
          OverlayManager.setState(OverlayManager.states.AI_ANALYZING, { completeness: completenessData.score });

          // Pass completeness score to AI analysis for conditional advice
          extractedData.completenessScore = completenessData?.score || 100;
          aiResult = await this.runAIAnalysis(extractedData, cachedData?.sectionScores);
        }

        if (aiResult.success) {
          result.contentScore = aiResult.score;
          result.sectionScores = aiResult.sectionScores;
          failedSections = aiResult.failed;
        } else {

          // Check for cached AI data to merge with new completeness
          if (cachedData && cachedData.contentScore !== undefined) {

            result.contentScore = cachedData.contentScore;
            result.sectionScores = cachedData.sectionScores;
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
      }
      
      // Cancelled, or a factory reset during the run cleared storage: don't write this run back or show it
      const { compliance } = await chrome.storage.local.get('compliance');
      if (this.cancelled || !compliance?.hasAcknowledged) {
        clearTimeout(analysisTimeout);
        // Factory Reset from another tab (only the active tab is told): leave 'AI analyzing...' for first-run setup
        if (!this.cancelled) {
          OverlayManager.hasCompliance = false;
          OverlayManager.setState(OverlayManager.states.INITIALIZING);
        }
        return { success: false, cancelled: true };
      }

      // Save to cache
      await this.cacheManager.save(this.profileId, result, extractedData);
      
      // Clear timeout on success
      clearTimeout(analysisTimeout);
      
      // Log total analysis time
      
      // Update overlay with final results. An AI failure keeps the completeness results and advice
      // (COMPLETE, as a reload shows them); earlier AI results come back with the cache-fallback banner.
      let finalState = OverlayManager.states.COMPLETE;
      if (result.aiError && this.settings.enableAI) {
        if (result.partialUpdate) {
          finalState = OverlayManager.states.ANALYSIS_FAILED_CACHE_FALLBACK;
        } else if (result.aiError.type === 'validation_failed') {
          // Add a specific message for API key errors
          result.apiKeyError = true;
          result.apiKeyErrorMessage = result.aiError.message;
        }
      }
      
      
      // Log what we're passing to overlay manager
      const overlayData = {
        ...result,
        // Ensure fromCache flag is set for partial updates
        fromCache: result.partialUpdate || result.cachedContentScore || result.fromCache,
        // Cache-fallback banner text: say what failed (e.g. rate limit wait time)
        message: result.aiError && `AI analysis failed (${result.aiError.message}). Showing your previous AI results.`,
        // Only mark AI as disabled if there's no content score
        aiDisabled: result.contentScore === undefined || result.contentScore === null,
        // The overlay's 'AI failed' contract (aiError + settings.enableAI), as the cache restore passes it
        settings: { enableAI: this.settings.enableAI }
      };
      
      
      
      OverlayManager.setState(finalState, overlayData);
      // Announce the end of the run from the fixed-position toast, wherever the page is scrolled
      const aiNote = result.aiError ? ` AI analysis failed: ${result.aiError.message}`
        : failedSections.length ? ` AI could not analyze ${failedSections.join(', ')} this time.` : '';
      OverlayManager.showToast(`Analysis done: profile ${result.completeness}% complete.${aiNote}`, aiNote ? 'warning' : 'success');
      
      return { success: true, data: result };
      
    } catch (error) {
      console.error('[Analyzer] Analysis failed:', error);
      clearTimeout(analysisTimeout);
      // An extension reload orphans this run (chrome.storage throws); the new script's overlay is not its to paint
      if (this.cancelled || !chrome.runtime?.id) return { success: false, cancelled: true };

      // If we have cached data, fall back to it
      if (cachedData && cachedData.completeness !== undefined) {
        
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
      // The extractor stores 'Mon YYYY' under employment; skip roles without a parseable date
      const startDate = new Date(exp.employment?.startDate);
      if (!isNaN(startDate) && startDate < earliestStart) {
        earliestStart = startDate;
      }
    });
    
    const now = new Date();
    const years = (now - earliestStart) / (1000 * 60 * 60 * 24 * 365.25);
    return Math.round(years * 10) / 10; // Round to 1 decimal
  }

  /**
   * Handle analysis timeout
   */
  async handleAnalysisTimeout() {
    if (this.cancelled) return;
    try {
      // Check if we have partial results (completeness score)
      if (this.analysisResults && this.analysisResults.completeness !== undefined) {
        
        // Create partial results object
        const partialResults = {
          completeness: this.analysisResults.completeness,
          completenessData: this.analysisResults.completenessData,
          extractedData: this.analysisResults.extractedData,
          // The overlay's "AI failed" contract: contentScore 0 + aiError + settings.enableAI
          // renders "No score" instead of a 0-star rating
          contentScore: 0,
          aiDisabled: true,
          aiError: {
            type: 'timeout',
            message: 'AI analysis took too long. Try again for full analysis.'
          },
          settings: { enableAI: this.settings.enableAI },
          timestamp: Date.now()
        };
        
        // Show partial results in the UI
        OverlayManager.setState(OverlayManager.states.COMPLETE, partialResults);
        
        // Don't cache partial results
        return;
      }
      
      // Use enhanced error recovery with central state restoration
      
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
      console.error('[Analyzer] Error handling timeout:', error);
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
    const results = {};
    // Leaving this profile cancels the run right away: the scan's own scrolling keeps analyzer-main's
    // debounced navigation observer from firing until it ends
    const stop = () => {
      if (extractProfileIdFromUrl() !== this.profileId) this.cancelled = true;
      return this.cancelled;
    };
    
    // Update scan progress
    const sections = Object.keys(this.extractors).map(name => ({
      name,
      status: 'pending',
      itemCount: 0
    }));
    
    OverlayManager.updateScanProgress(sections);
    
    // Lower profile sections render only once scrolled into view. The page jumps meanwhile, and the
    // overlay scrolls away with it, so explain it from the fixed-position toast
    const toast = OverlayManager.showToast('Scrolling through your profile so LinkedIn loads every section…', 'info', 60000);
    try {
      await BaseExtractor.loadLazySections(stop);
    } finally {
      toast.remove();
    }
    // A cancelled run must not scan the next page or paint EXTRACTING over a reset overlay
    if (stop()) return results;
    
    // Run extractors in parallel
    const promises = Object.entries(this.extractors).map(async ([name, extractor]) => {
      if (!extractor) {
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
        console.error(`[Analyzer] ${name} extraction failed:`, error);
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
        
        
        const result = calculator.calculate(extractedData);
        return result;
      }
      
      // Fallback calculation
      return {
        score: 50,
        recommendations: [],
        breakdown: {}
      };
    } catch (error) {
      console.error('[Analyzer] Error calculating completeness:', error);
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
  async runDistributedAIAnalysis(extractedData, prevScores) {
    const sectionResults = {};
    const sections = [];
    
    // Build list of sections to analyze
    // [CRITICAL_PATH:FIRST_IMPRESSION_EXTRACTION] - P0: Extract all first impression data
    // 1. First Impression (Headline + Photo + Banner)
    if (extractedData.headline || extractedData.photo || extractedData.banner) {
      sections.push({
        type: 'first_impression',
        name: 'First Impression',
        // [CRITICAL_PATH:FIRST_IMPRESSION_DATA] - P0: Must include all visual elements
        data: {
          headline: extractedData.headline?.text || '',
          headlineCharCount: extractedData.headline?.charCount || 0,
          photo: {
            exists: extractedData.photo?.exists || false,
            hasPhoto: extractedData.photo?.exists || false
          }
          // No banner/Open to Work/Creator Mode/connections: no extractor produces them
        }
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
      
      
      sections.push({
        type: 'about',
        name: 'About',
        data: aboutContext
      });
    }
    
    // 2. Experience (one overall section; roles feed its prompt)
    // Check if experience exists and has count > 0
    if (extractedData.experience?.exists && extractedData.experience?.count > 0) {
      // Need to run extractDeep to get individual experiences for AI analysis
      
      try {
        // Run deep extraction to get detailed experiences
        const experienceExtractor = this.extractors.experience;
        
        if (experienceExtractor && typeof experienceExtractor.extractDeep === 'function') {
          const deepExperienceData = await experienceExtractor.extractDeep();
          if (this.cancelled) return { success: false, cancelled: true };

          if (deepExperienceData.experiences && deepExperienceData.experiences.length > 0) {
            // Expose roles to skills/recommendations career context below
            extractedData.experience.experiences = deepExperienceData.experiences;

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
          }
        }
      } catch (error) {
        console.error('[Analyzer] Failed to extract deep experience data:', {
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
        // The latest role may have ended (between jobs): "Not specified" then, like the experience prompt
        currentRole: extractedData.experience?.experiences?.find(e => e.employment?.isCurrent) || null,
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
          
          const deepRecommendationsData = await recommendationsExtractor.extractDeep();
          
          
          if (deepRecommendationsData && deepRecommendationsData.recommendationChunks) {
            // Replace basic data with deep data
            extractedData.recommendations = deepRecommendationsData;
          } else if (deepRecommendationsData) {
            // Even if no chunks, use the deep data
            extractedData.recommendations = deepRecommendationsData;
          }
        }
      } catch (error) {
        console.error('[Analyzer] Failed to deep extract recommendations:', error);
        // Continue with basic data
      }
      
      // Build career context for recommendations analysis
      const careerContext = {
        currentRole: extractedData.experience?.experiences?.find(e => e.employment?.isCurrent) || null,
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
    
    
    // Track consecutive failures for early exit
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 2;
    let result;
    let scored = false;
    const failed = [];
    
    // Analyze sections sequentially
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      // Also covers the recommendations extractDeep above
      if (this.cancelled) return { success: false, cancelled: true };

      // Two failures in a row: stop calling the provider; the remaining sections fail with the same error
      if (consecutiveFailures < MAX_CONSECUTIVE_FAILURES) {
        try {
          OverlayManager.updateAIProgress('analyzing', section.name);

          // Above the SW's 180 s per AI call, so the SW's own error is the one reported
          result = await Promise.race([
            this.analyzeSection(section.type, section.data, section.context),
            new Promise((resolve) =>
              setTimeout(() => resolve({ success: false, error: 'Section analysis timeout (190s)' }), 190000)
            )
          ]);
        } catch (error) {
          console.error(`[AI Analysis] Error analyzing ${section.name}:`, error);
          result = { success: false, error: error.message };
        }
      }

      if (result.success) {
        consecutiveFailures = 0; // Reset on success
        scored = true;
        sectionResults[section.type] = result;
      } else {
        consecutiveFailures++;
        failed.push(section.name.replace(/ \(.*\)$/, ''));
        // Keep the section's last good result, as a whole-run failure keeps them all. Otherwise record
        // the failure so the overlay says this section failed instead of "Enable AI"
        const prev = prevScores?.[section.type];
        sectionResults[section.type] = prev?.score != null ? prev
          : { score: null, errorType: 'ANALYSIS_FAILED', error: result.error, actionItems: [] };
      }
    }

    // Nothing scored this run: report the real error (RATE_LIMIT/AUTH, retryAfter); analyze() keeps the previous AI results
    if (result && !scored) {
      return { success: false, error: result.error, errorType: result.errorType, retryAfter: result.retryAfter };
    }

    // 5. Synthesize all results
    if (this.cancelled) return { success: false, cancelled: true };
    OverlayManager.updateAIProgress('synthesizing', 'Synthesizing results...');

    return { ...await this.synthesizeResults(sectionResults), failed };
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
        context: context
      }, (response) => {
        if (response && response.success) {
          resolve({
            success: true,
            section: sectionType,
            score: response.score,
            // Include all AI analysis fields
            positiveInsight: response.insight,
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
            error: errorMessage,
            errorType: response?.errorType,
            retryAfter: response?.retryAfter
          });
        }
      });
    });
  }
  
  /**
   * Synthesize all section results
   */
  async synthesizeResults(sectionResults) {

    return new Promise((resolve) => {
      safeSendMessage({
        action: 'synthesizeAnalysis',
        sectionScores: sectionResults
      }, (response) => {
        
        if (response && response.success) {
          resolve({ success: true, score: response.finalScore, sectionScores: response.sectionScores });
        } else {
          // Treated like any AI failure: analyze() keeps the previous AI results
          resolve({ success: false, error: response?.error || 'Synthesis failed' });
        }
      });
    });
  }

  /**
   * Run AI analysis. Resolves with { success: false, error } instead of rejecting.
   */
  async runAIAnalysis(extractedData, prevScores) {
    try {
      return await this.runDistributedAIAnalysis(extractedData, prevScores);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}