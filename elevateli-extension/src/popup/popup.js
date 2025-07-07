// ElevateLI Popup - Simplified Control Center

document.addEventListener('DOMContentLoaded', async () => {
  // Get DOM elements
  const setupDiv = document.getElementById('setup');
  const controlsDiv = document.getElementById('controls');
  const profileSetupDiv = document.getElementById('profileSetup');
  const aiProviderSelect = document.getElementById('aiProvider');
  const apiKeyInput = document.getElementById('apiKey');
  const saveSetupBtn = document.getElementById('saveSetup');
  const aiEnabledToggle = document.getElementById('aiEnabled');
  const customInstructionsTextarea = document.getElementById('customInstructions');
  const updateInstructionsBtn = document.getElementById('updateInstructions');
  const targetRoleSelect = document.getElementById('targetRole');
  const seniorityLevelSelect = document.getElementById('seniorityLevel');
  const resetAnalysisBtn = document.getElementById('resetAnalysis');
  const testApiKeyBtn = document.getElementById('testApiKey');
  
  // New elements for redesigned UI
  const saveSettingsBtn = document.getElementById('saveSettings');
  const resetExtensionLink = document.getElementById('resetExtension');
  const aiConfigBox = document.getElementById('aiConfig');
  const aiProviderMain = document.getElementById('aiProviderMain');
  const apiKeyMain = document.getElementById('apiKeyMain');
  const testApiKeyMainBtn = document.getElementById('testApiKeyMain');
  const confirmDialog = document.getElementById('confirmDialog');
  const confirmMessage = confirmDialog?.querySelector('.confirm-message');
  const confirmYesBtn = confirmDialog?.querySelector('.confirm-yes');
  const confirmNoBtn = confirmDialog?.querySelector('.confirm-no');
  
  // Load current settings
  const settings = await chrome.storage.local.get([
    'aiProvider',
    'apiKey',
    'encryptedApiKey',
    'enableAI',
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
    aiEnabledToggle.checked = settings.enableAI === true;
    customInstructionsTextarea.value = settings.customInstructions || '';
    targetRoleSelect.value = settings.targetRole || '';
    seniorityLevelSelect.value = settings.seniorityLevel || '';
    
    // Set AI provider and key in main controls
    if (aiProviderMain) {
      aiProviderMain.value = settings.aiProvider || '';
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
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
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
      
      // Check if it's the user's profile
      const userProfile = settings.userProfile;
      const currentProfileMatch = tab.url.match(/\/in\/([^\/]+)/);
      const currentProfileId = currentProfileMatch ? currentProfileMatch[1] : null;
      const isOwnProfile = (userProfile?.profileId && currentProfileId === userProfile.profileId) || 
                          tab.url.includes('/in/me');
      
      if (isOwnProfile) {
        profileStatusDiv.innerHTML = `
          <p>✅ Ready to analyze your profile</p>
          ${userProfile?.profileName ? `<p class="profile-url">${userProfile.profileName}</p>` : ''}
        `;
        
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
      hideAllControls(roleSection, actionButtons, toggleRows, advanced, actions);
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
  
  // Handle test API key
  testApiKeyBtn?.addEventListener('click', async () => {
    const provider = aiProviderSelect.value;
    const apiKey = apiKeyInput.value.trim();
    
    if (!provider || !apiKey) {
      alert('Please select a provider and enter an API key to test');
      return;
    }
    
    // Update button state
    testApiKeyBtn.textContent = 'Testing...';
    testApiKeyBtn.disabled = true;
    
    try {
      // Send test request to service worker
      const response = await chrome.runtime.sendMessage({
        action: 'testApiKey',
        provider,
        apiKey
      });
      
      if (response.success) {
        testApiKeyBtn.textContent = '✓ Valid';
        testApiKeyBtn.style.background = '#057642';
        testApiKeyBtn.style.color = 'white';
        
        // Enable save button
        saveSetupBtn.disabled = false;
        saveSetupBtn.style.opacity = '1';
      } else {
        testApiKeyBtn.textContent = '✗ Invalid';
        testApiKeyBtn.style.background = '#dc2626';
        testApiKeyBtn.style.color = 'white';
        
        // Show error message
        alert(response.error || 'API key validation failed. Please check your key and try again.');
      }
    } catch (error) {
      testApiKeyBtn.textContent = 'Error';
      testApiKeyBtn.style.background = '#dc2626';
      testApiKeyBtn.style.color = 'white';
      alert('Failed to test API key. Please try again.');
    }
    
    // Reset button after 3 seconds
    setTimeout(() => {
      testApiKeyBtn.textContent = 'Test Key';
      testApiKeyBtn.disabled = false;
      testApiKeyBtn.style.background = '';
      testApiKeyBtn.style.color = '';
    }, 3000);
  });
  
  // Handle setup save
  saveSetupBtn.addEventListener('click', async () => {
    const provider = aiProviderSelect.value;
    const apiKey = apiKeyInput.value.trim();
    
    if (!provider || !apiKey) {
      alert('Please select a provider and enter an API key');
      return;
    }
    
    // Encrypt the API key before saving
    try {
      const encryptResponse = await chrome.runtime.sendMessage({
        action: 'encryptApiKey',
        apiKey: apiKey
      });
      
      if (encryptResponse.success) {
        // Save settings with encrypted key
        await chrome.storage.local.set({
          aiProvider: provider,
          encryptedApiKey: encryptResponse.encryptedApiKey,
          enableAI: true,
          hasSeenAISetup: true
        });
        
        // Remove any plain text key
        await chrome.storage.local.remove('apiKey');
      } else {
        // Fallback to plain text storage (not recommended)
        await chrome.storage.local.set({
          aiProvider: provider,
          apiKey: apiKey,
          enableAI: true,
          hasSeenAISetup: true
        });
      }
    } catch (error) {
      console.error('Error encrypting API key:', error);
      // Fallback to plain text storage
      await chrome.storage.local.set({
        aiProvider: provider,
        apiKey: apiKey,
        enableAI: true,
        hasSeenAISetup: true
      });
    }
    
    // Switch to controls view
    setupDiv.classList.add('hidden');
    controlsDiv.classList.remove('hidden');
    aiEnabledToggle.checked = true;
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
  
  // Handle custom instructions save
  updateInstructionsBtn.addEventListener('click', async () => {
    const instructions = customInstructionsTextarea.value.trim();
    await chrome.storage.local.set({ customInstructions: instructions });
    
    // Visual feedback
    updateInstructionsBtn.textContent = 'Saved!';
    setTimeout(() => {
      updateInstructionsBtn.textContent = 'Save';
    }, 2000);
  });
  
  // Handle Save Settings button
  saveSettingsBtn?.addEventListener('click', async () => {
    // Validate if AI is enabled
    if (aiEnabledToggle.checked) {
      const provider = aiProviderMain.value;
      const apiKey = apiKeyMain.value.trim();
      
      // Check if it's a placeholder or real key
      const isPlaceholder = apiKey === '••••••••••••';
      
      if (!provider || (!apiKey || isPlaceholder)) {
        // Show error in profile status
        const profileStatusDiv = document.getElementById('profileStatus');
        const originalContent = profileStatusDiv.innerHTML;
        profileStatusDiv.innerHTML = `
          <div style="background: #fee; border: 1px solid #fcc; border-radius: 6px; padding: 12px;">
            <p style="color: #d93025; font-weight: 500; margin: 0;">Missing Configuration</p>
            <p style="color: #d93025; font-size: 13px; margin: 4px 0 0 0;">Please select an AI provider and enter your API key.</p>
          </div>
        `;
        
        setTimeout(() => {
          profileStatusDiv.innerHTML = originalContent;
          checkProfileStatus();
        }, 3000);
        return;
      }
      
      // Save new API key if changed
      if (!isPlaceholder) {
        try {
          const encryptResponse = await chrome.runtime.sendMessage({
            action: 'encryptApiKey',
            apiKey: apiKey
          });
          
          if (encryptResponse.success) {
            await chrome.storage.local.set({
              encryptedApiKey: encryptResponse.encryptedApiKey,
              aiProvider: provider
            });
            await chrome.storage.local.remove('apiKey');
          } else {
            await chrome.storage.local.set({
              apiKey: apiKey,
              aiProvider: provider
            });
          }
        } catch (error) {
          console.error('Error encrypting API key:', error);
          await chrome.storage.local.set({
            apiKey: apiKey,
            aiProvider: provider
          });
        }
      } else {
        // Just save the provider if key wasn't changed
        await chrome.storage.local.set({ aiProvider: provider });
      }
    }
    
    // Save all other settings
    await chrome.storage.local.set({
      enableAI: aiEnabledToggle.checked,
      targetRole: targetRoleSelect.value,
      seniorityLevel: seniorityLevelSelect.value,
      customInstructions: customInstructionsTextarea.value.trim()
    });
    
    // Visual feedback
    saveSettingsBtn.textContent = '✓ Settings Saved';
    saveSettingsBtn.classList.add('success');
    
    setTimeout(() => {
      saveSettingsBtn.textContent = 'Save Settings';
      saveSettingsBtn.classList.remove('success');
    }, 2000);
  });
  
  // Handle test API key in main controls
  testApiKeyMainBtn?.addEventListener('click', async () => {
    const provider = aiProviderMain.value;
    const apiKey = apiKeyMain.value.trim();
    
    // Check if it's a placeholder
    if (apiKey === '••••••••••••') {
      alert('Please enter a new API key to test');
      return;
    }
    
    if (!provider || !apiKey) {
      alert('Please select a provider and enter an API key to test');
      return;
    }
    
    // Update button state
    testApiKeyMainBtn.textContent = 'Testing...';
    testApiKeyMainBtn.disabled = true;
    
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'testApiKey',
        provider,
        apiKey
      });
      
      if (response.success) {
        testApiKeyMainBtn.textContent = '✓ Valid';
        testApiKeyMainBtn.classList.add('success');
        testApiKeyMainBtn.classList.remove('error');
      } else {
        testApiKeyMainBtn.textContent = '✗ Invalid';
        testApiKeyMainBtn.classList.add('error');
        testApiKeyMainBtn.classList.remove('success');
        alert(response.error || 'API key validation failed. Please check your key and try again.');
      }
    } catch (error) {
      testApiKeyMainBtn.textContent = 'Error';
      testApiKeyMainBtn.classList.add('error');
      alert('Failed to test API key. Please try again.');
    }
    
    // Reset button after 3 seconds
    setTimeout(() => {
      testApiKeyMainBtn.textContent = 'Test';
      testApiKeyMainBtn.disabled = false;
      testApiKeyMainBtn.classList.remove('success', 'error');
    }, 3000);
  });
  
  
  
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
            `aiCache_${profileId}`,
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
      setTimeout(() => {
        resetAnalysisBtn.textContent = 'Reset Analysis';
        resetAnalysisBtn.disabled = false;
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
      alert('Failed to reset extension. Please try again.');
    }
  });
});