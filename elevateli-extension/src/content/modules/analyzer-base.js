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
    
    // Initialize cache manager
    this.cacheManager = new CacheManager(settings.cacheDuration || 7);
    
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
    try {
      Logger.info('[Analyzer] Starting analysis', { 
        profileId: this.profileId, 
        isOwn: this.isOwn,
        forceRefresh 
      });
      
      // Update overlay state
      OverlayManager.setState(OverlayManager.states.SCANNING);
      
      // Check cache first (unless forced refresh)
      if (!forceRefresh) {
        const cachedData = await this.cacheManager.get(this.profileId);
        if (cachedData && cachedData.completeness !== undefined) {
          Logger.info('[Analyzer] Using cached data');
          
          OverlayManager.setState(OverlayManager.states.CACHE_LOADED, {
            ...cachedData,
            fromCache: true,
            aiDisabled: !this.settings.enableAI
          });
          
          return { success: true, fromCache: true, data: cachedData };
        }
      }
      
      // Run extractors
      const extractedData = await this.runExtractors();
      
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
        
        OverlayManager.setState(OverlayManager.states.AI_ANALYZING);
        
        const aiResult = await this.runAIAnalysis(extractedData);
        if (aiResult.success) {
          result.contentScore = aiResult.score;
          result.recommendations = aiResult.recommendations;
          result.insights = aiResult.insights;
          result.sectionScores = aiResult.sectionScores;
          
          Logger.info('[Analyzer] AI Result Details:', {
            score: aiResult.score,
            recommendations: aiResult.recommendations,
            insights: aiResult.insights,
            fullResult: aiResult
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
      } else {
        Logger.info('[Analyzer] Skipping AI analysis', {
          enableAI: this.settings.enableAI,
          hasApiKey: !!hasApiKey,
          aiProvider: this.settings.aiProvider
        });
      }
      
      // Save to cache
      await this.cacheManager.save(this.profileId, result, extractedData);
      
      // Update overlay with final results
      // If AI failed but we have completeness, show complete state with error
      const finalState = result.aiError && this.settings.enableAI ? 
        OverlayManager.states.ERROR : 
        OverlayManager.states.COMPLETE;
      
      OverlayManager.setState(finalState, {
        ...result,
        aiDisabled: !this.settings.enableAI
      });
      
      return { success: true, data: result };
      
    } catch (error) {
      Logger.error('[Analyzer] Analysis failed:', error);
      OverlayManager.setState(OverlayManager.states.ERROR, {
        message: error.message
      });
      return { success: false, error: error.message };
    }
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
          OverlayManager.setState(OverlayManager.states.EXTRACTING);
          OverlayManager.updateExtractionProgress(name);
          
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
      sections: Object.keys(results).filter(k => results[k]?.exists).length 
    });
    
    return results;
  }
  
  /**
   * Calculate completeness score
   */
  async calculateCompleteness(extractedData) {
    if (typeof ProfileCompletenessCalculator !== 'undefined') {
      const calculator = new ProfileCompletenessCalculator();
      return calculator.calculate(extractedData);
    }
    
    // Fallback calculation
    Logger.warn('[Analyzer] ProfileCompletenessCalculator not available, using fallback');
    return {
      score: 50,
      recommendations: [],
      breakdown: {}
    };
  }
  
  /**
   * Run distributed AI analysis (section by section)
   */
  async runDistributedAIAnalysis(extractedData) {
    Logger.info('[Analyzer] Starting distributed AI analysis');
    
    const sectionPromises = [];
    const sectionResults = {};
    const sectionRecommendations = {};
    
    // 1. Analyze Profile Intro (About + Headline + Photo)
    if (extractedData.headline || extractedData.about) {
      sectionPromises.push(
        this.analyzeSection('profile_intro', {
          headline: extractedData.headline,
          about: extractedData.about,
          photo: extractedData.photo,
          topSkills: extractedData.skills?.skills?.slice(0, 10).map(s => s.name || s.skill)
        })
      );
    }
    
    // 2. Analyze Each Experience Role
    if (extractedData.experience?.experiences?.length > 0) {
      extractedData.experience.experiences.forEach((exp, index) => {
        sectionPromises.push(
          this.analyzeSection('experience_role', exp, {
            position: index,
            totalRoles: extractedData.experience.experiences.length,
            previousRole: extractedData.experience.experiences[index - 1],
            nextRole: extractedData.experience.experiences[index + 1]
          })
        );
      });
    }
    
    // 3. Analyze Skills
    if (extractedData.skills) {
      sectionPromises.push(
        this.analyzeSection('skills', extractedData.skills)
      );
    }
    
    // 4. Analyze Recommendations
    if (extractedData.recommendations) {
      sectionPromises.push(
        this.analyzeSection('recommendations', extractedData.recommendations)
      );
    }
    
    // Execute all section analyses in parallel
    const results = await Promise.allSettled(sectionPromises);
    
    // Process results
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.success) {
        const section = result.value.section;
        sectionResults[section] = result.value;
        sectionRecommendations[section] = result.value.recommendations || [];
        
        // Update UI progressively
        OverlayManager.updateSectionScore(section, result.value.score);
      }
    });
    
    // 5. Synthesize all results
    const synthesis = await this.synthesizeResults(sectionResults, sectionRecommendations);
    
    return synthesis;
  }
  
  /**
   * Analyze individual section
   */
  async analyzeSection(sectionType, data, context = {}) {
    return new Promise((resolve) => {
      safeSendMessage({
        action: 'analyzeSectionAI',
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
            insights: response.insights
          });
        } else {
          resolve({
            success: false,
            section: sectionType,
            error: response?.error || 'Section analysis failed'
          });
        }
      });
    });
  }
  
  /**
   * Synthesize all section results
   */
  async synthesizeResults(sectionResults, sectionRecommendations) {
    return new Promise((resolve) => {
      safeSendMessage({
        action: 'synthesizeAnalysis',
        sectionScores: sectionResults,
        sectionRecommendations: sectionRecommendations
      }, (response) => {
        if (response && response.success) {
          resolve({
            success: true,
            score: response.finalScore,
            synthesis: response.synthesis,
            recommendations: response.overallRecommendations,
            insights: response.careerNarrative
          });
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
          resolve({
            success: true,
            score: response.score,
            recommendations: response.recommendations,
            insights: response.insights,
            sectionScores: response.sectionScores,
            summary: response.summary
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