"""
RunPod Serverless Handler — The Elect GGUF serving layer.

Accepts: {"input": {"model": "the-galilean", "prompt": "...", "max_tokens": 400, "temperature": 0.8}}
Returns: {"output": {"text": "...", "model": "the-galilean", "tokens": N, "elapsed_s": F}}

On first cold start: downloads the GGUF from HuggingFace to the network volume (/models/).
On subsequent cold starts: GGUF is already on the volume → model-load-only cold start (~seconds).
Hard max_tokens cap: 1024.

To add a new model: add an entry to MODEL_CONFIGS below.
"""

import runpod
import os
import time
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODELS_DIR = os.environ.get("MODELS_DIR", "/models")
MAX_TOKENS_HARD_CAP = 1024
HF_TOKEN = os.environ.get("HF_TOKEN", "")

# ────────────────────────────────────────────────────────────────────────────────
# Model configuration registry
# frame_pre + <user prompt> + frame_post = the full completion prompt.
# stops = list of stop sequences (from the canonical Modelfile for each persona).
# ────────────────────────────────────────────────────────────────────────────────
MODEL_CONFIGS = {
    "the-galilean": {
        "local_path": "/models/the-galilean-7b/the-galilean-qwen2-5-7b-instruct-Q5_K_M.gguf",
        "hf_repo": "lerugray/the-galilean-7b",
        "hf_file": "the-galilean-qwen2-5-7b-instruct-Q5_K_M.gguf",
        "display_name": "The Galilean (Jesus, measured)",
        "frame_pre": "One who seeks the kingdom asks Jesus of Nazareth, the teacher of Galilee: ",
        "frame_post": "\n\nJesus answers, as one having authority, and not as the scribes:\n",
        "stops": [
            "One who seeks",
            "\nJesus answers",
            "\nQ:",
            "\n# ",
            "\nAnd he said",
            "\nAnd Jesus",
            "\nThen said",
            "\nThen Jesus",
            "\nThe disciples",
            "\nAnd it came to pass",
            "\nNow when",
            "\nAnd when",
            "\n¶",
            "Trinity",
            "three persons",
            "God the Son",
            "co-equal",
            "co-eternal",
            "Second Person",
        ],
        "default_temp": 0.8,
        "default_max_tokens": 360,
        "top_p": 0.92,
    },
    "den-of-thieves": {
        "local_path": "/models/den-of-thieves-7b/den-of-thieves-qwen2-5-7b-instruct-Q5_K_M.gguf",
        "hf_repo": "lerugray/den-of-thieves-7b",
        "hf_file": "den-of-thieves-qwen2-5-7b-instruct-Q5_K_M.gguf",
        "display_name": "Jesus of Nazareth (radical)",
        "frame_pre": "One who seeks the kingdom asks Jesus of Nazareth — the carpenter's son who drove the money-changers from the temple: ",
        "frame_post": "\n\nJesus answers, as one having authority, and not as the scribes:\n",
        "stops": [
            "One who seeks",
            "\nJesus answers",
            "\nQ:",
            "\n# ",
            "\nAnd he said",
            "\nAnd Jesus",
            "\nThen said",
            "\nThen Jesus",
            "\nThe disciples",
            "\nAnd it came to pass",
            "\nNow when",
            "\nAnd when",
            "\n¶",
        ],
        "default_temp": 0.85,
        "default_max_tokens": 320,
        "top_p": 0.92,
    },
    "spectre": {
        "local_path": "/models/spectre-7b/spectre-qwen2-5-7b-instruct-Q5_K_M.gguf",
        "hf_repo": "lerugray/spectre-7b",
        "hf_file": "spectre-qwen2-5-7b-instruct-Q5_K_M.gguf",
        "display_name": "Karl Marx",
        "frame_pre": "A visitor sits with Karl Marx and asks him: ",
        "frame_post": "\n\nMarx sets down his pen, considers, and answers the visitor aloud — plainly, in the first person, as a man speaking, not as an article for print:\n",
        "stops": [
            "A visitor sits",
            "\nA visitor",
            "\nOne puts",
            "\nQ:",
            "Karl Marx,",
            '\n"',
            "[See:",
            "\nThe above",
            "\nNote:",
            "\nLondon,",
            "\nNew York,",
        ],
        "default_temp": 0.6,
        "default_max_tokens": 350,
        "top_p": 0.9,
    },
    "osawatomie": {
        "local_path": "/models/osawatomie-7b/osawatomie-v3-qwen2.5-7b-instruct-Q5_K_M.gguf",
        "hf_repo": "lerugray/osawatomie-7b",
        "hf_file": "osawatomie-v3-qwen2.5-7b-instruct-Q5_K_M.gguf",
        "display_name": "John Brown",
        "frame_pre": "A visitor asks John Brown, in his cell at Charlestown: ",
        "frame_post": "\n\nJohn Brown answers in the first person, in his own plain and resolute voice:\n",
        "stops": [
            "A visitor asks John Brown",
            "\nA visitor",
            "\nQ:",
            "\n# ",
            "\n#",
            "\n---",
            "\n[",
            "[Note:",
            "This response",
            "fictional representation",
            "\nThe above",
            "\nNote:",
        ],
        "default_temp": 0.65,
        "default_max_tokens": 300,
        "top_p": 0.9,
    },
    "north-star": {
        "local_path": "/models/north-star-7b/north-star-qwen2-5-7b-instruct-Q5_K_M.gguf",
        "hf_repo": "lerugray/north-star-7b",
        "hf_file": "north-star-qwen2-5-7b-instruct-Q5_K_M.gguf",
        "display_name": "Frederick Douglass",
        "frame_pre": "A visitor asks Frederick Douglass: ",
        "frame_post": "\n\nFrederick Douglass answers in the first person, in his own voice — the thunder of the abolitionist orator and the measured cadence of the memoirs:\n",
        "stops": [
            "A visitor asks Frederick Douglass",
            "\nA visitor",
            "\nQ:",
            "\n# ",
            "\n#",
            "\n---",
            "\n[",
            "[Note:",
            "This response",
            "fictional representation",
            "\nThe above",
            "\nNote:",
        ],
        "default_temp": 0.65,
        "default_max_tokens": 320,
        "top_p": 0.9,
    },
}

# ── Loaded model cache: one Llama instance per worker lifetime ────────────────
_loaded_llm = None
_loaded_model_name = None


def ensure_weights(cfg: dict) -> str:
    """
    Ensure the GGUF file is present locally.
    If missing: download from HuggingFace to /models/ (network volume).
    Returns the local path.
    """
    local_path = cfg["local_path"]

    if os.path.exists(local_path):
        size_gb = os.path.getsize(local_path) / 1e9
        logger.info(f"Weights cached: {local_path} ({size_gb:.2f} GB)")
        return local_path

    logger.info(f"Weights not found at {local_path}. Downloading from HF...")
    os.makedirs(os.path.dirname(local_path), exist_ok=True)

    # Use huggingface_hub for reliable chunked downloads
    try:
        from huggingface_hub import hf_hub_download
        t0 = time.time()
        downloaded = hf_hub_download(
            repo_id=cfg["hf_repo"],
            filename=cfg["hf_file"],
            local_dir=os.path.dirname(local_path),
            token=HF_TOKEN or None,
        )
        elapsed = time.time() - t0
        logger.info(f"Downloaded in {elapsed:.1f}s → {downloaded}")
        # hf_hub_download may put it in a subdir; move if needed
        if downloaded != local_path and os.path.exists(downloaded):
            import shutil
            shutil.move(downloaded, local_path)
        return local_path
    except Exception as e:
        raise RuntimeError(f"Failed to download {cfg['hf_repo']}/{cfg['hf_file']}: {e}")


def get_model(model_name: str):
    """Load model into memory; reuse across requests in the same worker."""
    global _loaded_llm, _loaded_model_name

    if _loaded_llm is not None and _loaded_model_name == model_name:
        return _loaded_llm

    cfg = MODEL_CONFIGS.get(model_name)
    if cfg is None:
        raise ValueError(f"Unknown model '{model_name}'. Valid: {list(MODEL_CONFIGS.keys())}")

    # Ensure weights present (download on first cold start)
    local_path = ensure_weights(cfg)

    from llama_cpp import Llama

    # Probe CUDA availability: llama_cpp exposes LLAMA_SUPPORTS_GPU_OFFLOAD when
    # built with CUDA. Fall back to CPU (n_gpu_layers=0) if not present.
    try:
        import llama_cpp as _lc
        cuda_ok = getattr(_lc, "LLAMA_SUPPORTS_GPU_OFFLOAD", False)
        n_gpu_layers = -1 if cuda_ok else 0
    except Exception:
        n_gpu_layers = -1  # attempt GPU; llama.cpp logs a warning if CUDA absent
    logger.info(f"CUDA probe → n_gpu_layers={n_gpu_layers}")

    logger.info(f"Loading {model_name}...")
    t0 = time.time()
    llm = Llama(
        model_path=local_path,
        n_ctx=2048,
        n_gpu_layers=n_gpu_layers,
        verbose=True,  # verbose so startup info appears in RunPod worker logs
    )
    elapsed = time.time() - t0
    logger.info(f"Loaded {model_name} in {elapsed:.1f}s")

    _loaded_llm = llm
    _loaded_model_name = model_name
    return llm


def handler(job):
    """
    RunPod serverless job handler.

    Input schema:
      {
        "model": "the-galilean" | "den-of-thieves" | "spectre" | "osawatomie" | "north-star",
        "prompt": "string (max 2000 chars)",
        "max_tokens": int (optional, default per-model, hard cap 1024),
        "temperature": float (optional, default per-model)
      }

    Returns:
      {
        "output": {
          "text": "string",
          "model": "the-galilean",
          "display_name": "The Galilean (Jesus, measured)",
          "tokens": int,
          "elapsed_s": float
        }
      }
    """
    job_input = job.get("input", {})

    # ── Validate ──────────────────────────────────────────────────────────────
    model_name = job_input.get("model", "the-galilean")
    if model_name not in MODEL_CONFIGS:
        return {"error": f"Unknown model '{model_name}'. Valid: {sorted(MODEL_CONFIGS.keys())}"}

    prompt = job_input.get("prompt", "").strip()
    if not prompt:
        return {"error": "Empty prompt."}
    if len(prompt) > 2000:
        return {"error": "Prompt too long (max 2000 chars)."}

    cfg = MODEL_CONFIGS[model_name]
    requested_max = job_input.get("max_tokens", cfg["default_max_tokens"])
    max_tokens = min(int(requested_max), MAX_TOKENS_HARD_CAP)
    temperature = float(job_input.get("temperature", cfg["default_temp"]))
    temperature = max(0.0, min(2.0, temperature))

    # ── Load model (downloads weights on first cold start) ───────────────────
    try:
        llm = get_model(model_name)
    except Exception as e:
        logger.error(f"Model load error: {e}")
        return {"error": str(e)}

    # ── Build elicitation prompt ──────────────────────────────────────────────
    full_prompt = cfg["frame_pre"] + prompt + cfg["frame_post"]
    logger.info(f"Generating: model={model_name}, max_tokens={max_tokens}, temp={temperature:.2f}")

    # ── Generate ─────────────────────────────────────────────────────────────
    t0 = time.time()
    try:
        result = llm(
            full_prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            top_p=cfg.get("top_p", 0.9),
            stop=cfg["stops"],
            echo=False,
        )
    except Exception as e:
        logger.error(f"Generation error: {e}")
        return {"error": f"Generation failed: {e}"}

    elapsed = time.time() - t0
    text = result["choices"][0]["text"].strip()
    token_count = result["usage"]["completion_tokens"]

    logger.info(f"Done: {token_count} tokens in {elapsed:.2f}s ({token_count/elapsed:.1f} tok/s)")

    return {
        "output": {
            "text": text,
            "model": model_name,
            "display_name": cfg["display_name"],
            "tokens": token_count,
            "elapsed_s": round(elapsed, 2),
        }
    }


def _prewarm_in_background():
    """
    Download the primary model weights in a background thread so the RunPod
    SDK can start immediately (responding to health checks) while the ~5GB
    download happens concurrently. The first job for the-galilean will block
    briefly in ensure_weights() until the download completes, then load the
    model into GPU.
    """
    import threading

    def _download():
        primary = "the-galilean"
        logger.info(f"Background pre-warm: starting download for {primary}...")
        try:
            ensure_weights(MODEL_CONFIGS[primary])
            logger.info(f"Background pre-warm: {primary} weights ready on volume.")
        except Exception as e:
            logger.error(f"Background pre-warm failed (non-fatal): {e}")

    t = threading.Thread(target=_download, daemon=True)
    t.start()
    return t


if __name__ == "__main__":
    # Kick off weight download in background; RunPod SDK starts immediately.
    _prewarm_in_background()
    runpod.serverless.start({"handler": handler})
