// Service worker for TabsMute Chrome Extension

// Set default settings on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['shortcutKey', 'enableHUD', 'focusMode'], (result) => {
    const defaults = {};
    if (result.shortcutKey === undefined) defaults.shortcutKey = 'm';
    if (result.enableHUD === undefined) defaults.enableHUD = true;
    if (result.focusMode === undefined) defaults.focusMode = false;

    if (Object.keys(defaults).length > 0) {
      chrome.storage.local.set(defaults, () => {
        console.log('TabsMute extension initialized with default settings:', defaults);
      });
    }
  });
});

// Helper to handle the Focus Mode logic
// If Focus Mode is enabled and a tab is being UNMUTED, mute all other tabs.
function applyFocusModeIfNeeded(activeTabId) {
  chrome.storage.local.get(['focusMode'], (settings) => {
    if (settings.focusMode) {
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) => {
          if (tab.id !== activeTabId && !tab.mutedInfo.muted) {
            chrome.tabs.update(tab.id, { muted: true });
          }
        });
      });
    }
  });
}

// Handle message commands from Content Scripts and Popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggleMute') {
    // If sent from a tab content script, toggle that specific tab
    const tabId = sender.tab ? sender.tab.id : request.tabId;
    
    if (tabId !== undefined) {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError || !tab) {
          sendResponse({ success: false, error: 'Tab not found' });
          return;
        }

        const newMutedState = !tab.mutedInfo.muted;
        chrome.tabs.update(tabId, { muted: newMutedState }, (updatedTab) => {
          if (!newMutedState) {
            applyFocusModeIfNeeded(tabId);
          }
          sendResponse({ success: true, muted: newMutedState });
        });
      });
      return true; // Keep message channel open for async response
    } else {
      sendResponse({ success: false, error: 'No active tab identified' });
    }
  }

  if (request.action === 'getTabState') {
    const tabId = request.tabId;
    if (tabId) {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError || !tab) {
          sendResponse({ success: false });
        } else {
          sendResponse({
            success: true,
            muted: tab.mutedInfo.muted,
            audible: tab.audible
          });
        }
      });
      return true;
    }
  }
});

// Handle extension commands (Global Keyboard Shortcuts)
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-mute-active') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab && activeTab.id !== undefined) {
        const newMutedState = !activeTab.mutedInfo.muted;
        chrome.tabs.update(activeTab.id, { muted: newMutedState }, (updatedTab) => {
          if (!newMutedState) {
            applyFocusModeIfNeeded(activeTab.id);
          }
          
          // Send message to content script in the active tab to show the gorgeous HUD
          chrome.tabs.sendMessage(activeTab.id, { 
            action: 'showHUD', 
            muted: newMutedState 
          }).catch((err) => {
            // Ignore error if content script isn't loaded on this page (e.g. chrome:// pages)
            console.log('HUD message could not be sent (expected on system pages):', err.message);
          });
        });
      }
    });
  }
});
