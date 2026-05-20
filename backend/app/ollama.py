from __future__ import annotations

import requests

OLLAMA_URL = "http://127.0.0.1:11434/api/generate"
MODEL_NAME = "qwen3.5:4b"


def summarize_changes(old_text: str, new_text: str) -> str:
    prompt = (
        "Compare the old and new website text below and return exactly one sentence "
        "describing what changed.\n\n"
        f"OLD TEXT:\n{old_text[:4000]}\n\nNEW TEXT:\n{new_text[:4000]}"
    )
    payload = {"model": MODEL_NAME, "prompt": prompt, "stream": False}
    response = requests.post(OLLAMA_URL, json=payload, timeout=120)

    response.raise_for_status()
    data = response.json()
    summary = (data.get("response") or "").strip()
    return summary or "No meaningful change detected."
