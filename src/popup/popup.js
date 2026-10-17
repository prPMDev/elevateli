// ElevateLI Popup - Simplified Control Center

document.addEventListener('DOMContentLoaded', async () => {
  // Get DOM elements - Views
  const activeMainDiv = document.getElementById('activeMain');
  const profileSetupDiv = document.getElementById('profileSetup');
  const settingsViewDiv = document.getElementById('settingsView');

  // Header elements
  const settingsGearBtn = document.getElementById('settingsGear');

  // Settings view elements
  const backButton = document.getElementById('backButton');
  const settingsShowAnalysisToggle = document.getElementById('settingsShowAnalysis');
  const settingsEnableAIToggle = document.getElementById('settingsEnableAI');
  const settingsAiProviderSelect = document.getElementById('settingsAiProvider');
  const settingsBaseUrlInput = document.getElementById('settingsBaseUrl');
  const baseUrlGroup = document.getElementById('baseUrlGroup');
  const settingsAiModelSelect = document.getElementById('settingsAiModel');
  const settingsApiKeyInput = document.getElementById('settingsApiKey');
  const apiKeyError = document.getElementById('apiKeyError');
  const modelError = document.getElementById('modelError');
  const settingsTargetRoleSelect = document.getElementById('settingsTargetRole');
  const settingsCustomRoleInput = document.getElementById('settingsCustomRole');
  const settingsSeniorityLevelSelect = document.getElementById('settingsSeniorityLevel');
  const settingsCustomInstructionsTextarea = document.getElementById('settingsCustomInstructions');
  const settingsClearApiKeyBtn = document.getElementById('settingsClearApiKey');
  const settingsResetAllBtn = document.getElementById('settingsResetAll');
  const settingsStatus = document.getElementById('settingsStatus');
  const aiConfigSection = document.getElementById('aiConfigSection');

  // Active main view elements
  const activeProfileName = document.getElementById('activeProfileName');
  const analysisStatus = document.getElementById('analysisStatus');
  const aiAnalysisStatus = document.getElementById('aiAnalysisStatus');
  const openProfileBtn = document.getElementById('openProfileBtn');
  const onProfileText = document.getElementById('onProfileText');

  // Other elements
  const complianceCheck = document.getElementById('complianceCheck');
  const acknowledgeComplianceBtn = document.getElementById('acknowledgeCompliance');
  const setupError = document.getElementById('setupError');
  const confirmDialog = document.getElementById('confirmDialog');
  const confirmTitle = document.getElementById('confirmTitle');
  const confirmMessage = document.getElementById('confirmMessage');
  const confirmYesBtn = confirmDialog.querySelector('.confirm-yes');

  document.querySelector('.version').textContent = 'v' + chrome.runtime.getManifest().version;

  // Handle gear icon click
  settingsGearBtn.addEventListener('click', () => {
    showView('settings');
    backButton.focus();
  });

  // Handle back button click
  backButton.addEventListener('click', () => {
    showView('activeMain');
    settingsGearBtn.focus();
  });

  // Load current settings
  const settings = await chrome.storage.local.get([
    'aiProvider',
    'aiModel',
    'aiBaseUrl',
    'encryptedApiKey',
    'enableAI',
    'showAnalysis',
    'customInstructions',
    'targetRole',
    'customRole',
    'seniorityLevel',
    'compliance',
    'userProfile',
    'settingsDraft'
  ]);
  // activeTab exposes the URL of whatever tab the popup was opened on
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // The profile id when the tab is on a profile itself, not a /details/ or /recent-activity/ subpage
  const tabProfileId = activeTab?.url?.match(/linkedin\.com\/in\/([^\/?#]+)\/?(?:[?#]|$)/)?.[1];

  // View management functions
  function showView(viewName) {
    profileSetupDiv.classList.toggle('hidden', viewName !== 'profileSetup');
    activeMainDiv.classList.toggle('hidden', viewName !== 'activeMain');
    settingsViewDiv.classList.toggle('hidden', viewName !== 'settings');
    settingsGearBtn.classList.toggle('hidden', viewName !== 'activeMain');
    if (viewName === 'activeMain') updateActiveMainView();
    if (viewName === 'settings') {
      settingsStatus.textContent = '';
      updateSettingsView();
      onProviderChange();
    }
  }

  // Resolves true only for the confirm button; Cancel and Esc resolve false
  function showConfirmDialog(title, body, yesLabel = 'Confirm', danger = false) {
    confirmTitle.textContent = title;
    confirmMessage.textContent = body;
    confirmYesBtn.textContent = yesLabel;
    confirmYesBtn.classList.toggle('danger', danger);
    confirmDialog.returnValue = ''; // Esc leaves the previous value in place
    confirmDialog.showModal();
    return new Promise(resolve => {
      confirmDialog.addEventListener('close', () => resolve(confirmDialog.returnValue === 'yes'), { once: true });
    });
  }

  // [CRITICAL_PATH:SETTINGS_MANAGEMENT] - Every settings change saves as it is made.
  // Open LinkedIn tabs pick the changes up from chrome.storage.onChanged.
  function saveSettings(changes) {
    Object.assign(settings, changes);
    return chrome.storage.local.set(changes);
  }

  function updateActiveMainView() {
    analysisStatus.textContent = settings.showAnalysis !== false ? 'On' : 'Off';
    aiAnalysisStatus.textContent = !(settings.encryptedApiKey && settings.aiProvider && settings.aiModel) ? 'Not set up'
      : settings.enableAI ? 'On' : 'Off';
    const profileId = settings.userProfile?.profileId;
    activeProfileName.textContent = settings.userProfile?.profileName || profileId || '';
    // On the profile itself the overlay is right there, unless Show analysis is off
    const onProfile = !!profileId && tabProfileId === profileId;
    openProfileBtn.classList.toggle('hidden', onProfile);
    onProfileText.classList.toggle('hidden', !onProfile);
    onProfileText.textContent = settings.showAnalysis === false
      ? 'Turn on "Show analysis on profile" in Settings to see your results here.'
      : 'Your results are in the ElevateLI bar on this page.';
  }

  // Built from the id, not the saved URL, which can be the subpage setup ran on
  openProfileBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: `https://www.linkedin.com/in/${settings.userProfile?.profileId || 'me'}/` });
  });

  function updateSettingsView() {
    settingsShowAnalysisToggle.checked = settings.showAnalysis !== false;
    settingsEnableAIToggle.checked = settings.enableAI === true;
    aiConfigSection.classList.toggle('hidden', !settingsEnableAIToggle.checked);
    settingsTargetRoleSelect.value = settings.targetRole || '';
    settingsCustomRoleInput.classList.toggle('hidden', settings.targetRole !== 'other');
    settingsCustomRoleInput.value = settings.customRole || '';
    settingsSeniorityLevelSelect.value = settings.seniorityLevel || '';
    settingsCustomInstructionsTextarea.value = settings.customInstructions || '';
  }

  // Setup: on a LinkedIn profile the button saves it; anywhere else (subpages too) it opens the user's profile
  const onProfilePage = !!tabProfileId;
  if (!onProfilePage) {
    document.querySelector('.compliance-notice').classList.add('hidden');
    acknowledgeComplianceBtn.disabled = false;
    acknowledgeComplianceBtn.textContent = 'Open my LinkedIn profile';
  }

  showView(settings.compliance?.hasAcknowledged ? 'activeMain' : 'profileSetup');

  // Handle compliance checkbox (CSS hides the hint once the button is enabled)
  complianceCheck.addEventListener('change', () => {
    acknowledgeComplianceBtn.disabled = !complianceCheck.checked;
  });

  // Handle compliance acknowledgment
  acknowledgeComplianceBtn.addEventListener('click', async () => {
    if (!onProfilePage) {
      // create, not update, so an unrelated tab (Gmail, the install page) is never replaced
      chrome.tabs.create({ url: 'https://www.linkedin.com/in/me/' });
      window.close();
      return;
    }
    clearFieldError(null, setupError);
    try {
      // A tab opened before install/reload has no live content script, so this rejects with
      // 'Could not establish connection' and the catch below offers a refresh (which loads the manifest's content scripts).
      const response = await chrome.tabs.sendMessage(activeTab.id, { action: 'saveProfile' });
      if (!response?.success) {
        showFieldError(null, setupError, 'Open your own LinkedIn profile (not a section page), then try again.');
        return;
      }

      const { userProfile } = response;
      // Ticking the box already confirmed ownership; ask again only when the page doesn't look like the user's
      const confirmed = userProfile.verifiedOwnership || await showConfirmDialog(
        'This doesn\'t look like your own profile',
        `ElevateLI only analyzes yours. Continue only if ${userProfile.profileName || userProfile.profileId} is you.`,
        'Continue anyway'
      );
      if (!confirmed) return;

      await chrome.storage.local.set({ compliance: { hasAcknowledged: true, acknowledgedAt: Date.now() }, userProfile });
      // Open tabs update from storage.onChanged; this builds the overlay if this tab has none yet
      chrome.tabs.sendMessage(activeTab.id, { action: 'showOverlay' }).catch(() => {});

      settings.userProfile = userProfile;
      showView('activeMain');
      settingsGearBtn.focus();
    } catch (error) {
      if (error.message?.includes('Could not establish connection')) {
        profileSetupDiv.replaceChildren(document.getElementById('refreshNeeded').content.cloneNode(true));
        document.getElementById('refreshTab').addEventListener('click', () => {
          chrome.tabs.reload(activeTab.id);
          window.close(); // Close popup after refreshing
        });
      } else {
        showFieldError(null, setupError, 'Could not save your profile. Refresh the page and try again.');
      }
    }
  });


  // Settings view event handlers
  settingsEnableAIToggle.addEventListener('change', (e) => {
    saveSettings({ enableAI: e.target.checked }); // safe without a key: analysis needs enableAI, a key, a provider and a model
    aiConfigSection.classList.toggle('hidden', !e.target.checked);
    if (e.target.checked) onProviderChange(); // models load only once AI is on
  });

  settingsShowAnalysisToggle.addEventListener('change', (e) => saveSettings({ showAnalysis: e.target.checked }));

  settingsTargetRoleSelect.addEventListener('change', (e) => {
    settingsCustomRoleInput.classList.toggle('hidden', e.target.value !== 'other');
    saveSettings({ targetRole: e.target.value });
  });
  settingsSeniorityLevelSelect.addEventListener('change', (e) => saveSettings({ seniorityLevel: e.target.value }));
  // 'input', not 'change': the popup can close before a text field ever fires 'change'
  settingsCustomRoleInput.addEventListener('input', (e) => saveSettings({ customRole: e.target.value.trim() }));
  settingsCustomInstructionsTextarea.addEventListener('input', (e) => saveSettings({ customInstructions: e.target.value.trim() }));

  settingsClearApiKeyBtn.addEventListener('click', async () => {
    if (!await showConfirmDialog('Remove your saved API key?', 'AI analysis will turn off.', 'Remove key', true)) return;
    await chrome.storage.local.remove(['encryptedApiKey', 'installationId']);
    delete settings.encryptedApiKey; // or Settings shows the saved-key placeholder and 'On' again
    await saveSettings({ enableAI: false });
    settingsEnableAIToggle.checked = false;
    aiConfigSection.classList.add('hidden');
    settingsApiKeyInput.value = '';
    settingsStatus.textContent = 'API key removed. AI analysis is off.';
  });

  settingsResetAllBtn.addEventListener('click', async () => {
    if (!await showConfirmDialog('Reset ElevateLI?',
      'This deletes your API key, settings and saved results. You\'ll need to set up again.', 'Delete everything', true)) return;
    await chrome.storage.local.clear(); // open LinkedIn tabs reset themselves from storage.onChanged
    window.location.reload();
  });

  // input is null for the setup error, which belongs to no field
  function showFieldError(input, error, message) {
    input?.classList.add('input-error');
    input?.setAttribute('aria-invalid', 'true');
    error.textContent = message;
    error.classList.add('show');
  }

  function clearFieldError(input, error) {
    input?.classList.remove('input-error');
    input?.removeAttribute('aria-invalid');
    error.classList.remove('show');
  }

  // Clear validation on input
  settingsApiKeyInput.addEventListener('input', () => clearFieldError(settingsApiKeyInput, apiKeyError));

  // Ollama / LM Studio on this machine
  function isLocalBaseUrl() {
    return settingsAiProviderSelect.value === 'openai' &&
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(settingsBaseUrlInput.value.trim());
  }

  // localhost is an optional host permission. Asking needs a user gesture, and Chrome's prompt closes the popup,
  // so ask only when access is missing; the draft and the auto-saved fields survive the close.
  async function requestLocalAccess() {
    if (!isLocalBaseUrl()) return;
    const origins = { origins: ['http://localhost/*', 'http://127.0.0.1/*'] };
    if (!await chrome.permissions.contains(origins)) await chrome.permissions.request(origins).catch(() => false);
  }

  // The saved key only ever goes to the provider and server it was saved with
  function keyIsSaved() {
    return !!settings.encryptedApiKey && settingsAiProviderSelect.value === settings.aiProvider &&
      (settings.aiProvider !== 'openai' || settingsBaseUrlInput.value.trim() === (settings.aiBaseUrl || ''));
  }

  // A provider or server counts only once a key works with it. Until then it waits in a draft, so Back,
  // "Get an API key" and the localhost prompt (which closes the popup) lose nothing, and the stored
  // key, provider and server stay a set that works together.
  function saveDraft() {
    const settingsDraft = { aiProvider: settingsAiProviderSelect.value, aiBaseUrl: settingsBaseUrlInput.value.trim() };
    return keyIsSaved() || !settingsDraft.aiProvider
      ? chrome.storage.local.remove('settingsDraft')
      : chrome.storage.local.set({ settingsDraft });
  }

  // Fill the model list from the provider. The same call validates the key; a typed key that works is stored.
  let loadSeq = 0; // bumped whenever provider, key or server changes; only the latest load may write
  let listedFor = null; // provider|key|baseUrl the model list shows or is loading for
  async function loadModels() {
    const provider = settingsAiProviderSelect.value;
    const baseUrl = settingsBaseUrlInput.value.trim();
    const saved = keyIsSaved();
    // ponytail: local servers need no key; the stand-in 'local' keeps every "has an API key" check unchanged
    const apiKey = settingsApiKeyInput.value.trim() || (!saved && isLocalBaseUrl() ? 'local' : '');
    // Never send a key anywhere while AI is off
    if (!provider || !settingsEnableAIToggle.checked || !(apiKey || saved)) return;
    const id = [provider, apiKey, baseUrl].join('|');
    if (id === listedFor) return; // e.g. the blur that follows a paste
    listedFor = id;
    const seq = ++loadSeq;
    const keep = settingsAiModelSelect.value;
    if (!keep) settingsAiModelSelect.replaceChildren(new Option('Loading models…', ''));
    // No apiKey = the saved key, which the service worker only sends to the saved server
    // A worker that dies mid-call rejects: the failure path below then restores the select and allows a retry
    const response = await chrome.runtime.sendMessage({ action: 'testApiKey', provider, apiKey: apiKey || undefined, baseUrl })
      .catch(() => null);
    if (seq !== loadSeq) return; // provider, key or server changed while loading
    if (!response?.success) {
      listedFor = null; // let the same values be retried
      if (!keep) settingsAiModelSelect.replaceChildren(new Option('Enter your API key to load models', ''));
      showFieldError(settingsApiKeyInput, apiKeyError, response?.error || 'Could not load models');
      return;
    }
    clearFieldError(settingsApiKeyInput, apiKeyError);
    settingsAiModelSelect.replaceChildren(
      new Option('Select AI model...', ''),
      ...response.models.map(id => new Option(id, id, false, id === keep))
    );
    if (apiKey) {
      // The new key works: store it with the provider, server and model it was tested with.
      // The set below overwrites the old key, so it stays usable until the new one is stored.
      const encrypted = await chrome.runtime.sendMessage({ action: 'encryptApiKey', apiKey });
      if (seq !== loadSeq) return;
      if (!encrypted?.success || !encrypted.encryptedApiKey) {
        listedFor = null;
        showFieldError(settingsApiKeyInput, apiKeyError, 'Could not save the API key securely');
        return;
      }
      await saveSettings({
        encryptedApiKey: encrypted.encryptedApiKey,
        aiProvider: provider,
        aiBaseUrl: provider === 'openai' ? baseUrl : '',
        aiModel: settingsAiModelSelect.value
      });
      await chrome.storage.local.remove('settingsDraft');
      settingsApiKeyInput.value = '';
      settingsApiKeyInput.placeholder = isLocalBaseUrl() ? 'Not needed for a local server' : 'Key saved. Paste a new key to replace it.';
    }
    listedFor = [provider, settingsApiKeyInput.value.trim(), baseUrl].join('|');
    if (!settingsAiModelSelect.value) showFieldError(settingsAiModelSelect, modelError, 'Choose a model');
  }

  // Provider or server picked (or settings opened): point the links at it and load its models
  function onProviderChange() {
    const option = settingsAiProviderSelect.selectedOptions[0];
    if (option?.value) {
      document.getElementById('getKeyLink').href = option.dataset.keyUrl;
      document.getElementById('pricingLink').href = option.dataset.pricingUrl;
    }
    baseUrlGroup.classList.toggle('hidden', option?.value !== 'openai');
    clearFieldError(settingsApiKeyInput, apiKeyError);
    clearFieldError(settingsAiModelSelect, modelError);
    const saved = keyIsSaved();
    // A local server's stored key is the stand-in 'local', never one the user entered
    settingsApiKeyInput.placeholder = isLocalBaseUrl() ? 'Not needed for a local server'
      : saved ? 'Key saved. Paste a new key to replace it.' : 'Paste your API key';
    loadSeq++; // a list still loading for the old choice must not land
    listedFor = null;
    settingsAiModelSelect.replaceChildren(saved && settings.aiModel
      ? new Option(settings.aiModel, settings.aiModel, true, true)
      : new Option('Enter your API key to load models', ''));
    loadModels();
  }

  // A provider or server the saved key doesn't belong to comes back from the draft
  settingsAiProviderSelect.value = settings.settingsDraft?.aiProvider ?? settings.aiProvider ?? '';
  settingsBaseUrlInput.value = settings.settingsDraft?.aiBaseUrl ?? settings.aiBaseUrl ?? '';
  baseUrlGroup.open = !!settingsBaseUrlInput.value;

  settingsAiProviderSelect.addEventListener('change', () => {
    saveDraft();
    onProviderChange();
  });
  settingsApiKeyInput.addEventListener('change', loadModels);
  settingsApiKeyInput.addEventListener('paste', () => setTimeout(loadModels)); // after the pasted text lands
  settingsBaseUrlInput.addEventListener('change', async () => {
    await saveDraft(); // first: the permission prompt below can close the popup
    await requestLocalAccess();
    onProviderChange();
  });
  settingsAiModelSelect.addEventListener('change', () => {
    clearFieldError(settingsAiModelSelect, modelError);
    // The placeholder is no model: keep the last one picked
    if (keyIsSaved() && settingsAiModelSelect.value) saveSettings({ aiModel: settingsAiModelSelect.value });
  });
});
