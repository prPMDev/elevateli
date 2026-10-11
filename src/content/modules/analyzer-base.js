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
      ANALYSIS_TOTAL: 300000,  // 5 minutes timeout
      SECTION_TIMEOUT: 60000,  // 60 seconds per section
      SYNTHESIS_TIMEOUT: 60000, // 60 seconds for synthesis
      DEVELOPMENT_MODE: true   // Enable extended timeouts
    };
    
    
    // Set analysis timeout (3 minutes for development)
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
      
      // Calculate completeness
      OverlayManager.setState(OverlayManager.states.CALCULATING);
      
      
      // Use requestAnimationFrame to ensure UI updates
      await new Promise(resolve => requestAnimationFrame(resolve));
      
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
      
      
      if (this.settings.enableAI && hasApiKey && this.settings.aiProvider) {
        
        // Pre-flight API key validation
        const validationResult = await this.validateApiKey();
        
        if (!validationResult.isValid) {
          
          // Use enhanced error recovery with central state restoration
          
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
        } else {
          // API key is valid, proceed with AI analysis
          OverlayManager.setState(OverlayManager.states.AI_ANALYZING);
          
          // Use requestAnimationFrame to ensure UI updates
          await new Promise(resolve => requestAnimationFrame(resolve));
          
          // Pass completeness score to AI analysis for conditional advice
          extractedData.completenessScore = completenessData?.score || 100;
          const aiResult = await this.runAIAnalysis(extractedData);
          
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
          
          
          
          
          
          
          
        } else {
          
          // Check for cached AI data to merge with new completeness
          if (cachedData && cachedData.contentScore !== undefined) {
            
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
      }
      
      // Save to cache
      await this.cacheManager.save(this.profileId, result, extractedData);
      
      // Clear timeout on success
      clearTimeout(analysisTimeout);
      
      // Log total analysis time
      
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
          finalState = OverlayManager.states.ANALYSIS_FAILED_CACHE_FALLBACK;
        } else {
          finalState = OverlayManager.states.ERROR;
        }
      } else {
        finalState = OverlayManager.states.COMPLETE;
      }
      
      
      // Log what we're passing to overlay manager
      const overlayData = {
        ...result,
        // Ensure fromCache flag is set for partial updates
        fromCache: result.partialUpdate || result.cachedContentScore || result.fromCache,
        // Only mark AI as disabled if there's no content score
        aiDisabled: result.contentScore === undefined || result.contentScore === null
      };
      
      
      
      OverlayManager.setState(finalState, overlayData);
      
      return { success: true, data: result };
      
    } catch (error) {
      console.error('[Analyzer] Analysis failed:', error);
      clearTimeout(analysisTimeout);
      
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
   * Handle analysis timeout
   */
  async handleAnalysisTimeout() {
    try {
      // Check if we have partial results (completeness score)
      if (this.analysisResults && this.analysisResults.completeness !== undefined) {
        
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
  async runDistributedAIAnalysis(extractedData) {
    
    // Pre-flight API key validation before showing any UI
    const validationResult = await this.validateApiKey();
    
    if (!validationResult.isValid) {
      // Check if it's a network error vs actual validation failure
      const errorMessage = validationResult.error || 'Invalid Key';
      const isNetworkError = errorMessage.toLowerCase().includes('network') || 
                            errorMessage.toLowerCase().includes('fetch') ||
                            errorMessage.toLowerCase().includes('connection');
      
      
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
    
    // 2. Experience Roles
    // Check if experience exists and has count > 0
    if (extractedData.experience?.exists && extractedData.experience?.count > 0) {
      // Need to run extractDeep to get individual experiences for AI analysis
      
      try {
        // Run deep extraction to get detailed experiences
        const experienceExtractor = this.extractors.experience;
        
        if (experienceExtractor && typeof experienceExtractor.extractDeep === 'function') {
          const deepExperienceData = await experienceExtractor.extractDeep();
          
          if (deepExperienceData.experiences && deepExperienceData.experiences.length > 0) {
            // Expose roles to skills/recommendations career context below
            extractedData.experience.experiences = deepExperienceData.experiences;

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
    
    
    // Track consecutive failures for early exit
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 2;
    
    // Analyze sections sequentially
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      
      try {
        // Update UI with current section
        
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
        
        // Analyze the section with 30-second timeout
        const result = await Promise.race([
          this.analyzeSection(section.type, section.data, section.context),
          new Promise((resolve) => 
            setTimeout(() => resolve({ success: false, error: 'Section analysis timeout (30s)' }), 30000)
          )
        ]);
        
        // Log completion
        
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
          
          consecutiveFailures++;
          
          // Check for early exit condition
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            
            // Use enhanced error recovery with central state restoration
            
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
              console.error('[AI Analysis] Cache recovery failed:', recoveryError);
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
        console.error(`[AI Analysis] Error analyzing ${section.name}:`, error);
        consecutiveFailures++;
        
        // Check for early exit on exception
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.error(`[AI Analysis] ${consecutiveFailures} consecutive errors - stopping analysis`);
          
          // Use enhanced error recovery with central state restoration
          
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
            console.error('[AI Analysis] Cache recovery failed:', recoveryError);
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
    OverlayManager.updateAIProgress('synthesizing', 'Synthesizing results...');
    
    const synthesis = await this.synthesizeResults(sectionResults, sectionRecommendations);
    
    
    
    
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
            recommendations: response.recommendations,
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
    
    return new Promise((resolve) => {
      safeSendMessage({
        action: 'synthesizeAnalysis',
        sectionScores: sectionResults,
        sectionRecommendations: sectionRecommendations
      }, (response) => {
        
        if (response && response.success) {
          const result = {
            success: true,
            score: response.finalScore,
            synthesis: response.synthesis,
            recommendations: response.overallRecommendations || response.recommendations || [],
            insights: response.careerNarrative,
            sectionScores: response.sectionScores
          };
          
          
          
          resolve(result);
        } else {
          // Fallback: calculate weighted average
          const weights = {
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
   * Run AI analysis. Resolves with { success: false, error } instead of rejecting.
   */
  async runAIAnalysis(extractedData) {
    try {
      return await this.runDistributedAIAnalysis(extractedData);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}