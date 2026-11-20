
const API_URL = ""; 
// Insert your AI video backend URL here.
// Example: https://your-server.com/api/generate

const generateBtn = document.getElementById("generateBtn");
const promptInput = document.getElementById("prompt");
const statusBox = document.getElementById("status");
const progressBar = document.getElementById("progressBar");

const storyPanel = document.getElementById("storyPanel");
const storyboard = document.getElementById("storyboard");
const resultPanel = document.getElementById("resultPanel");
const videoPreview = document.getElementById("videoPreview");
const downloadLink = document.getElementById("downloadLink");

function setProgress(value, message) {
  progressBar.style.width = value + "%";
  statusBox.textContent = message;
}

function showStoryboard(scenes) {
  storyboard.innerHTML = "";

  scenes.forEach((scene, index) => {
    const div = document.createElement("div");
    div.className = "scene";

    const title = document.createElement("strong");
    title.textContent = "Scene " + (index + 1);

    const description = document.createElement("p");
    description.textContent = scene.description || scene.prompt || "";

    const duration = document.createElement("small");
    duration.textContent = (scene.duration || 0) + " seconds";

    div.append(title, description, duration);
    storyboard.appendChild(div);
  });

  storyPanel.classList.remove("hidden");
}

async function generateMovie() {
  const prompt = promptInput.value.trim();

  if (!prompt) {
    alert("Please enter your movie idea!");
    return;
  }

  if (!API_URL) {
    alert("Connect your AI video backend first. The frontend cannot generate real videos without an AI video service.");
    return;
  }

  generateBtn.disabled = true;
  resultPanel.classList.add("hidden");
  storyPanel.classList.add("hidden");

  setProgress(5, "Connecting to AI Movie Director...");

  try {
    // Start generation
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt,
        style: document.getElementById("style").value,
        duration: 60,
        quality: "360p",
        resolution: "640x360",
        language: document.getElementById("language").value
      })
    });

    if (!response.ok) {
      throw new Error("Unable to start video generation.");
    }

    const data = await response.json();

    if (data.scenes) {
      showStoryboard(data.scenes);
    }

    if (!data.jobId) {
      if (data.videoUrl) {
        finishMovie(data.videoUrl);
        return;
      }
      throw new Error("The server did not return a generation job ID.");
    }

    setProgress(15, "AI is creating your movie scenes...");

    // Check generation status
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 5000));

      const statusResponse = await fetch(
        API_URL + "/" + encodeURIComponent(data.jobId)
      );

      if (!statusResponse.ok) {
        throw new Error("Unable to check video generation status.");
      }

      const job = await statusResponse.json();

      setProgress(
        Math.min(95, job.progress || 20),
        job.message || "Generating your movie..."
      );

      if (job.status === "completed" && job.videoUrl) {
        finishMovie(job.videoUrl);
        break;
      }

      if (job.status === "failed") {
        throw new Error(job.error || "Video generation failed.");
      }
    }

  } catch (error) {
    statusBox.textContent = "Error: " + error.message;
    console.error(error);
  } finally {
    generateBtn.disabled = false;
  }
}

function finishMovie(videoUrl) {
  videoPreview.src = videoUrl;
  downloadLink.href = videoUrl;
  resultPanel.classList.remove("hidden");

  setProgress(100, "Your movie is ready!");

  resultPanel.scrollIntoView({
    behavior: "smooth"
  });
}

generateBtn.addEventListener("click", generateMovie);
