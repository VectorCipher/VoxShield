const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const status = document.getElementById('status');
const result = document.getElementById('result');

let isCapturing = false;

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only handle messages meant for popup
  if (message.type === 'status') {
    updateStatus(message.message);
    sendResponse({ received: true });
  } else if (message.type === 'result') {
    displayResult(message.data);
    sendResponse({ received: true });
  } else if (message.type === 'error') {
    updateStatus('Error: ' + message.message, true);
    sendResponse({ received: true });
  }
  // Don't respond to other messages
  return false;
});

startBtn.addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Send message without expecting response
    chrome.runtime.sendMessage({ 
      action: 'startCapture', 
      tabId: tab.id 
    }, (response) => {
      // Handle response or ignore if port closed
      if (chrome.runtime.lastError) {
        console.log('Expected error:', chrome.runtime.lastError.message);
      }
    });
    
    isCapturing = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    updateStatus('Starting capture...');
    result.classList.remove('show');
  } catch (error) {
    updateStatus('Error: ' + error.message, true);
  }
});

stopBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stopCapture' }, (response) => {
    if (chrome.runtime.lastError) {
      console.log('Expected error:', chrome.runtime.lastError.message);
    }
  });
  
  isCapturing = false;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  updateStatus('Capture stopped');
});

function updateStatus(message, isError = false) {
  if (isError) {
    status.style.background = 'rgba(239, 68, 68, 0.3)';
    status.style.borderLeft = '4px solid #ef4444';
  } else if (message.includes('Recording')) {
    status.style.background = 'rgba(74, 222, 128, 0.3)';
    status.style.borderLeft = '4px solid #4ade80';
    status.innerHTML = '<span class="recording-indicator"></span>' + message;
  } else {
    status.style.background = 'rgba(255, 255, 255, 0.2)';
    status.style.borderLeft = 'none';
    status.innerHTML = message;
  }
}

function displayResult(data) {
  const isPrediction = data.prediction !== undefined;
  const label = isPrediction ? 
    (data.prediction === 1 ? '🚨 FAKE DETECTED' : '✅ REAL AUDIO') : 
    data.label || 'Unknown';
  
  const confidence = data.confidence !== undefined ? 
    (data.confidence * 100).toFixed(2) : 
    (data.score ? (data.score * 100).toFixed(2) : 'N/A');
  
  result.innerHTML = `
    <div class="result-label">Analysis Result:</div>
    <div class="result-value">${label}</div>
    <div class="confidence">Confidence: ${confidence}%</div>
  `;
  
  if (isPrediction && data.prediction === 1) {
    result.style.borderLeftColor = '#ef4444';
  } else {
    result.style.borderLeftColor = '#4ade80';
  }
  
  result.classList.add('show');
}

// Initialize state on popup open
chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
  if (chrome.runtime.lastError) {
    console.log('Could not get state:', chrome.runtime.lastError.message);
    return;
  }
  
  if (response && response.isCapturing) {
    isCapturing = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    updateStatus('Recording audio...');
  }
});