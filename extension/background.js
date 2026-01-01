let isCapturing = false;
let recordingInterval = null;
let currentTabId = null;
const RECORDING_DURATION = 5000; // 5 seconds
const BACKEND_URL = 'http://localhost:8000';

console.log('tabCapture available:', !!chrome.tabCapture);
console.log('tabCapture.capture available:', !!chrome.tabCapture?.capture);

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Received message:', message);
  
  if (message.action === 'startCapture') {
    startCapture(message.tabId);
    sendResponse({ success: true });
  } else if (message.action === 'stopCapture') {
    stopCapture();
    sendResponse({ success: true });
  } else if (message.action === 'getState') {
    sendResponse({ isCapturing });
  }
  
  return true; // Keep channel open for async operations
});

async function startCapture(tabId) {
  try {
    currentTabId = tabId;

    // Check if offscreen document already exists
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existingContexts.length === 0) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['USER_MEDIA'],
        justification: 'Recording audio for deepfake detection'
      });
      console.log('Offscreen document created');
      
      // Wait for offscreen to load
      await new Promise(resolve => setTimeout(resolve, 500));
    } else {
      console.log('Offscreen document already exists');
    }

    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId
    });

    console.log('Stream ID obtained:', streamId);

    // Send init message to offscreen
    const response = await chrome.runtime.sendMessage({
      action: 'initCapture',
      streamId: streamId
    });

    console.log('Init response:', response);

    if (!response || !response.success) {
      throw new Error('Failed to initialize capture: ' + (response?.error || 'No response'));
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
    
    isCapturing = true;
    notifyPopup('status', 'Recording audio...');
    
    startPeriodicRecording(tabId);

  } catch (error) {
    console.error('Error starting capture:', error);
    notifyPopup('error', error.message);
  }
}

// function initializeCaptureWithStreamId(streamId) {
//   return new Promise((resolve, reject) => {
//     navigator.mediaDevices.getUserMedia({
//       audio: {
//         mandatory: {
//           chromeMediaSource: 'tab',
//           chromeMediaSourceId: streamId
//         }
//       }
//     }).then(stream => {
//       window.capturedStream = stream;
//       console.log('Stream captured in page context:', stream);
//       console.log('Audio tracks:', stream.getAudioTracks().length);
//       resolve(true); // Signal completion
//     }).catch(err => {
//       console.error('Failed to capture stream:', err);
//       reject(err);
//     });
//   });
// }

// async function setupAudioRecording(tabId, stream) {
//   try {
//     // Inject script to handle audio recording
//     await chrome.scripting.executeScript({
//       target: { tabId: tabId },
//       func: initializeAudioCapture
//     });
    
//     console.log('Audio capture initialized');
//   } catch (error) {
//     console.error('Error setting up audio:', error);
//     throw error;
//   }
// }

// Function injected into page to initialize audio capture
// function initializeAudioCapture() {
//   console.log('Initializing audio capture in page context');
  
//   window.audioRecorderReady = false;
//   window.capturedStream = null;
  
//   // Wait a bit for the stream to be available
//   setTimeout(() => {
//     window.audioRecorderReady = true;
//   }, 500);
// }

function startPeriodicRecording(tabId) {
  // Start first recording after a short delay
  setTimeout(() => {
    recordAndSendAudio(tabId);
  }, 1000);
  
  // Then record every 5 seconds
  recordingInterval = setInterval(() => {
    recordAndSendAudio(tabId);
  }, RECORDING_DURATION + 1000); // Add 1 second buffer
}

async function recordAndSendAudio(tabId) {
  if (!isCapturing) return;
  
  try {
    console.log('Recording audio chunk...');
    
    // Use offscreen document instead of content script
    const response = await chrome.runtime.sendMessage({
      action: 'captureAudio',
      duration: RECORDING_DURATION
    });

    if (response && response.success && response.audioDataUrl) {
      // Convert data URL to blob
      const fetchResponse = await fetch(response.audioDataUrl);
      const audioBlob = await fetchResponse.blob();
      
      console.log('Audio blob created, size:', audioBlob.size);
      console.log(audioBlob)
      
      // Send to backend
      await sendAudioToBackend(audioBlob);
    } else {
      console.log('No audio data captured:', response?.error);
    }

  } catch (error) {
    // Check if it's just the offscreen being closed
    if (error.message.includes('message channel closed')) {
      console.log('Offscreen closed, stopping recording');
      if (isCapturing) {
        isCapturing = false;
        if (recordingInterval) {
          clearInterval(recordingInterval);
          recordingInterval = null;
        }
      }
    } else {
      console.error('Error recording audio:', error);
    }
    // Don't stop on single error, continue recording if still active
  }
}

// Function to capture audio chunk (runs in page context)
// async function captureAudioChunk(duration) {
//   return new Promise(async (resolve) => {
//     try {
//       // Get audio from the current tab
//       // const stream = await navigator.mediaDevices.getDisplayMedia({
//       //   audio: true,
//       //   video: false
//       // });
//       console.log('captureAudioChunk called');
//       console.log('window object keys:', Object.keys(window).filter(k => k.includes('captured')));
//       const stream = window.capturedStream;
//       console.log('1. Stream from window:', !!stream);
//       console.log('2. Stream object:', stream);
//       // const stream = window.capturedStream;
//       // console.log('1. Stream from window:', !!stream);

      
//       if (!stream) {
//         resolve(null);
//         return;
//       }

//       const audioTracks = stream.getAudioTracks();
//       console.log('Audio tracks found:', audioTracks.length);
//       audioTracks.forEach((track, index) => {
//         console.log(`Track ${index}:`, {
//           enabled: track.enabled,
//           muted: track.muted,
//           readyState: track.readyState,
//           label: track.label
//         });
//       });
//       if (audioTracks.length === 0) {
//         resolve(null);
//         return;
//       }

//       const chunks = [];
//       const mediaRecorder = new MediaRecorder(stream, {
//         mimeType: 'audio/webm;codecs=opus'
//       });

//       mediaRecorder.ondataavailable = (event) => {
//         if (event.data.size > 0) {
//           console.log('Audio chunk received:', event.data.size, 'bytes');
//           chunks.push(event.data);
//         }else {
//           console.warn('Empty audio chunk received');
//         }
//       };

//       mediaRecorder.onstop = () => {
//         console.log('1. Stream received:', !!stream);
//         console.log('2. Audio tracks:', stream.getAudioTracks().length);
//         console.log('3. MediaRecorder created');
//         console.log('4. Recording for', duration, 'ms');
//         console.log('MediaRecorder stopped');
//         stream.getTracks().forEach(track => track.stop());
        
//         const blob = new Blob(chunks, { type: 'audio/webm' });
//         console.log('Total audio blob size:', blob.size, 'bytes');
//         console.log('Number of chunks:', chunks.length);
        
//         if (blob.size === 0) {
//           console.error('No audio data recorded!');
//           resolve(null);
//           return;
//         }
//         const reader = new FileReader();
        
//         reader.onloadend = () => {
//           const audio = new Audio(reader.result);
//           audio.play().then(() => {
//             console.log('Audio playback started - recording successful!');
//           }).catch(err => {
//             console.error('Cannot play audio:', err);
//           });
//           resolve(reader.result);
//         };
        
//         reader.readAsDataURL(blob);
//       };
      
//       mediaRecorder.onstart = () => {
//         console.log('MediaRecorder started');
//       };
      
//       // mediaRecorder.onstop = () => {
        
//       // };
      
//       mediaRecorder.onerror = (event) => {
//         console.error('MediaRecorder error:', event.error);
//       };
//       mediaRecorder.start();

      
//       setTimeout(() => {
//         if (mediaRecorder.state !== 'inactive') {
//           mediaRecorder.stop();
//         }
//       }, duration);

//     } catch (error) {
//       console.error('Error in captureAudioChunk:', error);
//       resolve(null);
//     }
//   });
// }

async function sendAudioToBackend(audioBlob) {
  try {
    console.log('Sending audio to backend...');
    
    const formData = new FormData();
    formData.append('audio', audioBlob, 'audio.webm');

    const response = await fetch(`${BACKEND_URL}/predict`, {
      method: 'POST',
      body: formData,
      headers: {
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    console.log('Analysis result:', result);
    
    notifyPopup('result', result);
    notifyPopup('status', 'Analysis complete - Recording continues...');

  } catch (error) {
    console.error('Error sending audio to backend:', error);
    notifyPopup('error', 'Failed to analyze: ' + error.message);
  }
}

async function stopCapture() {
  console.log('Stopping capture...');
  
  if (recordingInterval) {
    clearInterval(recordingInterval);
    recordingInterval = null;
  }

  isCapturing = false;
  
  // Wait a bit before closing offscreen to allow pending recordings to complete
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Close offscreen document
  try {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    
    if (existingContexts.length > 0) {
      await chrome.offscreen.closeDocument();
      console.log('Offscreen document closed');
    }
  } catch (err) {
    console.log('Error closing offscreen:', err);
  }
  
  currentTabId = null;
  notifyPopup('status', 'Capture stopped');
}

function notifyPopup(type, message) {
  chrome.runtime.sendMessage({
    type: type,
    message: typeof message === 'string' ? message : undefined,
    data: typeof message === 'object' ? message : undefined
  }, (response) => {
    // Ignore errors if popup is closed
    if (chrome.runtime.lastError) {
      console.log('Popup not available:', chrome.runtime.lastError.message);
    }
  });
}

// Clean up on extension unload
chrome.runtime.onSuspend.addListener(() => {
  stopCapture();
});