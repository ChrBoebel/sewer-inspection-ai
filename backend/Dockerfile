FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app/backend

RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        tesseract-ocr \
        tesseract-ocr-deu \
        tesseract-ocr-eng \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt backend/requirements-ml.txt ./backend/
# CPU-only torch zuerst — sonst zieht ultralytics auf aarch64 die volle CUDA-Stack
# (~3 GB cudnn/cublas/cufft/nccl/triton), die wir hier nie nutzen.
RUN pip install --upgrade pip \
 && pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision \
 && pip install -r backend/requirements.txt -r backend/requirements-ml.txt

COPY backend/ ./backend/

# Keine Modellgewichte im Image — der Default-Detektor ist der Placeholder.
# Eigene Checkpoints werden über das data/-Volume eingehängt, siehe DATA.md.

EXPOSE 8000
CMD ["uvicorn", "app.main:app", \
     "--app-dir", "backend", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--reload"]
