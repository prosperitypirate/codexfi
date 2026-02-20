FROM python:3.13-slim

WORKDIR /app

# Install dependencies first so this layer is cached independently of code changes
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application package
COPY app/ ./app/

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--log-level", "info"]
