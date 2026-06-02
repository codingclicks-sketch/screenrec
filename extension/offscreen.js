let mediaRecorder = null;
let chunks = [];
let recordingStart = null;

chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.target !== 'offscreen') return;

  if (msg.type === 'START_OFFSCREEN') {
    await startRecording(msg.streamId, msg.audio, msg.quality);
  }

  if (msg.type === 'STOP_OFFSCREEN') {
    stopRecording();
  }
});

async function startRecording(streamId, audio, quality) {
  const constraints = {
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: streamId,
        maxWidth: quality === 'high' ? 1920 : quality === 'medium' ? 1280 : 854,
        maxHeight: quality === 'high' ? 1080 : quality === 'medium' ? 720 : 480,
        maxFrameRate: 30,
      },
    },
  };

  if (audio) {
    constraints.audio = {
      mandatory: { chromeMediaSource: 'desktop' },
    };
  }

  const screenStream = await navigator.mediaDevices.getUserMedia(constraints);

  let finalStream = screenStream;

  // Mix in microphone audio if requested
  if (audio) {
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      ctx.createMediaStreamSource(screenStream).connect(dest);
      ctx.createMediaStreamSource(micStream).connect(dest);
      const combined = new MediaStream([
        ...screenStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);
      finalStream = combined;
    } catch (e) {
      // Mic unavailable — continue without it
    }
  }

  chunks = [];
  recordingStart = Date.now();

  mediaRecorder = new MediaRecorder(finalStream, {
    mimeType: 'video/webm;codecs=vp9',
    videoBitsPerSecond: quality === 'high' ? 4000000 : quality === 'medium' ? 2500000 : 1000000,
  });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    const duration = Date.now() - recordingStart;
    const blob = new Blob(chunks, { type: 'video/webm' });
    chunks = [];

    // Convert to base64 to send via message (blobs can't cross the boundary)
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);

    chrome.runtime.sendMessage({ type: 'RECORDING_DATA', blob: base64, duration });

    // Stop all tracks
    finalStream.getTracks().forEach(t => t.stop());
  };

  mediaRecorder.start(1000); // collect data every second
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}
