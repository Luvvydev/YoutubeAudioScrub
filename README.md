# YouTube Audio Scrubber

Chrome extension for audio scrubbing on YouTube.

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


## Known limitations

- No waveform.
- No separate audio extraction.
- No sample-accurate scrubbing.
- YouTube UI changes may require selector fixes, though this version relies mostly on the stable `<video>` element.
- On slow or unbuffered videos, preview can still feel choppy.
