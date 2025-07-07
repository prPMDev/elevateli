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
      if (this.settings.enableAI && this.settings.apiKey && this.settings.aiProvider) {
        OverlayManager.setState(OverlayManager.states.AI_ANALYZING);
        
        const aiResult = await this.runAIAnalysis(extractedData);
        if (aiResult.success) {
          result.contentScore = aiResult.score;
          result.recommendations = aiResult.recommendations;
          result.insights = aiResult.insights;
        }
      }
      
      // Save to cache
      await this.cacheManager.save(this.profileId, result, extractedData);
      
      // Update overlay with final results
      OverlayManager.setState(OverlayManager.states.COMPLETE, {
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
   * Run AI analysis
   */
  async runAIAnalysis(extractedData) {
    return new Promise((resolve) => {
      safeSendMessage({
        action: 'analyzeWithAI',
        data: extractedData,
        settings: this.settings
      }, (response) => {
        if (response && response.success) {
          resolve({
            success: true,
            score: response.score,
            recommendations: response.recommendations,
            insights: response.insights
          });
        } else {
          resolve({
            success: false,
            error: response?.error || 'AI analysis failed'
          });
        }
      });
    });
  }
}