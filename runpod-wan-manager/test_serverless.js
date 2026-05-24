const fs = require('fs');
const path = require('path');
require('dotenv').config();

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
const ENDPOINT_ID = process.argv[2] || process.env.RUNPOD_SERVERLESS_ENDPOINT_ID;

if (!RUNPOD_API_KEY) {
  console.error("Error: RUNPOD_API_KEY is not defined in .env");
  process.exit(1);
}

if (!ENDPOINT_ID) {
  console.log("\n=====================================================================");
  console.log("💡 How to test the Serverless Endpoint:");
  console.log("Once you deploy the serverless endpoint on RunPod, run:");
  console.log("  node test_serverless.js <ENDPOINT_ID>");
  console.log("Or add RUNPOD_SERVERLESS_ENDPOINT_ID to your .env file.");
  console.log("=====================================================================\n");
  process.exit(1);
}

const runpodUrl = `https://api.runpod.ai/v2/${ENDPOINT_ID}`;

async function testServerless() {
  const payload = {
    input: {
      prompt: "cinematic futuristic city at night, high quality, 4k",
      negativePrompt: "blurry, low quality, distorted",
      width: 704,
      height: 704,
      durationSeconds: 5,
      fps: 16,
      seed: 42
    }
  };

  // Optional: Image-to-Video testing
  if (process.argv.includes('--i2v')) {
    console.log("Configuring for Image-to-Video (I2V) test...");
    // Using a sample public image URL for the test
    payload.input.imageUrl = "https://picsum.photos/id/10/704/704.jpg"; 
  }

  console.log(`Submitting serverless job to ${runpodUrl}/run ...`);
  const runRes = await fetch(`${runpodUrl}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RUNPOD_API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  if (!runRes.ok) {
    console.error("Failed to submit job:", await runRes.text());
    return;
  }

  const runData = await runRes.json();
  const jobId = runData.id;
  console.log(`Job submitted successfully! Job ID: ${jobId}`);
  console.log("Polling status (this will start ComfyUI if it's the first run, then generate video)...");

  let isDone = false;
  let dots = 0;
  while (!isDone) {
    await new Promise(r => setTimeout(r, 5000));
    const statusRes = await fetch(`${runpodUrl}/status/${jobId}`, {
      headers: {
        'Authorization': `Bearer ${RUNPOD_API_KEY}`
      }
    });

    if (!statusRes.ok) {
      console.warn("Failed to fetch status, retrying...");
      continue;
    }

    const statusData = await statusRes.json();
    
    if (statusData.status === 'COMPLETED') {
      console.log("\n🎉 Job Completed Successfully!");
      console.log("Result output:", JSON.stringify(statusData.output, null, 2));
      isDone = true;
    } else if (statusData.status === 'FAILED') {
      console.error("\n❌ Job Failed!");
      console.error("Error details:", statusData.error || statusData);
      isDone = true;
    } else {
      dots++;
      process.stdout.write(`Status: ${statusData.status}${'.'.repeat(dots % 4)} \r`);
    }
  }
}

testServerless().catch(console.error);
