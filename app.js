// ==========================================
// PAPERHOUSE INC. - SMART VIDEO REMIX STUDIO
// ==========================================

const GEMINI_MODEL = "gemini-2.5-flash";

let scenes = [];
let assets = [];
let musicFile = null;
let narrationFile = null;
let ffmpeg = null;
let ffmpegLoaded = false;
let finalVideoURL = null;

const $ = id => document.getElementById(id);

function setStatus(message) {
  $("status").textContent = message;
}

function setProgress(value) {
  $("progressBar").style.width = Math.max(0, Math.min(100, value)) + "%";
}

function setExportStatus(message) {
  $("exportStatus").textContent = message;
}

function setExportProgress(value) {
  $("exportProgress").style.width =
    Math.max(0, Math.min(100, value)) + "%";
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

// ==========================================
// AI PROMPT UNDERSTANDING
// ==========================================

async function generateVideoPlan() {
  const key = $("geminiKey").value.trim();
  const prompt = $("prompt").value.trim();

  if (!key) return alert("Enter your Gemini API key.");
  if (!prompt) return alert("Enter your video prompt.");

  $("generateBtn").disabled = true;
  setProgress(5);
  setStatus("AI is understanding your prompt...");

  try {
    const requestPrompt = `
You are the video director for Paperhouse Inc.

Create a video plan using ONLY existing real-world video footage.
Do not request AI-generated video.

USER VIDEO PROMPT:
${prompt}

STYLE:
${$("style").value}

NARRATION LANGUAGE:
${$("language").value}

Create exactly 6 scenes for a 60-second video.

Return ONLY valid JSON in this format:

{
 "title":"Video title",
 "concept":"Short video concept",
 "narration":"Complete narration script",
 "scenes":[
  {
   "title":"Scene title",
   "description":"What should be shown",
   "searchQuery":"Short practical stock footage search phrase",
   "duration":10,
   "narration":"Scene narration"
  }
 ]
}

Rules:
- Exactly 6 scenes.
- Each scene is 10 seconds.
- Total duration is 60 seconds.
- Search queries must describe footage that could realistically exist.
- Avoid abstract or impossible visual requests.
- Use clear, specific search terms.
- Ensure the scenes form a logical story.
- Do not include video-generation instructions.
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          contents: [{
            parts: [{text: requestPrompt}]
          }],
          generationConfig: {
            temperature: 0.7,
            responseMimeType: "application/json"
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error("Gemini error: " + errorText);
    }

    const data = await response.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!raw) throw new Error("AI returned an empty response.");

    const plan = JSON.parse(raw);
    if (!Array.isArray(plan.scenes) || !plan.scenes.length) {
      throw new Error("AI did not return valid scenes.");
    }

    $("movieTitle").value = plan.title || "Paperhouse Video";
    $("fullScript").value = plan.narration || "";

    scenes = plan.scenes.slice(0, 10).map((scene, index) => ({
      id: crypto.randomUUID(),
      title: scene.title || `Scene ${index + 1}`,
      description: scene.description || "",
      searchQuery: scene.searchQuery || scene.title || prompt,
      duration: Number(scene.duration) || 10,
      narration: scene.narration || "",
      assetId: null,
      searching: false
    }));

    normalizeDurations();
    renderScenes();

    setProgress(20);
    setStatus("AI storyboard ready. Searching existing footage...");

    await searchAllScenes();

  } catch (error) {
    console.error(error);
    setStatus("Error: " + error.message);
    alert("Could not create the video plan. Check your API key and try again.");
  } finally {
    $("generateBtn").disabled = false;
  }
}

// ==========================================
// VIDEO SEARCH - PEXELS
// ==========================================

async function searchPexels(query) {
  const key = $("pexelsKey").value.trim();

  if (!key) throw new Error("Enter your Pexels API key.");

  const orientation = $("orientation").value;

  const response = await fetch(
    "https://api.pexels.com/videos/search?query=" +
    encodeURIComponent(query) +
    "&per_page=8&orientation=" + orientation,
    {
      headers: {Authorization: key}
    }
  );

  if (!response.ok) {
    throw new Error("Pexels search failed: " + response.status);
  }

  const data = await response.json();

  return (data.videos || []).map(video => {
    const files = (video.video_files || [])
      .filter(file => file.link && file.file_type?.includes("mp4"))
      .sort((a, b) => (a.width || 9999) - (b.width || 9999));

    const selected = files.find(file => (file.width || 9999) >= 360) ||
                     files[0];

    if (!selected) return null;

    return {
      id: crypto.randomUUID(),
      name: `Pexels video ${video.id}`,
      url: selected.link,
      thumbnail: video.image,
      source: "Pexels",
      photographer: video.user?.name || "Unknown",
      creditUrl: video.url || "https://www.pexels.com/",
      duration: video.duration || 0,
      type: "remote",
      file: null
    };
  }).filter(Boolean);
}

async function searchAllScenes() {
  if (!scenes.length) {
    return alert("Create a storyboard first.");
  }

  setStatus("Searching stock video footage...");
  let completed = 0;

  for (const scene of scenes) {
    try {
      scene.searching = true;
      renderScenes();

      const results = await searchPexels(scene.searchQuery);

      results.forEach(asset => {
        asset.searchSceneId = scene.id;
        assets.push(asset);
      });

      if (results.length) {
        scene.assetId = results[0].id;
      }

    } catch (error) {
      console.error(error);
      scene.searchError = error.message;
    }

    scene.searching = false;
    completed++;

    setProgress(20 + completed / scenes.length * 45);
    renderScenes();
    renderAssets();
  }

  setStatus("Footage search finished. Review and edit your scenes.");
}

// ==========================================
// USER VIDEO UPLOADS
// ==========================================

$("videoUpload").addEventListener("change", event => {
  for (const file of event.target.files) {
    const asset = {
      id: crypto.randomUUID(),
      name: file.name,
      url: URL.createObjectURL(file),
      thumbnail: null,
      source: "Your upload",
      type: "local",
      file
    };

    assets.push(asset);
  }

  renderAssets();
  renderScenes();
});

// ==========================================
// AUDIO UPLOADS
// ==========================================

$("musicUpload").addEventListener("change", event => {
  musicFile = event.target.files[0] || null;
});

$("narrationUpload").addEventListener("change", event => {
  narrationFile = event.target.files[0] || null;
});

// ==========================================
// SCENE MANAGEMENT
// ==========================================

function normalizeDurations() {
  if (!scenes.length) return;

  const total = scenes.reduce((sum, scene) => {
    return sum + Math.max(1, Number(scene.duration) || 1);
  }, 0);

  let remaining = 60;

  scenes.forEach((scene, index) => {
    if (index === scenes.length - 1) {
      scene.duration = remaining;
    } else {
      const duration = Math.max(
        1,
        Math.round((Math.max(1, Number(scene.duration) || 1) / total) * 60)
      );

      scene.duration = Math.min(duration, remaining - (scenes.length - index - 1));
      remaining -= scene.duration;
    }
  });
}

function addScene() {
  scenes.push({
    id: crypto.randomUUID(),
    title: "New scene",
    description: "",
    searchQuery: "cinematic landscape",
    duration: 10,
    narration: "",
    assetId: null
  });

  normalizeDurations();
  renderScenes();
}

function removeScene(id) {
  scenes = scenes.filter(scene => scene.id !== id);
  normalizeDurations();
  renderScenes();
}

function updateScene(id, field, value) {
  const scene = scenes.find(item => item.id === id);
  if (!scene) return;

  scene[field] = value;

  if (field === "duration") {
    scene.duration = Math.max(1, Number(value) || 1);
    normalizeDurations();
  }

  renderScenes();
}

function renderScenes() {
  const container = $("sceneList");
  container.innerHTML = "";

  scenes.forEach((scene, index) => {
    const sceneAssets = assets.filter(asset =>
      asset.searchSceneId === scene.id || asset.type === "local"
    );

    const box = document.createElement("div");
    box.className = "scene";

    box.innerHTML = `
      <div class="scene-top">
        <h3>Scene ${index + 1}: ${escapeHTML(scene.title)}</h3>
        <small>${scene.duration} seconds</small>
      </div>

      <label>Scene title</label>
      <input data-field="title" value="${escapeHTML(scene.title)}">

      <label>What should appear?</label>
      <textarea data-field="description">${escapeHTML(scene.description)}</textarea>

      <label>Footage search keywords</label>
      <input data-field="searchQuery" value="${escapeHTML(scene.searchQuery)}">

      <label>Scene narration</label>
      <textarea data-field="narration">${escapeHTML(scene.narration)}</textarea>

      <label>Duration in seconds</label>
      <input data-field="duration" type="number" min="1" max="60"
        value="${scene.duration}">

      <label>Selected footage</label>
      <select data-field="assetId">
        <option value="">Choose footage</option>
        ${sceneAssets.map(asset => `
          <option value="${asset.id}"
            ${scene.assetId === asset.id ? "selected" : ""}>
            ${escapeHTML(asset.name)} (${escapeHTML(asset.source)})
          </option>
        `).join("")}
      </select>

      <div class="row">
        <button class="secondary" data-action="search">Search this scene</button>
        <button class="danger" data-action="remove">Remove scene</button>
      </div>

      ${scene.searching ? "<small>Searching footage...</small>" : ""}
      ${scene.searchError ? `<small>${escapeHTML(scene.searchError)}</small>` : ""}
    `;

    box.querySelectorAll("[data-field]").forEach(input => {
      input.addEventListener("change", () => {
        updateScene(scene.id, input.dataset.field, input.value);
      });
    });

    box.querySelector('[data-action="search"]').onclick = async () => {
      try {
        scene.searching = true;
        renderScenes();

        const results = await searchPexels(scene.searchQuery);
        results.forEach(asset => {
          asset.searchSceneId = scene.id;
          assets.push(asset);
        });

        if (results.length) scene.assetId = results[0].id;

        renderAssets();
        renderScenes();
      } catch (error) {
        scene.searching = false;
        scene.searchError = error.message;
        renderScenes();
      }
    };

    box.querySelector('[data-action="remove"]').onclick = () => {
      removeScene(scene.id);
    };

    container.appendChild(box);
  });
}

// ==========================================
// VIDEO LIBRARY
// ==========================================

function renderAssets() {
  const container = $("assetList");
  container.innerHTML = "";

  assets.forEach(asset => {
    const card = document.createElement("div");
    card.className = "asset";

    card.innerHTML = `
      ${asset.thumbnail
        ? `<img src="${escapeHTML(asset.thumbnail)}" alt="">`
        : `<div style="height:115px;display:grid;place-items:center">VIDEO</div>`}
      <div class="asset-info">
        <strong>${escapeHTML(asset.name)}</strong><br>
        <small>${escapeHTML(asset.source)}</small>
        ${asset.photographer
          ? `<br><small>By ${escapeHTML(asset.photographer)}</small>` : ""}
        ${asset.creditUrl
          ? `<br><a href="${escapeHTML(asset.creditUrl)}" target="_blank" rel="noopener">Source</a>` : ""}
        <button class="secondary">Use in a scene</button>
      </div>
    `;

    card.querySelector("button").onclick = () => {
      if (!scenes.length) return alert("Create scenes first.");

      const target = scenes.find(scene => !scene.assetId) || scenes[0];
      target.assetId = asset.id;

      if (asset.searchSceneId) {
        const matching = scenes.find(s => s.id === asset.searchSceneId);
        if (matching) matching.assetId = asset.id;
      }

      renderScenes();
    };

    container.appendChild(card);
  });
}

// ==========================================
// FFMPEG LOADING
// ==========================================

async function loadFFmpeg() {
  if (ffmpegLoaded) return;

  if (!window.FFmpegWASM || !window.FFmpegUtil) {
    throw new Error("FFmpeg libraries did not load. Check your internet connection.");
  }

  const { FFmpeg } = FFmpegWASM;
  const { toBlobURL } = FFmpegUtil;

  ffmpeg = new FFmpeg();

  ffmpeg.on("progress", ({ progress }) => {
    setExportProgress(Math.round(progress * 100));
  });

  const baseURL =
    "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";

  setExportStatus("Loading video processing engine...");

  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm")
  });

  ffmpegLoaded = true;
}

// ==========================================
// FILE HELPERS
// ==========================================

async function assetToBytes(asset) {
  if (asset.type === "local" && asset.file) {
    return new Uint8Array(await asset.file.arrayBuffer());
  }

  const response = await fetch(asset.url);

  if (!response.ok) {
    throw new Error(
      "Could not download stock footage. It may block browser access. " +
      "Download permitted footage and upload it instead."
    );
  }

  return new Uint8Array(await response.arrayBuffer());
}

function getDimensions() {
  const orientation = $("orientation").value;

  if (orientation === "portrait") return [360, 640];
  if (orientation === "square") return [360, 360];

  return [640, 360];
}

// ==========================================
// AUTOMATIC VIDEO COMPILER
// ==========================================

async function exportVideo() {
  if (!scenes.length) return alert("Create your storyboard first.");

  const selectedScenes = scenes.filter(scene =>
    assets.some(asset => asset.id === scene.assetId)
  );

  if (selectedScenes.length !== scenes.length) {
    return alert("Every scene needs selected footage before exporting.");
  }

  $("exportBtn").disabled = true;
  setExportProgress(0);

  try {
    normalizeDurations();
    await loadFFmpeg();

    const [width, height] = getDimensions();
    const sceneFiles = [];

    // Create a video segment for each scene.
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const asset = assets.find(a => a.id === scene.assetId);

      setExportStatus(
        `Preparing scene ${i + 1} of ${scenes.length}: ${scene.title}`
      );

      const bytes = await assetToBytes(asset);
      const inputName = `input_${i}.mp4`;
      const outputName = `scene_${i}.mp4`;

      await ffmpeg.writeFile(inputName, bytes);

      const duration = Math.max(1, Number(scene.duration) || 1);

      const result = await ffmpeg.exec([
        "-stream_loop", "-1",
        "-i", inputName,
        "-t", String(duration),
        "-vf",
        `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24`,
        "-an",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        outputName
      ]);

      if (result !== 0) {
        throw new Error("Could not compile scene " + (i + 1));
      }

      sceneFiles.push(outputName);

      setExportProgress((i + 1) / scenes.length * 55);
    }

    // Join all scene clips.
    setExportStatus("Combining scenes...");

    const concatText = sceneFiles
      .map(name => `file '${name}'`)
      .join("\n");

    await ffmpeg.writeFile(
      "concat.txt",
      new TextEncoder().encode(concatText)
    );

    let result = await ffmpeg.exec([
      "-f", "concat",
      "-safe", "0",
      "-i", "concat.txt",
      "-c", "copy",
      "joined.mp4"
    ]);

    if (result !== 0) {
      throw new Error("Could not combine the scenes.");
    }

    // Mix uploaded audio.
    setExportStatus("Adding audio and preparing final MP4...");

    const args = ["-i", "joined.mp4"];
    let audioIndex = 1;
    let musicIndex = null;
    let narrationIndex = null;

    if (musicFile) {
      await ffmpeg.writeFile(
        "music",
        new Uint8Array(await musicFile.arrayBuffer())
      );

      args.push("-stream_loop", "-1", "-i", "music");
      musicIndex = audioIndex++;
    }

    if (narrationFile) {
      await ffmpeg.writeFile(
        "narration",
        new Uint8Array(await narrationFile.arrayBuffer())
      );

      args.push("-i", "narration");
      narrationIndex = audioIndex++;
    }

    let filter = "";
    let audioMap = null;

    if (musicIndex !== null && narrationIndex !== null) {
      filter =
        `[${musicIndex}:a]volume=0.18[m];` +
        `[${narrationIndex}:a]volume=1.0[n];` +
        `[m][n]amix=inputs=2:duration=first:dropout_transition=2[a]`;

      audioMap = "[a]";
    } else if (musicIndex !== null) {
      filter = `[${musicIndex}:a]volume=0.22[a]`;
      audioMap = "[a]";
    } else if (narrationIndex !== null) {
      filter = `[${narrationIndex}:a]volume=1.0[a]`;
      audioMap = "[a]";
    }

    args.push("-map", "0:v");

    if (filter) {
      args.push("-filter_complex", filter);
      args.push("-map", audioMap);
      args.push("-c:a", "aac", "-b:a", "128k");
    } else {
      args.push("-an");
    }

    args.push(
      "-t", "60",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "paperhouse_final.mp4"
    );

    result = await ffmpeg.exec(args);

    if (result !== 0) {
      throw new Error(
        "Final export failed. The selected FFmpeg build may not support this encoder."
      );
    }

    const output = await ffmpeg.readFile("paperhouse_final.mp4");

    const blob = new Blob([output], {type: "video/mp4"});

    if (finalVideoURL) URL.revokeObjectURL(finalVideoURL);

    finalVideoURL = URL.createObjectURL(blob);

    $("preview").src = finalVideoURL;

    $("downloadArea").innerHTML = `
      <a href="${finalVideoURL}" download="Paperhouse-Inc-Video.mp4">
        ⬇ Download Your Finished MP4
      </a>
    `;

    setExportProgress(100);
    setExportStatus("Video compilation completed!");

  } catch (error) {
    console.error(error);
    setExportStatus("Export error: " + error.message);
    alert(error.message);
  } finally {
    $("exportBtn").disabled = false;
  }
}
