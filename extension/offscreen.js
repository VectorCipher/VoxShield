let capturedStream = null;

console.log("Offscreen script loaded");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Offscreen received message:", message);

    if (message.action === "initCapture") {
        console.log("Handling initCapture");
        initializeCapture(message.streamId)
            .then(() => {
                console.log("Init successful");
                sendResponse({ success: true });
            })
            .catch((err) => {
                console.error("Init failed:", err);
                sendResponse({ success: false, error: err.message });
            });
        return true;
    }

    if (message.action === "captureAudio") {
        console.log("Handling captureAudio");
        captureAudio(message.duration)
            .then((audioDataUrl) => {
                console.log(
                    "Capture successful, data URL length:",
                    audioDataUrl?.length
                );
                sendResponse({ success: true, audioDataUrl });
            })
            .catch((err) => {
                console.error("Capture failed:", err);
                sendResponse({ success: false, error: err.message });
            });
        return true;
    }

    console.warn("Unknown action:", message.action);
    return false;
});

async function initializeCapture(streamId) {
    console.log("initializeCapture called with streamId:", streamId);

    // const stream = await navigator.mediaDevices.getUserMedia({
    //     audio: {
    //         mandatory: {
    //             chromeMediaSource: "tab",
    //             chromeMediaSourceId: streamId,
    //         },
    //     },
    // });

    // capturedStream = stream;
    const rawStream = await navigator.mediaDevices.getUserMedia({
  audio: {
    mandatory: {
      chromeMediaSource: "tab",
      chromeMediaSourceId: streamId,
    },
  },
});


const audioContext = new AudioContext();


const source = audioContext.createMediaStreamSource(rawStream);


const destination = audioContext.destination;


const recordingDestination = audioContext.createMediaStreamDestination();


source.connect(destination);               
source.connect(recordingDestination);       

capturedStream = recordingDestination.stream;

    // console.log("✅ Stream captured in offscreen:", stream);
    // console.log("Audio tracks:", stream.getAudioTracks().length);
}

async function captureAudio(duration) {
    return new Promise(async (resolve, reject) => {
        try {
            console.log("captureAudio called, duration:", duration);

            if (!capturedStream) {
                console.error("No captured stream available");
                reject(new Error("No captured stream"));
                return;
            }

            const audioTracks = capturedStream.getAudioTracks();
            console.log("Audio tracks found:", audioTracks.length);

            if (audioTracks.length === 0) {
                reject(new Error("No audio tracks"));
                return;
            }

            const chunks = [];
            const mediaRecorder = new MediaRecorder(capturedStream, {
                mimeType: "audio/webm;codecs=opus",
            });

            mediaRecorder.onstart = () => {
                console.log("MediaRecorder started");
            };

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    console.log(
                        "Audio chunk received:",
                        event.data.size,
                        "bytes"
                    );
                    chunks.push(event.data);
                } else {
                    console.warn("Empty audio chunk received");
                }
            };

            mediaRecorder.onstop = () => {
                console.log("MediaRecorder stopped");

                const blob = new Blob(chunks, { type: "audio/webm" });
                console.log("Total audio blob size:", blob.size, "bytes");
                console.log("Number of chunks:", chunks.length);

                if (blob.size === 0) {
                    console.error("No audio data recorded!");
                    reject(new Error("No audio data"));
                    return;
                }

                const reader = new FileReader();

                reader.onloadend = () => {
                    console.log("Audio converted to data URL");
                    resolve(reader.result);
                };

                reader.onerror = () => {
                    reject(new Error("Failed to read blob"));
                };

                reader.readAsDataURL(blob);
            };

            mediaRecorder.onerror = (event) => {
                console.error("MediaRecorder error:", event.error);
                reject(event.error);
            };

            mediaRecorder.start();

            setTimeout(() => {
                if (mediaRecorder.state !== "inactive") {
                    mediaRecorder.stop();
                }
            }, duration);
        } catch (error) {
            console.error("Error in captureAudio:", error);
            reject(error);
        }
    });
}
