// ElevateLI Popup - Simplified Control Center

// Helper function for safe Chrome runtime messaging
async function safeRuntimeMessage(message) {
  try {
    if (!chrome.runtime?.id) {
      throw new Error('Extension context invalidated');
    }
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    if (error.message?.includes('Extension context invalidated')) {
      // Extension was reloaded - prompt user to refresh
      return { error: 'Extension reloaded. Please refresh the page.' };
    }
    return { error: error.message || 'Communication error' };
  }
}

// Helper function for safe tab messaging
async function safeTabMessage(tabId, message) {
  try {
    if (!chrome.runtime?.id) {
      throw new Error('Extension context invalidated');
    }
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    return null;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Get DOM elements - Views
  const activeMainDiv = document.getElementById('activeMain');
  const profileSetupDiv = document.getElementById('profileSetup');
  const settingsViewDiv = document.getElementById('settingsView');
  
  // Header elements
  const settingsGearBtn = document.getElementById('settingsGear');
  const reloadExtensionBtn = document.getElementById('reloadExtension');
  
  // Settings view elements
  const backButton = document.getElementById('backButton');
  const settingsShowAnalysisToggle = document.getElementById('settingsShowAnalysis');
  const settingsEnableAIToggle = document.getElementById('settingsEnableAI');
  const settingsAiModelSelect = document.getElementById('settingsAiModel');
  const settingsApiKeyInput = document.getElementById('settingsApiKey');
  const settingsTargetRoleSelect = document.getElementById('settingsTargetRole');
  const settingsCustomRoleInput = document.getElementById('settingsCustomRole');
  const settingsSeniorityLevelSelect = document.getElementById('settingsSeniorityLevel');
  const settingsCustomInstructionsTextarea = document.getElementById('settingsCustomInstructions');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const settingsResetAnalysisLink = document.getElementById('settingsResetAnalysis');
  const settingsClearApiKeyLink = document.getElementById('settingsClearApiKey');
  const settingsResetAllLink = document.getElementById('settingsResetAll');
  const aiConfigSection = document.getElementById('aiConfigSection');
  
  // Active main view elements
  const activeProfileName = document.getElementById('activeProfileName');
  const analysisStatus = document.getElementById('analysisStatus');
  const targetRoleStatus = document.getElementById('targetRoleStatus');
  const aiAnalysisStatus = document.getElementById('aiAnalysisStatus');
  const customInstructionsStatus = document.getElementById('customInstructionsStatus');
  
  // Other elements
  const apiKeyHelp = document.getElementById('apiKeyHelp');
  const complianceCheck = document.getElementById('complianceCheck');
  const acknowledgeComplianceBtn = document.getElementById('acknowledgeCompliance');
  const confirmDialog = document.getElementById('confirmDialog');
  const confirmMessage = confirmDialog?.querySelector('.confirm-message');
  const confirmYesBtn = confirmDialog?.querySelector('.confirm-yes');
  const confirmNoBtn = confirmDialog?.querySelector('.confirm-no');
  
  // Handle gear icon click
  settingsGearBtn?.addEventListener('click', async () => {
    await showView('settings');
  });
  
  // Handle back button click
  backButton?.addEventListener('click', async () => {
    await showView('activeMain');
  });
  
  // Handle reload button in header
  reloadExtensionBtn?.addEventListener('click', async () => {
    try {
      // Get current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Reload the extension
      chrome.runtime.reload();
      
      // Reload the current tab
      if (tab?.id) {
        chrome.tabs.reload(tab.id);
      }
      
      // Close the popup
      window.close();
    } catch (error) {
    }
  });
  
  // Load current settings
  const settings = await chrome.storage.local.get([
    'aiProvider',
    'aiModel',
    'apiKey',
    'encryptedApiKey',
    'enableAI',
    'showAnalysis',
    'customInstructions',
    'targetRole',
    'seniorityLevel',
    'compliance',
    'userProfile',
    'lastAnalyzed'
  ]);
  
  // Check configuration states
  const hasCompliance = settings.compliance?.hasAcknowledged;
  const hasApiKey = !!(settings.apiKey || settings.encryptedApiKey);
  const hasProvider = !!settings.aiProvider;
  
  // Sync settings across popup instances and tabs
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      const updates = {};
      ['showAnalysis', 'enableAI', 'targetRole', 'seniorityLevel'].forEach(key => {
        if (changes[key]) updates[key] = changes[key].newValue;
      });
      if (Object.keys(updates).length) {
        Object.assign(settings, updates);
        if (!activeMainDiv?.classList.contains('hidden')) updateActiveMainView();
        if (!settingsViewDiv?.classList.contains('hidden')) updateSettingsView();
      }
    }
  });
  const isAIConfigured = hasApiKey && hasProvider;
  const hasUserProfile = !!settings.userProfile?.profileId;
  
  // View management functions
  function showView(viewName) {
    // Hide all views
    profileSetupDiv.classList.add('hidden');
    activeMainDiv.classList.add('hidden');
    settingsViewDiv.classList.add('hidden');
    
    // Clear any validation errors when switching views
    if (viewName === 'settings') {
      // Clear field errors when entering settings
      clearFieldError(settingsApiKeyInput, document.getElementById('apiKeyError'));
      clearFieldError(settingsCustomRoleInput, document.getElementById('customRoleError'));
      clearFieldError(settingsAiModelSelect, null);
      
      // Hide status messages
      const testStatus = document.getElementById('apiKeyTestStatus');
      if (testStatus) {
        testStatus.classList.add('hidden');
      }
    }
    
    // Show requested view
    switch(viewName) {
      case 'profileSetup':
        profileSetupDiv.classList.remove('hidden');
        settingsGearBtn.classList.add('hidden');
        break;
      case 'activeMain':
        activeMainDiv.classList.remove('hidden');
        settingsGearBtn.classList.remove('hidden');
        updateActiveMainView();
        break;
      case 'settings':
        settingsViewDiv.classList.remove('hidden');
        settingsGearBtn.classList.add('hidden');
        updateSettingsView();
        break;
    }
  }
  
  // Show custom confirmation dialog (supports HTML)
  function showConfirmDialog(message, isHtml = false) {
    return new Promise((resolve) => {
      // Defensive check: validate message parameter
      if (typeof message !== 'string' || !message) {
        console.error('[showConfirmDialog] Invalid message:', { message, type: typeof message, isHtml });
        resolve(confirm('Are you sure?')); // Fallback
        return;
      }

      if (!confirmDialog || !confirmMessage) {
        // Fallback to browser confirm
        console.warn('[showConfirmDialog] Dialog elements not found, using browser confirm');
        resolve(confirm(message));
        return;
      }

      console.log('[showConfirmDialog] Called with:', {
        messageLength: message.length,
        messagePreview: message.substring(0, 50) + '...',
        isHtml
      });

      // Support HTML content if specified
      if (isHtml) {
        try {
          // Use DOMParser for safe HTML rendering (Chrome Web Store compliant)
          const parser = new DOMParser();
          const doc = parser.parseFromString(message, 'text/html');
          confirmMessage.textContent = '';
          Array.from(doc.body.childNodes).forEach(node => {
            confirmMessage.appendChild(node.cloneNode(true));
          });
          console.log('[showConfirmDialog] HTML content rendered successfully');
        } catch (error) {
          console.error('[showConfirmDialog] HTML parsing failed:', error);
          confirmMessage.textContent = message; // Fallback to plain text
        }
      } else {
        confirmMessage.textContent = message;
        console.log('[showConfirmDialog] Plain text content set');
      }
      confirmDialog.classList.remove('hidden');
      
      // Update button text based on message content
      if (confirmYesBtn) {
        confirmYesBtn.textContent = message.includes('not verified') ? 'Continue Anyway' : 'Confirm';
      }
      
      const handleYes = () => {
        cleanup();
        resolve(true);
      };
      
      const handleNo = () => {
        cleanup();
        resolve(false);
      };
      
      const cleanup = () => {
        confirmDialog.classList.add('hidden');
        confirmYesBtn.removeEventListener('click', handleYes);
        confirmNoBtn.removeEventListener('click', handleNo);
        // Reset button text
        if (confirmYesBtn) {
          confirmYesBtn.textContent = 'Confirm';
        }
      };
      
      confirmYesBtn.addEventListener('click', handleYes);
      confirmNoBtn.addEventListener('click', handleNo);
    });
  }
  
  // [CRITICAL_PATH:SETTINGS_MANAGEMENT] - Centralized settings handler
  const SettingsManager = {
    // Single source of truth for settings updates
    async updateAndSync(changes) {
      // Update local cache
      Object.assign(settings, changes);
      
      // Update homepage if visible
      if (!activeMainDiv?.classList.contains('hidden')) {
        updateActiveMainView();
      }
      
      // Notify overlay only for showAnalysis changes
      if (changes.showAnalysis !== undefined) {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        if (tab?.url?.includes('linkedin.com/in/')) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'updateOverlayVisibility',
            showAnalysis: changes.showAnalysis
          }).catch(() => {});
        }
      }
    }
  };
  
  function updateActiveMainView() {
    // Update status displays in active main view
    if (analysisStatus) analysisStatus.textContent = settings.showAnalysis !== false ? 'On' : 'Off';
    if (targetRoleStatus) targetRoleStatus.textContent = settings.targetRole || 'Not set';
    if (aiAnalysisStatus) {
      const hasApiKey = !!(settings.apiKey || settings.encryptedApiKey);
      const hasProvider = !!settings.aiProvider;
      aiAnalysisStatus.textContent = (hasApiKey && hasProvider && settings.enableAI) ? 'Configured' : 'Not configured';
    }
    if (customInstructionsStatus) {
      customInstructionsStatus.textContent = settings.customInstructions ? 'Yes' : 'No';
    }
    if (activeProfileName && settings.userProfile) {
      activeProfileName.textContent = settings.userProfile.profileName || settings.userProfile.profileId || 'Your Profile';
    }
  }
  
  function updateSettingsView() {
    // Update all settings controls with current values
    if (settingsShowAnalysisToggle) settingsShowAnalysisToggle.checked = settings.showAnalysis !== false;
    if (settingsEnableAIToggle) settingsEnableAIToggle.checked = settings.enableAI === true;
    if (settingsAiModelSelect && settings.aiProvider) {
      const modelValue = settings.aiModel || 'gemini-2.5-flash-lite';
      settingsAiModelSelect.value = `${settings.aiProvider}:${modelValue}`;
    }
    if (settingsApiKeyInput && (settings.apiKey || settings.encryptedApiKey)) {
      settingsApiKeyInput.value = '••••••••••••';
    }
    if (settingsTargetRoleSelect) {
      settingsTargetRoleSelect.value = settings.targetRole || '';
      // Handle custom role visibility
      if (settingsCustomRoleInput) {
        if (settings.targetRole === 'other' || settings.targetRole === 'Other') {
          settingsCustomRoleInput.classList.remove('hidden');
          settingsCustomRoleInput.value = settings.customRole || '';
        } else {
          settingsCustomRoleInput.classList.add('hidden');
        }
      }
    }
    if (settingsSeniorityLevelSelect) settingsSeniorityLevelSelect.value = settings.seniorityLevel || '';
    if (settingsCustomInstructionsTextarea) settingsCustomInstructionsTextarea.value = settings.customInstructions || '';
    
    // Update AI config section visibility
    if (aiConfigSection) {
      if (settingsEnableAIToggle?.checked) {
        aiConfigSection.classList.remove('hidden');
      } else {
        aiConfigSection.classList.add('hidden');
      }
    }
  }
  
  // Determine which UI to show
  if (!hasCompliance) {
    // Show compliance setup first
    showView('profileSetup');
  } else {
    // Always go to main view after compliance
    // AI setup is optional and accessed through settings
    showView('activeMain');
    
    // Check current tab and profile status
    checkProfileStatus();
  }
  
  // Check if we're on a LinkedIn profile and if it's the user's profile
  async function checkProfileStatus() {
    const profileStatusDiv = document.getElementById('profileStatus');
    const roleSection = document.querySelector('.role-section');
    const actionButtons = document.querySelector('.action-buttons');
    const toggleRows = document.querySelectorAll('.toggle-row');
    const advanced = document.querySelector('.advanced');
    const actions = document.querySelector('.actions');
    
    // If profileStatusDiv doesn't exist, we're not in the right view
    if (!profileStatusDiv) {
      return;
    }
    
    // Show loading state with proper structure
    (() => {
        const parser = new DOMParser();
        const htmlContent = `
      <div class="profile-status-content">
        <p style="color: #666; font-size: 14px;">⟳ Checking your profile...</p>
      </div>
      <div class="profile-info" style="display: none;">
        <p class="profile-name">Not set</p>
        <button id="setProfile" class="small-button">Update</button>
      </div>
    `;
        const doc = parser.parseFromString(htmlContent, 'text/html');
        const fragment = document.createDocumentFragment();
        Array.from(doc.body.childNodes).forEach(node => {
          fragment.appendChild(node.cloneNode(true));
        });
        profileStatusDiv.replaceChildren(fragment);
      })();
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Check if we need to inject or reinject the content script
      if (tab.url && tab.url.includes('linkedin.com/in/')) {
        try {
          // Try to send a ping message to check if content script is alive
          const response = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
        } catch (error) {
          // Content script is not responding, show refresh message
          (() => {
        const parser = new DOMParser();
        const htmlContent = `
            <div style="text-align: center; padding: 20px; background: #fef3c7; border-radius: 8px; margin: 10px 0;">
              <p style="color: #92400e; font-weight: 500; margin-bottom: 8px;">🔄 Extension Updated</p>
              <p style="color: #78350f; font-size: 14px; margin-bottom: 12px;">Please refresh your LinkedIn tab to use the latest version</p>
              <button id="refreshTab" class="primary-button" style="background: #f59e0b;">Refresh LinkedIn Tab</button>
            </div>
          `;
        const doc = parser.parseFromString(htmlContent, 'text/html');
        const fragment = document.createDocumentFragment();
        Array.from(doc.body.childNodes).forEach(node => {
          fragment.appendChild(node.cloneNode(true));
        });
        profileStatusDiv.replaceChildren(fragment);
      })();
          
          hideAllControls(roleSection, actionButtons, toggleRows, advanced, actions);
          
          document.getElementById('refreshTab')?.addEventListener('click', () => {
            chrome.tabs.reload(tab.id);
            window.close(); // Close popup after refreshing
          });
          return;
        }
      }
      
      if (!tab.url || !tab.url.includes('linkedin.com/in/')) {
        (() => {
        const parser = new DOMParser();
        const htmlContent = `
          <div style="text-align: center; padding: 20px;">
            <p>📍 Navigate to your LinkedIn profile to see analysis</p>
            <button id="goToProfile" class="primary-button" style="margin-top: 12px;">Open Your Profile</button>
          </div>
        `;
        const doc = parser.parseFromString(htmlContent, 'text/html');
        const fragment = document.createDocumentFragment();
        Array.from(doc.body.childNodes).forEach(node => {
          fragment.appendChild(node.cloneNode(true));
        });
        profileStatusDiv.replaceChildren(fragment);
      })();
        
        // Hide all controls when not on LinkedIn
        hideAllControls(roleSection, actionButtons, toggleRows, advanced, actions);
        
        document.getElementById('goToProfile')?.addEventListener('click', () => {
          chrome.tabs.create({ url: 'https://www.linkedin.com/in/me/' });
        });
        return;
      }
      
      // Check if it's the user's profile - get fresh data from storage
      const profileData = await chrome.storage.local.get(['userProfile']);
      const userProfile = profileData.userProfile;
      const currentProfileMatch = tab.url.match(/\/in\/([^\/]+)/);
      const currentProfileId = currentProfileMatch ? currentProfileMatch[1] : null;
      const isOwnProfile = (userProfile?.profileId && currentProfileId === userProfile.profileId) || 
                          tab.url.includes('/in/me');
      
      if (isOwnProfile) {
        // Update the profile status content
        const statusContent = profileStatusDiv.querySelector('.profile-status-content');
        const profileInfoDiv = profileStatusDiv.querySelector('.profile-info');
        
        if (statusContent) {
          (() => {
        const parser = new DOMParser();
        const htmlContent = `
            <p style="margin: 0 0 4px 0; font-size: 12px; color: #0a66c2; font-weight: 500;">
              👉 Click "Analyze" in the blue banner on your LinkedIn profile
            </p>
          `;
        const doc = parser.parseFromString(htmlContent, 'text/html');
        const fragment = document.createDocumentFragment();
        Array.from(doc.body.childNodes).forEach(node => {
          fragment.appendChild(node.cloneNode(true));
        });
        statusContent.replaceChildren(fragment);
      })();
        }
        
        // Show and update profile info
        if (profileInfoDiv) {
          profileInfoDiv.style.display = 'flex';
          const profileNameEl = profileInfoDiv.querySelector('.profile-name');
          if (profileNameEl) {
            profileNameEl.textContent = `${userProfile?.profileName || userProfile?.profileId || 'Your Profile'} ${userProfile?.verifiedOwnership ? '✓' : ''}`;
          }
          
          // Add event listener to the update button
          const setProfileBtn = profileInfoDiv.querySelector('#setProfile');
          if (setProfileBtn) {
            setProfileBtn.addEventListener('click', async () => {
              // Send message to content script to save current profile
              try {
                await chrome.tabs.sendMessage(tab.id, { 
                  action: 'saveProfile'
                });
                
                // Show success and update UI
                const profileData = await chrome.storage.local.get(['userProfile']);
                if (profileData.userProfile) {
                  profileNameEl.textContent = `${profileData.userProfile.profileName || profileData.userProfile.profileId} ✓`;
                  
                  // Show temporary success message
                  const originalText = statusContent.textContent;
                  statusContent.textContent = '✓ Profile updated successfully!';
                  statusContent.style.color = '#059669';
                  statusContent.style.fontWeight = '500';
                  
                  setTimeout(() => {
                    statusContent.textContent = originalText;
                    statusContent.style.color = '';
                    statusContent.style.fontWeight = '';
                  }, 2000);
                }
              } catch (error) {
                statusContent.textContent = 'Failed to update profile';
                statusContent.style.color = '#dc2626';
              }
            });
          }
        }
        
        // Show all controls for own profile
        showAllControls(roleSection, actionButtons, toggleRows, advanced, actions);
      } else {
        (() => {
        const parser = new DOMParser();
        const htmlContent = `
          <div style="text-align: center; padding: 20px;">
            <p>⚠️ Not your profile</p>
            <p class="hint" style="margin: 12px 0;">Navigate to your own profile to see analysis</p>
            <button id="goToOwnProfile" class="primary-button">Go to Your Profile</button>
          </div>
        `;
        const doc = parser.parseFromString(htmlContent, 'text/html');
        const fragment = document.createDocumentFragment();
        Array.from(doc.body.childNodes).forEach(node => {
          fragment.appendChild(node.cloneNode(true));
        });
        profileStatusDiv.replaceChildren(fragment);
      })();
        
        // Hide all controls when not on own profile
        hideAllControls(roleSection, actionButtons, toggleRows, advanced, actions);
        
        document.getElementById('goToOwnProfile')?.addEventListener('click', () => {
          chrome.tabs.update(tab.id, { url: 'https://www.linkedin.com/in/me/' });
        });
      }
    } catch (error) {
      profileStatusDiv.textContent = 'Error checking profile status';
      hideAllControls(roleSection, actionButtons, toggleRows, advanced, actions, profileSection);
    }
  }
  
  function hideAllControls(roleSection, actionButtons, toggleRows, advanced, actions) {
    if (roleSection) roleSection.style.display = 'none';
    if (actionButtons) actionButtons.style.display = 'none';
    if (advanced) advanced.style.display = 'none';
    if (actions) actions.style.display = 'none';
    toggleRows.forEach(row => row.style.display = 'none');
  }
  
  function showAllControls(roleSection, actionButtons, toggleRows, advanced, actions) {
    
    if (actionButtons) actionButtons.style.display = 'block';
    if (advanced) advanced.style.display = 'block';
    if (actions) actions.style.display = 'block';
    toggleRows.forEach(row => row.style.display = 'flex');
  }
  
  
  // Handle compliance checkbox
  complianceCheck?.addEventListener('change', () => {
    if (acknowledgeComplianceBtn) {
      acknowledgeComplianceBtn.disabled = !complianceCheck.checked;
      // Update button styles
      if (complianceCheck.checked) {
        acknowledgeComplianceBtn.style.opacity = '1';
        acknowledgeComplianceBtn.style.cursor = 'pointer';
      } else {
        acknowledgeComplianceBtn.style.opacity = '0.6';
        acknowledgeComplianceBtn.style.cursor = 'not-allowed';
      }
      // Update hint text
      const buttonHint = document.getElementById('buttonHint');
      if (buttonHint) {
        buttonHint.style.display = complianceCheck.checked ? 'none' : 'block';
      }
    }
  });
  
  // Handle compliance acknowledgment
  acknowledgeComplianceBtn?.addEventListener('click', async () => {
    // Get current tab to save profile
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    
    if (tab && tab.url && tab.url.includes('linkedin.com/in/')) {
      // Save profile ownership acknowledgment
      try {
        // First check if content script is loaded
        let response;
        try {
          // Try to ping the content script
          await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
          
          // If ping succeeds, check profile WITHOUT saving
          response = await chrome.tabs.sendMessage(tab.id, { 
            action: 'saveProfile',
            checkOnly: true  // Just check, don't save yet
          });
        } catch (pingError) {
          // Content script not loaded, try to inject it
          
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['src/content/analyzer.js']
            });
            
            // Wait a moment for script to initialize
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Now try to check profile again
            response = await chrome.tabs.sendMessage(tab.id, { 
              action: 'saveProfile',
              checkOnly: true  // Just check, don't save yet
            });
          } catch (injectError) {
            throw new Error('Could not establish connection');
          }
        }
        
        if (response && response.success) {
          // Check if ownership was verified
          const hasOwnership = response.userProfile?.verifiedOwnership;
          const profileName = response.userProfile?.profileName || response.userProfile?.profileId || 'Unknown';
          
          // Build improved confirmation message
          let confirmMsg;

          if (hasOwnership) {
            confirmMsg = `Ready to save profile <b>${profileName}</b><br><br>
            ✅ Ownership verified<br><br>
            Continue?`;
          } else {
            confirmMsg = `Profile detected <b>${profileName}</b><br><br>
            ⚠️ <span style="color: #dc2626;">Ownership not verified</span><br>
            ElevateLI works best with your own profile.<br><br>
            Continue anyway?`;
          }

          // Defensive logging
          console.log('[acknowledgeCompliance] About to show dialog:', {
            profileName,
            hasOwnership,
            confirmMsgType: typeof confirmMsg,
            confirmMsgLength: confirmMsg?.length,
            confirmMsgPreview: confirmMsg?.substring(0, 50)
          });

          // Show confirmation dialog with HTML support
          const confirmed = await showConfirmDialog(confirmMsg, true);
          
          if (!confirmed) {
            // User cancelled - clear checkbox and stay on setup page
            if (complianceCheck) {
              complianceCheck.checked = false;
              // Trigger change event to update button state
              complianceCheck.dispatchEvent(new Event('change'));
            }
            return;
          }
          
          // NOW actually save the profile (user confirmed)
          const saveResponse = await chrome.tabs.sendMessage(tab.id, { 
            action: 'saveProfile'
            // No checkOnly flag, so it will save
          });
          
          if (!saveResponse || !saveResponse.success) {
            alert('Failed to save profile. Please try again.');
            return;
          }
          
          // Save compliance
          await chrome.storage.local.set({
            compliance: {
              hasAcknowledged: true,
              acknowledgedAt: Date.now(),
              version: '1.0'
            },
            userProfile: response.userProfile
          });
          
          // Update compliance state in content script
          await chrome.tabs.sendMessage(tab.id, {
            action: 'updateComplianceState',
            hasCompliance: true
          });
          
          // Show overlay on the profile
          await chrome.tabs.sendMessage(tab.id, {
            action: 'showOverlay'
          });
          
          // Move to main view (not AI setup)
          profileSetupDiv.classList.add('hidden');
          activeMainDiv.classList.remove('hidden');
          
          // Load the main view
          showView('activeMain');
          updateActiveMainView();
          checkProfileStatus();
        } else {
          alert('Failed to save profile. Please ensure you are on your LinkedIn profile.');
        }
      } catch (error) {
        
        // Check if it's a connection error (content script not loaded)
        if (error.message && error.message.includes('Could not establish connection')) {
          // Show refresh message using existing UI pattern
          (() => {
        const parser = new DOMParser();
        const htmlContent = `
            <div style="text-align: center; padding: 20px; background: #fef3c7; border-radius: 8px; margin: 10px 0;">
              <p style="color: #92400e; font-weight: 500; margin-bottom: 8px;">🔄 Extension Updated</p>
              <p style="color: #78350f; font-size: 14px; margin-bottom: 12px;">Please refresh your LinkedIn tab to use the latest version</p>
              <button id="refreshTab" class="primary-button" style="background: #f59e0b;">Refresh LinkedIn Tab</button>
            </div>
          `;
        const doc = parser.parseFromString(htmlContent, 'text/html');
        const fragment = document.createDocumentFragment();
        Array.from(doc.body.childNodes).forEach(node => {
          fragment.appendChild(node.cloneNode(true));
        });
        profileSetupDiv.replaceChildren(fragment);
      })();
          
          document.getElementById('refreshTab')?.addEventListener('click', () => {
            chrome.tabs.reload(tab.id);
            window.close(); // Close popup after refreshing
          });
        } else {
          alert('Failed to save profile. Please refresh the page and try again.');
        }
      }
    } else {
      alert('Please navigate to your LinkedIn profile first.');
    }
  });
  
  
  // Settings view event handlers
  settingsEnableAIToggle?.addEventListener('change', (e) => {
    if (aiConfigSection) {
      aiConfigSection.classList.toggle('hidden', !e.target.checked);
      if (!e.target.checked) {
        clearFieldError(settingsApiKeyInput, document.getElementById('apiKeyError'));
        clearFieldError(settingsAiModelSelect, null);
      }
    }
  });
  
  // Real-time overlay sync when toggled
  settingsShowAnalysisToggle?.addEventListener('change', (e) => {
    SettingsManager.updateAndSync({ showAnalysis: e.target.checked });
  });
  
  settingsTargetRoleSelect?.addEventListener('change', (e) => {
    if (settingsCustomRoleInput) {
      // Show custom role input when "Other" is selected
      if (e.target.value === 'other' || e.target.value === 'Other') {
        settingsCustomRoleInput.classList.remove('hidden');
      } else {
        settingsCustomRoleInput.classList.add('hidden');
      }
    }
  });
  
  settingsResetAnalysisLink?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (await showConfirmDialog('🗑️ <b>Clear Cached Analysis?</b><br><br>Settings will be preserved.', true)) {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      const profileId = tab?.url?.match(/linkedin\.com\/in\/([^\/]+)/)?.[1];
      if (profileId) {
        await chrome.storage.local.remove([`cache_${profileId}`]);
        chrome.tabs.sendMessage(tab.id, {action: 'triggerAnalysis'}).catch(() => {});
        await SettingsManager.updateAndSync({});  // Refresh UI
      }
      e.target.textContent = '✓ Cleared';
      setTimeout(() => e.target.textContent = 'Reset analysis', 2000);
    }
  });
  
  settingsClearApiKeyLink?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (await showConfirmDialog('Clear API key? You\'ll need to re-enter it.')) {
      await chrome.storage.local.remove(['apiKey', 'encryptedApiKey', 'installationId']);
      settingsApiKeyInput.value = '';
      // Update UI state
      await SettingsManager.updateAndSync({ enableAI: false });
      if (settingsEnableAIToggle) {
        settingsEnableAIToggle.checked = false;
        settingsEnableAIToggle.dispatchEvent(new Event('change'));
      }
      e.target.textContent = '✓ Cleared';
      setTimeout(() => e.target.textContent = 'Clear API key', 2000);
    }
  });
  
  settingsResetAllLink?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (await showConfirmDialog('⚠️ Factory Reset\n\nDelete ALL data including API keys?')) {
      if (await showConfirmDialog('Are you absolutely sure?')) {
        // BEFORE clearing storage, notify overlay
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        if (tab?.url?.includes('linkedin.com/in/')) {
          chrome.tabs.sendMessage(tab.id, {action: 'resetToZeroState'}).catch(() => {});
        }
        await chrome.storage.local.clear();
        setTimeout(() => window.location.reload(), 1000);
      }
    }
  });
  
  // Validation helper functions
  function showFieldError(inputElement, errorElement, message) {
    if (inputElement) {
      inputElement.classList.add('input-error');
    }
    if (errorElement) {
      errorElement.textContent = message || errorElement.textContent;
      errorElement.classList.add('show');
    }
  }
  
  function clearFieldError(inputElement, errorElement) {
    if (inputElement) {
      inputElement.classList.remove('input-error');
    }
    if (errorElement) {
      errorElement.classList.remove('show');
    }
  }
  
  // Clear validation on input
  settingsApiKeyInput?.addEventListener('input', () => {
    clearFieldError(settingsApiKeyInput, document.getElementById('apiKeyError'));
    // Also clear the test status when user starts typing
    const testStatus = document.getElementById('apiKeyTestStatus');
    if (testStatus) {
      testStatus.classList.add('hidden');
    }
  });
  
  settingsCustomRoleInput?.addEventListener('input', () => {
    clearFieldError(settingsCustomRoleInput, document.getElementById('customRoleError'));
  });
  
  settingsAiModelSelect?.addEventListener('change', () => {
    clearFieldError(settingsAiModelSelect, null);

    // Update cost hint and "Get key" link based on selected model
    const providerModel = settingsAiModelSelect.value;
    if (providerModel) {
      const [selectedProvider] = providerModel.split(':');
      const costHint = document.getElementById('costHint');
      const getKeyLink = document.getElementById('getKeyLink');

      const providerLinks = {
        'openai': 'https://platform.openai.com/api-keys',
        'anthropic': 'https://console.anthropic.com/settings/keys',
        'gemini': 'https://aistudio.google.com/apikey'
      };

      const modelCosts = {
        'gemini:gemini-2.5-flash-lite': 'Free with Gemini Flash Lite',
        'gemini:gemini-2.5-flash': '~$0.01-0.03/analysis',
        'gemini:gemini-2.5-pro': '~$0.03-0.10/analysis',
        'gemini:gemini-3.1-pro-preview': '~$0.05-0.15/analysis',
        'openai:gpt-4.1-nano': '~$0.01-0.02/analysis',
        'openai:gpt-4.1-mini': '~$0.02-0.05/analysis',
        'openai:gpt-4.1': '~$0.05-0.15/analysis',
        'openai:gpt-5.4-nano': '~$0.01-0.03/analysis',
        'openai:gpt-5.4-mini': '~$0.02-0.07/analysis',
        'openai:gpt-5.4': '~$0.05-0.20/analysis',
        'anthropic:claude-haiku-4-5-20251001': '~$0.02-0.05/analysis',
        'anthropic:claude-sonnet-4-6': '~$0.05-0.15/analysis',
        'anthropic:claude-opus-4-6': '~$0.10-0.30/analysis'
      };

      if (getKeyLink) getKeyLink.href = providerLinks[selectedProvider] || providerLinks['gemini'];
      if (costHint) costHint.textContent = modelCosts[providerModel] || '~$0.02-0.07/analysis';
    }
  });
  
  // Handle Save Settings button
  saveSettingsBtn?.addEventListener('click', async () => {
    let hasErrors = false;
    let provider = null;
    let model = null;
    let apiKey = null;
    let isPlaceholder = false;
    
    // Validate if AI is enabled AND visible
    if (settingsEnableAIToggle.checked && !aiConfigSection.classList.contains('hidden')) {
      const providerModel = settingsAiModelSelect.value;
      apiKey = settingsApiKeyInput.value.trim();
      
      // Clean the API key - remove zero-width spaces and other invisible characters
      apiKey = apiKey.replace(/[\u200B-\u200D\uFEFF]/g, '');
      
      // Check if it's a placeholder or real key
      isPlaceholder = apiKey === '••••••••••••';
      
      // Check for non-ASCII characters if not placeholder
      if (!isPlaceholder && apiKey && !/^[\x20-\x7E]+$/.test(apiKey)) {
        showFieldError(settingsApiKeyInput, document.getElementById('apiKeyError'), 'API key contains invalid characters');
        hasErrors = true;
      }
      
      // Check for empty API key if not placeholder
      if (!isPlaceholder && !apiKey) {
        showFieldError(settingsApiKeyInput, document.getElementById('apiKeyError'), 'API key is required');
        hasErrors = true;
      }
      
      if (!providerModel) {
        showFieldError(settingsAiModelSelect, null, null);
        hasErrors = true;
      }
      
      // Extract provider and model from combined value
      if (providerModel) {
        [provider, model] = providerModel.split(':');
      }
      
      // Only validate if user entered a new key (not placeholder)
      if (!isPlaceholder && apiKey) {
        // Show validating state
        saveSettingsBtn.textContent = '⟳ Validating...';
        saveSettingsBtn.disabled = true;
        
        // Validate API key first
        try {
          const testResponse = await chrome.runtime.sendMessage({
            action: 'testApiKey',
            provider,
            apiKey,
            model
          });
          
          if (!testResponse || !testResponse.success) {
            // Use consistent field validation error UI
            const errorMessage = testResponse?.error || 'Invalid API key';
            showFieldError(settingsApiKeyInput, document.getElementById('apiKeyError'), errorMessage);
            
            // Reset button
            saveSettingsBtn.textContent = 'Save Settings';
            saveSettingsBtn.disabled = false;
            
            return;
          }
          
          // Valid key, proceed with encryption
          saveSettingsBtn.textContent = '⟳ Saving...';
          
          // Clear any validation errors since key is valid
          clearFieldError(settingsApiKeyInput, document.getElementById('apiKeyError'));
          
          // Clear any existing encrypted key first
          await chrome.storage.local.remove(['encryptedApiKey', 'installationId']);
          
          const encryptResponse = await chrome.runtime.sendMessage({
            action: 'encryptApiKey',
            apiKey: apiKey
          });
          
          if (encryptResponse && encryptResponse.success && encryptResponse.encryptedApiKey) {
            await chrome.storage.local.set({
              encryptedApiKey: encryptResponse.encryptedApiKey,
              aiProvider: provider,
              aiModel: model || 'gemini-2.5-flash-lite'
            });
            await chrome.storage.local.remove('apiKey');
          } else {
            throw new Error('Failed to encrypt API key');
          }
        } catch (error) {
          
          // Determine error message
          let errorMessage = 'Failed to save API key securely';
          let showTroubleshoot = false;
          
          // Check if it's a Chrome runtime error
          if (chrome.runtime.lastError) {
            errorMessage = 'Extension error: ' + chrome.runtime.lastError.message;
          } else if (error.message && error.message.includes('Extension context invalidated')) {
            errorMessage = 'Extension reloaded. Please refresh the page';
          } else if (error.message && (error.message.includes('Web Crypto API') || error.message.includes('browser'))) {
            errorMessage = error.message;
            showTroubleshoot = true;
          } else if (error.message && error.message.includes('encrypt')) {
            errorMessage = 'Encryption failed. Try resetting encryption settings';
            showTroubleshoot = true;
          }
          
          // Use consistent field validation error UI
          showFieldError(settingsApiKeyInput, document.getElementById('apiKeyError'), errorMessage);
          
          // Only show status div for troubleshooting scenarios
          if (showTroubleshoot) {
            const statusDiv = document.getElementById('apiKeyTestStatus');
            if (statusDiv) {
              statusDiv.textContent = '✗ ' + errorMessage + ' ';
              const troubleshootLink = document.createElement('a');
              troubleshootLink.href = '#';
              troubleshootLink.id = 'troubleshoot-encryption';
              troubleshootLink.style.color = '#0a66c2';
              troubleshootLink.style.textDecoration = 'underline';
              troubleshootLink.style.fontSize = '12px';
              troubleshootLink.textContent = 'Troubleshoot';
              statusDiv.appendChild(troubleshootLink);
              
              // Handle troubleshoot click
              setTimeout(() => {
                document.getElementById('troubleshoot-encryption')?.addEventListener('click', async (e) => {
                  e.preventDefault();
                  
                  // Clear installation ID and encrypted key to force reset
                  await chrome.storage.local.remove(['installationId', 'encryptedApiKey']);
                  
                  statusDiv.textContent = '✓ Encryption settings reset. Please try saving again.';
                  statusDiv.className = 'test-status success';
                  
                  // Hide after 3 seconds
                  setTimeout(() => statusDiv.classList.add('hidden'), 3000);
                });
              }, 100);
            }
            
            // Hide error after 8 seconds (longer for troubleshooting)
            setTimeout(() => statusDiv.classList.add('hidden'), showTroubleshoot ? 8000 : 5000);
          }
          
          // Reset button
          saveSettingsBtn.textContent = 'Save Settings';
          saveSettingsBtn.disabled = false;
          
          return; // Don't continue with saving
        }
      } else if (!isPlaceholder && !apiKey) {
        // User cleared the API key field - use consistent validation
        showFieldError(settingsApiKeyInput, document.getElementById('apiKeyError'), 'API key is required');
        hasErrors = true;
      } else {
        // Just save the provider and model if key wasn't changed (placeholder shown)
        await chrome.storage.local.set({ 
          aiProvider: provider,
          aiModel: model || 'gemini-2.5-flash-lite'
        });
      }
    }
    
    // Save all other settings
    const settingsToSave = {
      showAnalysis: settingsShowAnalysisToggle.checked,  // ADD THIS LINE
      enableAI: settingsEnableAIToggle.checked,
      targetRole: settingsTargetRoleSelect.value,
      seniorityLevel: settingsSeniorityLevelSelect.value,
      customInstructions: settingsCustomInstructionsTextarea.value.trim()
    };
    
    // Validate custom role if "Other" is selected
    if (settingsTargetRoleSelect.value === 'other' || settingsTargetRoleSelect.value === 'Other') {
      const customRole = settingsCustomRoleInput.value.trim();
      if (!customRole) {
        showFieldError(settingsCustomRoleInput, document.getElementById('customRoleError'), 'Please enter your target role');
        hasErrors = true;
      } else {
        settingsToSave.customRole = customRole;
      }
    }
    
    // If there are validation errors, don't save
    if (hasErrors) {
      return;
    }
    
    await chrome.storage.local.set(settingsToSave);
    
    // Update settings object with saved values
    Object.assign(settings, settingsToSave);
    
    // If AI was configured with a new key, update settings to reflect that
    if (settingsEnableAIToggle.checked && !isPlaceholder && apiKey) {
      settings.encryptedApiKey = true; // Mark that we have an encrypted key
      settings.aiProvider = provider;
      settings.aiModel = model || 'gemini-2.5-flash-lite';
    }
    
    await SettingsManager.updateAndSync(settings);  // Pass full settings
    
    // Clear all validation errors on successful save
    clearFieldError(settingsApiKeyInput, document.getElementById('apiKeyError'));
    clearFieldError(settingsCustomRoleInput, document.getElementById('customRoleError'));
    clearFieldError(settingsAiModelSelect, null);
    
    // Hide any status messages
    const testStatus = document.getElementById('apiKeyTestStatus');
    if (testStatus) {
      testStatus.classList.add('hidden');
    }
    
    // Enhanced visual feedback with guidance
    saveSettingsBtn.textContent = '✓ Settings Saved';
    saveSettingsBtn.classList.add('success');
    
    // Navigate back to homepage after 1 second
    setTimeout(() => {
      saveSettingsBtn.textContent = 'Save Settings';
      saveSettingsBtn.classList.remove('success');
      showView('activeMain'); // Navigate back to homepage
    }, 1000);
  });
  
  // Removed test button handler - API validation now happens on save
  
  
  
  
  // Profile Management
  const setProfileBtn = document.getElementById('setProfile');
  
  // Handle set profile button
  setProfileBtn?.addEventListener('click', async () => {
    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.url || !tab.url.includes('linkedin.com/in/')) {
        await showConfirmDialog('⚠️ <b>Not on LinkedIn</b><br><br>Please navigate to a LinkedIn profile page first.', true);
        return;
      }
      
      // Extract profile ID from URL
      const profileMatch = tab.url.match(/\/in\/([^\/]+)/);
      const profileId = profileMatch ? profileMatch[1] : null;
      
      if (!profileId || profileId === 'me') {
        await showConfirmDialog('⚠️ <b>Invalid Profile URL</b><br><br>Could not extract profile ID.<br>Please navigate to your specific profile URL.', true);
        return;
      }
      
      // Get profile info and check ownership indicators
      let profileData = { name: profileId, hasIndicators: false, isMeUrl: false };
      try {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            // Get profile name
            const nameEl = document.querySelector('h1.text-heading-xlarge');
            const name = nameEl ? nameEl.textContent.trim() : null;
            
            // Check ownership indicators
            const editButton = document.querySelector('button[aria-label*="Edit intro"]') ||
                             document.querySelector('a[href*="/edit/intro/"]') ||
                             document.querySelector('.pvs-profile-actions__edit-profile') ||
                             Array.from(document.querySelectorAll('button')).find(btn => 
                               btn.getAttribute('aria-label')?.includes('Edit'));
            
            const addSectionButton = document.querySelector('button[aria-label*="Add profile section"]') ||
                                   document.querySelector('a[href*="add-edit/"]') ||
                                   Array.from(document.querySelectorAll('button')).find(btn => 
                                     btn.textContent?.includes('Add profile section'));
            
            const analyticsButton = document.querySelector('button[aria-label*="View profile analytics"]') ||
                                  document.querySelector('a[href*="/dashboard/"]') ||
                                  Array.from(document.querySelectorAll('button')).find(btn => 
                                    btn.textContent?.includes('View profile analytics'));
            
            const hasIndicators = !!(editButton || addSectionButton || analyticsButton);
            
            return {
              name: name,
              hasIndicators: hasIndicators,
              indicators: {
                editButton: !!editButton,
                addSectionButton: !!addSectionButton,
                analyticsButton: !!analyticsButton
              }
            };
          }
        });
        
        if (result?.result) {
          profileData = {
            ...result.result,
            isMeUrl: tab.url.includes('/in/me/')
          };
        }
      } catch (error) {
      }
      
      const profileName = profileData.name || profileId;
      const hasValidation = profileData.hasIndicators || profileData.isMeUrl;

      // Build confirmation message with HTML
      let confirmMsg;

      if (hasValidation) {
        confirmMsg = `Ready to save profile <b>${profileName}</b><br><br>`;
        confirmMsg += '✅ <span style="color: #059669;">Ownership verified</span><br><br>';
        confirmMsg += 'Continue?';
      } else {
        confirmMsg = `Set profile <b>${profileName}</b> as yours?<br><br>`;
        confirmMsg += '⚠️ <span style="color: #dc2626;">Ownership not verified</span><br><br>';
        confirmMsg += '<span style="font-size: 13px;">ElevateLI works best with your own profile.<br>';
        confirmMsg += 'Are you sure this is your profile?</span>';
      }

      // Defensive logging
      console.log('[setProfile] About to show dialog:', {
        profileName,
        hasValidation,
        confirmMsgType: typeof confirmMsg,
        confirmMsgLength: confirmMsg?.length,
        confirmMsgPreview: confirmMsg?.substring(0, 50)
      });

      // Show confirmation dialog with HTML support
      const confirmed = await showConfirmDialog(confirmMsg, true);
      
      if (!confirmed) {
        return;
      }
      
      // Save profile
      const userProfile = {
        profileId,
        profileName,
        profileUrl: tab.url.split('?')[0],
        savedAt: Date.now(),
        verifiedOwnership: hasValidation
      };
      
      await chrome.storage.local.set({ userProfile });
      
      // Try to notify content script to initialize overlay
      try {
        await chrome.tabs.sendMessage(tab.id, { 
          action: 'profileUpdated',
          userProfile: userProfile 
        });
        
        // Show success
        setProfileBtn.textContent = '✓ Saved';
        setProfileBtn.disabled = true;
        
        // Update profile status to remove "Not your profile" message
        await checkProfileStatus();
        
        setTimeout(() => {
          setProfileBtn.disabled = false;
          setProfileBtn.textContent = 'Update';
        }, 2000);
        
      } catch (error) {
        
        // Show success with refresh prompt
        setProfileBtn.textContent = '✓ Saved';
        setProfileBtn.disabled = true;
        
        // Ask if user wants to refresh
        const shouldRefresh = await showConfirmDialog(
          '✅ <b>Profile saved successfully!</b><br><br>Refresh the page to see your analysis?',
          true
        );
        
        if (shouldRefresh) {
          await chrome.tabs.reload(tab.id);
          window.close(); // Close popup after reload
        } else {
          // Update profile status even if user doesn't refresh
          await checkProfileStatus();
          
          setTimeout(() => {
            setProfileBtn.disabled = false;
            setProfileBtn.textContent = 'Update';
          }, 2000);
        }
      }
      
    } catch (error) {
      await showConfirmDialog('❌ <b>Failed to set profile</b><br><br>Please try again.', true);
    }
  });
  
  // Handle footer links for Privacy and Terms
  const termsLink = document.getElementById('terms-link');
  const privacyLink = document.getElementById('privacy-link');
  
  if (termsLink) {
    termsLink.addEventListener('click', (e) => {
      e.preventDefault();
      const url = termsLink.getAttribute('data-url');
      chrome.tabs.create({ url: chrome.runtime.getURL(url) });
    });
  }
  
  if (privacyLink) {
    privacyLink.addEventListener('click', (e) => {
      e.preventDefault();
      const url = privacyLink.getAttribute('data-url');
      chrome.tabs.create({ url: chrome.runtime.getURL(url) });
    });
  }
  
});