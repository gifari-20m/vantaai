#!/bin/bash

# Start ComfyUI in the background from the mounted network volume (/workspace)
echo "Starting ComfyUI from mounted volume on port 8188..."
cd /workspace/ComfyUI

# Activate virtual environment if present
if [ -f "venv/bin/activate" ]; then
    echo "Activating virtual environment venv/bin/activate..."
    source venv/bin/activate
fi

python main.py --listen 127.0.0.1 --port 8188 --output-directory /workspace/ComfyUI/output &

# Wait for ComfyUI to become ready
echo "Waiting for ComfyUI to respond..."
until curl -s http://127.0.0.1:8188/system_stats > /dev/null; do
    sleep 2
done
echo "ComfyUI is ready!"

# Start the RunPod serverless handler from /app
echo "Starting RunPod Serverless Handler..."
# Deactivate virtual environment so we run handler.py in the system python context (which has runpod package)
if command -v deactivate &> /dev/null; then
    deactivate
fi
python /app/handler.py
