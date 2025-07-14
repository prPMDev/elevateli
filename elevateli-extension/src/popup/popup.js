// ElevateLI Popup - Simplified Control Center

document.addEventListener('DOMContentLoaded', async () => {
  // Get DOM elements
  const setupDiv = document.getElementById('setup');
  const controlsDiv = document.getElementById('controls');
  const profileSetupDiv = document.getElementById('profileSetup');
  const aiProviderSelect = document.getElementById('aiProvider');
  const aiModelSelect = document.getElementById('aiModel');
  const apiKeyInput = document.getElementById('apiKey');
  const saveSetupBtn = document.getElementById('saveSetup');
  const showAnalysisToggle = document.getElementById('showAnalysis');
  const aiEnabledToggle = document.getElementById('aiEnabled');
  const customInstructionsTextarea = document.getElementById('customInstructions');
  // const updateInstructionsBtn = document.getElementById('updateInstructions'); // Removed in new design
  const targetRoleSelect = document.getElementById('targetRole');
  const seniorityLevelSelect = document.getElementById('seniorityLevel');
  const resetAnalysisBtn = document.getElementById('resetAnalysis');
  
  // New elements for redesigned UI
  const saveSettingsBtn = document.getElementById('saveSettings');
  const resetExtensionLink = document.getElementById('resetExtension');
  const aiConfigBox = document.getElementById('aiConfig');
  const aiProviderModelSelect = document.getElementById('aiProviderModel');
  const apiKeyMain = document.getElementById('apiKeyMain');
  const apiKeyHelp = document.getElementById('apiKeyHelp');
  const confirmDialog = document.getElementById('confirmDialog');
  const confirmMessage = confirmDialog?.querySelector('.confirm-message');
  const confirmYesBtn = confirmDialog?.querySelector('.confirm-yes');
  const confirmNoBtn = confirmDialog?.querySelector('.confirm-no');
  
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
    'hasSeenAISetup',
    'lastAnalyzed'
  ]);
  
  // Check configuration states
  const hasCompliance = settings.compliance?.hasAcknowledged;
  const hasApiKey = !!(settings.apiKey || settings.encryptedApiKey);
  const hasProvider = !!settings.aiProvider;
  const isAIConfigured = hasApiKey && hasProvider;
  const hasUserProfile = !!settings.userProfile?.profileId;
  
  // Get additional DOM elements for profile setup
  const complianceCheck = document.getElementById('complianceCheck');
  const acknowledgeComplianceBtn = document.getElementById('acknowledgeCompliance');
  const skipSetupBtn = document.getElementById('skipSetup');
  
  // Check if user has seen AI setup
  const hasSeenAISetup = settings.hasSeenAISetup;
  
  // Determine which UI to show
  if (!hasCompliance) {
    // Show compliance setup first
    profileSetupDiv.classList.remove('hidden');
    setupDiv.classList.add('hidden');
    controlsDiv.classList.add('hidden');
  } else if (!isAIConfigured && !hasSeenAISetup) {
    // Show AI setup (optional) only if they haven't seen it before
    profileSetupDiv.classList.add('hidden');
    setupDiv.classList.remove('hidden');
    controlsDiv.classList.add('hidden');
  } else {
    // Show controls but check if user is on their own profile first
    profileSetupDiv.classList.add('hidden');
    setupDiv.classList.add('hidden');
    controlsDiv.classList.remove('hidden');
    
    // Set control states
    showAnalysisToggle.checked = settings.showAnalysis !== false;  // Default to true
    aiEnabledToggle.checked = settings.enableAI === true;
    customInstructionsTextarea.value = settings.customInstructions || '';
    targetRoleSelect.value = settings.targetRole || '';
    seniorityLevelSelect.value = settings.seniorityLevel || '';
    
    // Set AI provider and model in main controls
    if (aiProviderModelSelect && settings.aiProvider) {
      const modelValue = settings.aiModel || 'gpt-4o-mini';
      aiProviderModelSelect.value = `${settings.aiProvider}:${modelValue}`;
    }
    if (apiKeyMain && (settings.apiKey || settings.encryptedApiKey)) {
      apiKeyMain.value = '••••••••••••';
    }
    
    // Update AI config box state
    updateAIConfigState();
    
    
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
    
    // Show loading state with proper structure
    profileStatusDiv.innerHTML = `
      <div class="profile-status-content">
        <p style="color: #666; font-size: 14px;">⟳ Checking your profile...</p>
      </div>
      <div class="profile-info" style="display: none;">
        <p class="profile-name">Not set</p>
        <button id="setProfile" class="small-button">Update</button>
      </div>
    `;
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Check if we need to inject or reinject the content script
      if (tab.url && tab.url.includes('linkedin.com/in/')) {
        try {
          // Try to send a ping message to check if content script is alive
          const response = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
        } catch (error) {
          // Content script is not responding, show refresh message
          profileStatusDiv.innerHTML = `
            <div style="text-align: center; padding: 20px; background: #fef3c7; border-radius: 8px; margin: 10px 0;">
              <p style="color: #92400e; font-weight: 500; margin-bottom: 8px;">🔄 Extension Updated</p>
              <p style="color: #78350f; font-size: 14px; margin-bottom: 12px;">Please refresh your LinkedIn tab to use the latest version</p>
              <button id="refreshTab" class="primary-button" style="background: #f59e0b;">Refresh LinkedIn Tab</button>
            </div>
          `;
          
          hideAllControls(roleSection, actionButtons, toggleRows, advanced, actions);
          
          document.getElementById('refreshTab')?.addEventListener('click', () => {
            chrome.tabs.reload(tab.id);
            window.close(); // Close popup after refreshing
          });
          return;
        }
      }
      
      if (!tab.url || !tab.url.includes('linkedin.com/in/')) {
        profileStatusDiv.innerHTML = `
          <div style="text-align: center; padding: 20px;">
            <p>📍 Navigate to your LinkedIn profile to see analysis</p>
            <button id="goToProfile" class="primary-button" style="margin-top: 12px;">Open Your Profile</button>
          </div>
        `;
        
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
          statusContent.innerHTML = `
            <p style="margin: 0 0 4px 0; font-size: 12px; color: #0a66c2; font-weight: 500;">
              👉 Click "Analyze" in the blue banner on your LinkedIn profile
            </p>
          `;
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
                  const originalContent = statusContent.innerHTML;
                  statusContent.innerHTML = `<p style="color: #059669; font-weight: 500;">✓ Profile updated successfully!</p>`;
                  
                  setTimeout(() => {
                    statusContent.innerHTML = originalContent;
                  }, 2000);
                }
              } catch (error) {
                console.error('Error saving profile:', error);
                statusContent.innerHTML = `<p style="color: #dc2626;">Failed to update profile</p>`;
              }
            });
          }
        }
        
        // Show all controls for own profile
        showAllControls(roleSection, actionButtons, toggleRows, advanced, actions);
      } else {
        profileStatusDiv.innerHTML = `
          <div style="text-align: center; padding: 20px;">
            <p>⚠️ Not your profile</p>
            <p class="hint" style="margin: 12px 0;">Navigate to your own profile to see analysis</p>
            <button id="goToOwnProfile" class="primary-button">Go to Your Profile</button>
          </div>
        `;
        
        // Hide all controls when not on own profile
        hideAllControls(roleSection, actionButtons, toggleRows, advanced, actions);
        
        document.getElementById('goToOwnProfile')?.addEventListener('click', () => {
          chrome.tabs.update(tab.id, { url: 'https://www.linkedin.com/in/me/' });
        });
      }
    } catch (error) {
      console.error('Error checking profile status:', error);
      profileStatusDiv.innerHTML = `<p>Error checking profile status</p>`;
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
    // Note: roleSection is now part of AI config, so we don't show it separately
    if (actionButtons) actionButtons.style.display = 'block';
    if (advanced) advanced.style.display = 'block';
    if (actions) actions.style.display = 'block';
    toggleRows.forEach(row => row.style.display = 'flex');
  }
  
  // Update AI configuration box state based on toggle
  function updateAIConfigState() {
    if (aiConfigBox) {
      if (aiEnabledToggle.checked) {
        aiConfigBox.classList.remove('disabled');
      } else {
        aiConfigBox.classList.add('disabled');
      }
    }
  }
  
  // Show custom confirmation dialog
  function showConfirmDialog(message) {
    return new Promise((resolve) => {
      if (!confirmDialog || !confirmMessage) {
        // Fallback to browser confirm
        resolve(confirm(message));
        return;
      }
      
      confirmMessage.textContent = message;
      confirmDialog.classList.remove('hidden');
      
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
      };
      
      confirmYesBtn.addEventListener('click', handleYes);
      confirmNoBtn.addEventListener('click', handleNo);
    });
  }
  
  // Handle provider dropdown - show help link when provider selected
  aiProviderSelect?.addEventListener('change', () => {
    if (aiProviderSelect.value) {
      apiKeyHelp.style.display = 'block';
    } else {
      apiKeyHelp.style.display = 'none';
    }
  });
  
  // Handle compliance checkbox
  complianceCheck?.addEventListener('change', () => {
    acknowledgeComplianceBtn.disabled = !complianceCheck.checked;
  });
  
  // Handle compliance acknowledgment
  acknowledgeComplianceBtn?.addEventListener('click', async () => {
    await chrome.storage.local.set({
      compliance: {
        hasAcknowledged: true,
        acknowledgedAt: Date.now(),
        version: '1.0'
      }
    });
    
    // Move to AI setup
    profileSetupDiv.classList.add('hidden');
    setupDiv.classList.remove('hidden');
  });
  
  // Handle skip AI setup
  skipSetupBtn?.addEventListener('click', async () => {
    // Mark that user has seen AI setup
    await chrome.storage.local.set({ 
      enableAI: false,
      hasSeenAISetup: true
    });
    
    // Go directly to controls without AI
    setupDiv.classList.add('hidden');
    controlsDiv.classList.remove('hidden');
    
    // Set default values
    aiEnabledToggle.checked = false;
    
    // Check current tab and profile status
    checkProfileStatus();
  });
  
  // Removed test button handler - API validation now happens on save
  
  // Handle setup save
  saveSetupBtn.addEventListener('click', async () => {
    const providerModel = aiProviderSelect.value;
    if (!providerModel) {
      // Show inline error
      const errorDiv = document.createElement('div');
      errorDiv.className = 'error-message';
      errorDiv.style.cssText = 'color: #dc2626; font-size: 13px; margin-top: 8px; text-align: center;';
      errorDiv.textContent = '✗ Please select a provider and model';
      saveSetupBtn.parentElement.insertBefore(errorDiv, saveSetupBtn.nextSibling);
      setTimeout(() => errorDiv.remove(), 3000);
      return;
    }
    
    const [provider, model] = providerModel.split(':');
    let apiKey = apiKeyInput.value.trim();
    
    // Clean the API key - remove zero-width spaces and other invisible characters
    apiKey = apiKey.replace(/[\u200B-\u200D\uFEFF]/g, '');
    
    // Check for non-ASCII characters
    if (apiKey && !/^[\x20-\x7E]+$/.test(apiKey)) {
      // Show inline error
      const errorDiv = document.createElement('div');
      errorDiv.className = 'error-message';
      errorDiv.style.cssText = 'color: #dc2626; font-size: 13px; margin-top: 8px; text-align: center;';
      errorDiv.textContent = '✗ API key contains invalid characters. Please re-copy it from your provider.';
      
      // Insert error after save button
      saveSetupBtn.parentElement.insertBefore(errorDiv, saveSetupBtn.nextSibling);
      
      // Remove error after 5 seconds
      setTimeout(() => errorDiv.remove(), 5000);
      return;
    }
    
    if (!provider || !apiKey) {
      // Show inline error
      const errorDiv = document.createElement('div');
      errorDiv.className = 'error-message';
      errorDiv.style.cssText = 'color: #dc2626; font-size: 13px; margin-top: 8px; text-align: center;';
      errorDiv.textContent = '✗ Please select a provider and enter an API key';
      
      // Insert error after save button
      saveSetupBtn.parentElement.insertBefore(errorDiv, saveSetupBtn.nextSibling);
      
      // Remove error after 3 seconds
      setTimeout(() => errorDiv.remove(), 3000);
      return;
    }
    
    // Show validating state
    saveSetupBtn.textContent = 'Validating...';
    saveSetupBtn.disabled = true;
    
    // Validate API key first
    try {
      const testResponse = await chrome.runtime.sendMessage({
        action: 'testApiKey',
        provider,
        apiKey,
        model
      });
      
      if (!testResponse || !testResponse.success) {
        // Show inline error
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.style.cssText = 'color: #dc2626; font-size: 13px; margin-top: 8px;';
        errorDiv.innerHTML = '✗ ' + (testResponse?.error || 'Key invalid, please check') + 
          ' <a href="https://platform.openai.com/api-keys" target="_blank" style="color: #0a66c2; font-size: 12px;">Get key →</a>';
        
        // Insert error after API key input
        const apiKeyRow = apiKeyInput.parentElement;
        apiKeyRow.parentElement.insertBefore(errorDiv, apiKeyRow.nextSibling);
        
        // Reset button
        saveSetupBtn.textContent = 'Save & Continue';
        saveSetupBtn.disabled = false;
        
        // Remove error after 5 seconds
        setTimeout(() => errorDiv.remove(), 5000);
        return;
      }
      
      // API key is valid, proceed with encryption
      saveSetupBtn.textContent = 'Saving...';
    } catch (error) {
      console.error('Error validating API key:', error);
      // Show error message
      const errorDiv = document.createElement('div');
      errorDiv.className = 'error-message';
      errorDiv.style.cssText = 'color: #dc2626; font-size: 13px; margin-top: 8px;';
      
      // Check if it's a Chrome runtime error
      if (chrome.runtime.lastError) {
        errorDiv.textContent = '✗ Extension error: ' + chrome.runtime.lastError.message;
      } else if (error.message && error.message.includes('Extension context invalidated')) {
        errorDiv.textContent = '✗ Extension reloaded. Please refresh the page.';
      } else {
        errorDiv.textContent = '✗ Connection error, try again';
      }
      
      // Insert error after API key input
      const apiKeyRow = apiKeyInput.parentElement;
      apiKeyRow.parentElement.insertBefore(errorDiv, apiKeyRow.nextSibling);
      
      // Reset button
      saveSetupBtn.textContent = 'Save & Continue';
      saveSetupBtn.disabled = false;
      
      // Remove error after 5 seconds
      setTimeout(() => errorDiv.remove(), 5000);
      return;
    }
    
    // Clear any existing encrypted key and installation ID first to ensure clean state
    await chrome.storage.local.remove(['encryptedApiKey', 'installationId']);
    
    // Encrypt the API key before saving
    try {
      console.log('Encrypting API key for provider:', provider);
      const encryptResponse = await chrome.runtime.sendMessage({
        action: 'encryptApiKey',
        apiKey: apiKey
      });
      
      console.log('Encryption response:', encryptResponse);
      
      if (encryptResponse && encryptResponse.success && encryptResponse.encryptedApiKey) {
        // Save settings with encrypted key
        await chrome.storage.local.set({
          aiProvider: provider,
          aiModel: model,
          encryptedApiKey: encryptResponse.encryptedApiKey,
          enableAI: true,
          hasSeenAISetup: true
        });
        
        // Remove any plain text key
        await chrome.storage.local.remove('apiKey');
        
        console.log('API key encrypted and saved successfully');
        
        // Show success briefly then switch
        setupDiv.innerHTML = `
          <div style="text-align: center; padding: 40px;">
            <h3 style="color: #057642; margin-bottom: 8px;">✓ Setup Complete!</h3>
            <p style="color: #666;">Loading your settings...</p>
          </div>
        `;
        
        // Smooth transition after 1 second
        setTimeout(() => {
          setupDiv.classList.add('hidden');
          controlsDiv.classList.remove('hidden');
          aiEnabledToggle.checked = true;
          
          // Set values in main controls
          if (aiProviderMain) aiProviderMain.value = provider;
          if (aiModelMain) {
            aiModelMain.value = model || 'gpt-4o-mini';
            if (provider === 'openai') {
              aiModelMain.classList.remove('hidden');
            }
          }
          if (apiKeyMain) apiKeyMain.value = '••••••••••••';
          
          // Update state and check profile
          updateAIConfigState();
          checkProfileStatus();
        }, 1000);
      } else {
        console.error('Encryption failed:', encryptResponse?.error || 'Unknown error');
        throw new Error('Failed to encrypt API key');
      }
    } catch (error) {
      console.error('Error encrypting API key:', error);
      
      // Show error to user with troubleshooting options
      let troubleshootingSteps = '';
      if (error.message && (error.message.includes('Web Crypto API') || error.message.includes('browser'))) {
        troubleshootingSteps = `
          <div style="text-align: left; margin-top: 16px; padding: 16px; background: #f3f4f6; border-radius: 6px;">
            <h4 style="margin: 0 0 8px 0; font-size: 14px;">Troubleshooting Steps:</h4>
            <ol style="margin: 8px 0; padding-left: 20px; font-size: 13px; color: #666;">
              <li>Try using a different browser (Chrome or Edge recommended)</li>
              <li>Ensure you're not in Incognito/Private mode</li>
              <li>Clear browser cache and cookies for this extension</li>
              <li>Disable any security extensions that might block encryption</li>
            </ol>
          </div>
        `;
      } else if (error.message && error.message.includes('encrypt')) {
        troubleshootingSteps = `
          <button id="reset-encryption" class="secondary-btn" style="margin-top: 8px;">Reset Encryption Settings</button>
        `;
      }
      
      setupDiv.innerHTML = `
        <div style="text-align: center; padding: 40px;">
          <h3 style="color: #dc2626; margin-bottom: 8px;">❌ Setup Failed</h3>
          <p style="color: #666;">Failed to securely store API key.</p>
          <p style="color: #999; font-size: 12px; margin-top: 8px;">${error.message}</p>
          ${troubleshootingSteps}
          <button id="retry-setup" class="primary-btn" style="margin-top: 16px;">Try Again</button>
        </div>
      `;
      
      // Handle retry
      document.getElementById('retry-setup')?.addEventListener('click', () => {
        showAISetup(settings);
      });
      
      // Handle reset encryption if available
      document.getElementById('reset-encryption')?.addEventListener('click', async () => {
        await chrome.storage.local.remove(['installationId', 'encryptedApiKey']);
        setupDiv.innerHTML = `
          <div style="text-align: center; padding: 40px;">
            <h3 style="color: #059669; margin-bottom: 8px;">✓ Encryption Reset</h3>
            <p style="color: #666;">Encryption settings have been reset.</p>
            <button id="continue-setup" class="primary-btn" style="margin-top: 16px;">Continue Setup</button>
          </div>
        `;
        
        document.getElementById('continue-setup')?.addEventListener('click', () => {
          showAISetup(settings);
        });
      });
      
      return; // Don't continue with setup
    }
  });
  
  // Handle show analysis toggle
  showAnalysisToggle?.addEventListener('change', async (e) => {
    const showAnalysis = e.target.checked;
    await chrome.storage.local.set({ showAnalysis });
    
    // Send message to current tab to show/hide overlay
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.url?.includes('linkedin.com/in/')) {
      chrome.tabs.sendMessage(tab.id, { 
        action: 'toggleOverlay', 
        show: showAnalysis 
      });
    }
  });
  
  // Handle AI toggle
  aiEnabledToggle.addEventListener('change', async (e) => {
    // Update AI config box state
    updateAIConfigState();
    
    // Save the toggle state (configuration validation happens on save)
    await chrome.storage.local.set({ enableAI: e.target.checked });
  });
  
  // Handle role selection
  targetRoleSelect.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ targetRole: e.target.value });
  });
  
  // Handle seniority selection
  seniorityLevelSelect.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ seniorityLevel: e.target.value });
  });
  
  // Custom instructions are now saved with the main Save Settings button
  
  // Handle Save Settings button
  saveSettingsBtn?.addEventListener('click', async () => {
    // Validate if AI is enabled
    if (aiEnabledToggle.checked) {
      const providerModel = aiProviderModelSelect.value;
      let apiKey = apiKeyMain.value.trim();
      
      // Clean the API key - remove zero-width spaces and other invisible characters
      apiKey = apiKey.replace(/[\u200B-\u200D\uFEFF]/g, '');
      
      // Check if it's a placeholder or real key
      const isPlaceholder = apiKey === '••••••••••••';
      
      // Check for non-ASCII characters if not placeholder
      if (!isPlaceholder && apiKey && !/^[\x20-\x7E]+$/.test(apiKey)) {
        const profileStatusDiv = document.getElementById('profileStatus');
        const originalContent = profileStatusDiv.innerHTML;
        profileStatusDiv.innerHTML = `
          <div style="background: #fee; border: 1px solid #fcc; border-radius: 6px; padding: 12px;">
            <p style="color: #d93025; font-weight: 500; margin: 0;">Invalid API Key Format</p>
            <p style="color: #d93025; font-size: 13px; margin: 4px 0 0 0;">Key contains invalid characters. Please re-copy from your provider.</p>
          </div>
        `;
        
        setTimeout(() => {
          profileStatusDiv.innerHTML = originalContent;
          checkProfileStatus();
        }, 5000);
        return;
      }
      
      if (!providerModel) {
        // Show error in profile status
        const profileStatusDiv = document.getElementById('profileStatus');
        const originalContent = profileStatusDiv.innerHTML;
        profileStatusDiv.innerHTML = `
          <div style="background: #fee; border: 1px solid #fcc; border-radius: 6px; padding: 12px;">
            <p style="color: #d93025; font-weight: 500; margin: 0;">AI Setup Required</p>
            <p style="color: #d93025; font-size: 13px; margin: 4px 0 0 0;">Select provider & model</p>
          </div>
        `;
        
        setTimeout(() => {
          profileStatusDiv.innerHTML = originalContent;
          checkProfileStatus();
        }, 3000);
        return;
      }
      
      // Extract provider and model from combined value
      const [provider, model] = providerModel.split(':');
      
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
            apiKey
          });
          
          if (!testResponse || !testResponse.success) {
            // Show error in status area
            const statusDiv = document.getElementById('apiKeyTestStatus');
            const isOpenAI = provider === 'openai' || provider === 'openai-gpt-3.5';
            const helpLink = isOpenAI ? 
              ' <a href="https://platform.openai.com/api-keys" target="_blank" style="color: #0a66c2; font-size: 12px;">Get key →</a>' : 
              '';
            statusDiv.innerHTML = '✗ ' + (testResponse?.error || 'Key invalid') + helpLink;
            statusDiv.className = 'test-status error';
            statusDiv.classList.remove('hidden');
            
            // Reset button
            saveSettingsBtn.textContent = 'Save Settings';
            saveSettingsBtn.disabled = false;
            
            // Hide error after 5 seconds
            setTimeout(() => statusDiv.classList.add('hidden'), 5000);
            return;
          }
          
          // Valid key, proceed with encryption
          saveSettingsBtn.textContent = '⟳ Saving...';
          
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
              aiModel: model || 'gpt-4o-mini'
            });
            await chrome.storage.local.remove('apiKey');
            console.log('API key encrypted and saved successfully');
          } else {
            console.error('Encryption failed:', encryptResponse?.error || 'Unknown error');
            throw new Error('Failed to encrypt API key');
          }
        } catch (error) {
          console.error('Error during validation/encryption:', error);
          
          // Show error message
          const statusDiv = document.getElementById('apiKeyTestStatus');
          if (statusDiv) {
            let errorMessage = '✗ Failed to save API key securely. Please try again.';
            let showTroubleshoot = false;
            
            // Check if it's a Chrome runtime error
            if (chrome.runtime.lastError) {
              errorMessage = '✗ Extension error: ' + chrome.runtime.lastError.message;
            } else if (error.message && error.message.includes('Extension context invalidated')) {
              errorMessage = '✗ Extension reloaded. Please refresh the page.';
            } else if (error.message && (error.message.includes('Web Crypto API') || error.message.includes('browser'))) {
              errorMessage = '✗ ' + error.message;
              showTroubleshoot = true;
            } else if (error.message && error.message.includes('encrypt')) {
              errorMessage = '✗ Encryption failed. Click here to reset encryption settings.';
              showTroubleshoot = true;
            }
            
            statusDiv.innerHTML = errorMessage;
            statusDiv.className = 'test-status error';
            statusDiv.classList.remove('hidden');
            
            // Add troubleshooting link if needed
            if (showTroubleshoot) {
              statusDiv.innerHTML += ' <a href="#" id="troubleshoot-encryption" style="color: #0a66c2; text-decoration: underline; font-size: 12px;">Troubleshoot</a>';
              
              // Handle troubleshoot click
              setTimeout(() => {
                document.getElementById('troubleshoot-encryption')?.addEventListener('click', async (e) => {
                  e.preventDefault();
                  
                  // Clear installation ID and encrypted key to force reset
                  await chrome.storage.local.remove(['installationId', 'encryptedApiKey']);
                  
                  statusDiv.innerHTML = '✓ Encryption settings reset. Please try saving again.';
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
        // User cleared the API key field - this is an error
        const profileStatusDiv = document.getElementById('profileStatus');
        const originalContent = profileStatusDiv.innerHTML;
        profileStatusDiv.innerHTML = `
          <div style="background: #fee; border: 1px solid #fcc; border-radius: 6px; padding: 12px;">
            <p style="color: #d93025; font-weight: 500; margin: 0;">AI Setup Required</p>
            <p style="color: #d93025; font-size: 13px; margin: 4px 0 0 0;">Enter API key to enable AI analysis</p>
          </div>
        `;
        
        setTimeout(() => {
          profileStatusDiv.innerHTML = originalContent;
          checkProfileStatus();
        }, 3000);
        return;
      } else {
        // Just save the provider and model if key wasn't changed (placeholder shown)
        await chrome.storage.local.set({ 
          aiProvider: provider,
          aiModel: model || 'gpt-4o-mini'
        });
      }
    }
    
    // Save all other settings
    await chrome.storage.local.set({
      enableAI: aiEnabledToggle.checked,
      targetRole: targetRoleSelect.value,
      seniorityLevel: seniorityLevelSelect.value,
      customInstructions: customInstructionsTextarea.value.trim()
    });
    
    // Enhanced visual feedback with guidance
    saveSettingsBtn.textContent = '✓ Settings Saved';
    saveSettingsBtn.classList.add('success');
    
    // Show guidance message
    const profileStatusDiv = document.getElementById('profileStatus');
    const originalContent = profileStatusDiv.innerHTML;
    profileStatusDiv.innerHTML = `
      <div style="background: #e8f5e9; border: 1px solid #4caf50; border-radius: 6px; padding: 12px; margin-bottom: 12px;">
        <p style="color: #2e7d32; font-weight: 500; margin: 0;">✓ Settings Saved Successfully!</p>
        <p style="color: #2e7d32; font-size: 13px; margin: 4px 0 0 0;">
          → Look for the blue ElevateLI banner on your LinkedIn profile<br>
          → Click "Analyze" to see your updated analysis
        </p>
      </div>
    ` + originalContent;
    
    setTimeout(() => {
      saveSettingsBtn.textContent = 'Save Settings';
      saveSettingsBtn.classList.remove('success');
      // Restore original profile status after 5 seconds
      setTimeout(() => {
        profileStatusDiv.innerHTML = originalContent;
        checkProfileStatus(); // Refresh the profile status
      }, 3000);
    }, 2000);
  });
  
  // Removed test button handler - API validation now happens on save
  
  
  
  // Handle target role change
  targetRoleSelect?.addEventListener('change', async () => {
    await chrome.storage.local.set({ targetRole: targetRoleSelect.value });
  });
  
  // Handle seniority level change
  seniorityLevelSelect?.addEventListener('change', async () => {
    await chrome.storage.local.set({ seniorityLevel: seniorityLevelSelect.value });
  });
  
  // Handle reset analysis button
  resetAnalysisBtn?.addEventListener('click', async () => {
    const confirmed = await showConfirmDialog('Clear analysis cache? Your settings will be preserved.');
    if (!confirmed) {
      return;
    }
    
    resetAnalysisBtn.textContent = 'Resetting...';
    resetAnalysisBtn.disabled = true;
    
    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tab.url?.includes('linkedin.com/in/')) {
        // Extract profile ID from URL
        const profileMatch = tab.url.match(/\/in\/([^\/]+)/);
        const profileId = profileMatch ? profileMatch[1] : null;
        
        if (profileId) {
          // Clear cache for this profile
          const keysToRemove = [
            `cache_${profileId}`,  // Fixed: Match the actual cache key prefix used by CacheManager
            `aiCache_${profileId}`,  // Legacy key (just in case)
            `completeness_${profileId}`
          ];
          
          await chrome.storage.local.remove(keysToRemove);
          console.log('✅ Cleared cache for profile:', profileId);
          
          // Send message to content script to trigger re-analysis
          chrome.tabs.sendMessage(tab.id, { action: 'triggerAnalysis' }, (response) => {
            if (chrome.runtime.lastError) {
              console.log('Could not send triggerAnalysis message:', chrome.runtime.lastError);
            }
          });
        }
      }
      
      // Visual feedback
      resetAnalysisBtn.textContent = 'Cache Cleared!';
      
      // Show helpful message about re-analysis
      const profileStatusDiv = document.getElementById('profileStatus');
      const originalContent = profileStatusDiv.innerHTML;
      profileStatusDiv.innerHTML = `
        <div style="background: #e3f2fd; border: 1px solid #64b5f6; border-radius: 6px; padding: 12px; margin-bottom: 12px;">
          <p style="color: #1565c0; font-weight: 500; margin: 0;">✓ Cache Cleared Successfully!</p>
          <p style="color: #1565c0; font-size: 13px; margin: 4px 0 0 0;">
            → Go to your LinkedIn profile<br>
            → Click "Analyze" to run fresh analysis<br>
            → If AI fails, try updating your API key in settings
          </p>
        </div>
      `;
      
      setTimeout(() => {
        resetAnalysisBtn.textContent = 'Reset Analysis';
        resetAnalysisBtn.disabled = false;
        // Restore original status after 5 seconds
        setTimeout(() => {
          profileStatusDiv.innerHTML = originalContent;
          checkProfileStatus();
        }, 5000);
      }, 2000);
      
      
    } catch (error) {
      console.error('Error resetting analysis:', error);
      resetAnalysisBtn.textContent = 'Reset Failed';
      setTimeout(() => {
        resetAnalysisBtn.textContent = 'Reset Analysis';
        resetAnalysisBtn.disabled = false;
      }, 2000);
    }
  });
  
  // Profile Management
  const setProfileBtn = document.getElementById('setProfile');
  
  // Handle set profile button
  setProfileBtn?.addEventListener('click', async () => {
    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.url || !tab.url.includes('linkedin.com/in/')) {
        await showConfirmDialog('Please navigate to a LinkedIn profile page first.');
        return;
      }
      
      // Extract profile ID from URL
      const profileMatch = tab.url.match(/\/in\/([^\/]+)/);
      const profileId = profileMatch ? profileMatch[1] : null;
      
      if (!profileId || profileId === 'me') {
        await showConfirmDialog('Could not extract profile ID. Please navigate to your specific profile URL.');
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
        console.log('Could not get profile data from page:', error);
      }
      
      const profileName = profileData.name || profileId;
      const hasValidation = profileData.hasIndicators || profileData.isMeUrl;
      
      // Build confirmation message
      let confirmMessage = `Set "${profileName}" as your profile?\n\n`;
      
      if (hasValidation) {
        confirmMessage += '✅ Profile ownership verified';
        if (profileData.isMeUrl) {
          confirmMessage += ' (me URL detected)';
        } else if (profileData.hasIndicators) {
          confirmMessage += ' (profile controls found)';
        }
      } else {
        confirmMessage += '⚠️ Could not verify profile ownership\n\n';
        confirmMessage += 'No "Edit profile" or "Add section" buttons found.\n';
        confirmMessage += 'Are you sure this is your profile?';
      }
      
      // Show confirmation dialog
      const confirmed = await showConfirmDialog(confirmMessage);
      
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
        console.log('Content script not ready, prompting for refresh');
        
        // Show success with refresh prompt
        setProfileBtn.textContent = '✓ Saved';
        setProfileBtn.disabled = true;
        
        // Ask if user wants to refresh
        const shouldRefresh = await showConfirmDialog(
          'Profile saved successfully!\n\nRefresh the page to see your analysis?'
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
      console.error('Error setting profile:', error);
      await showConfirmDialog('Failed to set profile. Please try again.');
    }
  });
  
  // Handle reset extension link
  resetExtensionLink?.addEventListener('click', async (e) => {
    e.preventDefault();
    
    // First confirmation
    const firstConfirm = await showConfirmDialog('⚠️ Factory Reset\n\nThis will delete all data including API keys. Continue?');
    if (!firstConfirm) {
      return;
    }
    
    // Second confirmation for safety
    const secondConfirm = await showConfirmDialog('Are you absolutely sure? This cannot be undone.');
    if (!secondConfirm) {
      return;
    }
    
    try {
      // Clear all storage
      await chrome.storage.local.clear();
      
      // Show success message
      const profileStatusDiv = document.getElementById('profileStatus');
      profileStatusDiv.innerHTML = `
        <div style="background: #e8f5e9; border: 1px solid #4caf50; border-radius: 6px; padding: 12px;">
          <p style="color: #2e7d32; font-weight: 500; margin: 0;">Extension Reset Complete</p>
          <p style="color: #2e7d32; font-size: 13px; margin: 4px 0 0 0;">Reloading...</p>
        </div>
      `;
      
      // Reload the popup after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 1500);
      
    } catch (error) {
      console.error('Error resetting extension:', error);
      
      // Show error in profile status
      const profileStatusDiv = document.getElementById('profileStatus');
      if (profileStatusDiv) {
        profileStatusDiv.innerHTML = `
          <div style="background: #fee; border: 1px solid #fcc; border-radius: 6px; padding: 12px;">
            <p style="color: #d93025; font-weight: 500; margin: 0;">Reset Failed</p>
            <p style="color: #d93025; font-size: 13px; margin: 4px 0 0 0;">Please try again or manually clear extension data</p>
          </div>
        `;
      }
    }
  });
});