(() => {
  "use strict";

  const MESSAGE_GET_STATUS = "YT_AUDIO_SCRUBBER_GET_STATUS";
  const MESSAGE_SET_ENABLED = "YT_AUDIO_SCRUBBER_SET_ENABLED";

  const els = {
    toggleButton: document.getElementById("toggleButton"),
    statusText: document.getElementById("statusText"),
    stateDot: document.getElementById("stateDot"),
    stateLabel: document.getElementById("stateLabel"),
    stateMeta: document.getElementById("stateMeta"),
    audioState: document.getElementById("audioState"),
    videoState: document.getElementById("videoState")
  };

  let activeTabId = null;
  let currentEnabled = false;

  function isYouTubeUrl(url) {
    try {
      const host = new URL(url).hostname;
      return host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com";
    } catch {
      return false;
    }
  }

  function setUi(status, errorText = "") {
    currentEnabled = Boolean(status?.enabled);
    const hasVideo = Boolean(status?.hasVideo);

    els.toggleButton.dataset.on = currentEnabled ? "true" : "false";
    els.toggleButton.setAttribute("aria-pressed", currentEnabled ? "true" : "false");
    els.stateDot.dataset.on = currentEnabled ? "true" : "false";
    els.audioState.textContent = currentEnabled ? "On" : "Off";
    els.videoState.textContent = hasVideo ? "Yes" : "No";

    if (errorText) {
      els.statusText.textContent = errorText;
      els.stateLabel.textContent = "Unavailable";
      els.stateMeta.textContent = "Open a YouTube video tab";
      els.toggleButton.disabled = true;
      return;
    }

    els.toggleButton.disabled = false;
    els.statusText.textContent = hasVideo ? "YouTube video ready" : "Waiting for video";
    els.stateLabel.textContent = currentEnabled ? "On" : "Off";
    els.stateMeta.textContent = currentEnabled ? "Drag the rail on the video" : "Shift+S toggles on the page";
  }

  async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  }

  function sendToTab(message) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(activeTabId, message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(error);
          return;
        }
        resolve(response);
      });
    });
  }

  async function refresh() {
    const tab = await getActiveTab();
    activeTabId = tab?.id || null;

    if (!activeTabId || !isYouTubeUrl(tab.url || "")) {
      setUi(null, "Not a YouTube tab");
      return;
    }

    try {
      const status = await sendToTab({ type: MESSAGE_GET_STATUS });
      setUi(status);
    } catch {
      setUi(null, "Reload the YouTube tab");
    }
  }

  async function toggle() {
    if (!activeTabId || els.toggleButton.disabled) return;
    els.toggleButton.disabled = true;

    try {
      const status = await sendToTab({ type: MESSAGE_SET_ENABLED, enabled: !currentEnabled });
      setUi(status);
    } catch {
      setUi(null, "Reload the YouTube tab");
    }
  }

  els.toggleButton.addEventListener("click", toggle);
  refresh();
})();
