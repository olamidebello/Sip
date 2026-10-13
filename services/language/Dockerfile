FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir flask==3.1.1 gunicorn==23.0.0 faster-whisper==1.2.0 piper-tts==1.3.0
WORKDIR /app
COPY server.py /app/server.py
RUN useradd -m speech && mkdir /models && chown speech /models
USER speech
ENV HF_HOME=/models/huggingface
CMD ["gunicorn","--bind","0.0.0.0:8000","--workers","1","--threads","2","--timeout","180","server:app"]
