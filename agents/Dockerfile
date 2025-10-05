FROM python:3.12-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy agent service code
COPY . .

# Add vendored SDK to Python path
ENV PYTHONPATH=/app/external/openai-agents-python/src:$PYTHONPATH

# Expose health check port
EXPOSE 8000

# Run the agent service
CMD ["python", "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
