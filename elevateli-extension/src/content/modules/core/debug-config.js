/**
 * Debug Configuration Module
 * Centralized debug flags for strategic logging
 */

const DEBUG_CONFIG = {
  // Master switch - set to false to disable all logging
  ENABLED: true,
  
  // AI-related logging
  AI: {
    PROMPTS: true,        // Log prompt generation details
    RESPONSES: true,      // Log AI response details
    PARSING: true,        // Log response parsing process
    SCORING: true,        // Log score calculations
    QUOTES: true,         // Log quote detection in responses
    COSTS: true,          // Log token usage and costs
  },
  
  // Data extraction and processing
  DATA: {
    EXTRACTION: true,     // Log profile data extraction
    TRANSFORMATION: true, // Log data transformation steps
    VALIDATION: true,     // Log validation results
    COMPLETENESS: true,   // Log completeness calculations
  },
  
  // UI and user experience
  UI: {
    STATES: true,         // Log state transitions
    RENDERING: true,      // Log render operations
    INTERACTIONS: true,   // Log user interactions
    ERRORS: true,         // Log UI error states
  },
  
  // Performance monitoring
  PERFORMANCE: {
    TIMING: true,         // Log operation durations
    MEMORY: false,        // Log memory usage (disabled by default)
    CACHE: true,          // Log cache operations
    API_LATENCY: true,    // Log API call latency
  },
  
  // Detailed section logging
  SECTIONS: {
    EXPERIENCE: true,     // Log experience extraction details
    RECOMMENDATIONS: true, // Log recommendations processing
    SKILLS: true,         // Log skills analysis
    PROFILE_INTRO: true,  // Log headline + about processing
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DEBUG_CONFIG;
} else {
  // For browser context
  window.DEBUG_CONFIG = DEBUG_CONFIG;
}