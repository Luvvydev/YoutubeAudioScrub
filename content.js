(() => {
  "use strict";

  const EXT_ID = "yt-audio-scrubber-medium";
  const MESSAGE_GET_STATUS = "YT_AUDIO_SCRUBBER_GET_STATUS";
  const MESSAGE_SET_ENABLED = "YT_AUDIO_SCRUBBER_SET_ENABLED";
  const STORAGE_KEY = "ytAudioScrubberEnabled";
  const UI_SOURCE = "YT_AUDIO_SCRUBBER_UI";
  const PAGE_SOURCE = "YT_AUDIO_SCRUBBER_PAGE";
  const VIDEO_RETRY_MS = 250;

  const state = {
    enabled: false,
    dragging: false,
    video: null,
    host: null,
    root: null,
    panel: null,
    railHit: null,
    rail: null,
    fill: null,
    knob: null,
    timeLabel: null,
    status: null,
    toggle: null,
    help: null,
    latestDragTime: null,
    queuedMoveTime: null,
    moveRaf: 0,
    raf: 0,
    hideHelpTimer: 0,
    videoRetryTimer: 0,
    mountedForUrl: location.href,
    savedStateLoaded: false
  };

  function extensionApi() {
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.id) return null;
    return chrome;
  }

  function findVideo() {
    const videos = [...document.querySelectorAll("video")];
    if (!videos.length) return null;
    return videos.find((video) => video.classList.contains("html5-main-video")) ||
      videos.find((video) => video.duration && video.readyState >= 1) ||
      videos[0];
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function videoRect() {
    const video = state.video || findVideo();
    if (!video) return null;
    const rect = video.getBoundingClientRect();
    if (rect.width < 100 || rect.height < 60) return null;
    return rect;
  }

  function isTextInput(target) {
    if (!target) return false;
    const tag = target.tagName;
    return target.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }

  function initWhenReady() {
    if (!document.documentElement) {
      requestAnimationFrame(initWhenReady);
      return;
    }
    init();
  }

  function mount() {
    if (document.getElementById(EXT_ID)) return;

    const host = document.createElement("div");
    host.id = EXT_ID;
    host.setAttribute("aria-hidden", "false");
    document.documentElement.appendChild(host);

    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host {
          all: initial;
          --bg: rgba(8, 14, 20, 0.92);
          --panel: rgba(15, 20, 33, 0.94);
          --panel-2: rgba(18, 24, 40, 0.98);
          --line: rgba(86, 103, 136, 0.32);
          --text: rgba(245, 249, 255, 0.96);
          --muted: rgba(176, 193, 211, 0.78);
          --accent: #ff3047;
          --accent-2: #ff5f6d;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .scrub-ui {
          position: fixed;
          inset: 0;
          z-index: 2147483647;
          pointer-events: none;
        }
        .toggle {
          position: fixed;
          right: 18px;
          bottom: 82px;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          border: 1px solid var(--line);
          border-radius: 18px;
          padding: 10px 12px;
          background: linear-gradient(180deg, var(--panel-2), var(--panel));
          color: var(--text);
          font: 800 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          letter-spacing: 0.01em;
          box-shadow: 0 12px 34px rgba(0, 0, 0, 0.36), inset 0 1px 0 rgba(255,255,255,0.04);
          cursor: pointer;
          pointer-events: auto;
          user-select: none;
          backdrop-filter: blur(14px);
        }
        .toggle::before {
          content: "";
          width: 11px;
          height: 11px;
          border-radius: 50%;
          background: rgba(115, 133, 155, 0.9);
          box-shadow: 0 0 0 5px rgba(115, 133, 155, 0.16);
        }
        .toggle:hover {
          border-color: rgba(255, 48, 71, 0.44);
        }
        .toggle[data-on="true"]::before {
          background: var(--accent);
          box-shadow: 0 0 0 5px rgba(255, 48, 71, 0.18), 0 0 20px rgba(255, 48, 71, 0.34);
        }
        .panel {
          position: fixed;
          left: 0;
          top: 0;
          width: 0;
          height: 0;
          pointer-events: none;
          opacity: 0;
          transition: opacity 90ms ease;
        }
        .panel[data-visible="true"] {
          opacity: 1;
        }
        .rail-hit {
          position: absolute;
          left: 0;
          bottom: 4px;
          width: 100%;
          height: 66px;
          pointer-events: auto;
          cursor: ew-resize;
          touch-action: none;
        }
        .rail {
          position: absolute;
          left: 20px;
          right: 20px;
          bottom: 27px;
          height: 12px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.14);
          box-shadow: 0 0 0 1px rgba(255,255,255,0.08), 0 12px 30px rgba(0,0,0,0.38);
          overflow: hidden;
        }
        .fill {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 0%;
          background: linear-gradient(90deg, var(--accent), var(--accent-2));
        }
        .knob {
          position: absolute;
          left: 20px;
          bottom: 20px;
          width: 25px;
          height: 25px;
          margin-left: -12.5px;
          border-radius: 50%;
          background: #f7fbff;
          box-shadow: 0 8px 26px rgba(0,0,0,0.48), 0 0 0 5px rgba(255,48,71,0.16);
        }
        .time {
          position: absolute;
          right: 20px;
          bottom: 45px;
          padding: 6px 8px;
          border: 1px solid rgba(86, 103, 136, 0.32);
          border-radius: 8px;
          color: var(--text);
          background: rgba(6, 14, 22, 0.84);
          font: 800 12px/1.1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          text-shadow: 0 1px 0 rgba(0,0,0,0.45);
          user-select: none;
        }
        .status {
          position: absolute;
          left: 20px;
          bottom: 45px;
          max-width: calc(100% - 150px);
          padding: 6px 8px;
          border: 1px solid rgba(86, 103, 136, 0.32);
          border-radius: 8px;
          color: var(--text);
          background: rgba(6, 14, 22, 0.84);
          font: 750 12px/1.1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          user-select: none;
        }
        .help {
          position: fixed;
          right: 18px;
          bottom: 126px;
          max-width: 330px;
          padding: 11px 12px;
          border: 1px solid var(--line);
          border-radius: 16px;
          color: var(--muted);
          background: linear-gradient(180deg, var(--panel-2), var(--panel));
          font: 650 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          box-shadow: 0 14px 34px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.04);
          pointer-events: none;
          opacity: 0;
          transform: translateY(4px);
          transition: opacity 110ms ease, transform 110ms ease;
          backdrop-filter: blur(14px);
        }
        .help strong {
          color: var(--text);
        }
        .help[data-visible="true"] {
          opacity: 1;
          transform: translateY(0);
        }
        @media (max-width: 700px) {
          .toggle {
            right: 10px;
            bottom: 72px;
          }
          .help {
            right: 10px;
            bottom: 112px;
          }
        }
      </style>
      <div class="scrub-ui">
        <button class="toggle" type="button" data-on="false" title="Toggle YouTube Audio Scrub">Audio Scrub: Off</button>
        <div class="help"><strong>Audio Scrub</strong><br>Drag the red rail while it is on. Moving uses YouTube's no-buffer seek path first, then exact seek when you stop or release.</div>
        <div class="panel" data-visible="false">
          <div class="rail-hit" part="rail-hit">
            <div class="rail"><div class="fill"></div></div>
            <div class="knob"></div>
            <div class="status">Drag to audio scrub</div>
            <div class="time">0:00 / 0:00</div>
          </div>
        </div>
      </div>
    `;

    state.host = host;
    state.root = root;
    state.toggle = root.querySelector(".toggle");
    state.panel = root.querySelector(".panel");
    state.railHit = root.querySelector(".rail-hit");
    state.rail = root.querySelector(".rail");
    state.fill = root.querySelector(".fill");
    state.knob = root.querySelector(".knob");
    state.timeLabel = root.querySelector(".time");
    state.status = root.querySelector(".status");
    state.help = root.querySelector(".help");

    state.toggle.addEventListener("click", () => {
      setEnabled(!state.enabled, true, true);
    });
    state.railHit.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerUp, { passive: true });
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("message", onPageMessage);

    updateEnabledUi();
    startLoop();
  }

  function loadSavedState() {
    const api = extensionApi();
    if (!api?.storage?.local) {
      state.savedStateLoaded = true;
      return;
    }

    api.storage.local.get({ [STORAGE_KEY]: false }, (result) => {
      state.savedStateLoaded = true;
      if (api.runtime.lastError) return;
      setEnabled(Boolean(result[STORAGE_KEY]), false, false);
    });
  }

  function saveEnabledState(enabled) {
    const api = extensionApi();
    if (!api?.storage?.local || !state.savedStateLoaded) return;
    api.storage.local.set({ [STORAGE_KEY]: enabled });
  }

  function installMessageBridge() {
    const api = extensionApi();
    if (!api?.runtime?.onMessage) return;

    api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || typeof message.type !== "string") return false;

      if (message.type === MESSAGE_GET_STATUS) {
        state.video = findVideo() || state.video;
        sendResponse(getStatus());
        return true;
      }

      if (message.type === MESSAGE_SET_ENABLED) {
        setEnabled(Boolean(message.enabled), true, true);
        sendResponse(getStatus());
        return true;
      }

      return false;
    });
  }

  function getStatus() {
    const video = state.video || findVideo();
    return {
      enabled: state.enabled,
      dragging: state.dragging,
      hasVideo: Boolean(video),
      duration: video?.duration || 0,
      currentTime: video?.currentTime || 0,
      url: location.href
    };
  }

  function onPageMessage(event) {
    if (event.source !== window || !event.data || event.data.source !== PAGE_SOURCE) return;
    if (event.data.type === "status" && typeof event.data.text === "string") {
      setStatus(event.data.text);
    }
  }

  function sendPage(type, data = {}) {
    window.postMessage({ source: UI_SOURCE, type, ...data }, "*");
  }

  function showHelp() {
    if (!state.help) return;
    state.help.dataset.visible = "true";
    clearTimeout(state.hideHelpTimer);
    state.hideHelpTimer = setTimeout(() => {
      if (state.help) state.help.dataset.visible = "false";
    }, 2600);
  }

  function updateEnabledUi() {
    if (state.toggle) {
      state.toggle.dataset.on = state.enabled ? "true" : "false";
      state.toggle.textContent = state.enabled ? "Audio Scrub: On" : "Audio Scrub: Off";
    }
    if (state.panel) state.panel.dataset.visible = state.enabled && videoRect() ? "true" : "false";
  }

  function setEnabled(enabled, userAction = false, persist = false) {
    state.enabled = enabled;
    updateEnabledUi();

    if (enabled) {
      state.video = findVideo() || state.video;
      scheduleVideoRetry();
      if (userAction) showHelp();
    } else {
      if (state.dragging) finishDrag();
      setStatus("Drag to audio scrub");
    }

    sendPage("enabled", { enabled });

    if (persist) saveEnabledState(enabled);
  }

  function scheduleVideoRetry() {
    if (!state.enabled || state.videoRetryTimer) return;

    const retry = () => {
      state.videoRetryTimer = 0;
      state.video = findVideo() || state.video;
      if (!state.video && state.enabled) {
        state.videoRetryTimer = setTimeout(retry, VIDEO_RETRY_MS);
      }
    };

    state.videoRetryTimer = setTimeout(retry, 0);
  }

  function updatePanelPosition() {
    if (!state.enabled || !state.panel) return;
    const rect = videoRect();
    if (!rect) {
      state.panel.dataset.visible = "false";
      return;
    }
    state.panel.dataset.visible = "true";
    state.panel.style.left = `${Math.round(rect.left)}px`;
    state.panel.style.top = `${Math.round(rect.top)}px`;
    state.panel.style.width = `${Math.round(rect.width)}px`;
    state.panel.style.height = `${Math.round(rect.height)}px`;
  }

  function updateProgressUI(targetTime = null) {
    const video = state.video || findVideo();
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const current = targetTime == null ? video.currentTime : targetTime;
    const pct = clamp(current / video.duration, 0, 1);
    const railRect = state.rail ? state.rail.getBoundingClientRect() : null;
    if (state.fill) state.fill.style.width = `${pct * 100}%`;
    if (state.knob && railRect) {
      const knobX = 20 + pct * Math.max(0, railRect.width);
      state.knob.style.left = `${knobX}px`;
    }
    if (state.timeLabel) state.timeLabel.textContent = `${formatTime(current)} / ${formatTime(video.duration)}`;
  }

  function pointerTime(event) {
    const video = state.video || findVideo();
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0 || !state.rail) return null;
    const rect = state.rail.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const pct = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    return pct * video.duration;
  }

  function onPointerDown(event) {
    if (!state.enabled) return;
    const video = findVideo();
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) {
      setStatus("No playable YouTube video found");
      return;
    }

    state.video = video;
    state.dragging = true;
    state.latestDragTime = pointerTime(event);
    state.queuedMoveTime = null;
    event.preventDefault();

    state.railHit.setPointerCapture?.(event.pointerId);

    if (video.muted) video.muted = false;
    video.playbackRate = 1;
    video.play().catch(() => {
      setStatus("Click the video once, then drag again");
    });

    if (state.latestDragTime != null) {
      updateProgressUI(state.latestDragTime);
      sendPage("scrub-start", { time: state.latestDragTime });
    }
  }

  function onPointerMove(event) {
    if (!state.dragging) return;
    event.preventDefault();

    const nextTime = pointerTime(event);
    if (nextTime == null) return;

    state.latestDragTime = nextTime;
    updateProgressUI(nextTime);
    queueMove(nextTime);
  }

  function queueMove(time) {
    state.queuedMoveTime = time;
    if (state.moveRaf) return;

    state.moveRaf = requestAnimationFrame(() => {
      state.moveRaf = 0;
      if (!state.dragging || state.queuedMoveTime == null) return;
      sendPage("scrub-move", { time: state.queuedMoveTime });
    });
  }

  function onPointerUp() {
    if (!state.dragging) return;
    finishDrag();
  }

  function onKeyDown(event) {
    if (isTextInput(event.target)) return;
    if (event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey && event.code === "KeyS") {
      event.preventDefault();
      setEnabled(!state.enabled, true, true);
    }
  }

  function finishDrag() {
    state.dragging = false;
    cancelAnimationFrame(state.moveRaf);
    state.moveRaf = 0;

    if (state.latestDragTime != null) {
      sendPage("scrub-end", { time: state.latestDragTime });
    } else {
      sendPage("scrub-cancel");
    }

    state.queuedMoveTime = null;
    state.latestDragTime = null;
    setStatus("Drag to audio scrub");
  }

  function setStatus(text) {
    if (state.status) state.status.textContent = text;
  }

  function startLoop() {
    if (state.raf) return;

    const loop = () => {
      if (state.mountedForUrl !== location.href) {
        state.mountedForUrl = location.href;
        state.video = findVideo();
        if (state.enabled) scheduleVideoRetry();
      }

      if (state.enabled) {
        state.video = findVideo() || state.video;
        updatePanelPosition();
        if (!state.dragging) updateProgressUI();
      }

      state.raf = requestAnimationFrame(loop);
    };

    state.raf = requestAnimationFrame(loop);
  }

  function init() {
    mount();
    installMessageBridge();
    loadSavedState();
    scheduleVideoRetry();

    const observer = new MutationObserver(() => {
      if (!state.host || !document.documentElement.contains(state.host)) mount();
      if (!state.video) state.video = findVideo();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  initWhenReady();
})();
