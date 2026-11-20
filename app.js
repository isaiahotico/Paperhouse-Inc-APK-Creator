
let currentPlan = null;

const $ = id => document.getElementById(id);

function setStatus(message, error = false) {
  $("status").textContent = message;
  $("status").style.color = error ? "#ff8888" : "#aaaabd";
}

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Something went wrong.");
  }

  return data;
}

function formatTime(seconds) {
  const s = Math.floor(Number(seconds) || 0);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function srtTime(seconds) {
  const ms = Math.round(Number(seconds || 0) * 1000);

  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const m = String(Math.floor(ms % 3600000 / 60000)).padStart(2, "0");
  const s = String(Math.floor(ms % 60000 / 1000)).padStart(2, "0");
  const z = String(ms % 1000).padStart(3, "0");

  return `${h}:${m}:${s},${z}`;
}

// GENERATE STORYBOARD

$("generateBtn").addEventListener("click", async () => {
  const prompt = $("prompt").value.trim();

  if (!prompt) {
    setStatus("Please enter your video prompt.", true);
    return;
  }

  const button = $("generateBtn");
  button.disabled = true;

  setStatus("Gemini AI is developing your story...");

  try {
    const result = await api("/api/plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt,
        duration: Number($("duration").value),
        resolution: $("resolution").value,
        style: $("style").value,
        language: $("language").value,
        captionsEnabled: $("captionsEnabled").checked
      })
    });

    currentPlan = result.plan;

    renderScenes(currentPlan);

    setStatus(
      `Storyboard created successfully. ${currentPlan.scenes.length} scenes generated.`
    );

  } catch (error) {
    setStatus(error.message, true);
  } finally {
    button.disabled = false;
  }
});

// DISPLAY SCENES AND CAPTIONS

function renderScenes(plan) {
  const container = $("sceneList");

  container.innerHTML = "";

  const heading = document.createElement("div");
  heading.className = "scene";

  const project = document.createElement("div");
  project.textContent = "PROJECT";

  const details = document.createElement("div");

  const title = document.createElement("h3");
  title.textContent = plan.title || "AI Video Project";

  const summary = document.createElement("p");
  summary.textContent = plan.summary || "";

  details.append(title, summary);
  heading.append(project, details);

  container.appendChild(heading);

  plan.scenes.forEach(scene => {
    const article = document.createElement("article");
    article.className = "scene";

    const time = document.createElement("div");
    time.className = "scene-time";
    time.textContent =
      `${formatTime(scene.start)} - ${formatTime(scene.end)}`;

    const content = document.createElement("div");

    const name = document.createElement("h3");
    name.textContent = `SCENE ${scene.number}`;

    const visual = document.createElement("p");
    visual.textContent = scene.visual_prompt || "";

    const dialogue = document.createElement("p");
    dialogue.textContent = `Dialogue: ${scene.dialogue || "None"}`;

    const caption = document.createElement("p");
    caption.className = "caption";
    caption.textContent =
      `CC: ${scene.caption || scene.dialogue || ""}`;

    const sound = document.createElement("p");
    sound.textContent = `Sound: ${scene.sound || "None"}`;

    content.append(
      name,
      visual,
      dialogue,
      caption,
      sound
    );

    article.append(time, content);
    container.appendChild(article);
  });

  $("exportSrtBtn").disabled = false;
  $("compileBtn").disabled = false;
}

// DOWNLOAD CAPTIONS

function createSRT() {
  if (!currentPlan) return "";

  return currentPlan.scenes.map((scene, index) => {
    return `${index + 1}
${srtTime(scene.start)} --> ${srtTime(scene.end)}
${scene.caption || scene.dialogue || ""}
`;
  }).join("\n");
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$("exportSrtBtn").addEventListener("click", () => {
  if (!currentPlan) return;

  downloadFile(
    createSRT(),
    "paperhouse-captions.srt",
    "application/x-subrip"
  );
});

// COMPILE VIDEO

$("compileBtn").addEventListener("click", async () => {
  const files = $("videoFiles").files;

  if (!files.length) {
    $("compileStatus").textContent =
      "Please upload your generated video clips first.";
    return;
  }

  const button = $("compileBtn");
  button.disabled = true;

  $("compileStatus").textContent =
    "Uploading and compiling your video...";

  try {
    const form = new FormData();

    for (const file of files) {
      form.append("clips", file);
    }

    form.append("resolution", $("resolution").value);

    const captions = $("burnCaptions").checked && currentPlan
      ? currentPlan.scenes.map(scene => ({
          start: scene.start,
          end: scene.end,
          caption: scene.caption || scene.dialogue || ""
        }))
      : [];

    form.append("captions", JSON.stringify(captions));

    const result = await api("/api/compile", {
      method: "POST",
      body: form
    });

    // VIDEO PREVIEW

    const preview = $("videoPreview");
    preview.innerHTML = "";

    const video = document.createElement("video");
    video.controls = true;
    video.playsInline = true;
    video.src = result.videoUrl;

    preview.appendChild(video);

    // DOWNLOAD MP4

    const download = $("downloadBtn");
    download.href = result.videoUrl;
    download.classList.remove("disabled");
    download.download = "paperhouse-ai-video.mp4";

    // DOWNLOAD SRT

    if (result.captionsUrl) {
      const srt = $("downloadSrtBtn");
      srt.href = result.captionsUrl;
      srt.classList.remove("disabled");
      srt.download = "paperhouse-captions.srt";
    }

    $("compileStatus").textContent =
      "Video compilation complete! Your MP4 is ready.";

  } catch (error) {
    $("compileStatus").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

// SERVER CONNECTION

async function checkConnection() {
  try {
    const result = await api("/api/health");

    $("connectionStatus").textContent =
      `Server connected | Gemini: ${
        result.geminiConfigured ? "Connected" : "API key missing"
      } | Video engine: ${
        result.videoProviderConfigured ? "Configured" : "Not connected"
      }`;

  } catch {
    $("connectionStatus").textContent =
      "Server offline. Start the Node.js backend.";
  }
}

checkConnection();
