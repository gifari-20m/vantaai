FROM runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04

# Install curl and other packages
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Install RunPod Python SDK and dependencies
RUN pip install --no-cache-dir runpod requests

# Set working directory to app (to avoid conflict with /workspace volume mount)
WORKDIR /app

# Copy handler, start scripts, and default workflows to /app
COPY handler.py /app/handler.py
COPY start.sh /app/start.sh
COPY workflows/ /app/workflows/

# Make start.sh executable
RUN chmod +x /app/start.sh

# Start using the shell script entrypoint from /app
CMD ["/app/start.sh"]
