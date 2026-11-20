
import { FFmpeg } from "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js";
import { toBlobURL } from "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js";

const $ = id => document.getElementById(id);

const state = {
  scenes: [],
  ffmpeg: null,
  loaded: false,
  outputUrl: null
};

function log(message) {
  $("log").textContent =
    `${new Date().toLocaleTimeString()} ${message}\n` +
    $("log").textContent;
}

function fmt(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function progress(percent, message) {
  $("progressBar").style.width =
    `${Math.max(0, Math.min(100, percent))}%`;
  $("statusText").textContent = message;
}

// ----------------------------------
// LOCAL SCENE GENERATOR
// ----------------------------------

function localPlan(prompt, total) {
  const topic = prompt.trim().split(/\s+/).slice(0, 12).join(" ");

  const beats = [
    ["Opening hook", `Open with a compelling question and introduce ${topic}.`],
    ["Background", `Explain the background, setting and why ${topic} matters.`],
    ["Main challenge", `Show the biggest challenges and risks connected to ${topic}.`],
    ["Essential knowledge", `Explain the important facts in clear language.`],
    ["Preparation", `Show useful preparation, tools and planning.`],
    ["Turning point", `Introduce a surprising development or key discovery.`],
    ["Practical guidance", `Give practical steps and concrete examples.`],
    ["Wider impact", `Explain how the topic affects people and communities.`],
    ["Lessons learned", `Summarize the most important lessons.`],
    ["Closing", `Finish with a memorable conclusion and call to action.`]
  ];

  const count =
    total <= 60 ? 4 :
    total <= 180 ? 6 :
    total <= 300 ? 7 :
    total <= 420 ? 8 : 10;

  const chosen = beats.slice(0, count);
  const base = Math.floor(total / count);
  const remainder = total % count;

  return chosen.map((beat, index) => ({
    id: index + 1,
    title: beat[0],
    narration: beat[1],
    duration: base + (index < remainder ? 1 : 0),
    query: `${topic} ${beat[0]} documentary footage`.slice(0, 90),
    videoUrl: null,
    thumb: null
  }));
}

// ----------------------------------
// GEMINI SCRIPT AND SCENE GENERATOR
// ----------------------------------

async function geminiPlan(prompt, total) {
  const key = $("geminiKey").value.trim();

  if (!key) {
    throw new Error("Enter your Gemini API key first.");
  }

  const model = $("model").value;

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const instructions = `
You are a professional documentary scriptwriter.

Create a complete video plan for a ${total}-second video.

Return ONLY valid JSON using this structure:

{
  "scenes": [
    {
      "title": "Scene title",
      "duration": 60,
      "narration": "Complete spoken narration",
      "search_query": "Stock footage search phrase"
    }
  ]
}

Rules:
1. Create 4 to 10 scenes.
2. All scene durations must add up to exactly ${total} seconds.
3. Narration must be informative and engaging.
4. Maintain a logical beginning, middle and ending.
5. Write natural spoken dialogue.
6. Make footage search phrases visually descriptive.
7. Do not include Markdown or explanations outside the JSON.

USER VIDEO PROMPT:
${prompt}
`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: instructions }]
      }],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: "application/json"
      }
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error?.message || `Gemini error ${response.status}`
    );
  }

  const raw = data.candidates?.[0]?.content?.parts
    ?.map(part => part.text || "")
    .join("");

  if (!raw) {
    throw new Error("Gemini returned an empty response.");
  }

  const parsed = JSON.parse(
    raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
  );

  if (!Array.isArray(parsed.scenes) || !parsed.scenes.length) {
    throw new Error("Gemini did not return a valid scene list.");
  }

  const scenes = parsed.scenes.slice(0, 12).map((scene, index) => ({
    id: index + 1,
    title: String(scene.title || `Scene ${index + 1}`),
    narration: String(scene.narration || ""),
    duration: Math.max(1, Math.round(Number(scene.duration) || 1)),
    query: String(
      scene.search_query || scene.title || prompt
    ).slice(0, 100),
    videoUrl: null,
    thumb: null
  }));

  // Adjust scene durations to match the selected video length.
  const sum = scenes.reduce((a, s) => a + s.duration, 0);

  scenes.forEach(scene => {
    scene.duration = Math.max(
      1,
      Math.round(scene.duration * total / sum)
    );
  });

  const difference =
    total - scenes.reduce((a, s) => a + s.duration, 0);

  scenes[scenes.length - 1].duration =
    Math.max(1, scenes[scenes.length - 1].duration + difference);

  return scenes;
}

// ----------------------------------
// DISPLAY SCENES
// ----------------------------------

function draw() {
  $("sceneList").innerHTML = state.scenes.map(scene => `
    <article class="scene">

      ${
        scene.thumb
        ? `<img src="${scene.thumb}" alt="Scene footage">`
        : `<div style="aspect-ratio:16/9;background:#222;border-radius:7px;display:grid;place-items:center;color:#777;font-size:11px">No clip</div>`
      }

      <div>
        <div class="meta">
          SCENE ${scene.id} · ${fmt(scene.duration)}
        </div>

        <h4>${esc(scene.title)}</h4>

        <p>${esc(scene.narration)}</p>

        <p style="color:#d8ad50">
          Footage: ${esc(scene.query)}
        </p>

        <div class="actions">
          <button class="btn secondary"
            data-preview="${scene.id}"
            ${scene.videoUrl ? "" : "disabled"}>
            Preview
          </button>

          <button class="btn secondary"
            data-find="${scene.id}">
            Find clip
          </button>
        </div>
      </div>
    </article>
  `).join("");

  $("sceneCount").textContent = state.scenes.length;

  $("totalTime").textContent = fmt(
    state.scenes.reduce((a, s) => a + s.duration, 0)
  );

  $("readyCount").textContent =
    state.scenes.filter(s => s.videoUrl).length;

  $("searchBtn").disabled = !state.scenes.length;

  $("renderBtn").disabled =
    !state.scenes.length ||
    !state.scenes.every(s => s.videoUrl);
}

function update(id, changes) {
  const scene = state.scenes.find(s => s.id === id);

  if (scene) {
    Object.assign(scene, changes);
  }

  draw();
}

// ----------------------------------
// PEXELS FOOTAGE SEARCH
// ----------------------------------

async function pexelsSearch(scene) {
  const key = $("pexelsKey").value.trim();

  if (!key) {
    throw new Error("Enter a Pexels API key to search footage.");
  }

  const url =
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(scene.query)}&per_page=8&orientation=landscape`;

  const response = await fetch(url, {
    headers: { Authorization: key }
  });

  if (!response.ok) {
    throw new Error(`Pexels error ${response.status}`);
  }

  const data = await response.json();

  if (!data.videos?.length) {
    throw new Error(`No footage found: ${scene.query}`);
  }

  const video = data.videos[0];

  const file =
    [...video.video_files]
      .sort((a, b) => (b.width || 0) - (a.width || 0))
      .find(f => (f.width || 0) <= 1920) ||
    video.video_files[0];

  return {
    videoUrl: file.link,
    thumb: video.image
  };
}

async function findFootage(targetId = null) {
  const scenes = state.scenes.filter(scene =>
    !scene.videoUrl &&
    (targetId === null || scene.id === targetId)
  );

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];

    try {
      const result = await pexelsSearch(scene);
      update(scene.id, result);
      log(`Found footage for scene ${scene.id}.`);
    } catch (error) {
      log(`Scene ${scene.id}: ${error.message}`);
    }

    progress(
      ((i + 1) / Math.max(scenes.length, 1)) * 100,
      `Searching footage ${i + 1}/${scenes.length}`
    );
  }

  progress(100, "Footage search completed.");
  draw();
}

// ----------------------------------
// LOAD FFMPEG
// ----------------------------------

async function getFFmpeg() {
  if (state.loaded) {
    return state.ffmpeg;
  }

  log("Loading FFmpeg video renderer...");

  const ffmpeg = new FFmpeg();

  ffmpeg.on("progress", ({ progress: value }) => {
    progress(
      Math.round(value * 100),
      `Rendering ${Math.round(value * 100)}%`
    );
  });

  const base =
    "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd";

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

  state.ffmpeg = ffmpeg;
  state.loaded = true;

  return ffmpeg;
}

// ----------------------------------
// VIDEO COMPILATION
// ----------------------------------

async function compile() {
  if (state.scenes.some(scene => !scene.videoUrl)) {
    alert("Find footage for every scene first.");
    return;
  }

  $("renderBtn").disabled = true;

  try {
    const ffmpeg = await getFFmpeg();

    const [width, height] =
      $("resolution").value.split(":").map(Number);

    const parts = [];

    for (let i = 0; i < state.scenes.length; i++) {
      const scene = state.scenes[i];

      progress(
        (i / state.scenes.length) * 35,
        `Preparing scene ${i + 1}/${state.scenes.length}`
      );

      const response = await fetch(scene.videoUrl);

      if (!response.ok) {
        throw new Error(
          `Could not download clip ${i + 1}. The footage provider may block browser access.`
        );
      }

      const videoBytes =
        new Uint8Array(await response.arrayBuffer());

      await ffmpeg.writeFile(
        `input${i}.mp4`,
        videoBytes
      );

      await ffmpeg.exec([
        "-stream_loop", "-1",
        "-i", `input${i}.mp4`,
        "-t", String(scene.duration),
        "-vf",
        `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25,format=yuv420p`,
        "-an",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "28",
        `part${i}.mp4`
      ]);

      parts.push(`file 'part${i}.mp4'`);

      log(`Prepared scene ${i + 1}.`);
    }

    await ffmpeg.writeFile(
      "concat.txt",
      new TextEncoder().encode(parts.join("\n"))
    );

    progress(40, "Joining scenes...");

    await ffmpeg.exec([
      "-f", "concat",
      "-safe", "0",
      "-i", "concat.txt",
      "-c", "copy",
      "joined.mp4"
    ]);

    const narration = $("narrationFile").files[0];
    const music = $("musicFile").files[0];

    if (narration) {
      await ffmpeg.writeFile(
        "narration",
        new Uint8Array(await narration.arrayBuffer())
      );
    }

    if (music) {
      await ffmpeg.writeFile(
        "music",
        new Uint8Array(await music.arrayBuffer())
      );
    }

    if (narration && music) {
      await ffmpeg.exec([
        "-i", "joined.mp4",
        "-i", "narration",
        "-stream_loop", "-1",
        "-i", "music",
        "-filter_complex",
        "[1:a]volume=1[a];[2:a]volume=0.14[b];[a][b]amix=inputs=2:duration=first[aout]",
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-shortest",
        "final.mp4"
      ]);
    } else if (narration || music) {
      await ffmpeg.exec([
        "-i", "joined.mp4",
        "-i", narration ? "narration" : "music",
        "-map", "0:v",
        "-map", "1:a",
        "-c:v", "copy",
        "-c:a", "aac",
        "-shortest",
        "final.mp4"
      ]);
    } else {
      await ffmpeg.exec([
        "-i", "joined.mp4",
        "-c", "copy",
        "final.mp4"
      ]);
    }

    const output = await ffmpeg.readFile("final.mp4");

    const blob = new Blob(
      [output.buffer],
      { type: "video/mp4" }
    );

    if (state.outputUrl) {
      URL.revokeObjectURL(state.outputUrl);
    }

    state.outputUrl = URL.createObjectURL(blob);

    const video = document.createElement("video");
    video.controls = true;
    video.src = state.outputUrl;

    $("preview").innerHTML = "";
    $("preview").append(video);

    const download = document.createElement("a");
    download.href = state.outputUrl;
    download.download = "paperhouse-inc-video.mp4";
    download.className = "btn primary";
    download.textContent = "Download MP4";

    $("preview").insertAdjacentElement(
      "afterend",
      download
    );

    progress(100, "Video successfully compiled.");
    log("MP4 export completed.");

  } catch (error) {
    console.error(error);

    log(`Export failed: ${error.message}`);

    progress(0, error.message);

    alert(
      `Export failed: ${error.message}\n\nTry 360p or a desktop browser. Browser memory and stock-footage CORS restrictions can prevent export.`
    );

  } finally {
    $("renderBtn").disabled = false;
    draw();
  }
}

// ----------------------------------
// BUTTON EVENTS
// ----------------------------------

$("planBtn").addEventListener("click", async () => {
  const prompt = $("prompt").value.trim();

  if (prompt.length < 12) {
    alert("Enter a detailed video prompt.");
    return;
  }

  $("planBtn").disabled = true;

  progress(5, "Gemini is writing your video script...");

  try {
    state.scenes = await geminiPlan(
      prompt,
      Number($("duration").value)
    );

    log("Gemini generated your scene plan.");

  } catch (error) {
    log(`Gemini error: ${error.message}`);
    alert(
      `${error.message}\n\nYou can use Create local plan instead.`
    );

  } finally {
    $("planBtn").disabled = false;
    draw();

    progress(
      0,
      state.scenes.length
        ? "Scene plan ready. Find footage next."
        : "Waiting for a valid scene plan."
    );
  }
});

$("localBtn").addEventListener("click", () => {
  const prompt = $("prompt").value.trim();

  if (prompt.length < 12) {
    alert("Enter a detailed video prompt.");
    return;
  }

  state.scenes = localPlan(
    prompt,
    Number($("duration").value)
  );

  draw();
  progress(0, "Local scene plan ready.");
  log("Created a local scene plan.");
});

$("sampleBtn").addEventListener("click", () => {
  $("prompt").value =
    "Create a cinematic 10-minute documentary about surviving a major disaster. Cover emergency planning, clean water, food, shelter, first aid, communication and community recovery. Make it informative, realistic and hopeful.";
});

$("searchBtn").addEventListener("click", () => {
  findFootage();
});

$("renderBtn").addEventListener("click", compile);

$("sceneList").addEventListener("click", event => {
  const previewId = event.target.dataset.preview;
  const findId = event.target.dataset.find;

  if (previewId) {
    const scene = state.scenes.find(
      s => s.id === Number(previewId)
    );

    if (scene?.videoUrl) {
      const video = document.createElement("video");
      video.controls = true;
      video.src = scene.videoUrl;

      $("preview").innerHTML = "";
      $("preview").append(video);
    }
  }

  if (findId) {
    findFootage(Number(findId));
  }
});
