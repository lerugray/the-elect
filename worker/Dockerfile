# The Elect — RunPod Serverless GGUF Worker
# Base: runpod/base:0.6.1-cuda12.1.0 (official RunPod CUDA base)
# Runtime: llama-cpp-python (CUDA) + huggingface_hub + runpod SDK
#
# Weight caching pattern:
#   - Network volume at /models/ is attached to the RunPod serverless endpoint.
#   - On first cold start: handler downloads GGUF from HF → /models/<model>/<file>.gguf
#   - On subsequent cold starts: file exists → skip download → model-load only (~seconds).
#   - The HF_TOKEN env var is set as a RunPod secret so private repos are accessible.

FROM runpod/base:0.6.1-cuda12.1.0

# System deps for llama-cpp-python CUDA build
RUN apt-get update -qq && apt-get install -y --no-install-recommends \
    build-essential cmake git curl ca-certificates wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python base deps (runpod SDK + hf_hub for weight download)
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# llama-cpp-python with CUDA support (built from source with GPU offload)
ENV CMAKE_ARGS="-DGGML_CUDA=on"
ENV FORCE_CMAKE=1
RUN pip install --no-cache-dir \
    "llama-cpp-python" \
    --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu121

# Handler
COPY handler.py /app/handler.py

# Network volume mount point (populated by handler on first run)
RUN mkdir -p /models

# Env vars (non-secret defaults; secret HF_TOKEN injected at endpoint creation)
ENV MODELS_DIR=/models

# RunPod serverless entrypoint
CMD ["python3", "-u", "/app/handler.py"]
