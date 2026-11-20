
const $ = id => document.getElementById(id);

let scenes = [];
let assets = [];
let ffmpeg = null;
let ffmpegReady = false;
let narrationBlob = null;
let outputURL = null;

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function status(message, progress) {
  $("status").textContent = message;
  if (progress !== undefined) $("bar").style.width = progress + "%";
}

function exportStatus(message) {
  $("exportStatus").textContent = message;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[c]);
}

// ---------------- AI STORYBOARD ----------------

async function askGemini(prompt) {
  const key = $("geminiKey").value.trim();
  if (!key) throw new Error("Enter your Gemini API key first.");

  const instructions = `
Create an intelligent 60-second video storyboard.

User idea: ${prompt}
Style: ${$("style").value}
Language: ${$("language").value}

Create exactly 5 scenes. Their durations must total exactly 60 seconds.

Each scene needs:
- title
- description
- searchQuery: concise English stock-footage search terms
- duration: seconds
- narration: spoken narration for this scene

Also create a compelling movie title and a complete narration script.

Return ONLY valid JSON in this format:
{
 "title":"Movie title",
 "concept":"Short movie concept",
 "narration":"Complete narration",
 "scenes":[
  {
   "title":"Scene title",
   "description":"Visual description",
   "searchQuery":"jungle survival",
   "duration":12,
   "narration":"Spoken words"
  }
 ]
}

No markdown. Exactly 5 scenes. Total duration exactly 60.
`;

  const response = await fetch(
    GEMINI_URL + "?key=" + encodeURIComponent(key),
    {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({
        contents: [{parts:[{text:instructions}]}],
        generationConfig: {temperature:0.8}
      })
    }
  );

  if (!response.ok) {
    throw new Error("Gemini error: " + await response.text());
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts
    ?.map(p => p.text || "").join("");

  if (!text) throw new Error("AI returned an empty storyboard.");

  const clean = text.replace(/```json|```/g, "").trim();
  const result = JSON.parse(clean);

  if (!Array.isArray(result.scenes) || !result.scenes.length) {
    throw new Error("AI storyboard has no scenes.");
  }

  return result;
}

$("create").addEventListener("click", async () => {
  const prompt = $("prompt").value.trim();
  if (!prompt) return alert("Describe your movie first.");

  $("create").disabled = true;

  try {
    status("AI is developing your movie concept...", 10);

    const result = await askGemini(prompt);

    scenes = result.scenes.map((s, i) => ({
      id: crypto.randomUUID(),
      title: s.title || `Scene ${i+1}`,
      description: s.description || "",
      query: s.searchQuery || prompt,
      narration: s.narration || "",
      duration: Number(s.duration) || 12,
      assetId: ""
    }));

    // Normalize scene durations to exactly 60 seconds.
    normalizeDurations();

    $("storyText").innerHTML =
      `<h3>${escapeHTML(result.title)}</h3>
       <p>${escapeHTML(result.concept)}</p>`;

    $("script").value = result.narration || "";

    $("storyPanel").classList.remove("hidden");
    $("stockPanel").classList.remove("hidden");
    $("editorPanel").classList.remove("hidden");

    renderScenes();

    status("Storyboard created! Searching for stock footage...", 30);

    // Search relevant footage for each scene.
    for (const scene of scenes) {
      try {
        await searchPexels(scene.query, scene.id, true);
      } catch (err) {
        console.warn("Footage search failed:", err);
      }
    }

    renderScenes();
    status("Your storyboard and footage selections are ready.", 55);

  } catch (error) {
    status("Error: " + error.message);
    alert(error.message);
  } finally {
    $("create").disabled = false;
  }
});

// ---------------- STOCK VIDEO SEARCH ----------------

async function searchPexels(query, sceneId, automatic = false) {
  const key = $("pexelsKey").value.trim();
  if (!key) {
    if (!automatic) alert("Enter your Pexels API key.");
    return;
  }

  const orientation = $("format").value;

  const url = new URL("https://api.pexels.com/v1/videos/search");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", "8");
  url.searchParams.set("orientation", orientation);

  const response = await fetch(url, {
    headers: {Authorization:key}
  });

  if (!response.ok) {
    throw new Error("Pexels search failed: " + response.status);
  }

  const data = await response.json();

  const found = (data.videos || []).map(video => {
    const files = (video.video_files || [])
      .filter(f => f.link)
      .sort((a,b) => {
        const target = 640;
        return Math.abs((a.width || 0)-target) -
               Math.abs((b.width || 0)-target);
      });

    const file = files[0];
    if (!file) return null;

    return {
      id: "pexels-" + video.id,
      name: "Pexels video " + video.id,
      url: file.link,
      thumbnail: video.image,
      duration: video.duration || 0,
      photographer: video.user?.name || "Pexels contributor",
      source: "Pexels",
      creditURL: video.url,
      type: "remote"
    };
  }).filter(Boolean);

  found.forEach(asset => {
    if (!assets.some(a => a.id === asset.id)) assets.push(asset);
  });

  if (sceneId && found.length) {
    const scene = scenes.find(s => s.id === sceneId);
    if (scene && !scene.assetId) scene.assetId = found[0].id;
  }

  if (!automatic) {
    renderSearchResults(found);
  }
}

$("searchBtn").addEventListener("click", async () => {
  const query = $("searchTerm").value.trim();
  if (!query) return alert("Enter search words.");

  $("searchBtn").disabled = true;

  try {
    await searchPexels(query, null, false);
  } catch (e) {
    alert(e.message);
  } finally {
    $("searchBtn").disabled = false;
  }
});

function renderSearchResults(found) {
  const container = $("stockResults");
  container.innerHTML = "";

  found.forEach(asset => {
    const card = document.createElement("div");
    card.className = "asset";

    const image = document.createElement("img");
    image.src = asset.thumbnail;
    image.style.width = "100%";
    image.style.height = "110px";
    image.style.objectFit = "cover";

    const name = document.createElement("p");
    name.className = "small";
    name.textContent = asset.name;

    const add = document.createElement("button");
    add.className = "secondary";
    add.textContent = "Add to scene";

    add.onclick = () => {
      const scene = scenes.find(s => !s.assetId);
      if (!scene) {
        alert("All scenes already have footage. Change a scene's footage instead.");
        return;
      }
      scene.assetId = asset.id;
      renderScenes();
      alert("Footage added to " + scene.title);
    };

    card.append(image, name, add);
    container.appendChild(card);
  });
}

// ---------------- USER VIDEO UPLOADS ----------------

$("uploads").addEventListener("change", event => {
  const files = Array.from(event.target.files || []);

  files.forEach(file => {
    if (!file.type.startsWith("video/")) return;

    const asset = {
      id: "upload-" + crypto.randomUUID(),
      name: file.name,
      file,
      url: URL.createObjectURL(file),
      source: "Your upload",
      type: "local"
    };

    assets.push(asset);
  });

  $("uploadList").textContent =
    files.length + " file(s) selected. Uploaded videos are stored locally in this browser session.";

  renderScenes();
});

// ---------------- SCENE EDITOR ----------------

function normalizeDurations() {
  if (!scenes.length) return;

  const total = scenes.reduce(
    (sum, s) => sum + Math.max(1, Number(s.duration) || 1), 0
  );

  let used = 0;

  scenes.forEach((scene, i) => {
    if (i === scenes.length - 1) {
      scene.duration = 60 - used;
    } else {
      scene.duration = Math.max(
        1,
        Math.round(60 * scene.duration / total)
      );
      used += scene.duration;
    }
  });
}

function renderScenes() {
  const container = $("scenes");
  container.innerHTML = "";

  scenes.forEach((scene, index) => {
    const div = document.createElement("div");
    div.className = "scene";

    const title = document.createElement("div");
    title.className = "scene-head";

    const heading = document.createElement("strong");
    heading.textContent = `${index+1}. ${scene.title}`;

    const remove = document.createElement("button");
    remove.className = "danger";
    remove.textContent = "Remove";
    remove.onclick = () => {
      scenes.splice(index,1);
      normalizeDurations();
      renderScenes();
    };

    title.append(heading, remove);

    const description = document.createElement("p");
    description.className = "small";
    description.textContent = scene.description;

    const durationLabel = document.createElement("label");
    durationLabel.textContent = "Scene duration (seconds)";

    const duration = document.createElement("input");
    duration.type = "number";
    duration.min = "1";
    duration.max = "60";
    duration.value = scene.duration;

    duration.onchange = () => {
      scene.duration = Math.max(1, Number(duration.value) || 1);
      normalizeDurations();
      renderScenes();
    };

    const sourceLabel = document.createElement("label");
    sourceLabel.textContent = "Select video footage";

    const select = document.createElement("select");

    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "Choose footage...";
    select.appendChild(empty);

    assets.forEach(asset => {
      const option = document.createElement("option");
      option.value = asset.id;
      option.textContent = `${asset.name} (${asset.source})`;
      select.appendChild(option);
    });

    select.value = scene.assetId;
    select.onchange = () => {
      scene.assetId = select.value;
    };

    const search = document.createElement("button");
    search.className = "secondary full";
    search.textContent = "Find more footage for this scene";
    search.onclick = async () => {
      try {
        await searchPexels(scene.query, scene.id);
        renderScenes();
      } catch (e) {
        alert(e.message);
      }
    };

    div.append(
      title, description, durationLabel,
      duration, sourceLabel, select, search
    );

    container.appendChild(div);
  });

  const total = scenes.reduce(
    (sum, s) => sum + Number(s.duration), 0
  );

  const totalLabel = document.createElement("p");
  totalLabel.className = "small";
  totalLabel.textContent = "Total movie duration: " + total + " seconds";
  container.appendChild(totalLabel);
}

$("addScene").addEventListener("click", () => {
  if (scenes.length >= 20) return alert("Maximum 20 scenes.");

  scenes.push({
    id: crypto.randomUUID(),
    title: "New scene",
    description: "Add your video footage.",
    query: $("prompt").value,
    narration: "",
    duration: 10,
    assetId: ""
  });

  normalizeDurations();
  renderScenes();
});

// ---------------- AI NARRATION ----------------

async function generateVoice() {
  const key = $("voiceKey").value.trim();
  const voiceId = $("voiceId").value.trim();
  const text = $("script").value.trim();

  if (!key || !voiceId) {
    throw new Error("Enter your ElevenLabs API key and Voice ID.");
  }
  if (!text) throw new Error("Your narration script is empty.");

  $("voiceStatus").textContent = "Generating narration audio...";

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg"
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error("Voice API error: " + await response.text());
  }

  narrationBlob = await response.blob();

  $("voiceStatus").textContent = "AI narration generated successfully.";
}

$("makeVoice").addEventListener("click", async () => {
  try {
    await generateVoice();
  } catch (e) {
    $("voiceStatus").textContent = e.message;
    alert(e.message);
  }
});

$("refreshVoice").addEventListener("click", async () => {
  try {
    await generateVoice();
  } catch (e) {
    alert(e.message);
  }
});

// ---------------- FFMPEG INITIALIZATION ----------------

async function loadFFmpeg() {
  if (ffmpegReady) return;

  if (!window.FFmpegWASM || !window.FFmpegUtil) {
    throw new Error("FFmpeg libraries did not load. Check your internet connection.");
  }

  exportStatus("Loading video editor. First load may download approximately 30 MB...");

  const {FFmpeg} = window.FFmpegWASM;
  const {toBlobURL} = window.FFmpegUtil;

  ffmpeg = new FFmpeg();

  ffmpeg.on("progress", ({progress}) => {
    exportStatus("Processing video: " + Math.round(progress * 100) + "%");
  });

  const base = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";

  await ffmpeg.load({
    coreURL: await toBlobURL(base + "/ffmpeg-core.js", "text/javascript"),
    wasmURL: await toBlobURL(base + "/ffmpeg-core.wasm", "application/wasm")
  });

  ffmpegReady = true;
  exportStatus("Video editor loaded.");
}

// ---------------- VIDEO EXPORT ----------------

async function getAssetBytes(asset) {
  if (asset.file) {
    return new Uint8Array(await asset.file.arrayBuffer());
  }

  const response = await fetch(asset.url);
  if (!response.ok) throw new Error("Unable to download " + asset.name);

  return new Uint8Array(await response.arrayBuffer());
}

async function writeAudio(file, filename) {
  await ffmpeg.writeFile(
    filename,
    new Uint8Array(await file.arrayBuffer())
  );
}

$("export").addEventListener("click", async () => {
  const button = $("export");
  button.disabled = true;

  try {
    if (!scenes.length) throw new Error("Create a storyboard first.");

    const missing = scenes.filter(s => !s.assetId);
    if (missing.length) {
      throw new Error("Please select video footage for every scene.");
    }

    const durationTotal = scenes.reduce(
      (sum,s) => sum + Number(s.duration), 0
    );

    if (durationTotal !== 60) {
      throw new Error("Scene durations must total exactly 60 seconds.");
    }

    await loadFFmpeg();

    exportStatus("Preparing your scenes...");
    const concatLines = [];

    const format = $("format").value;
    let width = 640, height = 360;

    if (format === "portrait") {
      width = 360; height = 640;
    } else if (format === "square") {
      width = 360; height = 360;
    }

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const asset = assets.find(a => a.id === scene.assetId);

      if (!asset) throw new Error("Missing footage for " + scene.title);

      exportStatus(`Preparing scene ${i+1} of ${scenes.length}...`);

      const inputName = `input_${i}.bin`;
      const outputName = `scene_${i}.mp4`;

      const bytes = await getAssetBytes(asset);
      await ffmpeg.writeFile(inputName, bytes);

      const seconds = Math.max(1, Number(scene.duration));

      await ffmpeg.exec([
        "-stream_loop", "-1",
        "-i", inputName,
        "-t", String(seconds),
        "-vf",
        `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24`,
        "-an",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "30",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        outputName
      ]);

      concatLines.push(`file '${outputName}'`);
    }

    exportStatus("Combining scenes...");

    await ffmpeg.writeFile(
      "list.txt",
      new TextEncoder().encode(concatLines.join("\n"))
    );

    await ffmpeg.exec([
      "-f", "concat",
      "-safe", "0",
      "-i", "list.txt",
      "-c", "copy",
      "combined.mp4"
    ]);

    const music = $("music").files[0];
    const uploadedNarration = $("narration").files[0];
    const voiceFile = uploadedNarration || narrationBlob;

    exportStatus("Adding music and narration...");

    const args = ["-i", "combined.mp4"];
    let audioCount = 0;

    if (music) {
      await writeAudio(music, "music.mp3");
      args.push("-stream_loop", "-1", "-i", "music.mp3");
      audioCount++;
    }

    if (voiceFile) {
      await writeAudio(voiceFile, "narration.mp3");
      args.push("-i", "narration.mp3");
      audioCount++;
    }

    args.push("-t", "60");

    if (music && voiceFile) {
      args.push(
        "-filter_complex",
        "[1:a]volume=0.20[m];[2:a]volume=1.0[n];[m][n]amix=inputs=2:duration=longest:dropout_transition=2[a]",
        "-map", "0:v:0",
        "-map", "[a]"
      );
    } else if (music || voiceFile) {
      args.push("-map", "0:v:0", "-map", "1:a:0");
      if (music) args.push("-af", "volume=0.20");
    } else {
      args.push("-map", "0:v:0", "-an");
    }

    args.push(
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-crf", "30",
      "-pix_fmt", "yuv420p",
      "-r", "24",
      "-c:a", "aac",
      "-b:a", "96k",
      "-movflags", "+faststart",
      "paperhouse_final.mp4"
    );

    await ffmpeg.exec(args);

    exportStatus("Preparing MP4 download...");

    const result = await ffmpeg.readFile("paperhouse_final.mp4");

    const blob = new Blob([result], {type:"video/mp4"});

    if (outputURL) URL.revokeObjectURL(outputURL);
    outputURL = URL.createObjectURL(blob);

    $("preview").src = outputURL;
    $("download").href = outputURL;
    $("resultPanel").classList.remove("hidden");

    exportStatus("Your 60-second movie is ready!");

    $("resultPanel").scrollIntoView({behavior:"smooth"});

  } catch (error) {
    console.error(error);
    exportStatus("Export error: " + error.message);
    alert(error.message);
  } finally {
    button.disabled = false;
  }
});
