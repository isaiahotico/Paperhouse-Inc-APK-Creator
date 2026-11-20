
const API = "";

const $ = (id) => document.getElementById(id);

let currentPlan = null;

async function checkServer() {
  try {
    const response = await fetch(`${API}/api/health`);
    const data = await response.json();

    $("serverStatus").textContent =
      response.ok && data.geminiConfigured
        ? "AI Connected"
        : "Server Online · Check AI Key";

    $("serverStatus").className =
      response.ok && data.geminiConfigured
        ? "status online"
        : "status warning";
  } catch (error) {
    $("serverStatus").textContent = "Server Offline";
    $("serverStatus").className = "status offline";
  }
}

function showMessage(id, message, error = false) {
  const element = $(id);
  element.textContent = message;
  element.className = error ? "message error" : "message";
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

async function generateStoryboard() {
  const prompt = $("prompt").value.trim();

  if (!prompt) {
    showMessage("message", "Please describe your video idea.", true);
    return;
  }

  const button = $("generateBtn");
  button.disabled = true;
  button.textContent = "AI Processing...";
  showMessage("message", "Understanding your prompt and creating scenes...");

  try {
    const response = await fetch(`${API}/api/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        duration: Number($("duration").value),
        captionsEnabled: $("captions").checked
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to generate storyboard.");
    }

    currentPlan = data.plan || data;

    if (!Array.isArray(currentPlan.scenes) || !currentPlan.scenes.length) {
      throw new Error("The AI did not return any scenes.");
    }

    renderStoryboard(currentPlan);

    $("storyboardSection").classList.remove("hidden");
    $("compileSection").classList.remove("hidden");

    showMessage("message", "Your AI storyboard is ready!");
    $("storyboardSection").scrollIntoView({ behavior: "smooth" });

  } catch (error) {
    showMessage("message", error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "Generate AI Storyboard";
  }
}

function renderStoryboard(plan) {
  $("videoInfo").innerHTML = `
    <h3>${escapeHTML(plan.title || "Untitled Video")}</h3>
    <p class="muted">${escapeHTML(plan.summary || "")}</p>
    <p class="muted">Scenes: ${plan.scenes.length}</p>
  `;

  $("scenes").innerHTML = plan.scenes.map((scene, index) => `
    <article class="scene">
      <div class="scene-top">
        <strong>SCENE ${index + 1}</strong>
        <span>${escapeHTML(scene.start ?? "")} - ${escapeHTML(scene.end ?? "")}</span>
      </div>

      <h3>${escapeHTML(scene.title || `Scene ${index + 1}`)}</h3>

      <p><b>Visual direction</b><br>
      ${escapeHTML(scene.visualPrompt || scene.visual || "")}</p>

      <p><b>Dialogue</b><br>
      ${escapeHTML(scene.dialogue || "")}</p>

      <p><b>Caption</b><br>
      ${escapeHTML(scene.caption || "")}</p>

      <p><b>Sound design</b><br>
      ${escapeHTML(scene.sound || "")}</p>

      <button class="secondary copy-btn" data-copy="${index}">
        Copy Scene Prompt
      </button>
    </article>
  `).join("");

  document.querySelectorAll(".copy-btn").forEach(button => {
    button.addEventListener("click", async () => {
      const scene = currentPlan.scenes[Number(button.dataset.copy)];

      const text = [
        scene.title,
        scene.visualPrompt || scene.visual,
        scene.dialogue,
        scene.caption,
        scene.sound
      ].filter(Boolean).join("\n\n");

      try {
        await navigator.clipboard.writeText(text);
        button.textContent = "Copied!";
        setTimeout(() => button.textContent = "Copy Scene Prompt", 1500);
      } catch {
        showMessage("message", "Unable to copy. Please select the scene text manually.", true);
      }
    });
  });
}

function exportSRT() {
  if (!currentPlan || !currentPlan.scenes) {
    showMessage("message", "Generate a storyboard first.", true);
    return;
  }

  const toSrtTime = (value) => {
    const seconds = Number(value) || 0;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.round((seconds % 1) * 1000);

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
  };

  const subtitles = currentPlan.scenes
    .filter(scene => scene.caption)
    .map((scene, index) => {
      return [
        index + 1,
        `${toSrtTime(scene.start)} --> ${toSrtTime(scene.end)}`,
        scene.caption,
        ""
      ].join("\n");
    }).join("\n");

  const blob = new Blob([subtitles], {
    type: "text/plain;charset=utf-8"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "paperhouse-captions.srt";
  link.click();

  URL.revokeObjectURL(url);
}

async function compileVideo() {
  if (!currentPlan) {
    showMessage("compileMessage", "Create a storyboard first.", true);
    return;
  }

  const files = $("clips").files;

  if (!files.length) {
    showMessage("compileMessage", "Please upload your scene video clips.", true);
    return;
  }

  if (files.length !== currentPlan.scenes.length) {
    showMessage(
      "compileMessage",
      `Upload exactly ${currentPlan.scenes.length} clips, one for each scene.`,
      true
    );
    return;
  }

  const button = $("compileBtn");
  button.disabled = true;
  button.textContent = "Compiling Video...";

  showMessage("compileMessage", "Processing clips and creating your MP4...");

  try {
    const formData = new FormData();

    Array.from(files).forEach(file => {
      formData.append("clips", file);
    });

    formData.append("quality", $("quality").value);
    formData.append("captionsEnabled", String($("captions").checked));
    formData.append("plan", JSON.stringify(currentPlan));

    const response = await fetch(`${API}/api/compile`, {
      method: "POST",
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Video compilation failed.");
    }

    const videoUrl = data.videoUrl || data.url;

    if (!videoUrl) {
      throw new Error("The server did not return a video download URL.");
    }

    const finalUrl = new URL(videoUrl, window.location.origin).href;

    $("preview").src = finalUrl;
    $("downloadBtn").href = finalUrl;
    $("result").classList.remove("hidden");

    showMessage("compileMessage", "Your MP4 video is ready!");
    $("result").scrollIntoView({ behavior: "smooth" });

  } catch (error) {
    showMessage("compileMessage", error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "Compile MP4 Video";
  }
}

$("generateBtn").addEventListener("click", generateStoryboard);
$("exportSrtBtn").addEventListener("click", exportSRT);
$("compileBtn").addEventListener("click", compileVideo);

checkServer();
