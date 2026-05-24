import os
import json
import time
import urllib.request
import requests
import runpod

COMFYUI_URL = "http://127.0.0.1:8188"

def download_file(url, save_path):
    print(f"Downloading input file: {url} -> {save_path}")
    urllib.request.urlretrieve(url, save_path)
    return save_path

def get_comfyui_history(prompt_id):
    url = f"{COMFYUI_URL}/history/{prompt_id}"
    response = requests.get(url)
    if response.status_code == 200:
        return response.json()
    return {}

def submit_workflow(workflow):
    url = f"{COMFYUI_URL}/prompt"
    payload = {"prompt": workflow}
    response = requests.post(url, json=payload)
    if response.status_code == 200:
        return response.json()
    raise Exception(f"ComfyUI prompt submission failed: {response.text}")

def handler(event):
    input_data = event.get("input", {})
    
    # 1. Parse request parameters
    prompt = input_data.get("prompt", "")
    negative_prompt = input_data.get("negativePrompt", "")
    width = input_data.get("width", 704)
    height = input_data.get("height", 704)
    duration_seconds = input_data.get("durationSeconds", 5)
    fps = input_data.get("fps", 16)
    seed = input_data.get("seed", -1)
    
    # Optional files for I2V/V2V
    image_url = input_data.get("imageUrl", None)
    video_url = input_data.get("videoUrl", None)
    
    # If seed is -1, randomize it
    if seed == -1:
        import random
        seed = random.randint(1, 10**9)
        
    total_frames = int(max(24, duration_seconds * fps))
    
    # 2. Get workflow structure
    custom_workflow = input_data.get("workflow", None)
    if custom_workflow:
        print("Using custom workflow supplied in event payload")
        workflow = custom_workflow
    else:
        # Load default Text-to-Video / Image-to-Video workflow
        print("Loading default wan2.2-ti2v-5b.json workflow")
        default_path = "/app/workflows/wan2.2-ti2v-5b.json"
        if not os.path.exists(default_path):
            # Fallback path
            default_path = "./workflows/wan2.2-ti2v-5b.json"
            
        with open(default_path, "r") as f:
            workflow = json.load(f)
            
    # 3. Handle downloads if custom urls are passed
    if image_url:
        input_image_path = "/workspace/ComfyUI/input/serverless_input_image.png"
        download_file(image_url, input_image_path)
        
        # Check if we have a LoadImage node
        has_load_image = any(node.get("class_type") == "LoadImage" for node in workflow.values())
        
        if not has_load_image:
            print("No LoadImage node found in workflow. Dynamically converting T2V workflow to I2V workflow...")
            # We will insert a LoadImage node at "6" (replacing/overwriting EmptyLatentImage)
            workflow["6"] = {
                "inputs": {
                    "image": "serverless_input_image.png",
                    "upload": "image"
                },
                "class_type": "LoadImage"
            }
            # We insert a VAEEncode node at "11"
            workflow["11"] = {
                "inputs": {
                    "pixels": [ "6", 0 ],
                    "vae": [ "2", 0 ]
                },
                "class_type": "VAEEncode"
            }
            # Update KSampler (usually "7") to take latent_image from VAEEncode (11) and set denoise to 0.8
            if "7" in workflow and workflow["7"].get("class_type") == "KSampler":
                workflow["7"]["inputs"]["latent_image"] = [ "11", 0 ]
                workflow["7"]["inputs"]["denoise"] = 0.8
                print("KSampler (7) patched for I2V: latent_image set to node 11, denoise set to 0.8")
            else:
                # Find any KSampler and patch it
                for node_id, node in workflow.items():
                    if node.get("class_type") == "KSampler":
                        node["inputs"]["latent_image"] = [ "11", 0 ]
                        node["inputs"]["denoise"] = 0.8
                        print(f"KSampler ({node_id}) patched for I2V: latent_image set to node 11, denoise set to 0.8")
        else:
            # Just patch the existing LoadImage node
            for node_id, node in workflow.items():
                if node.get("class_type") == "LoadImage":
                    node["inputs"]["image"] = "serverless_input_image.png"
                    print(f"Patched LoadImage Node {node_id} with serverless_input_image.png")

    if video_url:
        input_video_path = "/workspace/ComfyUI/input/serverless_input_video.mp4"
        download_file(video_url, input_video_path)
        # Find LoadVideo node (usually class_type="LoadVideo") and patch it
        for node_id, node in workflow.items():
            if node.get("class_type") in ["LoadVideo", "VHS_LoadVideo"]:
                if "inputs" in node:
                    node["inputs"]["video"] = input_video_path
                    print(f"Patched LoadVideo Node {node_id} with {input_video_path}")
                    
    # Patch FPS
    if "9" in workflow and workflow["9"].get("class_type") in ["CreateVideo", "VHS_VideoCombine"]:
        workflow["9"]["inputs"]["fps"] = fps
        print(f"Patched FPS Node 9 with {fps}")
    else:
        for node_id, node in workflow.items():
            if node.get("class_type") in ["CreateVideo", "VHS_VideoCombine"]:
                if "inputs" in node and "fps" in node["inputs"]:
                    node["inputs"]["fps"] = fps
                    print(f"Patched FPS Node {node_id} with {fps}")
            
    # 4. Patch main generation parameters in default node structures
    # Patch Positive Prompt (class_type="CLIPTextEncode")
    if "4" in workflow and workflow["4"].get("class_type") == "CLIPTextEncode":
        workflow["4"]["inputs"]["text"] = prompt
    else:
        # Fallback: search for first CLIPTextEncode node with clip input for positive prompt
        for node_id, node in workflow.items():
            if node.get("class_type") == "CLIPTextEncode" and node_id == "4":
                node["inputs"]["text"] = prompt
                
    # Patch Negative Prompt
    if "5" in workflow and workflow["5"].get("class_type") == "CLIPTextEncode":
        workflow["5"]["inputs"]["text"] = negative_prompt

    # Patch Seed in KSampler
    if "7" in workflow and workflow["7"].get("class_type") == "KSampler":
        workflow["7"]["inputs"]["seed"] = seed
    else:
        # Fallback: find any KSampler node and patch its seed
        for node_id, node in workflow.items():
            if node.get("class_type") == "KSampler":
                node["inputs"]["seed"] = seed

    # Patch resolution/frames (EmptyLatentImage)
    if "6" in workflow and workflow["6"].get("class_type") == "EmptyLatentImage":
        workflow["6"]["inputs"]["width"] = width
        workflow["6"]["inputs"]["height"] = height
        workflow["6"]["inputs"]["batch_size"] = total_frames
    else:
        # Fallback: search for EmptyLatentImage
        for node_id, node in workflow.items():
            if node.get("class_type") == "EmptyLatentImage":
                node["inputs"]["width"] = width
                node["inputs"]["height"] = height
                node["inputs"]["batch_size"] = total_frames

    # 5. Submit to local ComfyUI
    print("Submitting workflow to ComfyUI...")
    res = submit_workflow(workflow)
    prompt_id = res.get("prompt_id")
    print(f"Workflow submitted successfully. Prompt ID: {prompt_id}")
    
    # 6. Poll for completion
    completed = False
    max_duration_seconds = 30 * 60  # 30 mins limit
    start_time = time.time()
    
    while time.time() - start_time < max_duration_seconds:
        history = get_comfyui_history(prompt_id)
        if prompt_id in history:
            job_history = history[prompt_id]
            if job_history.get("status", {}).get("completed", False):
                completed = True
                break
            else:
                # ComfyUI returned but not completed successfully (failed/aborted)
                raise Exception("ComfyUI prompt execution failed or aborted during generation.")
        time.sleep(5)
        
    if not completed:
        raise Exception("ComfyUI task timed out on RunPod Serverless worker.")
        
    # 7. Collect output video filename
    output_filename = None
    job_outputs = history[prompt_id].get("outputs", {})
    
    for node_id, node_output in job_outputs.items():
        if "gifs" in node_output and len(node_output["gifs"]) > 0:
            output_filename = node_output["gifs"][0]["filename"]
            break
        if "images" in node_output and len(node_output["images"]) > 0:
            output_filename = node_output["images"][0]["filename"]
            break
        if "videos" in node_output and len(node_output["videos"]) > 0:
            output_filename = node_output["videos"][0]["filename"]
            break
            
    if not output_filename:
        raise Exception("No generated video file was found in ComfyUI history output keys.")
        
    # The output path will be in the output directory
    output_filepath = f"/workspace/ComfyUI/output/{output_filename}"
    print(f"Generated video located at: {output_filepath}")
    
    # Return result details
    # In production, you would upload this file to S3/R2 storage here and return the URL.
    # If S3/R2 variables are set, upload. Otherwise, we can return the path or let RunPod proxy it.
    
    return {
        "success": True,
        "promptId": prompt_id,
        "seed": seed,
        "filename": output_filename,
        "outputPath": output_filepath
    }

if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
