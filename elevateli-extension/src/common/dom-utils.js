/**
 * Safe DOM manipulation utilities for Chrome Web Store compliance
 * Avoids innerHTML and provides secure alternatives
 */

const DOMUtils = {
  /**
   * Safely set text content
   * @param {Element} element - Target element
   * @param {string} text - Text to set
   */
  setText(element, text) {
    if (element) {
      element.textContent = text || '';
    }
  },

  /**
   * Create element with attributes and text
   * @param {string} tag - HTML tag name
   * @param {Object} attrs - Attributes to set
   * @param {string} text - Text content
   * @returns {Element}
   */
  createElement(tag, attrs = {}, text = '') {
    const element = document.createElement(tag);
    
    // Set attributes safely
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === 'className') {
        element.className = value;
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(element.style, value);
      } else if (key.startsWith('data-')) {
        element.setAttribute(key, value);
      } else {
        element[key] = value;
      }
    });
    
    if (text) {
      element.textContent = text;
    }
    
    return element;
  },

  /**
   * Create element with children
   * @param {string} tag - HTML tag name
   * @param {Object} attrs - Attributes
   * @param {Array<Element|string>} children - Child elements or text
   * @returns {Element}
   */
  createElementWithChildren(tag, attrs = {}, children = []) {
    const element = this.createElement(tag, attrs);
    
    children.forEach(child => {
      if (typeof child === 'string') {
        element.appendChild(document.createTextNode(child));
      } else if (child instanceof Element) {
        element.appendChild(child);
      }
    });
    
    return element;
  },

  /**
   * Safely update element content with multiple children
   * @param {Element} parent - Parent element
   * @param {Array<Element>} children - New children
   */
  replaceChildren(parent, children) {
    if (!parent) return;
    
    // Clear existing content
    while (parent.firstChild) {
      parent.removeChild(parent.firstChild);
    }
    
    // Add new children
    const fragment = document.createDocumentFragment();
    children.forEach(child => {
      if (child) fragment.appendChild(child);
    });
    parent.appendChild(fragment);
  },

  /**
   * Create a link element safely
   * @param {string} href - URL
   * @param {string} text - Link text
   * @param {Object} attrs - Additional attributes
   * @returns {Element}
   */
  createLink(href, text, attrs = {}) {
    return this.createElement('a', {
      href: href,
      target: '_blank',
      rel: 'noopener noreferrer',
      ...attrs
    }, text);
  },

  /**
   * Create icon element
   * @param {string} iconClass - Icon class name
   * @returns {Element}
   */
  createIcon(iconClass) {
    return this.createElement('i', { className: iconClass });
  },

  /**
   * Escape HTML entities
   * @param {string} text - Text to escape
   * @returns {string}
   */
  escapeHtml(text) {
    // Replace HTML entities without using innerHTML
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '/': '&#x2F;'
    };
    return String(text).replace(/[&<>"'\/]/g, s => entities[s]);
  },

  /**
   * Create loading spinner
   * @returns {Element}
   */
  createLoadingSpinner() {
    const spinner = this.createElement('div', { className: 'loading-spinner' });
    const spinnerIcon = this.createElement('div', { className: 'spinner' });
    spinner.appendChild(spinnerIcon);
    return spinner;
  },

  /**
   * Create error message element
   * @param {string} message - Error message
   * @returns {Element}
   */
  createErrorMessage(message) {
    return this.createElementWithChildren('div', 
      { className: 'error-message' },
      [
        this.createIcon('fas fa-exclamation-circle'),
        ' ',
        message
      ]
    );
  },

  /**
   * Create success message element
   * @param {string} message - Success message
   * @returns {Element}
   */
  createSuccessMessage(message) {
    return this.createElementWithChildren('div', 
      { className: 'success-message' },
      [
        this.createIcon('fas fa-check-circle'),
        ' ',
        message
      ]
    );
  },

  /**
   * Safely set HTML content using templates
   * @param {Element} element - Target element
   * @param {string} template - HTML template
   * @param {Object} data - Data to interpolate
   */
  setTemplate(element, template, data = {}) {
    if (!element) return;
    
    // Create a temporary container
    const temp = document.createElement('div');
    
    // Replace placeholders with escaped data
    const safeHtml = template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return this.escapeHtml(data[key] || '');
    });
    
    // Use DOMParser for safer parsing
    const parser = new DOMParser();
    const doc = parser.parseFromString(safeHtml, 'text/html');
    
    // Clear and append
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
    
    // Move all children from parsed document
    while (doc.body.firstChild) {
      element.appendChild(doc.body.firstChild);
    }
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DOMUtils;
}