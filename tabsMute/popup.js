// Popup controller for TabsMute Chrome Extension

document.addEventListener('DOMContentLoaded', () => {
  const settingsBtn = document.getElementById('settings-btn');
  const settingsPanel = document.getElementById('settings-panel');
  const tabFavicon = document.getElementById('tab-favicon');
  const tabTitle = document.getElementById('tab-title');
  const soundwave = document.getElementById('soundwave');
  
  const muteBtn = document.getElementById('mute-toggle-btn');
  const toggleIcon = document.getElementById('toggle-icon');
  const toggleStatusText = document.getElementById('toggle-status');
  
  const statusDot = document.getElementById('status-dot');
  const statusDesc = document.getElementById('status-desc');
  
  const shortcutSelect = document.getElementById('shortcut-select');
  const hudCheckbox = document.getElementById('hud-checkbox');
  const focusCheckbox = document.getElementById('focus-checkbox');
  const chromeShortcutLink = document.getElementById('chrome-shortcut-link');

  let currentTabId = null;
  let isTabAudible = false;

  // SVG Paths for Mute and Unmute states
  const speakerUnmutedSVG = `
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.03zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
  `;
  
  const speakerMutedSVG = `
    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.21.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
  `;

  // 1. Initial State Loading & Rendering
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError || !tabs || tabs.length === 0) {
      renderErrorState('No active tab');
      return;
    }

    const activeTab = tabs[0];
    currentTabId = activeTab.id;
    isTabAudible = activeTab.audible;

    // Render tab information
    tabTitle.textContent = activeTab.title || 'Untitled Tab';
    if (activeTab.favIconUrl) {
      tabFavicon.src = activeTab.favIconUrl;
      tabFavicon.style.display = 'block';
    }

    // Determine current mute state
    const isMuted = activeTab.mutedInfo ? activeTab.mutedInfo.muted : false;
    updateMuteUI(isMuted, isTabAudible);
  });

  // 2. Load Configuration Settings
  chrome.storage.local.get(['shortcutKey', 'enableHUD', 'focusMode'], (settings) => {
    if (settings.shortcutKey) shortcutSelect.value = settings.shortcutKey;
    if (settings.enableHUD !== undefined) hudCheckbox.checked = settings.enableHUD;
    if (settings.focusMode !== undefined) focusCheckbox.checked = settings.focusMode;
  });

  // 3. UI Update Helpers
  function updateMuteUI(isMuted, isAudible) {
    if (isMuted) {
      // Muted State CSS
      muteBtn.classList.add('muted');
      toggleIcon.innerHTML = speakerMutedSVG;
      toggleStatusText.textContent = 'UNMUTE';
      
      statusDot.classList.add('muted');
      statusDesc.textContent = 'Muted Tab';
      
      soundwave.classList.remove('playing');
    } else {
      // Unmuted State CSS
      muteBtn.classList.remove('muted');
      toggleIcon.innerHTML = speakerUnmutedSVG;
      toggleStatusText.textContent = 'MUTE';
      
      statusDot.classList.remove('muted');
      
      if (isAudible) {
        statusDesc.textContent = 'Playing Audio';
        soundwave.classList.add('playing');
      } else {
        statusDesc.textContent = 'Silent Tab';
        soundwave.classList.remove('playing');
      }
    }
  }

  function renderErrorState(message) {
    tabTitle.textContent = message;
    statusDesc.textContent = 'Unavailable';
    muteBtn.disabled = true;
    muteBtn.style.opacity = '0.5';
    soundwave.classList.remove('playing');
  }

  // 4. Click Event Mute Toggle Trigger
  muteBtn.addEventListener('click', () => {
    if (!currentTabId) return;

    // Play a subtle ripple/click expansion animation
    const ripple = muteBtn.querySelector('.btn-ripple');
    ripple.style.animation = 'none';
    void ripple.offsetWidth; // Force layout flow reset
    ripple.style.animation = 'pulse-ring 1s cubic-bezier(0.215, 0.61, 0.355, 1) 1';

    // Request toggle from background worker
    chrome.runtime.sendMessage({ 
      action: 'toggleMute', 
      tabId: currentTabId 
    }, (response) => {
      if (chrome.runtime.lastError || !response || !response.success) {
        console.error('Failed to toggle mute state:', chrome.runtime.lastError);
        return;
      }

      // Recheck the active tab audible state
      chrome.runtime.sendMessage({ 
        action: 'getTabState', 
        tabId: currentTabId 
      }, (stateResponse) => {
        const audible = (stateResponse && stateResponse.success) ? stateResponse.audible : isTabAudible;
        updateMuteUI(response.muted, audible);
      });
    });
  });

  // 5. Settings Expand Toggle
  settingsBtn.addEventListener('click', () => {
    const isOpen = settingsPanel.classList.contains('open');
    if (isOpen) {
      settingsPanel.classList.remove('open');
      settingsBtn.classList.remove('active');
    } else {
      settingsPanel.classList.add('open');
      settingsBtn.classList.add('active');
    }
  });

  // 6. Settings Inputs Handling
  shortcutSelect.addEventListener('change', () => {
    chrome.storage.local.set({ shortcutKey: shortcutSelect.value }, () => {
      console.log('Shortcut key updated to:', shortcutSelect.value);
    });
  });

  hudCheckbox.addEventListener('change', () => {
    chrome.storage.local.set({ enableHUD: hudCheckbox.checked }, () => {
      console.log('HUD feedback toggle set to:', hudCheckbox.checked);
    });
  });

  focusCheckbox.addEventListener('change', () => {
    chrome.storage.local.set({ focusMode: focusCheckbox.checked }, () => {
      console.log('Focus Mode toggle set to:', focusCheckbox.checked);
    });
  });

  // 7. Navigation redirection helper to open native chrome settings panels
  chromeShortcutLink.addEventListener('click', (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
});
