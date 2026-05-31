FROM python:3.11-slim AS ai-service

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl libglib2.0-0 libgl1 libgomp1 \
  && rm -rf /var/lib/apt/lists/*

COPY ai_service/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch torchvision \
  && pip install --no-cache-dir -r /tmp/requirements.txt

COPY ai_service ./ai_service

EXPOSE 8001

CMD ["python", "-m", "uvicorn", "ai_service.app.main:app", "--host", "0.0.0.0", "--port", "8001"]
