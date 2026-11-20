
import express from "express";
import dotenv from "dotenv";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

dotenv.config();

const root = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const run = promisify(execFile);

const upload = multer({
  dest: path.join(root, "uploads"),
  limits: { fileSize: 500 * 1024 * 1024 }
});

const storage = path.join(root, "storage");

fs.mkdirSync(storage, { recursive: true });
fs.mkdirSync(path.join(root, "uploads"), { recursive: true });

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(root, "public")));
app.use("/storage", express.static(storage));

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

// SERVER STATUS

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    geminiConfigured: Boolean(ai),
    videoProviderConfigured: Boolean(process.env.VIDEO_PROVIDER_URL)
  });
});

// GEMINI STORY GENERATION

app.post("/api/plan", async (req, res) => {
  try {
    if (!ai) {
      return res.status(400).json({
        error: "Gemini API key is not configured on the server."
      });
    }

    const {
      prompt,
      duration = 60,
      style = "Cinematic",
      language = "English",
      captionsEnabled = true
    } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({
        error: "Please enter a video prompt."
      });
    }

    const seconds = Math.min(
      180,
      Math.max(10, Number(duration) || 60)
    );

    const instruction = `
You are Paperhouse AI, an expert cinematic video director.

Create a complete video storyboard.

USER IDEA:
${prompt}

DURATION:
${seconds} seconds.

STYLE:
${style}

LANGUAGE:
${language}

CAPTIONS:
${captionsEnabled ? "Generate captions for every scene." : "Captions may be empty."}

Return ONLY valid JSON:

{
  "title": "Video title",
  "summary": "Video summary",
  "scenes": [
    {
      "number": 1,
      "start": 0,
      "end": 8,
      "visual_prompt": "Detailed visual footage instructions",
      "dialogue": "Spoken dialogue",
      "caption": "Subtitle text",
      "sound": "Music and sound effects"
    }
  ]
}

RULES:
1. Cover the entire requested duration.
2. No gaps or overlapping scenes.
3. Use scene durations between 4 and 8 seconds where possible.
4. Final scene must end exactly at ${seconds}.
5. Maintain consistent characters and environments.
6. Use cinematic camera directions.
7. Write dialogue and captions in ${language}.
8. Make every scene visually detailed.
9. Do not claim that actual video footage has been generated.
`;

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash",
      contents: instruction,
      config: {
        responseMimeType: "application/json",
        temperature: 0.7
      }
    });

    const plan = JSON.parse(response.text);

    if (!Array.isArray(plan.scenes) || !plan.scenes.length) {
      throw new Error("Invalid storyboard returned by Gemini.");
    }

    // Validate the scene timings.
    let previousEnd = 0;

    for (const scene of plan.scenes) {
      scene.start = Number(scene.start);
      scene.end = Number(scene.end);

      if (
        !Number.isFinite(scene.start) ||
        !Number.isFinite(scene.end) ||
        scene.start !== previousEnd ||
        scene.end <= scene.start ||
        scene.end > seconds
      ) {
        throw new Error("Gemini returned invalid scene timing. Generate again.");
      }

      previousEnd = scene.end;
    }

    if (previousEnd !== seconds) {
      throw new Error("Storyboard does not cover the full video duration.");
    }

    res.json({ plan });

  } catch (error) {
    console.error("Gemini error:", error);

    res.status(500).json({
      error: error.message || "Story generation failed."
    });
  }
});

// VIDEO COMPILATION

app.post("/api/compile", upload.array("clips", 60), async (req, res) => {
  const uploaded = (req.files || []).map(file => file.path);

  try {
    if (!uploaded.length) {
      return res.status(400).json({
        error: "Upload video clips first."
      });
    }

    const resolution = req.body.resolution === "360p"
      ? "360p"
      : "720p";

    const width = resolution === "360p" ? 640 : 1280;
    const height = resolution === "360p" ? 360 : 720;

    const id = randomUUID();
    const folder = path.join(storage, id);

    fs.mkdirSync(folder, { recursive: true });

    const listFile = path.join(folder, "clips.txt");
    const joined = path.join(folder, "joined.mp4");
    const finalVideo = path.join(folder, "paperhouse-video.mp4");

    // Build FFmpeg input list.
    fs.writeFileSync(
      listFile,
      uploaded.map(file =>
        `file '${file.replace(/'/g, "'\\''")}'`
      ).join("\n")
    );

    // Join and resize clips.
    await run("ffmpeg", [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listFile,
      "-vf",
      `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "24",
      "-c:a", "aac",
      "-b:a", "128k",
      joined
    ]);

    const captions = JSON.parse(req.body.captions || "[]");

    if (captions.length) {
      const subtitleFile = path.join(folder, "captions.srt");

      const srt = captions.map((caption, index) => {
        return `${index + 1}
${toSrtTime(caption.start)} --> ${toSrtTime(caption.end)}
${String(caption.caption || "").replace(/\n/g, " ")}
`;
      }).join("\n");

      fs.writeFileSync(subtitleFile, srt);

      // Burn subtitles into video.
      const escaped = subtitleFile
        .replace(/\\/g, "\\\\")
        .replace(/:/g, "\\:")
        .replace(/'/g, "\\'");

      await run("ffmpeg", [
        "-y",
        "-i", joined,
        "-vf",
        `subtitles='${escaped}':force_style='FontName=Arial,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Alignment=2,MarginV=35'`,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "24",
        "-c:a", "copy",
        finalVideo
      ]);

    } else {
      fs.copyFileSync(joined, finalVideo);
    }

    res.json({
      success: true,
      videoUrl: `/storage/${id}/paperhouse-video.mp4`,
      captionsUrl: captions.length
        ? `/storage/${id}/captions.srt`
        : null
    });

  } catch (error) {
    console.error("Compilation error:", error);

    res.status(500).json({
      error: error.message + " Check that FFmpeg is installed."
    });

  } finally {
    for (const file of uploaded) {
      try {
        fs.unlinkSync(file);
      } catch {}
    }
  }
});

function toSrtTime(seconds) {
  const ms = Math.round(Number(seconds || 0) * 1000);

  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const m = String(Math.floor(ms % 3600000 / 60000)).padStart(2, "0");
  const s = String(Math.floor(ms % 60000 / 1000)).padStart(2, "0");
  const z = String(ms % 1000).padStart(3, "0");

  return `${h}:${m}:${s},${z}`;
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Paperhouse AI running on port ${PORT}`);
});
