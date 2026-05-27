// Content script for TabsMute Chrome Extension

let isFullscreen = false;
let hudTimeout = null;
let hudHost = null;
let shadowRoot = null;

// Keep track of fullscreen state
document.addEventListener('fullscreenchange', () => {
  isFullscreen = !!document.fullscreenElement;
});

// Watch for direct fullscreen changes in video elements or frames
document.addEventListener('webkitfullscreenchange', () => {
  isFullscreen = !!document.webkitFullscreenElement;
});

// Create and style the HUD element in a closed Shadow DOM (prevents page styling leaks)
function createHUD() {
  if (hudHost) return;

  hudHost = document.createElement('div');
  hudHost.id = 'tabs-mute-hud-host';
  hudHost.style.cssText = 'position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647; pointer-events: none;';
  
  document.body.appendChild(hudHost);
  shadowRoot = hudHost.attachShadow({ mode: 'closed' });

  // Add gorgeous styling
  const style = document.createElement('style');
  style.textContent = `
    .hud-wrapper {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) scale(0.85);
      pointer-events: none;
      opacity: 0;
      transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease;
      z-index: 2147483647;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    
    .hud-wrapper.active {
      transform: translate(-50%, -50%) scale(1);
      opacity: 1;
    }
    
    .hud-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(16px) saturate(180%);
      -webkit-backdrop-filter: blur(16px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 28px;
      padding: 24px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5), 0 0 40px rgba(99, 102, 241, 0.15);
      width: 140px;
      height: 140px;
      box-sizing: border-box;
    }
    
    .hud-icon {
      width: 52px;
      height: 52px;
      margin-bottom: 12px;
      color: #ffffff;
      fill: currentColor;
      filter: drop-shadow(0 2px 8px rgba(99, 102, 241, 0.4));
    }
    
    .hud-text {
      font-size: 13px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
      margin: 0;
      padding: 0;
      text-align: center;
    }
  `;
  shadowRoot.appendChild(style);

  const wrapper = document.createElement('div');
  wrapper.className = 'hud-wrapper';
  wrapper.innerHTML = `
    <div class="hud-container">
      <div class="hud-icon-container"></div>
      <p class="hud-text"></p>
    </div>
  `;
  shadowRoot.appendChild(wrapper);
}

// Display the premium glassmorphic HUD
function showHUD(isMuted) {
  createHUD();

  const wrapper = shadowRoot.querySelector('.hud-wrapper');
  const iconContainer = shadowRoot.querySelector('.hud-icon-container');
  const textElement = shadowRoot.querySelector('.hud-text');

  // Cancel any active timeouts to allow seamless consecutive keypresses
  if (hudTimeout) {
    clearTimeout(hudTimeout);
    wrapper.classList.remove('active');
  }

  // Set the correct SVG and text
  if (isMuted) {
    textElement.textContent = 'Muted';
    iconContainer.innerHTML = `
      <svg class="hud-icon" viewBox="0 0 24 24">
        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.21.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
      </svg>
    `;
  } else {
    textElement.textContent = 'Sound On';
    iconContainer.innerHTML = `
      <svg class="hud-icon" viewBox="0 0 24 24">
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.03zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
      </svg>
    `;
  }

  // Force layout reflow before starting animation
  wrapper.offsetHeight;

  // Fade in and scale up
  wrapper.classList.add('active');

  // Smoothly fade out and shrink after 1.5 seconds
  hudTimeout = setTimeout(() => {
    wrapper.classList.remove('active');
  }, 1500);
}

// Helper to check if the user is currently typing in an input, textarea, or editable element
function isInputElementActive() {
  const active = document.activeElement;
  if (!active) return false;

  const tagName = active.tagName.toLowerCase();
  const isInput = tagName === 'input' || tagName === 'textarea' || tagName === 'select';
  const isEditable = active.hasAttribute('contenteditable') || active.contentEditable === 'true' || active.getAttribute('role') === 'textbox';
  
  return isInput || isEditable;
}

// Detect keyboard shortcut keydown events
document.addEventListener('keydown', (event) => {
  // Query configurations from extension storage
  chrome.storage.local.get(['shortcutKey', 'enableHUD'], (settings) => {
    if (chrome.runtime.lastError) return; // Guard against context invalidation

    const configuredKey = (settings.shortcutKey || 'm').toLowerCase();
    const eventKey = event.key.toLowerCase();

    const isHardwareMute = (event.key === 'AudioVolumeMute' || event.code === 'VolumeMute');
    const isConfiguredShortcut = (eventKey === configuredKey);

    // Intercept if:
    // 1. It is a hardware volume mute keypress OR
    // 2. It is the configured shortcut (default: 'm') and the user is NOT focused on an input or text field
    const shouldIntercept = isHardwareMute || (isConfiguredShortcut && !isInputElementActive());

    if (shouldIntercept) {
      // Prevent default site interactions (e.g. standard player play/pause, default browser controls)
      event.preventDefault();
      event.stopPropagation();

      // Trigger the mute toggle via background service worker
      chrome.runtime.sendMessage({ action: 'toggleMute' }, (response) => {
        if (chrome.runtime.lastError) return; // Extension Context Invalidated check
        
        if (response && response.success && settings.enableHUD) {
          showHUD(response.muted);
        }
      });
    }
  });
}, true); // Use capturing phase to intercept before native video players intercept the keypress

// Listen for HUD invocation messages from background worker (e.g. global shortcuts)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'showHUD') {
    chrome.storage.local.get(['enableHUD'], (settings) => {
      if (chrome.runtime.lastError) return;
      if (settings.enableHUD) {
        showHUD(request.muted);
      }
    });
    sendResponse({ success: true });
  }
});
