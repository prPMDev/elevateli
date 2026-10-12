/**
 * Certifications Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile certifications section
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const CertificationsExtractor = {
  name: 'certifications',
  
  /**
   * Quick scan for certifications section existence
   * @returns {Object} Scan results
   */
  async scan() {
    const section = BaseExtractor.findSection('Licenses & certifications');
    
    return {
      exists: !!section,
      visibleCount: BaseExtractor.items(section).length,
      // Heading carries the total: "Licenses & certifications (14)"
      totalCount: section ? BaseExtractor.count(section) : 0
    };
  },
  
  /**
   * Extract certifications data for completeness scoring
   * @returns {Object} Basic certifications data
   */
  async extract() {
    const scanResult = await this.scan();
    
    if (!scanResult.exists) {
      return {
        exists: false,
        count: 0,
        certifications: []
      };
    }
    
    const certifications = BaseExtractor.items(BaseExtractor.findSection('Licenses & certifications'))
      .map(element => this.extractCertificationItem(element))
      .filter(cert => cert.name);
    
    const result = {
      exists: true,
      count: scanResult.totalCount || certifications.length,
      certifications: certifications.map(cert => ({
        name: cert.name,
        issuer: cert.issuer
      })),
      hasActiveCertifications: certifications.some(cert => !cert.expired),
      hasTechCertifications: certifications.some(cert => this.isTechnicalCertification(cert.name))
    };
    
    return result;
  },
  
  /**
   * Extract single certification item
   * Fields: name, issuer, "Issued Jan 2023 · Expires Jan 2025", "Credential ID ...", skills
   * @param {Element} element - Certification element
   * @returns {Object} Certification data
   */
  extractCertificationItem(element) {
    const [name = '', issuer = '', ...rest] = BaseExtractor.fields(element);
    const expires = rest.join(' ').match(/Expires?\s+([A-Za-z]+\s+\d{4})/);
    
    return {
      name,
      issuer,
      expired: expires ? this.isExpired(expires[1]) : false
    };
  },
  
  /**
   * Check if certification is technical
   * @param {string} name - Certification name
   * @returns {boolean}
   */
  isTechnicalCertification(name) {
    const techPatterns = /\b(AWS|Azure|Google Cloud|GCP|Cisco|Microsoft|Oracle|VMware|CompTIA|Linux|Red Hat|Docker|Kubernetes|Certified.*Engineer|Certified.*Developer|Certified.*Architect)\b/i;
    return techPatterns.test(name);
  },
  
  /**
   * Check if date is expired
   * @param {string} dateStr - Date string
   * @returns {boolean}
   */
  isExpired(dateStr) {
    if (!dateStr || dateStr === 'No Expiration') return false;
    
    // Simple comparison - would need proper date parsing
    const currentYear = new Date().getFullYear();
    const year = parseInt(dateStr.match(/\d{4}/)?.[0] || '9999');
    
    return year < currentYear;
  },
  
  /**
   * Check if certification is recent (within 2 years)
   * @param {string} dateStr - Issue date
   * @returns {boolean}
   */
  isRecent(dateStr) {
    if (!dateStr) return false;
    
    const currentYear = new Date().getFullYear();
    const year = parseInt(dateStr.match(/\d{4}/)?.[0] || '0');
    
    return (currentYear - year) <= 2;
  },
};