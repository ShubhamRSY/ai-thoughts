# One-time setup (from marketing/):
#   python3.11 -m venv .work/tts-venv && .work/tts-venv/bin/pip install kokoro-onnx soundfile
#   curl -L -o .work/kokoro-v1.0.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
#   curl -L -o .work/voices-v1.0.bin  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
# Local neural voiceover (Kokoro, offline). Usage: tts.py lines.json  -> writes each {"out","text"} as a wav.
import json, sys
import soundfile as sf
from kokoro_onnx import Kokoro

VOICE, SPEED = "af_heart", 0.95  # warm US female; try af_bella, af_nicole, af_sky, bf_emma (UK)
k = Kokoro(".work/kokoro-v1.0.onnx", ".work/voices-v1.0.bin")
for line in json.load(open(sys.argv[1])):
    samples, sr = k.create(line["text"], voice=VOICE, speed=SPEED, lang="en-us")
    sf.write(line["out"], samples, sr)
    print(line["out"], f"{len(samples) / sr:.2f}s", flush=True)
