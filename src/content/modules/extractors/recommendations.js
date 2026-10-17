/**
 * Recommendations Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile recommendations section
 */

const RecommendationsExtractor = {
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
      givenCount: counts.given
    };
  },

  /**
   * Extract recommendations data for completeness scoring
   * @returns {Object} Basic recommendations data
   */
  async extract() {
    const scanResult = await this.scan();
    if (!scanResult.exists) return scanResult;

    const result = {
      exists: true,
      count: scanResult.receivedCount, // Only received ones count; given ones are about other people
      receivedCount: scanResult.receivedCount,
      givenCount: scanResult.givenCount
    };

    // The completeness rule needs recency before extractDeep runs
    // ponytail: only the cards shown on the profile (newest first); no dates = undefined, so the scorer uses the count
    const dated = this.visibleCards(BaseExtractor.findSection('Recommendations'))
      .map(card => this.extractRecommendationItem(card))
      .filter(rec => rec.date);
    if (dated.length) result.isCurrentlyEndorsed = this.hasRecentRecommendations(dated);

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
    const received = this.visibleCards(BaseExtractor.findSection('Recommendations'))
      .map(card => this.extractRecommendationItem(card))
      .filter(rec => rec.recommenderName);
    // Roles on the page, to tell the AI which role each recommendation is about
    const experiences = (await ExperienceExtractor.extractDetailedExperiences()).filter(exp => exp.company);

    return { ...basicData, recommendationChunks: this.prepareForAI(this.matchRecommendationsToExperience(received, experiences)) };
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
   * Cards of the Received tab (or the only list when there are no tabs). One card per recommender:
   * the nearest ancestor of their profile link that holds the recommendation text
   * @param {Element} section - Recommendations section
   * @returns {Array<Element>} Cards
   */
  visibleCards(section) {
    // With "Given" selected the cards are ones the user wrote about other people
    const checkedTab = section?.querySelector('[role="radio"][aria-checked="true"]');
    if (checkedTab && !checkedTab.textContent.trim().startsWith('Received')) return [];

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
      company: this.extractCompanyFromTitle(rec.recommenderTitle),
      relatedRole: rec.relatedRole || 'Not specified'
    }));
  },

  /**
   * Extract company from title string
   * @param {string} title - Title like "Product Manager at CompanyName"
   * @returns {string} Company name, '' when the title names none
   */
  extractCompanyFromTitle(title) {
    // "at" as a whole word, so "great products" is not read as a company
    return title?.match(/\bat\s+(.+)$/i)?.[1].trim() || '';
  },

  /**
   * Set relatedRole ("Title at Company") on each recommendation that matches one of the user's roles
   * @param {Array<Object>} recommendations - Recommendations
   * @param {Array<Object>} experiences - User's roles that name a company, newest first
   * @returns {Array<Object>} Recommendations
   */
  matchRecommendationsToExperience(recommendations, experiences) {
    const started = exp => new Date(/^\d{4}$/.test(exp.startDate) ? `Jan ${exp.startDate}` : exp.startDate);

    return recommendations.map(rec => {
      // Roles are newest first: the first one that had started by the recommendation date is the role then
      const pick = matches => matches.find(exp => rec.date && started(exp) <= new Date(rec.date)) || matches[0];
      const recCompany = this.extractCompanyFromTitle(rec.recommenderTitle).toLowerCase();

      // By the company in the recommender's title, else by a company the text names as a whole word
      // ("Intuit" is not in "intuitive"). Lookarounds instead of \b so names that start or end with a symbol ("C++") still match.
      const exp = (recCompany && pick(experiences.filter(e =>
          e.company.toLowerCase().includes(recCompany) || recCompany.includes(e.company.toLowerCase())))) ||
        pick(experiences.filter(e => {
          const escaped = e.company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return new RegExp(`(?<!\\w)${escaped}(?!\\w)`, 'i').test(rec.text);
        }));

      return exp ? { ...rec, relatedRole: `${exp.title} at ${exp.company}` } : rec;
    });
  }
};