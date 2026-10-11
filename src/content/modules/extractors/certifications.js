/**
 * Certifications Extractor Module for ElevateLI
 * Handles extraction of LinkedIn profile certifications section
 * This module will be concatenated into analyzer.js for Manifest V3 compatibility
 */

const CertificationsExtractor = {
  name: 'certifications',
  
  selectors: [
    'section[data-section="certifications"]',
    'section#licenses-and-certifications',
    'section#certifications',
    'div[id*="certifications"]',
    'section.pv-accomplishments-section',
    // New pattern: anchor + sibling
    '#licenses_and_certifications.pv-profile-card__anchor + div',
    '#certifications.pv-profile-card__anchor + div',
    '#licenses_and_certifications ~ div',
    '#certifications ~ div'
  ],
  
  /**
   * Quick scan for certifications section existence
   * @returns {Object} Scan results
   */
  async scan() {
    // Custom section finding for certifications - check multiple anchor IDs
    let section = null;
    const anchorIds = ['licenses_and_certifications', 'certifications', 'licenses-and-certifications'];
    
    for (const anchorId of anchorIds) {
      const anchor = document.querySelector(`div#${anchorId}.pv-profile-card__anchor`);
      if (anchor) {
        let sibling = anchor.nextElementSibling;
        let siblingIndex = 0;
        
        while (sibling && siblingIndex < 5) {
          // Look for certification content indicators
          const showAllLink = sibling.querySelector('a[href*="/details/certifications"], a[href*="/details/licenses"]');
          const hasCertificationItems = sibling.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item, li').length > 0;
          const textContent = sibling.textContent || '';
          const hasCertificationText = textContent.includes('certification') || textContent.includes('Certification') || textContent.includes('license');
          
          // We want the sibling with actual certification content
          if ((showAllLink || hasCertificationItems) && hasCertificationText) {
            section = sibling;
            break;
          }
          
          sibling = sibling.nextElementSibling;
          siblingIndex++;
        }
        if (section) break;
      }
    }
    
    // Fallback to BaseExtractor if custom method fails
    if (!section) {
      section = BaseExtractor.findSection(this.selectors, 'Certifications');
    }
    
    const exists = !!section;
    
    if (section) {
    } else {
    }
    
    let visibleCount = 0;
    let totalCount = 0;
    if (exists) {
      let items = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
      
      // Try additional selectors if none found
      if (items.length === 0) {
        items = section.querySelectorAll('li[class*="pvs"], div[class*="entity"], li');
      }
      
      visibleCount = items.length;
      
      // First try to find count from show all link
      const showAllLink = section.querySelector('a[href*="/details/certifications"], a[href*="/details/licenses"]');
      if (showAllLink) {
        const linkText = showAllLink.textContent || '';
        
        // Try multiple patterns for extracting count
        const patterns = [
          /Show\s+all\s+(\d+)\s+certifications?/i,
          /Show\s+all\s+(\d+)\s+licenses?/i,
          /(\d+)\s+certifications?/i,
          /(\d+)\s+licenses?/i,
          /All\s+(\d+)/i
        ];
        
        for (const pattern of patterns) {
          const match = linkText.match(pattern);
          if (match) {
            totalCount = parseInt(match[1]);
            break;
          }
        }
      }
      
      // Fallback to extractShowAllInfo if not found
      if (totalCount === 0) {
        const showAllInfo = BaseExtractor.extractShowAllInfo(section, 'certifications');
        totalCount = showAllInfo.totalCount || visibleCount;
      }
    }
    
    return {
      exists,
      visibleCount,
      totalCount
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
    
    // Use same custom section finder as scan
    let section = null;
    const anchorIds = ['licenses_and_certifications', 'certifications', 'licenses-and-certifications'];
    
    for (const anchorId of anchorIds) {
      const anchor = document.querySelector(`div#${anchorId}.pv-profile-card__anchor`);
      if (anchor) {
        let sibling = anchor.nextElementSibling;
        let siblingIndex = 0;
        
        while (sibling && siblingIndex < 5) {
          const showAllLink = sibling.querySelector('a[href*="/details/certifications"], a[href*="/details/licenses"]');
          const hasCertificationContent = sibling.textContent && (sibling.textContent.includes('certification') || sibling.textContent.includes('license'));
          
          if ((showAllLink || hasCertificationContent) && sibling.querySelectorAll('li, .pvs-list__paged-list-item').length > 0) {
            section = sibling;
            break;
          }
          
          sibling = sibling.nextElementSibling;
          siblingIndex++;
        }
        if (section) break;
      }
    }
    
    if (!section) {
      section = BaseExtractor.findSection(this.selectors, 'Certifications');
    }
    const certifications = await this.extractCertificationItems(section);
    
    // Use total count from scan if available
    const totalCount = scanResult.totalCount || certifications.length;
    
    const result = {
      exists: true,
      count: totalCount,
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
   * Extract certification items
   * @param {Element} section - Certifications section
   * @returns {Array<Object>} Certification items
   */
  async extractCertificationItems(section) {
    const items = [];
    const itemElements = section.querySelectorAll('.pvs-list__paged-list-item, .artdeco-list__item');
    
    for (const element of itemElements) {
      const item = await this.extractCertificationItem(element);
      if (item.name) {
        items.push(item);
      }
    }
    
    return items;
  },
  
  /**
   * Extract single certification item
   * @param {Element} element - Certification element
   * @returns {Object} Certification data
   */
  async extractCertificationItem(element) {
    const certification = {
      name: '',
      issuer: '',
      issueDate: '',
      expirationDate: '',
      credentialId: '',
      credentialUrl: '',
      expired: false
    };
    
    // Extract certification name
    const nameEl = element.querySelector('.t-bold span[aria-hidden="true"], h3 span[aria-hidden="true"]');
    certification.name = BaseExtractor.extractTextContent(nameEl);
    
    // Extract issuer
    const issuerEl = element.querySelector('.t-14:not(.t-bold) span[aria-hidden="true"]');
    certification.issuer = BaseExtractor.extractTextContent(issuerEl);
    
    // Extract dates
    const dateEl = element.querySelector('.pvs-entity__caption-wrapper');
    const dateText = BaseExtractor.extractTextContent(dateEl);
    if (dateText) {
      // Parse "Issued Jan 2023 · Expires Jan 2025"
      const issuedMatch = dateText.match(/Issued\s+([A-Za-z]+\s+\d{4})/);
      if (issuedMatch) {
        certification.issueDate = issuedMatch[1];
      }
      
      const expiresMatch = dateText.match(/Expires?\s+([A-Za-z]+\s+\d{4})/);
      if (expiresMatch) {
        certification.expirationDate = expiresMatch[1];
        // Check if expired
        certification.expired = this.isExpired(expiresMatch[1]);
      }
      
      // No expiration date mentioned
      if (!expiresMatch && dateText.includes('No Expiration')) {
        certification.expirationDate = 'No Expiration';
      }
    }
    
    // Extract credential ID
    const credentialEl = element.querySelector('.pvs-list__outer-container');
    if (credentialEl) {
      const credentialText = BaseExtractor.extractTextContent(credentialEl);
      const idMatch = credentialText.match(/Credential ID[:\s]+([^\s]+)/i);
      if (idMatch) {
        certification.credentialId = idMatch[1];
      }
    }
    
    // Extract credential URL
    const linkEl = element.querySelector('a[href*="credential"]');
    if (linkEl) {
      certification.credentialUrl = linkEl.href;
    }
    
    return certification;
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