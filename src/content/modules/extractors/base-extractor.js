/**
 * Base Extractor Module for ElevateLI
 * Shared DOM helpers for LinkedIn's profile page (2026 UI: hashed class names, so no class selectors)
 */

const BaseExtractor = {
  /**
   * Wait for element with timeout
   */
  async waitForElement(selector, timeout = 3000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const element = document.querySelector(selector);
      if (element) return element;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return null;
  },

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Find a profile section by its h2 heading. Headings can carry a count, e.g. "Skills (58)".
   * ponytail: English headings only; the ProfileNullStateCardAnchor_<Name> componentkeys are the locale-free upgrade
   */
  findSection(heading) {
    const h2 = Array.from(document.querySelectorAll('main section h2'))
      .find(h => h.textContent.trim().startsWith(heading));
    return h2 ? h2.closest('section') : null;
  },

  /**
   * Top card: the section holding the first heading in main (the profile name)
   */
  topCard() {
    return document.querySelector('main section h2')?.closest('section') || null;
  },

  /**
   * Entity rows of a section (one per role, school, skill, certification, project)
   */
  items(section) {
    return section ? Array.from(section.querySelectorAll('[componentkey^="entity-collection-item"]')) : [];
  },

  /**
   * Text fields of an element; LinkedIn renders each field as a <p>
   */
  fields(element) {
    return Array.from(element.querySelectorAll('p'))
      .map(p => this.text(p))
      .filter(Boolean);
  },

  /**
   * Long text (About, descriptions) of an element's first text box
   */
  longText(element) {
    return this.text(element?.querySelector('[data-testid="expandable-text-box"]'));
  },

  /**
   * Text without the "… more" toggle; <br> (paragraphs, bullets) kept as line breaks
   */
  text(element) {
    if (!element) return '';
    const clone = element.cloneNode(true);
    clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    return clone.textContent.replace(/…\s*more$/, '').trim();
  },

  /**
   * Total item count from the heading ("Skills (58)") or a "Show all 14 licenses" link, else the visible rows
   * (or the caller's own visible count)
   */
  count(section, fallback = this.items(section).length) {
    const heading = section.querySelector('h2')?.textContent.match(/\((\d+)\)/);
    const showAll = Array.from(section.querySelectorAll('a'))
      .map(a => a.textContent.trim().match(/^Show all (\d+)/))
      .find(Boolean);
    return parseInt((heading || showAll || [])[1]) || fallback;
  },

  /**
   * Lower sections render only once scrolled into view: scroll each empty placeholder section into view,
   * then the bottom of the page, until nothing new loads. Restores the user's scroll position.
   * @param {Function} shouldStop - True once the run is cancelled (navigation, reset): stop and leave the page alone
   */
  async loadLazySections(shouldStop = () => false, timeout = 8000) {
    const main = document.querySelector('main');
    if (!main) return;
    // The profile scrolls inside <main>, not the window
    const scroller = main.scrollHeight > main.clientHeight ? main : document.scrollingElement;
    const start = scroller.scrollTop;
    const tried = new Set();
    let end = Date.now() + timeout;

    while (Date.now() < end) {
      if (shouldStop()) return;
      // A background tab doesn't render, so nothing mounts: wait until it is visible, then retry every empty section
      if (document.hidden) {
        const hiddenAt = Date.now();
        await new Promise(resolve => document.addEventListener('visibilitychange', resolve, { once: true }));
        end += Date.now() - hiddenAt;
        tried.clear();
        continue;
      }
      const placeholder = Array.from(main.querySelectorAll('section'))
        .find(s => !s.textContent.trim() && !tried.has(s));
      if (placeholder) {
        tried.add(placeholder);
        placeholder.scrollIntoView();
        for (let i = 0; i < 10 && !placeholder.textContent.trim() && !document.hidden && !shouldStop(); i++) await this.wait(100);
      } else {
        const height = scroller.scrollHeight;
        scroller.scrollTop = height;
        await this.wait(600);
        if (scroller.scrollHeight === height && !document.hidden) break;
      }
    }

    if (!shouldStop()) scroller.scrollTop = start;
  }
};
