import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js';
import audioBufferToWav from 'audiobuffer-to-wav';
import { Mp3Encoder } from '@breezystack/lamejs';

// DOM Elements
const audioInput = document.getElementById('audio-input');
const stampInput = document.getElementById('stamp-input');
const fileNameDisplay = document.getElementById('file-name');
const uploadSection = document.getElementById('upload-section');
const editorSection = document.getElementById('editor-section');
const btnPlayPause = document.getElementById('btn-play-pause');
const btnAddRegion = document.getElementById('btn-add-region');
const btnSplitChannels = document.getElementById('btn-split-channels');
const btnExportWav = document.getElementById('btn-export-wav');
const btnExportMp3 = document.getElementById('btn-export-mp3');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');

let wavesurfer;
let wsRegions;
let activeAudioFile = null;
let cachedMainBuffer = null;

// Helper to get Mono channel data
function getMonoData(buffer) {
    if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    const mono = new Float32Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
        mono[i] = (left[i] + right[i]) / 2;
    }
    return mono;
}

// Helper to downsample audio for faster processing
function downsample(data, factor) {
    const newLen = Math.floor(data.length / factor);
    const newData = new Float32Array(newLen);
    for (let i = 0; i < newLen; i++) {
        let sum = 0;
        for (let j = 0; j < factor; j++) {
            sum += data[i * factor + j];
        }
        newData[i] = sum / factor;
    }
    return newData;
}

// Find matches using Normalized Cross-Correlation
async function findAudioMatches(mainBuffer, stampBuffer, threshold = 0.85) {
    const downsampleFactor = 8; 
    const mainMono = getMonoData(mainBuffer);
    const stampMono = getMonoData(stampBuffer);
    
    const mainDs = downsample(mainMono, downsampleFactor);
    const stampDs = downsample(stampMono, downsampleFactor);
    
    const matches = [];
    const stampLen = stampDs.length;
    const mainLen = mainDs.length;
    
    let stampSum = 0;
    for (let i = 0; i < stampLen; i++) stampSum += stampDs[i];
    const stampMean = stampSum / stampLen;
    
    let stampVar = 0;
    for (let i = 0; i < stampLen; i++) stampVar += (stampDs[i] - stampMean) ** 2;
    
    const chunkSize = 50000; 
    let matchCount = 0;
    
    for (let i = 0; i <= mainLen - stampLen; i += 2) {
        if (i % chunkSize === 0) {
            await new Promise(r => setTimeout(r, 0)); // yield to UI
            const percent = Math.round((i / mainLen) * 100);
            loadingText.textContent = `Analyzing audio... ${percent}%`;
        }
        
        let mainSum = 0;
        for (let j = 0; j < stampLen; j++) mainSum += mainDs[i + j];
        const mainMean = mainSum / stampLen;
        
        let cov = 0;
        let mainVar = 0;
        for (let j = 0; j < stampLen; j++) {
            const mDiff = mainDs[i + j] - mainMean;
            const sDiff = stampDs[j] - stampMean;
            cov += mDiff * sDiff;
            mainVar += mDiff ** 2;
        }
        
        if (mainVar === 0 || stampVar === 0) continue;
        const correlation = cov / Math.sqrt(mainVar * stampVar);
        
        if (correlation >= threshold) {
            const matchStartTime = (i * downsampleFactor) / mainBuffer.sampleRate;
            const matchEndTime = matchStartTime + stampBuffer.duration;
            
            const isOverlap = matches.some(m => 
                (matchStartTime >= m.start && matchStartTime <= m.end) ||
                (matchEndTime >= m.start && matchEndTime <= m.end) ||
                (m.start >= matchStartTime && m.start <= matchEndTime)
            );
            
            if (!isOverlap) {
                matches.push({ start: matchStartTime, end: matchEndTime });
                matchCount++;
            }
        }
    }
    
    return matches;
}

stampInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !activeAudioFile) return;

    showLoading('Decoding audio tracks...');
    
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Cache main buffer if we haven't already so we don't decode multiple times
        if (!cachedMainBuffer) {
            const mainArrayBuffer = await activeAudioFile.arrayBuffer();
            cachedMainBuffer = await audioContext.decodeAudioData(mainArrayBuffer);
        }
        
        const stampArrayBuffer = await file.arrayBuffer();
        const stampBuffer = await audioContext.decodeAudioData(stampArrayBuffer);

        const matches = await findAudioMatches(cachedMainBuffer, stampBuffer, 0.85);

        if (matches.length > 0) {
            matches.forEach(match => {
                wsRegions.addRegion({
                    start: match.start,
                    end: match.end,
                    color: 'rgba(168, 85, 247, 0.4)', // Purple for auto-detect
                    drag: true,
                    resize: true
                });
            });
            alert(`Found and highlighted ${matches.length} matching stamps!`);
        } else {
            alert('No closely matching audio stamps found in the main track.');
        }

    } catch (err) {
        console.error(err);
        alert('Error analyzing audio: ' + err.message);
    } finally {
        hideLoading();
        stampInput.value = ''; // Reset input
    }
});

// Initialize Wavesurfer
function initWavesurfer() {
    if (wavesurfer) {
        wavesurfer.destroy();
    }

    wavesurfer = WaveSurfer.create({
        container: '#waveform',
        waveColor: '#3b82f6',
        progressColor: '#2563eb',
        cursorColor: '#ffffff',
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        height: 120,
        normalize: true,
        plugins: [
            TimelinePlugin.create({
                container: '#waveform-timeline',
            }),
        ],
    });

    wsRegions = wavesurfer.registerPlugin(RegionsPlugin.create());

    // Play/Pause button logic
    wavesurfer.on('play', () => {
        btnPlayPause.textContent = 'Pause';
    });
    wavesurfer.on('pause', () => {
        btnPlayPause.textContent = 'Play';
    });

    // Skip logic for regions (preview cuts)
    wavesurfer.on('timeupdate', (currentTime) => {
        const regions = wsRegions.getRegions();
        for (const region of regions) {
            // If the playhead is inside a region, skip to the end of it
            if (currentTime >= region.start && currentTime < region.end) {
                wavesurfer.setTime(region.end);
                break;
            }
        }
    });
}

// Handle file upload
audioInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    activeAudioFile = file;
    fileNameDisplay.textContent = file.name;
    uploadSection.classList.add('hidden');
    editorSection.classList.remove('hidden');

    initWavesurfer();
    
    const objectUrl = URL.createObjectURL(file);
    wavesurfer.load(objectUrl);
});

// Controls
btnPlayPause.addEventListener('click', () => {
    wavesurfer.playPause();
});

btnAddRegion.addEventListener('click', () => {
    const duration = wavesurfer.getDuration();
    const currentTime = wavesurfer.getCurrentTime();
    
    wsRegions.addRegion({
        start: currentTime,
        end: Math.min(currentTime + 5, duration),
        color: 'rgba(239, 68, 68, 0.4)', // Danger red
        drag: true,
        resize: true
    });
});

function showLoading(text) {
    loadingText.textContent = text;
    loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    loadingOverlay.classList.add('hidden');
}

// Audio Processing Functions
async function getProcessedAudioBuffer() {
    // 1. Decode the original file to AudioBuffer
    const arrayBuffer = await activeAudioFile.arrayBuffer();
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const originalBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // 2. Get regions to cut and sort them by start time
    const regions = wsRegions.getRegions()
        .map(r => ({ start: r.start, end: r.end }))
        .sort((a, b) => a.start - b.start);
    
    // Merge overlapping regions
    const mergedRegions = [];
    if (regions.length > 0) {
        let current = regions[0];
        for (let i = 1; i < regions.length; i++) {
            const next = regions[i];
            if (next.start <= current.end) {
                current.end = Math.max(current.end, next.end);
            } else {
                mergedRegions.push(current);
                current = next;
            }
        }
        mergedRegions.push(current);
    }

    const duration = originalBuffer.duration;
    
    // 3. Determine segments to KEEP
    const keepSegments = [];
    let currentTime = 0;
    for (const region of mergedRegions) {
        if (region.start > currentTime) {
            keepSegments.push({ start: currentTime, end: region.start });
        }
        currentTime = region.end;
    }
    if (currentTime < duration) {
        keepSegments.push({ start: currentTime, end: duration });
    }

    // 4. Calculate total length of new buffer
    const sampleRate = originalBuffer.sampleRate;
    const channels = originalBuffer.numberOfChannels;
    
    // Convert segments to sample indices to avoid rounding mismatches
    const keepSampleSegments = keepSegments.map(seg => ({
        start: Math.floor(seg.start * sampleRate),
        end: Math.floor(seg.end * sampleRate)
    }));

    let totalSamples = 0;
    for (const seg of keepSampleSegments) {
        totalSamples += (seg.end - seg.start);
    }
    
    // If we cut everything, return empty
    if (totalSamples === 0) return null;

    // 5. Create new buffer and copy data
    const newBuffer = audioContext.createBuffer(channels, totalSamples, sampleRate);
    
    for (let channel = 0; channel < channels; channel++) {
        const originalData = originalBuffer.getChannelData(channel);
        const newData = newBuffer.getChannelData(channel);
        
        let writeOffset = 0;
        for (const seg of keepSampleSegments) {
            const length = seg.end - seg.start;
            
            // Copy slice
            newData.set(originalData.subarray(seg.start, seg.end), writeOffset);
            writeOffset += length;
        }
    }
    
    return newBuffer;
}

function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// Split Channels (WAV)
btnSplitChannels.addEventListener('click', async () => {
    showLoading('Splitting channels...');
    try {
        const processedBuffer = await getProcessedAudioBuffer();
        if (!processedBuffer) {
            alert('Cannot process empty audio. Adjust regions.');
            hideLoading();
            return;
        }
        
        const channels = processedBuffer.numberOfChannels;
        if (channels < 2) {
            alert('This audio file only has 1 channel (Mono). There is nothing to split.');
            hideLoading();
            return;
        }

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const sampleRate = processedBuffer.sampleRate;
        const length = processedBuffer.length;
        
        const originalName = activeAudioFile.name.replace(/\.[^/.]+$/, "");

        for (let i = 0; i < channels; i++) {
            // Create a mono buffer for this specific channel
            const monoBuffer = audioContext.createBuffer(1, length, sampleRate);
            monoBuffer.getChannelData(0).set(processedBuffer.getChannelData(i));
            
            const wavData = audioBufferToWav(monoBuffer);
            const blob = new Blob([new DataView(wavData)], { type: 'audio/wav' });
            
            // Name it Left / Right if stereo
            const side = i === 0 ? "Left" : (i === 1 ? "Right" : `Ch${i + 1}`);
            triggerDownload(blob, `${originalName}_${side}.wav`);
            
            // Wait slightly between downloads so the browser allows multiple file prompts
            await new Promise(r => setTimeout(r, 500));
        }

    } catch (e) {
        console.error(e);
        alert('Error splitting channels: ' + e.message);
    } finally {
        hideLoading();
    }
});

// Export WAV
btnExportWav.addEventListener('click', async () => {
    showLoading('Processing WAV...');
    try {
        const processedBuffer = await getProcessedAudioBuffer();
        if (!processedBuffer) {
            alert('Cannot save empty audio. Adjust regions.');
            hideLoading();
            return;
        }
        
        const wavData = audioBufferToWav(processedBuffer);
        const blob = new Blob([new DataView(wavData)], { type: 'audio/wav' });
        
        const originalName = activeAudioFile.name.replace(/\.[^/.]+$/, "");
        triggerDownload(blob, `${originalName}_spliced.wav`);
    } catch (e) {
        console.error(e);
        alert('Error processing WAV: ' + e.message);
    } finally {
        hideLoading();
    }
});

// Export MP3
btnExportMp3.addEventListener('click', async () => {
    showLoading('Processing MP3...');
    // Allow UI to update
    await new Promise(r => setTimeout(r, 50));
    
    try {
        const processedBuffer = await getProcessedAudioBuffer();
        if (!processedBuffer) {
            alert('Cannot save empty audio. Adjust regions.');
            hideLoading();
            return;
        }

        const sampleRate = processedBuffer.sampleRate;
        const channels = processedBuffer.numberOfChannels;
        
        // Setup lamejs encoder
        const mp3encoder = new Mp3Encoder(channels, sampleRate, 128);
        const mp3Data = [];

        // Lamejs needs 16-bit integers, we have 32-bit floats
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
            channelData.push(convertFloatToInt16(processedBuffer.getChannelData(i)));
        }

        const sampleBlockSize = 1152;
        const numSamples = channelData[0].length;

        for (let i = 0; i < numSamples; i += sampleBlockSize) {
            let chunk1 = channelData[0].subarray(i, i + sampleBlockSize);
            let chunk2 = channels > 1 ? channelData[1].subarray(i, i + sampleBlockSize) : null;
            
            // Encode chunk
            let mp3buf;
            if (channels > 1) {
                mp3buf = mp3encoder.encodeBuffer(chunk1, chunk2);
            } else {
                mp3buf = mp3encoder.encodeBuffer(chunk1);
            }
            
            if (mp3buf.length > 0) {
                mp3Data.push(mp3buf);
            }
        }
        
        const finalBuf = mp3encoder.flush();
        if (finalBuf.length > 0) {
            mp3Data.push(finalBuf);
        }

        const blob = new Blob(mp3Data, { type: 'audio/mp3' });
        const originalName = activeAudioFile.name.replace(/\.[^/.]+$/, "");
        triggerDownload(blob, `${originalName}_spliced.mp3`);
        
    } catch (e) {
        console.error(e);
        alert('Error processing MP3: ' + e.message);
    } finally {
        hideLoading();
    }
});