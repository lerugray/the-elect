"""
RunPod Serverless Handler — The Elect GGUF serving layer.

Accepts: {"input": {"model": "the-galilean", "prompt": "...", "max_tokens": 400, "temperature": 0.8}}
Returns: {"output": {"text": "...", "model": "the-galilean", "tokens": N}}

Applies each model's persona FRAME + STOP tokens from the embedded registry.
Hard max_tokens cap: 1024.

To add a new model: add an entry to MODEL_CONFIGS below and ensure its GGUF is
present on the network volume at /models/<hf_repo_name>/<filename>.
"""

import runpod
import os
import time
import json
import logging
from llama_cpp import Llama, LlamaTokenizer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODELS_DIR = os.environ.get("MODELS_DIR", "/models")
MAX_TOKENS_HARD_CAP = 1024

# ────────────────────────────────────────────────────────────────────────────────
# Model configuration registry
# Each entry: hf_repo → filename on HF, frame_pre/frame_post = elicitation template,
# stops = list of stop sequences, default_temp, default_max_tokens.
# The "frame" is split into pre/post — the prompt goes between them.
# ────────────────────────────────────────────────────────────────────────────────
MODEL_CONFIGS = {
    "the-galilean": {
        "gguf_path": "/models/the-galilean-7b/the-galilean-qwen2-5-7b-instruct-Q5_K_M.gguf",
        "hf_repo": "lerugray/the-galilean-7b",
        "hf_file": "the-galilean-qwen2-5-7b-instruct-Q5_K_M.gguf",
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
        "gguf_path": "/models/den-of-thieves-7b/den-of-thieves-qwen2-5-7b-instruct-Q5_K_M.gguf",
        "hf_repo": "lerugray/den-of-thieves-7b",
        "hf_file": "den-of-thieves-qwen2-5-7b-instruct-Q5_K_M.gguf",
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
        "gguf_path": "/models/spectre-7b/spectre-qwen2-5-7b-instruct-Q5_K_M.gguf",
        "hf_repo": "lerugray/spectre-7b",
        "hf_file": "spectre-qwen2-5-7b-instruct-Q5_K_M.gguf",
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
        "gguf_path": "/models/osawatomie-7b/osawatomie-v3-qwen2.5-7b-instruct-Q5_K_M.gguf",
        "hf_repo": "lerugray/osawatomie-7b",
        "hf_file": "osawatomie-v3-qwen2.5-7b-instruct-Q5_K_M.gguf",
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
        "gguf_path": "/models/north-star-7b/north-star-qwen2-5-7b-instruct-Q5_K_M.gguf",
        "hf_repo": "lerugray/north-star-7b",
        "hf_file": "north-star-qwen2-5-7b-instruct-Q5_K_M.gguf",
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

# ────────────────────────────────────────────────────────────────────────────────
# Loaded model cache — one model per worker lifetime
# ────────────────────────────────────────────────────────────────────────────────
_loaded_model = None
_loaded_model_name = None


def get_model(model_name: str) -> Llama:
    """Load model into memory, reuse if same model requested again."""
    global _loaded_model, _loaded_model_name

    if _loaded_model is not None and _loaded_model_name == model_name:
        logger.info(f"Cache hit: {model_name}")
        return _loaded_model

    cfg = MODEL_CONFIGS.get(model_name)
    if cfg is None:
        raise ValueError(f"Unknown model: {model_name}. Valid: {list(MODEL_CONFIGS.keys())}")

    gguf_path = cfg["gguf_path"]
    if not os.path.exists(gguf_path):
        raise FileNotFoundError(
            f"GGUF not found at {gguf_path}. "
            f"Ensure network volume is mounted and weights were cached. "
            f"HF source: {cfg['hf_repo']}/{cfg['hf_file']}"
        )

    logger.info(f"Loading {model_name} from {gguf_path}")
    t0 = time.time()
    llm = Llama(
        model_path=gguf_path,
        n_ctx=2048,
        n_gpu_layers=-1,  # offload all layers to GPU
        verbose=False,
    )
    elapsed = time.time() - t0
    logger.info(f"Model loaded in {elapsed:.1f}s")

    _loaded_model = llm
    _loaded_model_name = model_name
    return llm


def build_prompt(cfg: dict, user_prompt: str) -> str:
    """Assemble the elicitation frame around the user's prompt."""
    return cfg["frame_pre"] + user_prompt + cfg["frame_post"]


def handler(job):
    """
    RunPod serverless job handler.

    Input schema:
      {
        "model": "the-galilean" | "den-of-thieves" | "spectre" | "osawatomie" | "north-star",
        "prompt": "string",
        "max_tokens": int (optional, default from config, hard cap 1024),
        "temperature": float (optional, default from config)
      }
    """
    job_input = job.get("input", {})

    # ── Validate inputs ──────────────────────────────────────────────────────
    model_name = job_input.get("model", "the-galilean")
    if model_name not in MODEL_CONFIGS:
        return {"error": f"Unknown model '{model_name}'. Valid: {list(MODEL_CONFIGS.keys())}"}

    prompt = job_input.get("prompt", "").strip()
    if not prompt:
        return {"error": "Empty prompt."}
    if len(prompt) > 2000:
        return {"error": "Prompt too long (max 2000 chars)."}

    cfg = MODEL_CONFIGS[model_name]
    requested_max = job_input.get("max_tokens", cfg["default_max_tokens"])
    max_tokens = min(int(requested_max), MAX_TOKENS_HARD_CAP)
    temperature = float(job_input.get("temperature", cfg["default_temp"]))
    temperature = max(0.0, min(2.0, temperature))  # clamp

    # ── Load / retrieve model ─────────────────────────────────────────────────
    try:
        llm = get_model(model_name)
    except Exception as e:
        logger.error(f"Model load error: {e}")
        return {"error": str(e)}

    # ── Build prompt + generate ───────────────────────────────────────────────
    full_prompt = build_prompt(cfg, prompt)
    logger.info(f"Generating: model={model_name}, max_tokens={max_tokens}, temp={temperature}")

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
            "display_name": {
                "the-galilean": "The Galilean (Jesus, measured)",
                "den-of-thieves": "Jesus of Nazareth (radical)",
                "spectre": "Karl Marx",
                "osawatomie": "John Brown",
                "north-star": "Frederick Douglass",
            }.get(model_name, model_name),
            "tokens": token_count,
            "elapsed_s": round(elapsed, 2),
        }
    }


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
