# AudioSplice & Voice Stamp Removal Suite

A powerful, purely local, browser-based suite of tools for editing audio, removing repetitive voice stamps, and applying phase cancellation. Everything runs entirely client-side using JavaScript, Web Audio API, and normalized cross-correlation math—no backend servers, cloud APIs, or Python environments required.

## Tools Included

### 1. AudioSplice
A minimalist audio editor designed for quick slicing and intelligent pattern matching.

**Features:**
*   **Visual Editing:** Drag to highlight sections of audio you want to cut. The live preview automatically skips your cuts during playback.
*   **Auto-Detect Stamp (Pattern Matching):** Upload a short sample clip (e.g., a repetitive intro or a background noise). The algorithm uses Normalized Cross-Correlation to automatically scan your main track, find matching occurrences, and highlight them for instant removal.
*   **Split Channels:** Instantly separate a stereo track into two distinct Left/Right mono files.
*   **Video Support:** Upload `.mp4` video files to automatically rip the audio streams directly in your browser.
*   **Exporting:** Export your spliced results as lossless `.wav` or compressed `.mp3`.

### 2. Voice Stamp Removal (Phase Cancellation)
An advanced tool specifically designed to remove a repeating, periodic audio stamp (like a watermark or a metronome click) from a track by using phase subtraction.

**Features:**
*   **Dual Tracks:** Upload your main audio and a single sample of the unwanted noise.
*   **Precision Control:** Use sliders or exact numeric inputs to define exactly when the first stamp occurs and the exact time gap between each subsequent stamp.
*   **Triple-Track Syncing:** 
    *   *Track 1:* Your original audio.
    *   *Track 2:* A generated visualization of where your stamp will be applied.
    *   *Track 3:* The mathematical result (Track 1 minus Track 2).
    *   All tracks share a global cursor that is perfectly synced for precision editing.
*   **Real-time Muting:** Click the radio buttons to instantly solo a specific track while keeping the others visually synced.
*   **Smart Processing:** Generating the preview track is instantaneous. Once you are visually satisfied with how the waveforms align, generate the final subtraction track for export.

---

## How to Run Locally

You must have [Node.js](https://nodejs.org/) installed.

1. Clone or download this repository.
2. Open your terminal in the root `audioSplice` directory.
3. Install the dependencies:
   ```bash
   npm install
   ```

### To run AudioSplice:
```bash
npm run dev
# Then open http://127.0.0.1:5173
```

### To run Voice Stamp Removal:
Open a new terminal window, navigate to the `voiceStampRemoval` subdirectory, and run:
```bash
cd voiceStampRemoval
npm install
npm run dev -- --port 5175 --host 127.0.0.1
# Then open http://127.0.0.1:5175
```

## Privacy & Security
Because these tools run 100% inside your web browser, your audio files are **never** uploaded to the internet. They are decoded and processed entirely within your machine's local memory.