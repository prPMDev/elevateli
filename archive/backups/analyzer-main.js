/**
 * Main entry point for ElevateLI content script
 * Coordinates all modules and initializes the extension
 */

import { CONFIG, TIMINGS, SELECTORS } from './modules/constants.js';
import { ExtensionState, updateNavigationState } from './modules/state.js';
import { cleanup, addManagedTimeout, addManagedEventListener } from './modules/memoryManager.js';
import { isProfilePage, waitForElement, debounce } from './modules/domUtils.js';
import { safeChrome, safeSendMessage, safeStorageGet } from './modules/chromeUtils.js';
import { ProfileSectionDiscovery } from './modules/profileDiscovery.js';
import { injectScoreBadge } from './modules/uiComponents.js';
import { extractAndUpdate } from './modules/profileExtractor.js';

// Wrap in IIFE to avoid global scope pollution
(function() {
  'use strict';
  
  console.log(`${CONFIG.EXTENSION_NAME} content script loaded`);
  
  /**
   * Initialize the extension
   */
  function init() {
    console.log(`Initializing ${CONFIG.EXTENSION_NAME} on`, location.href);
    
    // Check if Chrome APIs are available
    if (!safeChrome()) {
      console.error('Chrome APIs not available - extension context lost');
      return;
    }
    
    if (isProfilePage()) {
      waitForElement(SELECTORS.PROFILE_ACTIONS, () => {
        addManagedTimeout(() => {
          injectScoreBadge();
          
          // Check if analysis should run on page load
          // DISABLED AUTO-AI: Now requires manual trigger to reduce costs
          /*
          safeStorageGet(['showAnalysis'], async (data) => {
            if (data.showAnalysis && await isOwnProfile()) {
              extractAndUpdate();
            }
          });
          */
        }, TIMINGS.BADGE_INJECT_DELAY);
      });
    }
    
    // Start navigation observer
    observeNavigation();
  }
  
  /**
   * Navigation observer to handle SPA navigation
   */
  function observeNavigation() {
    const observer = new MutationObserver(debounce((mutations) => {
      const isOurMutation = mutations.some(m => 
        m.target.id?.includes('linkedin-optimizer') ||
        m.target.closest('#elevateli-overlay') ||
        m.target.closest('#elevateli-score')
      );
      if (isOurMutation) return;
      
      if (location.pathname !== ExtensionState.lastPath) {
        updateNavigationState(location.pathname);
        
        if (isProfilePage()) {
          waitForElement(SELECTORS.PROFILE_ACTIONS, () => {
            addManagedTimeout(injectScoreBadge, TIMINGS.BADGE_INJECT_DELAY);
          });
        }
      }
    }, TIMINGS.DEBOUNCE_DELAY));
    
    observer.observe(document.body, { 
      childList: true, 
      subtree: true 
    });
    
    ExtensionState.observers.push(observer);
  }
  
  /**
   * Message listener for communication with service worker
   */
  if (safeChrome()) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('Content script received message:', request);
      
      if (request.action === 'runDiscovery') {
        try {
          const discoveryData = ProfileSectionDiscovery.discoverSections();
          sendResponse({ success: true, data: discoveryData });
        } catch (error) {
          console.error('Discovery error:', error);
          sendResponse({ success: false, error: error.message });
        }
        return true;
      }
      
      if (request.action === 'extractSectionData') {
        const { section } = request;
        console.log('Extracting section data for:', section);
        
        try {
          let sectionData = null;
          
          // Use specialized extractors when available
          if (section === 'about') {
            const AboutExtractor = window.ElevateLI?.extractAbout;
            if (AboutExtractor) {
              sectionData = AboutExtractor();
            }
          } else if (section === 'experience') {
            const ExperienceExtractor = window.ElevateLI?.extractExperience;
            if (ExperienceExtractor) {
              sectionData = ExperienceExtractor();
            }
          } else if (section === 'skills') {
            const SkillsExtractor = window.ElevateLI?.extractSkills;
            if (SkillsExtractor) {
              sectionData = SkillsExtractor();
            }
          }
          
          // Fallback to ProfileSectionDiscovery for other sections
          if (!sectionData) {
            const discoveryData = ProfileSectionDiscovery.discoverSections();
            sectionData = discoveryData[section] || null;
          }
          
          sendResponse({ 
            success: true, 
            data: sectionData,
            section: section
          });
        } catch (error) {
          console.error('Section extraction error:', error);
          sendResponse({ 
            success: false, 
            error: error.message,
            section: section
          });
        }
        return true;
      }
    });
  }
  
  /**
   * Start the extension
   */
  if (document.readyState === 'loading') {
    const domContentLoadedHandler = () => {
      document.removeEventListener('DOMContentLoaded', domContentLoadedHandler);
      init();
    };
    document.addEventListener('DOMContentLoaded', domContentLoadedHandler);
  } else {
    init();
  }
  
  /**
   * Handle navigation
   */
  if (window.navigation) {
    window.navigation.addEventListener('navigate', () => {
      cleanup();
    });
  }
  
  /**
   * Cleanup on page unload
   */
  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('unload', cleanup);
  
  /**
   * Listen for storage changes to update popup scores
   */
  if (safeChrome()) {
    ExtensionState.storageListener = (changes, namespace) => {
      if (namespace === 'local') {
        // Update popup if it's open
        if (changes.lastScan || changes.lastAnalysis) {
          // Popup will re-read scores when opened
        }
      }
    };
    chrome.storage.onChanged.addListener(ExtensionState.storageListener);
  }
  
  /**
   * Export for debugging
   */
  window.ElevateLI = {
    discover: () => ProfileSectionDiscovery.discoverSections(),
    extractAndUpdate: extractAndUpdate,
    state: ExtensionState,
    cleanup: cleanup
  };
  
})();