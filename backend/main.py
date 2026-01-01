import os
os.environ["TRANSFORMERS_NO_TORCHCODEC"] = "1"

from fastapi import FastAPI, UploadFile, File
from transformers import pipeline
from pydub import AudioSegment
import numpy as np
import io
import librosa

app = FastAPI()

MODEL_NAME = "MelodyMachine/Deepfake-audio-detection-V2"
TARGET_SR = 16000

pipe = pipeline(
    "audio-classification",
    model=MODEL_NAME,
    device=-1  # CPU
)

def preprocess_audio(audio_bytes):
    # Decode WebM/Opus using FFmpeg (pydub)
    audio = AudioSegment.from_file(io.BytesIO(audio_bytes), format="webm")

    # Mono
    audio = audio.set_channels(1)

    samples = np.array(audio.get_array_of_samples()).astype(np.float32)

    # Normalize
    samples /= np.max(np.abs(samples)) + 1e-9

    # Resample to 16kHz
    if audio.frame_rate != TARGET_SR:
        samples = librosa.resample(
            samples,
            orig_sr=audio.frame_rate,
            target_sr=TARGET_SR
        )

    return samples

@app.post("/predict")
async def predict(audio: UploadFile = File(...)):
    audio_bytes = await audio.read()
    waveform = preprocess_audio(audio_bytes)

    result = pipe({
        "array": waveform,
        "sampling_rate": TARGET_SR
    })

    label = result[0]["label"].lower()
    score = float(result[0]["score"])

    prediction = 1 if "fake" in label else 0

    return {
        "prediction": prediction,
        "confidence": score
    }
