/**
 * ElevateLI Analyzer Base
 * Main orchestrator for LinkedIn profile analysis
 */

/* ============================================
 * ANALYZER CLASS
 * ============================================ */
class Analyzer {
  constructor() {
    // The manifest loads every extractor before this file
    this.extractors = {
      photo: PhotoExtractor,
      headline: HeadlineExtractor,
      about: AboutExtractor,
      experience: ExperienceExtractor,
      skills: SkillsExtractor,
      education: EducationExtractor,
      recommendations: RecommendationsExtractor,
      certifications: CertificationsExtractor,
      projects: ProjectsExtractor,
      featured: FeaturedExtractor
    };
    
    this.profileId = null;
    this.isOwn = false;
    this.settings = {};
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
  }
  
  /**
   * Run the analysis
   * @param {boolean} forceRefresh - Force refresh even if cached
   */
  async analyze(forceRefresh = false) {
    // 20 minutes: 5 sections x 190s section timeout, plus extraction
    const analysisTimeout = setTimeout(() => this.handleAnalysisTimeout(), 1200000);

    // Cached data, also for the fallbacks in the catch block
    let cachedData = null;

    try {
      // Update overlay state
      OverlayManager.setState(OverlayManager.states.SCANNING);
      
      // Use the cache unless forced refresh; a forced refresh keeps it for the fallbacks below
      const cacheKey = `cache_${this.profileId}`;
      cachedData = (await chrome.storage.local.get(cacheKey))[cacheKey];
      if (!forceRefresh && cachedData?.completeness !== undefined) {
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
        return;
      }

      // Run extractors
      const extractedData = await this.runExtractors();
      // analyzer-main cancelAnalysis(): navigation, Reset analysis or Factory Reset. Stop reading, saving and painting.
      if (this.cancelled) return;

      // Calculate completeness
      OverlayManager.setState(OverlayManager.states.CALCULATING);

      const completenessData = this.calculateCompleteness(extractedData);

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
        if (this.cancelled) return;

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
          aiResult = await this.runDistributedAIAnalysis(extractedData, cachedData?.sectionScores)
            .catch(error => ({ success: false, error: error.message }));
        }

        if (aiResult.success) {
          result.contentScore = aiResult.score;
          result.sectionScores = aiResult.sectionScores;
          failedSections = aiResult.failed;
        } else {
          // Keep the previous AI results with the new completeness
          if (cachedData?.contentScore !== undefined) {
            result.contentScore = cachedData.contentScore;
            result.sectionScores = cachedData.sectionScores;
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
        // Reset all cleared storage before its onChanged event reached this tab: leave 'AI analyzing...' for first-run setup
        if (!this.cancelled) {
          OverlayManager.hasCompliance = false;
          OverlayManager.setState(OverlayManager.states.INITIALIZING);
        }
        return;
      }

      // Save to cache (result.extractedData is extractedData); stamped with the save time
      await chrome.storage.local.set({ [`cache_${this.profileId}`]: { ...result, timestamp: new Date().toISOString() } })
        .catch(error => console.error('[Analyzer] Cache save failed:', error));

      // Update overlay with final results. An AI failure keeps the completeness results and advice
      // (COMPLETE, as a reload shows them); earlier AI results come back with the cache-fallback banner.
      let finalState = OverlayManager.states.COMPLETE;
      if (result.aiError) {
        if (result.aiFailedWithCache) {
          finalState = OverlayManager.states.ANALYSIS_FAILED_CACHE_FALLBACK;
        } else if (result.aiError.type === 'validation_failed') {
          // Add a specific message for API key errors
          result.apiKeyError = true;
          result.apiKeyErrorMessage = result.aiError.message;
        }
      }

      const overlayData = {
        ...result,
        // Previous AI results kept after an AI failure
        fromCache: result.aiFailedWithCache,
        // Cache-fallback banner text: say what failed (e.g. rate limit wait time)
        message: result.aiError && `AI analysis failed (${result.aiError.message}). Showing your previous AI results.`,
        // Only mark AI as disabled if there's no content score
        aiDisabled: result.contentScore === undefined || result.contentScore === null,
        // The overlay's 'AI failed' contract (aiError + settings.enableAI), as the cache restore passes it
        settings: { enableAI: this.settings.enableAI }
      };

      OverlayManager.setState(finalState, overlayData);
      // COMPLETE announces the run's end and any AI error. Sections that kept an earlier rating look unchanged, so name them.
      if (failedSections.length) OverlayManager.showToast(`AI could not analyze ${failedSections.join(', ')} this time.`);
    } catch (error) {
      console.error('[Analyzer] Analysis failed:', error);
      // An extension reload orphans this run (chrome.storage throws); the new script's overlay is not its to paint
      if (this.cancelled || !chrome.runtime?.id) return;

      // If we have cached data, fall back to it; otherwise show the error
      if (cachedData?.completeness !== undefined) {
        OverlayManager.setState(OverlayManager.states.ANALYSIS_FAILED_CACHE_FALLBACK, {
          ...cachedData,
          fromCache: true,
          analysisError: error.message,
          message: 'Analysis couldn\'t complete. Showing cached results. Please try again in a few minutes.',
          // Only mark AI as disabled if there's no content score
          aiDisabled: cachedData.contentScore === undefined || cachedData.contentScore === null
        });
      } else {
        OverlayManager.setState(OverlayManager.states.ERROR, { message: error.message });
      }
    } finally {
      clearTimeout(analysisTimeout);
    }
  }
  
  /**
   * Calculate total years of experience
   * @param {Object} experienceData - Experience data from extractor
   * @returns {number} Years of experience
   */
  calculateYearsOfExperience(experienceData) {
    // The extractor stores 'Mon YYYY' under employment; skip roles without a parseable date
    const starts = (experienceData?.experiences || []).map(e => Date.parse(e.employment?.startDate)).filter(t => !isNaN(t));
    const years = (Date.now() - Math.min(Date.now(), ...starts)) / (365.25 * 24 * 60 * 60 * 1000);
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
    const response = await safeSendMessage({ action: 'validateApiKey' });
    return response?.success ? { isValid: true } : { isValid: false, error: response?.error || 'ElevateLI could not reach its service worker. Reload the page and try again.' };
  }
  
  /**
   * Run all extractors
   */
  async runExtractors() {
    // Leaving this profile page (another profile, a /details/ subpage) cancels the run right away, as analyzer-main's
    // leftProfile() would: the scan's own scrolling keeps that debounced observer from firing until it ends
    const stop = () => {
      if (extractProfileIdFromUrl() !== this.profileId || !isProfilePage()) this.cancelled = true;
      return this.cancelled;
    };

    // Lower profile sections render only once scrolled into view; the overlay's SCANNING toast explains the motion
    await BaseExtractor.loadLazySections(stop);
    // A cancelled run must not scan the next page
    if (stop()) return {};

    // Run extractors in parallel. A missing section returns its scan result, so the scorer gets exists: false
    return Object.fromEntries(await Promise.all(Object.entries(this.extractors).map(async ([name, extractor]) => {
      try {
        const scanResult = await extractor.scan();
        return [name, scanResult.exists ? await extractor.extract() : scanResult];
      } catch (error) {
        console.error(`[Analyzer] ${name} extraction failed:`, error);
        return [name, null];
      }
    })));
  }
  
  /**
   * Calculate completeness score
   */
  calculateCompleteness(extractedData) {
    try {
      return new ProfileCompletenessCalculator().calculate(extractedData);
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
    
    // Build list of sections to analyze. Each sends only what its service-worker prompt reads.
    // [CRITICAL_PATH:FIRST_IMPRESSION_EXTRACTION] - P0: Extract all first impression data
    // 1. First Impression (Headline + Photo)
    if (extractedData.headline || extractedData.photo) {
      sections.push({
        type: 'first_impression',
        name: 'First Impression',
        // [CRITICAL_PATH:FIRST_IMPRESSION_DATA] - P0: Must include all visual elements
        data: {
          headline: extractedData.headline?.text || '',
          headlineCharCount: extractedData.headline?.charCount || 0,
          photo: { exists: extractedData.photo?.exists || false }
          // No banner/Open to Work/Creator Mode/connections: no extractor produces them
        }
      });
    }
    
    // [CRITICAL_PATH:ABOUT_ISOLATED] - P0: About must be separate section
    // 2. About Section (separate from headline). The SW reads the role and level from storage.
    if (extractedData.about?.exists || extractedData.about?.text) {
      sections.push({ type: 'about', name: 'About', data: { text: extractedData.about?.text || '' } });
    }
    
    // 3. Experience (one overall section; roles feed its prompt)
    if (extractedData.experience?.exists && extractedData.experience?.count > 0) {
      try {
        const deep = await this.extractors.experience.extractDeep();
        if (this.cancelled) return { success: false, cancelled: true };

        if (deep.experiences?.length) {
          // Expose roles to the skills/recommendations career context below
          extractedData.experience.experiences = deep.experiences;
          sections.push({
            type: 'experience_overall',
            name: 'Overall Experience',
            data: { ...extractedData.experience, averageTenure: deep.averageTenure, totalRoles: deep.experiences.length }
          });
        }
      } catch (error) {
        console.error('[Analyzer] Failed to extract deep experience data:', error);
        // Fallback: analyze experience as a single section
        sections.push({
          type: 'experience',
          name: `Experience (${extractedData.experience.count} roles)`,
          data: extractedData.experience
        });
      }
    }
    
    // Career context for the skills and recommendations prompts
    const roles = extractedData.experience?.experiences || [];
    const career = {
      // The latest role may have ended (between jobs): "Not specified" then, like the experience prompt
      currentRole: roles.find(e => e.employment?.isCurrent) || null,
      recentCompanies: roles.slice(0, 3).map(e => ({ company: e.company })),
      yearsOfExperience: this.calculateYearsOfExperience(extractedData.experience)
    };
    
    // 4. Skills: visible skills only (no /details/skills navigation); the data carries the hidden count
    if (extractedData.skills?.exists && extractedData.skills?.count > 0) {
      const skillsData = extractedData.skills;
      sections.push({
        type: 'skills',
        name: `Skills (${skillsData.totalCount || skillsData.count || 0} total)`,
        data: skillsData,
        // Completeness score for conditional advice
        context: { ...career, completenessScore: extractedData.completenessScore || 100 }
      });
    }
    
    // [CRITICAL_PATH:RECOMMENDATIONS_AI_EXTRACTION] - P0: Must extract recommendations for AI analysis
    // 5. Recommendations - Deep extract for AI analysis
    if (extractedData.recommendations?.exists && extractedData.recommendations?.count > 0) {
      try {
        extractedData.recommendations = await this.extractors.recommendations.extractDeep();
      } catch (error) {
        console.error('[Analyzer] Failed to deep extract recommendations:', error);
        // Continue with basic data
      }
      
      sections.push({
        type: 'recommendations',
        name: `Recommendations (${extractedData.recommendations.count || 0} total)`,
        data: extractedData.recommendations,
        context: career
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
          OverlayManager.updateAIProgress('analyzing', section.name, i + 1, sections.length);

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

    // 6. Synthesize all results
    if (this.cancelled) return { success: false, cancelled: true };
    OverlayManager.updateAIProgress('synthesizing', 'Synthesizing results...');

    return { ...this.synthesizeResults(sectionResults), failed };
  }
  
  /**
   * Analyze individual section
   */
  async analyzeSection(section, data, context = {}) {
    const r = await safeSendMessage({ action: 'analyzeSection', section, data, context });
    return r?.success
      ? { success: true, section, score: r.score, positiveInsight: r.insight, actionItems: r.actionItems }
      : { success: false, section, error: r?.error || 'Section analysis failed', errorType: r?.errorType, retryAfter: r?.retryAfter };
  }
  
  /**
   * Content score: the weighted average of the scored sections
   */
  synthesizeResults(sectionScores) {
    const weights = { first_impression: 0.20, about: 0.25, experience_overall: 0.30, skills: 0.15, recommendations: 0.10 };
    let total = 0, weight = 0;
    for (const [type, r] of Object.entries(sectionScores)) {
      if (r?.score == null) continue;
      const w = weights[type] || 0.1; // the 'experience' fallback section
      total += r.score * w;
      weight += w;
    }
    // No section scored: fail instead of inventing a score; analyze() keeps the previous AI results
    return weight ? { success: true, score: Math.round(total / weight * 10) / 10, sectionScores }
      : { success: false, error: 'AI could not score any section' };
  }
}