(() => {
  "use strict";

  const UI_SOURCE = "YT_AUDIO_SCRUBBER_UI";
  const PAGE_SOURCE = "YT_AUDIO_SCRUBBER_PAGE";
  const SCRUB_INTERVAL_MS = 120;
  const MOVING_WINDOW_MS = 190;
  const IDLE_EXACT_SEEK_MS = 260;
  const MIN_SEEK_DELTA_SECONDS = 0.16;

  const state = {
    enabled: false,
    dragging: false,
    targetTime: null,
    lastMoveAt: 0,
    lastSeekAt: 0,
    lastSeekTarget: -1,
    lastExactSeekAt: 0,
    loopTimer: 0,
    restore: null
  };

  function postStatus(text) {
    window.postMessage({ source: PAGE_SOURCE, type: "status", text }, "*");
  }

  function getVideo() {
    const videos = [...document.querySelectorAll("video")];
    if (!videos.length) return null;
    return videos.find((video) => video.classList.contains("html5-main-video")) ||
      videos.find((video) => video.duration && video.readyState >= 1) ||
      videos[0];
  }

  function getPlayer() {
    return document.getElementById("movie_player") ||
      document.querySelector(".html5-video-player") ||
      null;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function isBuffered(video, time, margin = 0.25) {
    if (!video || !video.buffered) return false;
    for (let i = 0; i < video.buffered.length; i += 1) {
      const start = video.buffered.start(i) - margin;
      const end = video.buffered.end(i) + margin;
      if (time >= start && time <= end) return true;
    }
    return false;
  }

  function nearestBufferedTime(video, time, maxDistance = 1.25) {
    if (!video || !video.buffered) return null;

    let bestTime = null;
    let bestDistance = Infinity;

    for (let i = 0; i < video.buffered.length; i += 1) {
      const start = video.buffered.start(i);
      const end = video.buffered.end(i);
      const candidate = clamp(time, start, Math.max(start, end - 0.15));
      const distance = Math.abs(candidate - time);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestTime = candidate;
      }
    }

    return bestDistance <= maxDistance ? bestTime : null;
  }

  function playPreview(video, player) {
    try {
      if (player && typeof player.playVideo === "function") {
        player.playVideo();
        return;
      }
    } catch {}

    try {
      const result = video?.play?.();
      if (result?.catch) {
        result.catch(() => {
          postStatus("Click the video once, then drag again");
        });
      }
    } catch {
      postStatus("Click the video once, then drag again");
    }
  }

  function pausePreview(video, player) {
    try {
      if (player && typeof player.pauseVideo === "function") {
        player.pauseVideo();
        return;
      }
    } catch {}

    try {
      video?.pause?.();
    } catch {}
  }

  function seekViaPlayer(player, time, allowSeekAhead) {
    if (!player || typeof player.seekTo !== "function") return false;

    try {
      player.seekTo(time, allowSeekAhead);
      return true;
    } catch {
      return false;
    }
  }

  function seekViaVideo(video, time, allowSeekAhead) {
    if (!video) return false;

    if (!allowSeekAhead && !isBuffered(video, time)) {
      const bufferedTime = nearestBufferedTime(video, time);
      if (bufferedTime == null) return false;
      time = bufferedTime;
    }

    try {
      if (allowSeekAhead && typeof video.fastSeek === "function") {
        video.fastSeek(time);
      } else {
        video.currentTime = time;
      }
      return true;
    } catch {
      try {
        video.currentTime = time;
        return true;
      } catch {
        return false;
      }
    }
  }

  function seekPreview(time, allowSeekAhead) {
    const video = getVideo();
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) {
      postStatus("No playable YouTube video found");
      return false;
    }

    const player = getPlayer();
    const safeTime = clamp(time, 0, Math.max(0, video.duration - 0.05));

    let didSeek = false;
    if (player) {
      didSeek = seekViaPlayer(player, safeTime, allowSeekAhead);
    }

    if (!didSeek) {
      didSeek = seekViaVideo(video, safeTime, allowSeekAhead);
    }

    if (!didSeek) {
      postStatus("Target is not buffered. Move slower or hold briefly.");
      return false;
    }

    if (video.muted) video.muted = false;
    video.playbackRate = 1;
    playPreview(video, player);
    postStatus(allowSeekAhead ? "Buffering exact audio preview..." : "Previewing buffered audio while dragging");
    return true;
  }

  function startLoop() {
    if (state.loopTimer) return;
    state.loopTimer = window.setInterval(tick, SCRUB_INTERVAL_MS);
  }

  function stopLoop() {
    clearInterval(state.loopTimer);
    state.loopTimer = 0;
  }

  function tick() {
    if (!state.dragging || state.targetTime == null) return;

    const now = performance.now();
    const moving = now - state.lastMoveAt < MOVING_WINDOW_MS;
    const delta = Math.abs(state.targetTime - state.lastSeekTarget);

    if (delta < MIN_SEEK_DELTA_SECONDS && now - state.lastSeekAt < SCRUB_INTERVAL_MS * 2) {
      return;
    }

    const shouldExactSeek = !moving && now - state.lastMoveAt > IDLE_EXACT_SEEK_MS;
    const allowSeekAhead = shouldExactSeek;

    if (seekPreview(state.targetTime, allowSeekAhead)) {
      state.lastSeekTarget = state.targetTime;
      state.lastSeekAt = now;
      if (allowSeekAhead) state.lastExactSeekAt = now;
    }
  }

  function startScrub(time) {
    const video = getVideo();
    const player = getPlayer();

    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) {
      postStatus("No playable YouTube video found");
      return;
    }

    state.dragging = true;
    state.targetTime = time;
    state.lastMoveAt = performance.now();
    state.lastSeekAt = 0;
    state.lastSeekTarget = -1;
    state.lastExactSeekAt = 0;
    state.restore = {
      paused: video.paused,
      muted: video.muted,
      playbackRate: video.playbackRate,
      volume: video.volume
    };

    if (video.muted) video.muted = false;
    video.playbackRate = 1;

    startLoop();
    seekPreview(time, false);
    playPreview(video, player);
  }

  function moveScrub(time) {
    if (!state.dragging) return;
    state.targetTime = time;
    state.lastMoveAt = performance.now();
  }

  function endScrub(time) {
    if (!state.dragging) return;

    state.targetTime = time;
    const video = getVideo();
    const player = getPlayer();

    if (Number.isFinite(time)) {
      seekPreview(time, true);
    }

    stopLoop();

    window.setTimeout(() => {
      restoreVideo(video, player);
    }, 90);

    state.dragging = false;
    state.targetTime = null;
  }

  function cancelScrub() {
    if (!state.dragging) return;
    const video = getVideo();
    const player = getPlayer();
    stopLoop();
    restoreVideo(video, player);
    state.dragging = false;
    state.targetTime = null;
  }

  function restoreVideo(video, player) {
    if (!video || !state.restore) {
      state.restore = null;
      return;
    }

    try {
      video.muted = state.restore.muted;
      video.playbackRate = state.restore.playbackRate;
      video.volume = state.restore.volume;
    } catch {}

    if (state.restore.paused) {
      pausePreview(video, player);
    } else {
      playPreview(video, player);
    }

    state.restore = null;
    postStatus("Drag to audio scrub");
  }

  function onMessage(event) {
    if (event.source !== window || !event.data || event.data.source !== UI_SOURCE) return;

    const { type, time, enabled } = event.data;

    if (type === "enabled") {
      state.enabled = Boolean(enabled);
      if (!state.enabled) cancelScrub();
      return;
    }

    if (!state.enabled && type !== "scrub-cancel") return;

    if (type === "scrub-start") {
      startScrub(Number(time));
      return;
    }

    if (type === "scrub-move") {
      moveScrub(Number(time));
      return;
    }

    if (type === "scrub-end") {
      endScrub(Number(time));
      return;
    }

    if (type === "scrub-cancel") {
      cancelScrub();
    }
  }

  window.addEventListener("message", onMessage);
})();
