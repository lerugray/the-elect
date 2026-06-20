# The Elect — RunPod Serverless GGUF Worker
# Base: runpod/base:0.6.1-cuda12.1.0 (official RunPod CUDA base)
# Runtime: llama-cpp-python (CUDA prebuilt wheel) + huggingface_hub + runpod SDK
#
# Weight caching pattern:
#   - Network volume at /models/ is attached to the RunPod serverless endpoint.
#   - On first cold start: handler downloads GGUF from HF → /models/<model>/<file>.gguf
#   - On subsequent cold starts: file exists → skip download → model-load only (~seconds).
#   - The HF_TOKEN env var is set as a RunPod secret so private repos are accessible.

FROM runpod/base:0.6.1-cuda12.1.0

# System deps
RUN apt-get update -qq && apt-get install -y --no-install-recommends \
    curl ca-certificates wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python base deps (runpod SDK + hf_hub for weight download)
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# llama-cpp-python with CUDA support: install prebuilt cu121 wheel directly.
# abetlen publishes cu121-compiled wheels; v0.3.31-cu121 is the py3-none universal
# wheel (1.8GB, includes CUDA .so). --only-binary prevents falling back to source.
RUN pip install --no-cache-dir \
    "llama-cpp-python==0.3.31" \
    --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu121 \
    --only-binary llama-cpp-python

# Handler
COPY handler.py /app/handler.py

# Network volume mount point (populated by handler on first run)
RUN mkdir -p /models

# Env vars (non-secret defaults; secret HF_TOKEN injected at endpoint creation)
ENV MODELS_DIR=/models

# RunPod serverless entrypoint
CMD ["python3", "-u", "/app/handler.py"]
