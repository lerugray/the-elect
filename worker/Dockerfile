# The Elect — RunPod Serverless GGUF Worker
# Base: runpod/base:0.6.1-cuda12.1.0 (official RunPod CUDA base)
# Runtime: llama-cpp-python (CUDA-enabled) + runpod SDK
#
# The GGUF weights are NOT baked into this image.
# They are pre-cached on a RunPod network volume at /models/
# and the volume is attached at endpoint creation time.
# Cold-start = model-load from fast NFS (seconds), not download.

FROM runpod/base:0.6.1-cuda12.1.0

# System deps for llama-cpp-python CUDA build
RUN apt-get update -qq && apt-get install -y --no-install-recommends \
    build-essential cmake git curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt /app/requirements.txt
WORKDIR /app

# Install llama-cpp-python with CUDA support
ENV CMAKE_ARGS="-DGGML_CUDA=on"
ENV FORCE_CMAKE=1
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir \
        "llama-cpp-python[server]" \
        --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu121

# Handler
COPY handler.py /app/handler.py

# Network volume mount point (populated externally)
RUN mkdir -p /models

# RunPod serverless entrypoint
CMD ["python3", "-u", "/app/handler.py"]
