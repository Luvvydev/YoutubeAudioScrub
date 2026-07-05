# YouTube Audio Scrubber

Medium prototype Chrome extension for audio scrubbing on YouTube.

## What it does

- Adds a styled `Audio Scrub` toggle on YouTube pages.
- Adds an extension popup toggle with the same on/off state.
- Supports `Shift+S` while the YouTube page is focused.
- Adds a green scrub rail over the bottom of the active video.
- Lets you drag the rail to seek through the video while hearing audio during the drag.
- Uses YouTube's existing `<video>` element. It does not download, extract, or decode YouTube streams.

## Install locally

1. Unzip this folder.
2. Open `chrome://extensions`.
3. Turn on `Developer mode`.
4. Click `Load unpacked`.
5. Select the unzipped `youtube-audio-scrubber-medium` folder.
6. Open or reload a YouTube video.
7. Click the extension icon and turn `AudioScrub` on, or press `Shift+S` on the YouTube page.
8. Drag the green rail at the bottom of the video.

## What changed in 0.2.0

- Changed the content script to load at `document_start` so the UI is ready sooner.
- Added a popup menu with an on/off switch.
- Persisted the on/off state with `chrome.storage.local`.
- Reworked dragging so pointer movement only updates the target time, while a steady scrub timer seeks at a playable cadence.
- Removed the tiny pause burst behavior during drag, because that could make audio wait until mouse movement stopped.

## Notes

This is still the medium version, not true DJ sample-accurate scrubbing.

The extension seeks the normal YouTube video element and plays from the latest drag target. That means the feel depends on buffering, keyframes, video length, browser behavior, and YouTube's player state.

If audio does not start, click the YouTube video once and try again. Browser autoplay rules can block playback until the page has a user gesture.

## Known limitations

- No waveform.
- No separate audio extraction.
- No sample-accurate scrubbing.
- YouTube UI changes may require selector fixes, though this version relies mostly on the stable `<video>` element.
- On slow or unbuffered videos, preview can still feel choppy.


## v0.4 change

This version stops hammering `video.currentTime` from the isolated content script while the mouse is moving. That was causing YouTube to show the spinner until movement stopped.

The extension now uses a separate `page-controller.js` script in the page world so it can call YouTube's own player seek path when available:

- moving drag: `seekTo(time, false)` first, so YouTube does not constantly force new network seeks
- held still or release: exact seek with buffering allowed
- fallback: direct video seek only when the target is already buffered

This is still limited by YouTube buffering. It should feel less broken while dragging, but unbuffered parts of long videos cannot be turned into instant audio without extracting or decoding the stream separately.
