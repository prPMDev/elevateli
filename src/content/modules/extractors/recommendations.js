/**
 * Recommendations Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile recommendations section
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const RecommendationsExtractor = {
  name: 'recommendations',
  
  /**
   * Quick scan for recommendations section existence
   * @returns {Object} Scan results
   */
  async scan() {
    const section = BaseExtractor.findSection('Recommendations');
    const counts = this.extractRecommendationCounts(section);
    
    return {
      exists: !!section,
      receivedCount: counts.received,
      givenCount: counts.given,
      hasRecommendations: counts.received > 0 || counts.given > 0
    };
  },
  
  /**
   * Extract recommendations data for completeness scoring
   * @returns {Object} Basic recommendations data
   */
  async extract() {
    const scanResult = await this.scan();
    
    if (!scanResult.exists) {
      return {
        exists: false,
        count: 0,
        receivedCount: 0,
        givenCount: 0
      };
    }
    
    const received = scanResult.receivedCount;
    const given = scanResult.givenCount;
    
    const result = {
      exists: true,
      count: received + given,
      receivedCount: received,
      givenCount: given,
      hasRecommendations: received > 0,
      isActive: given > 0, // Shows if user gives recommendations
      ratio: received > 0 ? (given / received).toFixed(2) : 0
    };
    
    return result;
  },
  
  /**
   * Deep extraction for AI analysis
   * @returns {Object} Detailed recommendations data
   */
  async extractDeep() {
    const basicData = await this.extract();
    
    if (!basicData.exists) return basicData;
    
    // ponytail: only the cards shown on the profile; /details/recommendations is client-rendered,
    // so fetching it returns no cards. Open that page in a tab if all of them are needed.
    let received = this.visibleCards(BaseExtractor.findSection('Recommendations'))
      .map(card => this.extractRecommendationItem(card))
      .filter(rec => rec.recommenderName);
    
    // Get experience data from the page to match recommendations
    const experienceData = await this.getExperienceDataForMatching();
    
    // Enhance recommendations with matched experience data
    if (experienceData.length > 0) {
      received = this.matchRecommendationsToExperience(received, experienceData);
    }
    
    const result = {
      ...basicData,
      received: received,
      
      // Analysis features
      recommenderRoles: this.extractRecommenderRoles(received),
      recommendationKeywords: this.extractKeywords(received),
      sentimentAnalysis: this.analyzeSentiments(received),
      relationshipTypes: this.categorizeRelationships(received),
      skillsMentioned: this.extractMentionedSkills(received),
      averageLength: this.calculateAverageLength(received),
      
      // Time analysis
      mostRecentDate: this.getMostRecentDate(received),
      isCurrentlyEndorsed: this.hasRecentRecommendations(received),
      
      // For AI processing
      recommendationChunks: this.prepareForAI(received)
    };
    
    return result;
  },
  
  /**
   * Extract recommendation counts from the "Received (10)" / "Given (7)" tabs; without tabs, count the visible cards
   * @param {Element} section - Recommendations section
   * @returns {Object} Counts
   */
  extractRecommendationCounts(section) {
    const text = section?.textContent || '';
    const received = text.match(/Received\s*\((\d+)\)/);
    const given = text.match(/Given\s*\((\d+)\)/);
    
    return {
      received: received ? parseInt(received[1]) : this.visibleCards(section).length,
      given: given ? parseInt(given[1]) : 0
    };
  },
  
  /**
   * One card per recommender: the nearest ancestor of their profile link that holds the recommendation text
   * @param {Element} section - Recommendations section
   * @returns {Array<Element>} Cards
   */
  visibleCards(section) {
    const cards = new Map();
    
    for (const link of section?.querySelectorAll('a[href*="/in/"]') || []) {
      const href = link.getAttribute('href');
      if (href.includes('/details/') || cards.has(href)) continue;
      
      let card = link;
      while (card && card !== section && !card.querySelector('[data-testid="expandable-text-box"]')) {
        card = card.parentElement;
      }
      if (card && card !== section) cards.set(href, card);
    }
    
    return Array.from(cards.values());
  },
  
  /**
   * Extract single recommendation item
   * Fields: name, "· 1st", title, "June 11, 2025, Kaylie worked with Prashant but on different teams", text
   * @param {Element} card - Recommendation card
   * @returns {Object} Recommendation data
   */
  extractRecommendationItem(card) {
    const fields = BaseExtractor.fields(card).filter(field => !field.startsWith('·'));
    const dateIndex = fields.findIndex(field => /^\w+ \d{1,2}, \d{4}, /.test(field));
    const dateLine = fields[dateIndex] || '';
    
    return {
      recommenderName: fields[0] || '',
      recommenderTitle: dateIndex > 1 ? fields[1] : '',
      relationship: dateLine.replace(/^\w+ \d{1,2}, \d{4}, /, ''),
      text: BaseExtractor.longText(card),
      date: dateLine.match(/^\w+ \d{1,2}, \d{4}/)?.[0] || ''
    };
  },
  
  /**
   * Extract recommender roles/titles
   * @param {Array<Object>} recommendations - Recommendations
   * @returns {Array<string>} Unique roles
   */
  extractRecommenderRoles(recommendations) {
    const roles = new Set();
    
    recommendations.forEach(rec => {
      if (rec.recommenderTitle) {
        // Extract role from title (e.g., "Senior Developer at Company" -> "Senior Developer")
        const role = rec.recommenderTitle.split(' at ')[0].trim();
        roles.add(role);
      }
    });
    
    return Array.from(roles);
  },
  
  /**
   * Extract keywords from recommendations
   * @param {Array<Object>} recommendations - Recommendations
   * @returns {Array<string>} Keywords
   */
  extractKeywords(recommendations) {
    const keywords = {};
    const stopWords = new Set(['the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at']);
    
    recommendations.forEach(rec => {
      const words = rec.text.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3 && !stopWords.has(word));
      
      words.forEach(word => {
        keywords[word] = (keywords[word] || 0) + 1;
      });
    });
    
    // Return top keywords
    return Object.entries(keywords)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word]) => word);
  },
  
  /**
   * Analyze sentiments of recommendations
   * @param {Array<Object>} recommendations - Recommendations
   * @returns {Object} Sentiment analysis
   */
  analyzeSentiments(recommendations) {
    const sentiments = {
      positive: 0,
      neutral: 0,
      negative: 0
    };
    
    const positiveWords = ['excellent', 'outstanding', 'exceptional', 'great', 'amazing', 'brilliant', 'talented', 'skilled', 'professional', 'dedicated'];
    const negativeWords = ['difficult', 'challenging', 'issue', 'problem', 'concern'];
    
    recommendations.forEach(rec => {
      const text = rec.text.toLowerCase();
      let score = 0;
      
      positiveWords.forEach(word => {
        if (text.includes(word)) score++;
      });
      
      negativeWords.forEach(word => {
        if (text.includes(word)) score--;
      });
      
      if (score > 0) sentiments.positive++;
      else if (score < 0) sentiments.negative++;
      else sentiments.neutral++;
    });
    
    return sentiments;
  },
  
  /**
   * Categorize relationships
   * @param {Array<Object>} recommendations - Recommendations
   * @returns {Object} Relationship categories
   */
  categorizeRelationships(recommendations) {
    const categories = {
      manager: 0,
      colleague: 0,
      report: 0,
      client: 0,
      other: 0
    };
    
    recommendations.forEach(rec => {
      const rel = (rec.relationship || '').toLowerCase();
      
      if (rel.includes('managed') || rel.includes('reported')) {
        categories.manager++;
      } else if (rel.includes('worked with') || rel.includes('colleague')) {
        categories.colleague++;
      } else if (rel.includes('managed directly')) {
        categories.report++;
      } else if (rel.includes('client') || rel.includes('customer')) {
        categories.client++;
      } else {
        categories.other++;
      }
    });
    
    return categories;
  },
  
  /**
   * Extract mentioned skills
   * @param {Array<Object>} recommendations - Recommendations
   * @returns {Array<string>} Skills mentioned
   */
  extractMentionedSkills(recommendations) {
    const skills = new Set();
    
    const skillPatterns = [
      /\b(leadership|communication|teamwork|problem solving|analytical|technical|creative|strategic)\b/gi,
      /\b(programming|software|development|engineering|design|analysis|management)\b/gi,
      /\b(java|python|javascript|react|node|sql|aws|cloud|data)\b/gi
    ];
    
    recommendations.forEach(rec => {
      skillPatterns.forEach(pattern => {
        const matches = rec.text.match(pattern);
        if (matches) {
          matches.forEach(skill => skills.add(skill.toLowerCase()));
        }
      });
    });
    
    return Array.from(skills);
  },
  
  /**
   * Calculate average recommendation length
   * @param {Array<Object>} recommendations - Recommendations
   * @returns {number} Average length
   */
  calculateAverageLength(recommendations) {
    if (recommendations.length === 0) return 0;
    
    const totalLength = recommendations.reduce((sum, rec) => sum + rec.text.length, 0);
    return Math.round(totalLength / recommendations.length);
  },
  
  /**
   * Get most recent recommendation date
   * @param {Array<Object>} recommendations - Recommendations
   * @returns {string} Most recent date
   */
  getMostRecentDate(recommendations) {
    // This is simplified - would need proper date parsing
    return recommendations[0]?.date || 'Unknown';
  },
  
  /**
   * Check if has recent recommendations (within 2 years)
   * @param {Array<Object>} recommendations - Recommendations
   * @returns {boolean}
   */
  hasRecentRecommendations(recommendations) {
    const currentYear = new Date().getFullYear();
    const twoYearsAgo = currentYear - 2;
    
    return recommendations.some(rec => {
      const date = rec.date || '';
      // Check if date contains any year within last 2 years
      for (let year = currentYear; year >= twoYearsAgo; year--) {
        if (date.includes(year.toString())) {
          return true;
        }
      }
      return false;
    });
  },
  
  /**
   * Prepare recommendations for AI processing
   * [CRITICAL_PATH:RECOMMENDATIONS_PREPARE_AI] - P0: Must format recommendations correctly for AI
   * @param {Array<Object>} recommendations - Recommendations
   * @returns {Array<Object>} Chunked recommendations
   */
  prepareForAI(recommendations) {
    return recommendations.map((rec, index) => ({
      index: index + 1,
      recommender: `${rec.recommenderName} (${rec.recommenderTitle})`,
      relationship: rec.relationship,
      date: rec.date || 'Date not available',
      text: rec.text || '', // Keep original text, don't chunk here
      keywords: this.extractKeywords([rec]),
      company: rec.recommenderCompany || this.extractCompanyFromTitle(rec.recommenderTitle),
      relatedRole: rec.relatedRole || 'Not specified'
    }));
  },

  /**
   * Extract company from title string
   * @param {string} title - Title like "Product Manager at CompanyName"
   * @returns {string} Company name
   */
  extractCompanyFromTitle(title) {
    if (!title) return 'Unknown';
    
    // Check if title contains "at Company"
    const atMatch = title.match(/at\s+(.+?)$/i);
    if (atMatch) return atMatch[1].trim();
    
    // Check if title is just the role (no company mentioned)
    // In this case, we might need to look elsewhere for company
    const rolePatterns = ['Manager', 'Director', 'Engineer', 'Developer', 'Analyst', 'Lead', 'Specialist'];
    const hasRoleOnly = rolePatterns.some(pattern => title.includes(pattern));
    
    if (hasRoleOnly && !title.includes(' at ')) {
      return 'Company not specified in title';
    }
    
    return 'Unknown';
  },

  /**
   * Get experience data from the page for matching
   * @returns {Array<Object>} Experience data
   */
  async getExperienceDataForMatching() {
    const experiences = await ExperienceExtractor.extractDetailedExperiences();
    
    return experiences
      .filter(exp => exp.company)
      .map(exp => ({
        title: exp.title,
        company: exp.company,
        dateRange: exp.duration,
        fullText: `${exp.title} at ${exp.company}`
      }));
  },

  /**
   * Match recommendations to user's experience timeline
   * @param {Array<Object>} recommendations - Recommendations
   * @param {Array<Object>} experiences - User's experiences
   * @returns {Array<Object>} Enhanced recommendations
   */
  matchRecommendationsToExperience(recommendations, experiences) {
    return recommendations.map(rec => {
      const enhanced = { ...rec };
      
      // Try to match by company name
      const recCompany = rec.recommenderCompany || this.extractCompanyFromTitle(rec.recommenderTitle);
      
      if (recCompany && recCompany !== 'Unknown') {
        // Find matching experience by company
        const matchedExp = experiences.find(exp => 
          exp.company.toLowerCase().includes(recCompany.toLowerCase()) ||
          recCompany.toLowerCase().includes(exp.company.toLowerCase())
        );
        
        if (matchedExp) {
          enhanced.relatedRole = `${matchedExp.title} at ${matchedExp.company}`;
          enhanced.relatedCompany = matchedExp.company;
          enhanced.experienceContext = matchedExp;
        }
      }
      
      // Also check recommendation text for company mentions
      if (!enhanced.relatedRole && rec.text) {
        const textLower = rec.text.toLowerCase();
        for (const exp of experiences) {
          if (textLower.includes(exp.company.toLowerCase())) {
            enhanced.relatedRole = `${exp.title} at ${exp.company}`;
            enhanced.relatedCompany = exp.company;
            enhanced.experienceContext = exp;
            break;
          }
        }
      }
      
      return enhanced;
    });
  }
};