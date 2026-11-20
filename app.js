// ============================================
// PAPERHOUSE INC. 2.0
// SMART VIDEO REMIX STUDIO
// ============================================

const $ = id => document.getElementById(id);

let scenes = [];
let assets = [];
let musicFile = null;
let narrationFile = null;
let ffmpeg = null;
let ffmpegLoaded = false;
let finalVideoURL = null;
let isGenerating = false;
let isExporting = false;

const uid = () =>
  crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now() + "-" + Math.random().toString(16).slice(2);

function setStatus(message) {
  $("status").textContent = message;
}

function setProgress(value) {
  $("progressBar").style.width =
    Math.max(0, Math.min(100, value)) + "%";
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

async function getJSON(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return data;
}

// ============================================
// SYSTEM HEALTH
// ============================================

async function checkSystem() {
  try {
    const data = await getJSON("/api/health");

    $("systemStatus").textContent =
      `Server: ${data.status} | Gemini: ${data.gemini ? "Configured" : "Not configured"} | Pexels: ${data.pexels ? "Configured" : "Not configured"}`;

    if (!data.gemini || !data.pexels) {
      $("systemStatus").textContent +=
        " — An administrator needs to configure the missing API key.";
    }
  } catch (error) {
    $("systemStatus").textContent =
      "Cannot connect to Paperhouse server: " + error.message;
  }
}

// ============================================
// GEMINI PROMPT-TO-STORYBOARD
// ============================================

async function generateVideoPlan() {
  if (isGenerating) return;

  const prompt = $("prompt").value.trim();

  if (!prompt) {
    alert("Please describe the video you want to create.");
    return;
  }

  isGenerating = true;
  $("generateBtn").disabled = true;
  setProgress(5);
  setStatus("Gemini is understanding your video prompt...");

  try {
    const data = await getJSON("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        style: $("style").value,
        language: $("language").value
      })
    });

    if (!Array.isArray(data.scenes) || !data.scenes.length) {
      throw new Error("The AI returned no scenes.");
    }

    $("movieTitle").value = data.title || "Paperhouse Video";
    $("fullScript").value = data.narration || "";

    scenes = data.scenes.map((scene, index) => ({
      id: uid(),
      title: scene.title || `Scene ${index + 1}`,
      description: scene.description || "",
      searchQuery: scene.searchQuery || scene.title || prompt,
      duration: 10,
      narration: scene.narration || "",
      assetId: null,
      searching: false,
      searchError: ""
    }));

    renderScenes();
    setProgress(15);
    setStatus("Storyboard created. Finding matching existing footage...");

    await searchAllScenes();

  } catch (error) {
    console.error(error);
    setStatus("Storyboard error: " + error.message);
    alert(error.message);
  } finally {
    isGenerating = false;
    $("generateBtn").disabled = false;
  }
}

// ============================================
// PEXELS VIDEO SEARCH
// ============================================

async function searchPexels(query) {
  const params = new URLSearchParams({
    q: query,
    orientation: $("orientation").value
  });

  const data = await getJSON("/api/search?" + params.toString());
  return data.videos || [];
}

async function searchAllScenes() {
  if (!scenes.length) {
    alert("Create a storyboard first.");
    return;
  }

  setStatus("Searching footage for each scene...");

  let completed = 0;

  for (const scene of scenes) {
    scene.searching = true;
    scene.searchError = "";
    renderScenes();

    try {
      const results = await searchPexels(scene.searchQuery);

      results.forEach(asset => {
        asset.id = uid();
        asset.searchSceneId = scene.id;
        asset.type = "remote";
        assets.push(asset);
      });

      if (results.length) {
        scene.assetId = results[0].id;
      } else {
        scene.searchError = "No matching stock videos found.";
      }

    } catch (error) {
      scene.searchError = error.message;
    }

    scene.searching = false;
    completed++;

    setProgress(15 + (completed / scenes.length) * 55);
    renderScenes();
    renderAssets();
  }

  const ready = scenes.filter(scene => scene.assetId).length;

  setStatus(
    `Footage search finished. ${ready} of ${scenes.length} scenes have footage. Review your storyboard.`
  );
}

// ============================================
// SCENE MANAGEMENT
// ============================================

function addScene() {
  if (scenes.length >= 20) {
    alert("Maximum 20 scenes.");
    return;
  }

  scenes.push({
    id: uid(),
    title: "New scene",
    description: "",
    searchQuery: "cinematic landscape",
    duration: 10,
    narration: "",
    assetId: null,
    searching: false,
    searchError: ""
  });

  normalizeDurations();
  renderScenes();
}

function removeScene(id) {
  scenes = scenes.filter(scene => scene.id !== id);
  normalizeDurations();
  renderScenes();
}

function moveScene(id, direction) {
  const index = scenes.findIndex(scene => scene.id === id);
  const target = index + direction;

  if (index < 0 || target < 0 || target >= scenes.length) return;

  [scenes[index], scenes[target]] =
    [scenes[target], scenes[index]];

  renderScenes();
}

function normalizeDurations() {
  if (!scenes.length) return;

  const count = scenes.length;

  if (count > 60) return;

  let total = scenes.reduce(
    (sum, scene) => sum + Math.max(1, Number(scene.duration) || 1),
    0
  );

  let remaining = 60;

  scenes.forEach((scene, index) => {
    if (index === count - 1) {
      scene.duration = remaining;
      return;
    }

    const minimumForRest = count - index - 1;
    let next = Math.round(
      Math.max(1, Number(scene.duration) || 1) / total * 60
    );

    next = Math.max(1, Math.min(next, remaining - minimumForRest));

    scene.duration = next;
    remaining -= next;
  });
}

function updateScene(id, field, value) {
  const scene = scenes.find(item => item.id === id);
  if (!scene) return;

  if (field === "duration") {
    scene.duration = Math.max(1, Number(value) || 1);
    normalizeDurations();
  } else {
    scene[field] = value;
  }

  renderScenes();
}

async function searchOneScene(id) {
  const scene = scenes.find(item => item.id === id);
  if (!scene) return;

  scene.searching = true;
  scene.searchError = "";
  renderScenes();

  try {
    const results = await searchPexels(scene.searchQuery);

    results.forEach(asset => {
      asset.id = uid();
      asset.searchSceneId = scene.id;
      asset.type = "remote";
      assets.push(asset);
    });

    if (results.length) {
      scene.assetId = results[0].id;
    } else {
      scene.searchError = "No footage found for this search.";
    }
  } catch (error) {
    scene.searchError = error.message;
  }

  scene.searching = false;
  renderAssets();
  renderScenes();
}

function renderScenes() {
  const container = $("sceneList");
  container.innerHTML = "";

  scenes.forEach((scene, index) => {
    const sceneAssets = assets.filter(asset =>
      asset.searchSceneId === scene.id || asset.type === "local"
    );

    const selectedAsset = assets.find(a => a.id === scene.assetId);

    const box = document.createElement("div");
    box.className = "scene";

    box.innerHTML = `
      <h3>Scene ${index + 1}: ${escapeHTML(scene.title)}</h3>

      ${selectedAsset?.thumbnail
        ? `<img src="${escapeHTML(selectedAsset.thumbnail)}" alt="Selected footage">`
        : ""}

      <label>Scene title</label>
      <input data-field="title" value="${escapeHTML(scene.title)}">

      <label>Visual description</label>
      <textarea data-field="description">${escapeHTML(scene.description)}</textarea>

      <label>Stock video search keywords</label>
      <input data-field="searchQuery" value="${escapeHTML(scene.searchQuery)}">

      <label>Narration for this scene</label>
      <textarea data-field="narration">${escapeHTML(scene.narration)}</textarea>

      <label>Duration (seconds)</label>
      <input type="number" min="1" max="60"
        data-field="duration" value="${scene.duration}">

      <label>Select footage</label>
      <select data-field="assetId">
        <option value="">Select footage</option>
        ${sceneAssets.map(asset => `
          <option value="${asset.id}"
            ${scene.assetId === asset.id ? "selected" : ""}>
            ${escapeHTML(asset.name)} — ${escapeHTML(asset.source)}
          </option>
        `).join("")}
      </select>

      <small>Duration: ${scene.duration}s</small>
      ${scene.searching ? "<p>Searching...</p>" : ""}
      ${scene.searchError ? `<p>${escapeHTML(scene.searchError)}</p>` : ""}

      <div class="row">
        <button class="secondary" data-action="search">Find footage</button>
        <button class="secondary" data-action="up">Move up</button>
        <button class="secondary" data-action="down">Move down</button>
        <button class="danger" data-action="remove">Remove</button>
      </div>
    `;

    box.querySelectorAll("[data-field]").forEach(input => {
      input.addEventListener("change", () => {
        updateScene(scene.id, input.dataset.field, input.value);
      });
    });

    box.querySelector('[data-action="search"]').onclick =
      () => searchOneScene(scene.id);

    box.querySelector('[data-action="up"]').onclick =
      () => moveScene(scene.id, -1);

    box.querySelector('[data-action="down"]').onclick =
      () => moveScene(scene.id, 1);

    box.querySelector('[data-action="remove"]').onclick =
      () => removeScene(scene.id);

    container.appendChild(box);
  });

  const total = scenes.reduce(
    (sum, scene) => sum + Number(scene.duration || 0),
    0
  );

  if (scenes.length) {
    const summary = document.createElement("p");
    summary.className = "muted";
    summary.textContent =
      `${scenes.length} scenes · ${total} seconds total`;
    container.prepend(summary);
  }
}

// ============================================
// USER UPLOADS
// ============================================

$("videoUpload").addEventListener("change", event => {
  for (const file of event.target.files || []) {
    if (!file.type.startsWith("video/")) continue;

    assets.push({
      id: uid(),
      name: file.name,
      url: URL.createObjectURL(file),
      thumbnail: null,
      source: "Your upload",
      type: "local",
      file
    });
  }

  renderAssets();
  renderScenes();
});

$("musicUpload").addEventListener("change", event => {
  musicFile = event.target.files[0] || null;
});

$("narrationUpload").addEventListener("change", event => {
  narrationFile = event.target.files[0] || null;
});

function renderAssets() {
  const container = $("assetList");
  container.innerHTML = "";

  assets.forEach(asset => {
    const card = document.createElement("div");
    card.className = "asset";

    card.innerHTML = `
      ${asset.thumbnail
        ? `<img src="${escapeHTML(asset.thumbnail)}" alt="">`
        : `<div style="height:110px;display:grid;place-items:center">VIDEO</div>`}

      <div class="asset-info">
        <strong>${escapeHTML(asset.name)}</strong><br>
        <small>${escapeHTML(asset.source)}</small>

        ${asset.photographer
          ? `<br><small>Photographer: ${escapeHTML(asset.photographer)}</small>`
          : ""}

        ${asset.sourceUrl
          ? `<br><a href="${escapeHTML(asset.sourceUrl)}" target="_blank" rel="noopener">View source</a>`
          : ""}

        <button class="secondary">Use in scene</button>
      </div>
    `;

    card.querySelector("button").onclick = () => {
      const target = scenes.find(scene => !scene.assetId) || scenes[0];

      if (!target) return alert("Create a scene first.");

      target.assetId = asset.id;
      renderScenes();
    };

    container.appendChild(card);
  });
}

// ============================================
// FFMPEG
// ============================================

async function loadFFmpeg() {
  if (ffmpegLoaded) return;

  if (!window.FFmpegWASM || !window.FFmpegUtil) {
    throw new Error(
      "FFmpeg libraries could not load. Check your connection or browser."
    );
  }

  const { FFmpeg } = window.FFmpegWASM;
  const { toBlobURL } = window.FFmpegUtil;

  ffmpeg = new FFmpeg();

  ffmpeg.on("progress", ({ progress }) => {
    setExportProgress(10 + Math.round(progress * 75));
  });

  const base =
    "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";

  setExportStatus("Loading video processing engine...");

  await ffmpeg.load({
    coreURL: await toBlobURL(
      `${base}/ffmpeg-core.js`,
      "text/javascript"
    ),
    wasmURL: await toBlobURL(
      `${base}/ffmpeg-core.wasm`,
      "application/wasm"
    )
  });

  ffmpegLoaded = true;
}

function videoDimensions() {
  const orientation = $("orientation").value;

  if (orientation === "portrait") return [360, 640];
  if (orientation === "square") return [360, 360];

  return [640, 360];
}

function extensionFromName(name, fallback) {
  const match = String(name).match(/\.([a-zA-Z0-9]{2,5})$/);
  return match ? match[1].toLowerCase() : fallback;
}

async function writeAssetToFFmpeg(asset, filename) {
  let bytes;

  if (asset.type === "local" && asset.file) {
    bytes = new Uint8Array(await asset.file.arrayBuffer());
  } else {
    const response = await fetch(asset.url);

    if (!response.ok) {
      throw new Error("Unable to download selected footage: " + asset.name);
    }

    bytes = new Uint8Array(await response.arrayBuffer());
  }

  await ffmpeg.writeFile(filename, bytes);
}

async function writeAudioToFFmpeg(file, filename) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  await ffmpeg.writeFile(filename, bytes);
}

// ============================================
// VIDEO COMPILER
// ============================================

async function exportVideo() {
  if (isExporting) return;

  if (!scenes.length) {
    return alert("Create a storyboard first.");
  }

  if (scenes.some(scene =>
    !assets.some(asset => asset.id === scene.assetId)
  )) {
    return alert("Please select footage for every scene.");
  }

  isExporting = true;
  $("exportBtn").disabled = true;
  setExportProgress(0);

  try {
    normalizeDurations();

    await loadFFmpeg();

    const [width, height] = videoDimensions();
    const sceneFiles = [];

    // Compile individual scenes.
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const asset = assets.find(a => a.id === scene.assetId);

      setExportStatus(
        `Processing scene ${i + 1}/${scenes.length}: ${scene.title}`
      );

      const ext = asset.type === "local"
        ? extensionFromName(asset.name, "mp4")
        : "mp4";

      const inputName = `input_${i}.${ext}`;
      const outputName = `scene_${i}.mp4`;

      await writeAssetToFFmpeg(asset, inputName);

      const duration = Number(scene.duration) || 10;

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
        throw new Error(
          `Could not encode scene ${i + 1}. Check source video format and FFmpeg encoder support.`
        );
      }

      sceneFiles.push(outputName);
      setExportProgress((i + 1) / scenes.length * 50);
    }

    // Concatenate scenes.
    setExportStatus("Combining video scenes...");

    const concatList = sceneFiles
      .map(name => `file '${name}'`)
      .join("\n");

    await ffmpeg.writeFile(
      "concat.txt",
      new TextEncoder().encode(concatList)
    );

    let result = await ffmpeg.exec([
      "-f", "concat",
      "-safe", "0",
      "-i", "concat.txt",
      "-c", "copy",
      "joined.mp4"
    ]);

    if (result !== 0) {
      throw new Error("Could not join the scene clips.");
    }

    // Add audio.
    setExportStatus("Adding your audio...");

    const args = ["-i", "joined.mp4"];
    let nextInput = 1;
    let musicIndex = null;
    let narrationIndex = null;

    if (musicFile) {
      const ext = extensionFromName(musicFile.name, "mp3");
      const name = `music.${ext}`;

      await writeAudioToFFmpeg(musicFile, name);
      args.push("-stream_loop", "-1", "-i", name);
      musicIndex = nextInput++;
    }

    if (narrationFile) {
      const ext = extensionFromName(narrationFile.name, "mp3");
      const name = `narration.${ext}`;

      await writeAudioToFFmpeg(narrationFile, name);
      args.push("-i", name);
      narrationIndex = nextInput++;
    }

    let filter = "";
    let audioMap = null;

    if (musicIndex !== null && narrationIndex !== null) {
      filter =
        `[${musicIndex}:a]volume=0.18[music];` +
        `[${narrationIndex}:a]volume=1.0[voice];` +
        `[music][voice]amix=inputs=2:duration=first:dropout_transition=2[audio]`;

      audioMap = "[audio]";

    } else if (musicIndex !== null) {
      filter = `[${musicIndex}:a]volume=0.22[audio]`;
      audioMap = "[audio]";

    } else if (narrationIndex !== null) {
      filter = `[${narrationIndex}:a]volume=1.0[audio]`;
      audioMap = "[audio]";
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
        "Final MP4 export failed. The FFmpeg browser build may not support the selected format or encoder."
      );
    }

    setExportStatus("Preparing your final video...");

    const output = await ffmpeg.readFile("paperhouse_final.mp4");

    const blob = new Blob([output], { type: "video/mp4" });

    if (finalVideoURL) {
      URL.revokeObjectURL(finalVideoURL);
    }

    finalVideoURL = URL.createObjectURL(blob);

    $("preview").src = finalVideoURL;

    const link = document.createElement("a");
    link.href = finalVideoURL;
    link.download = "Paperhouse-Inc-Video.mp4";
    link.textContent = "⬇ Download your finished MP4";

    $("downloadArea").replaceChildren(link);

    setExportProgress(100);
    setExportStatus("Your video has been compiled successfully!");

  } catch (error) {
    console.error(error);
    setExportStatus("Export failed: " + error.message);
    alert(error.message);
  } finally {
    isExporting = false;
    $("exportBtn").disabled = false;
  }
}

// ============================================
// BUTTONS
// ============================================

$("generateBtn").addEventListener("click", generateVideoPlan);

$("searchAllBtn").addEventListener("click", searchAllScenes);

$("addSceneBtn").addEventListener("click", addScene);

$("exportBtn").addEventListener("click", exportVideo);

// ============================================
// START APPLICATION
// ============================================

checkSystem();
