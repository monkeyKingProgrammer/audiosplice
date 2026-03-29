import WaveSurfer from 'wavesurfer.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js';
import audioBufferToWav from 'audiobuffer-to-wav';
import { Mp3Encoder } from '@breezystack/lamejs';

// DOM Elements
const mainAudioInput = document.getElementById('main-audio-input');
const stampAudioInput = document.getElementById('stamp-audio-input');
const mainFileName = document.getElementById('main-file-name');
const stampFileName = document.getElementById('stamp-file-name');
const stampLabel = document.getElementById('stamp-label');
const editorSection = document.getElementById('editor-section');
const startDelaySlider = document.getElementById('start-delay-slider');
const startDelayValue = document.getElementById('start-delay-value');
const delaySlider = document.getElementById('delay-slider');
const delayValue = document.getElementById('delay-value');
const btnProcessStamps = document.getElementById('btn-process-stamps');
const btnProcessResult = document.getElementById('btn-process-result');
const btnPlayPause = document.getElementById('btn-play-pause');
const currentTimeDisplay = document.getElementById('current-time-display');
const btnExportWav = document.getElementById('btn-export-wav');
const btnExportMp3 = document.getElementById('btn-export-mp3');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');
const trackRadios = document.querySelectorAll('input[name="play-track"]');

// Global cursor elements
const globalCursor = document.getElementById('global-cursor');
const tracksWrapper = document.getElementById('tracks-wrapper');
const waveformOriginalEl = document.getElementById('waveform-original');

let wsOriginal, wsStamp, wsResult;
let mainBuffer = null;
let stampBuffer = null;
let periodicStampBuffer = null; // Stores the generated track 2
let resultBuffer = null;
let audioContext = new (window.AudioContext || window.webkitAudioContext)();
let activeWs = null; // keeps track of which wavesurfer is meant to be playing

// Initialize Wavesurfers
function initWavesurfers() {
    const wsOptions = {
        waveColor: '#64748b',
        progressColor: '#8b5cf6',
        cursorColor: 'transparent', // Hide the native cursor
        cursorWidth: 0,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        height: 100,
        normalize: false,
    };

    wsOriginal = WaveSurfer.create({ 
        container: '#waveform-original', 
        ...wsOptions,
        plugins: [TimelinePlugin.create({ container: '#timeline-original' })]
    });
    wsStamp = WaveSurfer.create({ 
        container: '#waveform-stamp', 
        ...wsOptions, 
        waveColor: '#f59e0b', 
        progressColor: '#d97706',
        plugins: [TimelinePlugin.create({ container: '#timeline-stamp' })]
    });
    wsResult = WaveSurfer.create({ 
        container: '#waveform-result', 
        ...wsOptions, 
        waveColor: '#10b981', 
        progressColor: '#059669',
        plugins: [TimelinePlugin.create({ container: '#timeline-result' })]
    });

    activeWs = wsOriginal;
    
    // Ensure only the default activeWs is unmuted at the start
    wsOriginal.setVolume(1);
    wsStamp.setVolume(0);
    wsResult.setVolume(0);

    // Sync play/pause button state based on active wavesurfer
    const updatePlayBtn = () => {
        if (activeWs.isPlaying()) btnPlayPause.textContent = 'Pause';
        else btnPlayPause.textContent = 'Play';
    };

    const updateTimeDisplay = (time) => {
        currentTimeDisplay.textContent = time.toFixed(2);
    };

    const updateGlobalCursor = (time) => {
        if (!activeWs || activeWs.getDuration() === 0) return;
        const progress = time / activeWs.getDuration();
        const wrapperRect = tracksWrapper.getBoundingClientRect();
        const waveformRect = waveformOriginalEl.getBoundingClientRect();
        
        const leftOffset = waveformRect.left - wrapperRect.left;
        const width = waveformRect.width;
        
        globalCursor.style.left = `${leftOffset + (progress * width)}px`;
    };

    // Make all waveforms sync their cursor visually and update the time display
    [wsOriginal, wsStamp, wsResult].forEach(ws => {
        ws.on('play', updatePlayBtn);
        ws.on('pause', updatePlayBtn);
        
        ws.on('timeupdate', (time) => {
            if (activeWs === ws) {
                updateTimeDisplay(time);
                updateGlobalCursor(time);
            }
        });

        // When user clicks/drags to seek, sync the others and update time
        ws.on('seeking', (time) => {
            updateTimeDisplay(time);
            updateGlobalCursor(time);
            
            // Sync cursor on other inactive wavesurfers visually
            [wsOriginal, wsStamp, wsResult].forEach(otherWs => {
                if (otherWs !== ws && otherWs.getDuration() > 0) {
                    // Prevent circular seeking events
                    otherWs.setTime(time);
                }
            });
        });
    });
}

initWavesurfers();

// Helpers
function showLoading(text) {
    loadingText.textContent = text;
    loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    loadingOverlay.classList.add('hidden');
}

// Decode File
async function decodeFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    return await audioContext.decodeAudioData(arrayBuffer);
}

// Inputs
mainAudioInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    mainFileName.textContent = file.name;
    showLoading('Decoding Main Audio...');
    try {
        mainBuffer = await decodeFile(file);
        
        // Update slider max based on audio duration
        startDelaySlider.max = Math.floor(mainBuffer.duration);
        
        // Render Original waveform
        const objectUrl = URL.createObjectURL(file);
        wsOriginal.load(objectUrl);
        
        globalCursor.classList.remove('hidden');
        
        stampAudioInput.disabled = false;
        stampLabel.classList.remove('disabled-btn');
        stampLabel.classList.add('primary-btn');
    } catch (err) {
        alert('Error decoding main audio: ' + err.message);
    } finally {
        hideLoading();
    }
});

stampAudioInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    stampFileName.textContent = file.name;
    showLoading('Decoding Stamp Audio...');
    try {
        stampBuffer = await decodeFile(file);
        editorSection.classList.remove('hidden');
    } catch (err) {
        alert('Error decoding stamp audio: ' + err.message);
    } finally {
        hideLoading();
    }
});

startDelaySlider.addEventListener('input', (e) => {
    startDelayValue.value = Number(e.target.value).toFixed(2);
});
startDelayValue.addEventListener('input', (e) => {
    startDelaySlider.value = e.target.value;
});

delaySlider.addEventListener('input', (e) => {
    delayValue.value = Number(e.target.value).toFixed(2);
});
delayValue.addEventListener('input', (e) => {
    delaySlider.value = e.target.value;
});

// Arrow key cursor navigation
document.addEventListener('keydown', (e) => {
    if (!activeWs || mainBuffer === null) return;
    
    // Don't seek if user is typing in the input boxes
    if (document.activeElement.tagName === 'INPUT' && document.activeElement.type !== 'range' && document.activeElement.type !== 'radio') return;

    const skipAmount = 0.1; // seconds to skip per arrow press
    const duration = activeWs.getDuration();
    if (duration === 0) return;

    let currentTime = activeWs.getCurrentTime();

    if (e.key === 'ArrowRight') {
        currentTime = Math.min(currentTime + skipAmount, duration);
        e.preventDefault();
    } else if (e.key === 'ArrowLeft') {
        currentTime = Math.max(currentTime - skipAmount, 0);
        e.preventDefault();
    } else {
        return; // Other key pressed
    }

    activeWs.setTime(currentTime);
    
    // Sync the other wavesurfers visually
    [wsOriginal, wsStamp, wsResult].forEach(ws => {
        if (ws !== activeWs && ws.getDuration() > 0) {
            ws.setTime(currentTime);
        }
    });
});

// Process Phase Cancellation - Step 1: Preview Stamps
btnProcessStamps.addEventListener('click', async () => {
    if (!mainBuffer || !stampBuffer) return;
    
    showLoading('Generating Stamp Track...');
    await new Promise(r => setTimeout(r, 50));
    
    try {
        const sampleRate = mainBuffer.sampleRate;
        const channels = mainBuffer.numberOfChannels;
        const totalSamples = mainBuffer.length;
        
        const startDelaySeconds = parseFloat(startDelayValue.value);
        const startGapSamples = Math.floor(startDelaySeconds * sampleRate);

        const delaySeconds = parseFloat(delayValue.value);
        const gapSamples = Math.floor(delaySeconds * sampleRate);
        const stampSamples = stampBuffer.length;
        
        periodicStampBuffer = audioContext.createBuffer(channels, totalSamples, sampleRate);
        
        const getStampChannelData = (ch) => {
            if (ch < stampBuffer.numberOfChannels) {
                return stampBuffer.getChannelData(ch);
            }
            return stampBuffer.getChannelData(0);
        };

        for (let ch = 0; ch < channels; ch++) {
            const outData = periodicStampBuffer.getChannelData(ch);
            const stampData = getStampChannelData(ch);
            
            let currentOffset = startGapSamples; 
            
            while (currentOffset < totalSamples) {
                const copyLength = Math.min(stampSamples, totalSamples - currentOffset);
                if (copyLength > 0) {
                    outData.set(stampData.subarray(0, copyLength), currentOffset);
                }
                currentOffset += stampSamples + gapSamples;
            }
        }
        
        const stampWav = audioBufferToWav(periodicStampBuffer);
        const stampBlob = new Blob([new DataView(stampWav)], { type: 'audio/wav' });
        const stampUrl = URL.createObjectURL(stampBlob);
        
        if (wsStamp.media && wsStamp.media.src) {
            URL.revokeObjectURL(wsStamp.media.src);
        }
        wsStamp.load(stampUrl);
        
    } catch (err) {
        console.error(err);
        alert('Error generating stamps: ' + err.message);
    } finally {
        hideLoading();
    }
});

// Process Phase Cancellation - Step 2: Generate Subtraction Result
btnProcessResult.addEventListener('click', async () => {
    if (!mainBuffer || !periodicStampBuffer) {
        alert("Please click 'Preview Stamps' first to generate the stamp track.");
        return;
    }
    
    showLoading('Calculating Subtraction...');
    await new Promise(r => setTimeout(r, 50));
    
    try {
        const sampleRate = mainBuffer.sampleRate;
        const channels = mainBuffer.numberOfChannels;
        const totalSamples = mainBuffer.length;

        resultBuffer = audioContext.createBuffer(channels, totalSamples, sampleRate);
        for (let ch = 0; ch < channels; ch++) {
            const mainData = mainBuffer.getChannelData(ch);
            const stampData = periodicStampBuffer.getChannelData(ch);
            const resultData = resultBuffer.getChannelData(ch);
            
            for (let i = 0; i < totalSamples; i++) {
                resultData[i] = mainData[i] - stampData[i];
            }
        }
        
        const resultWav = audioBufferToWav(resultBuffer);
        const resultBlob = new Blob([new DataView(resultWav)], { type: 'audio/wav' });
        const resultUrl = URL.createObjectURL(resultBlob);

        if (wsResult.media && wsResult.media.src) {
            URL.revokeObjectURL(wsResult.media.src);
        }
        wsResult.load(resultUrl);
        
    } catch (err) {
        console.error(err);
        alert('Error processing subtraction: ' + err.message);
    } finally {
        hideLoading();
    }
});

// Track Selection and Playback
trackRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        const val = e.target.value;
        const isPlaying = activeWs.isPlaying();
        const currentTime = activeWs.getCurrentTime();
        
        if (isPlaying) {
            wsOriginal.pause();
            wsStamp.pause();
            wsResult.pause();
        }
        
        // Mute all first
        wsOriginal.setVolume(0);
        wsStamp.setVolume(0);
        wsResult.setVolume(0);

        if (val === 'original') {
            activeWs = wsOriginal;
            wsOriginal.setVolume(1);
        } else if (val === 'stamp') {
            activeWs = wsStamp;
            wsStamp.setVolume(1);
        } else if (val === 'result') {
            activeWs = wsResult;
            wsResult.setVolume(1);
        }
        
        // Sync times
        if (wsOriginal.getDuration() > 0) wsOriginal.setTime(currentTime);
        if (wsStamp.getDuration() > 0) wsStamp.setTime(currentTime);
        if (wsResult.getDuration() > 0) wsResult.setTime(currentTime);
        
        if (isPlaying) {
            // Un-muting one and playing the active one handles the audio correctly
            activeWs.play();
        }
    });
});

btnPlayPause.addEventListener('click', () => {
    activeWs.playPause();
});

// Exports
function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

btnExportWav.addEventListener('click', async () => {
    if (!resultBuffer) return alert('Please Generate the track first!');
    showLoading('Saving WAV...');
    try {
        const wavData = audioBufferToWav(resultBuffer);
        const blob = new Blob([new DataView(wavData)], { type: 'audio/wav' });
        triggerDownload(blob, 'clean_result.wav');
    } catch (e) {
        alert('Error saving WAV: ' + e.message);
    } finally {
        hideLoading();
    }
});

btnExportMp3.addEventListener('click', async () => {
    if (!resultBuffer) return alert('Please Generate the track first!');
    showLoading('Saving MP3...');
    await new Promise(r => setTimeout(r, 50));
    
    try {
        const sampleRate = resultBuffer.sampleRate;
        const channels = resultBuffer.numberOfChannels;
        const mp3encoder = new Mp3Encoder(channels, sampleRate, 128);
        const mp3Data = [];

        const convertFloatToInt16 = (float32Array) => {
            const int16Array = new Int16Array(float32Array.length);
            for (let i = 0; i < float32Array.length; i++) {
                let val = Math.floor(float32Array[i] * 32767);
                val = Math.max(-32768, Math.min(32767, val));
                int16Array[i] = val;
            }
            return int16Array;
        };

        const channelData = [];
        for (let i = 0; i < channels; i++) {
            channelData.push(convertFloatToInt16(resultBuffer.getChannelData(i)));
        }

        const sampleBlockSize = 1152;
        const numSamples = channelData[0].length;

        for (let i = 0; i < numSamples; i += sampleBlockSize) {
            let chunk1 = channelData[0].subarray(i, i + sampleBlockSize);
            let chunk2 = channels > 1 ? channelData[1].subarray(i, i + sampleBlockSize) : null;
            
            let mp3buf = channels > 1 ? mp3encoder.encodeBuffer(chunk1, chunk2) : mp3encoder.encodeBuffer(chunk1);
            if (mp3buf.length > 0) mp3Data.push(mp3buf);
        }
        
        const finalBuf = mp3encoder.flush();
        if (finalBuf.length > 0) mp3Data.push(finalBuf);

        const blob = new Blob(mp3Data, { type: 'audio/mp3' });
        triggerDownload(blob, 'clean_result.mp3');
    } catch (e) {
        alert('Error saving MP3: ' + e.message);
    } finally {
        hideLoading();
    }
});