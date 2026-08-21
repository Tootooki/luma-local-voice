import tempfile
from pathlib import Path

from main import synthesize, transcribe


CONTROL_TEXT = "The local voice assistant is ready for a fast private conversation."


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="luma-setup-") as directory:
        sample = Path(directory) / "speech-check.wav"
        synthesize(CONTROL_TEXT, sample)
        transcript = transcribe(sample)
        if "local voice assistant" not in transcript.lower():
            raise RuntimeError(f"Speech model verification failed: {transcript}")
    print("Speech models verified.")


if __name__ == "__main__":
    main()
