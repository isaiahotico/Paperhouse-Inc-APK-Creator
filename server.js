import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = process.env.PORT || 10000;
const ROOT = path.dirname(fileURLToPath(import.meta.url));

app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(express.json({ limit: "20kb" }));

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false
});

const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: "draft-8",
  legacyHeaders: false
});

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function cleanText(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

app.get("/api/health", (req, res) => {
  res.json({
    app: "Paperhouse Inc.",
    status: "online",
    gemini: Boolean(process.env.GEMINI_API_KEY),
    pexels: Boolean(process.env.PEXELS_API_KEY)
  });
});

// ------------------------------------------
// GEMINI: PROMPT TO VIDEO STORYBOARD
// ------------------------------------------

app.post("/api/plan", aiLimiter, async (req, res) => {
  try {
    const key = requiredEnv("GEMINI_API_KEY");

    const prompt = cleanText(req.body?.prompt, 2000);
    const style = cleanText(req.body?.style, 80) || "Cinematic documentary";
    const language = cleanText(req.body?.language, 40) || "English";

    if (!prompt) {
      return res.status(400).json({ error: "Enter a video prompt." });
    }

    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    const instruction = `
You are the intelligent video director for Paperhouse Inc.

Your task is to plan a video using EXISTING real-world footage only.
Do not generate video, images, or fictional footage.

USER PROMPT:
${prompt}

STYLE:
${style}

NARRATION LANGUAGE:
${language}

Return JSON only, in this exact structure:

{
  "title": "Video title",
  "concept": "Short concept",
  "narration": "Complete narration script",
  "scenes": [
    {
      "title": "Scene title",
      "description": "What should appear in the footage",
      "searchQuery": "Practical stock video search keywords",
      "duration": 10,
      "narration": "Narration for this scene"
    }
  ]
}

Rules:
- Exactly 6 scenes.
- Each scene must be 10 seconds.
- Total video duration must be 60 seconds.
- Search queries must describe real footage that can be found online.
- Create a coherent beginning, middle, and ending.
- Do not ask for AI-generated footage.
- Use practical stock video search terms.
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: instruction }] }],
          generationConfig: {
            temperature: 0.7,
            responseMimeType: "application/json"
          }
        }),
        signal: AbortSignal.timeout(60000)
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", result);
      return res.status(502).json({
        error: "Gemini could not create your storyboard. Check your API quota and configuration."
      });
    }

    const raw = result.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("");

    if (!raw) throw new Error("Gemini returned an empty response.");

    const plan = JSON.parse(raw);

    if (!Array.isArray(plan.scenes) || plan.scenes.length !== 6) {
      throw new Error("Gemini returned an invalid storyboard.");
    }

    const scenes = plan.scenes.map((scene, index) => ({
      title: cleanText(scene.title, 120) || `Scene ${index + 1}`,
      description: cleanText(scene.description, 500),
      searchQuery: cleanText(scene.searchQuery, 180) ||
        cleanText(scene.title, 120),
      duration: 10,
      narration: cleanText(scene.narration, 1000)
    }));

    res.json({
      title: cleanText(plan.title, 150) || "Paperhouse Video",
      concept: cleanText(plan.concept, 500),
      narration: cleanText(plan.narration, 5000),
      scenes
    });

  } catch (error) {
    console.error("Storyboard error:", error.message);
    res.status(500).json({
      error: "Unable to create storyboard. Please try again."
    });
  }
});

// ------------------------------------------
// PEXELS: VIDEO SEARCH
// ------------------------------------------

app.get("/api/search", searchLimiter, async (req, res) => {
  try {
    const key = requiredEnv("PEXELS_API_KEY");
    const query = cleanText(req.query.q, 150);

    const orientation = ["landscape", "portrait", "square"]
      .includes(req.query.orientation)
      ? req.query.orientation
      : "landscape";

    if (!query) {
      return res.status(400).json({ error: "Enter search keywords." });
    }

    const url = new URL("https://api.pexels.com/videos/search");
    url.searchParams.set("query", query);
    url.searchParams.set("per_page", "8");
    url.searchParams.set("orientation", orientation);

    const response = await fetch(url, {
      headers: { Authorization: key },
      signal: AbortSignal.timeout(30000)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Pexels error:", data);
      return res.status(502).json({
        error: "Video search failed. Check the Pexels API configuration."
      });
    }

    const videos = (data.videos || []).map(video => {
      const files = (video.video_files || [])
        .filter(file =>
          file.link &&
          file.file_type?.toLowerCase().includes("mp4") &&
          safePexelsURL(file.link)
        )
        .sort((a, b) => (a.width || 9999) - (b.width || 9999));

      const selected =
        files.find(file => (file.width || 0) >= 360) || files[0];

      if (!selected) return null;

      return {
        id: String(video.id),
        name: `Pexels video ${video.id}`,
        url: `/api/clip?url=${encodeURIComponent(selected.link)}`,
        thumbnail: video.image,
        photographer: cleanText(video.user?.name, 100),
        sourceUrl: video.url,
        duration: video.duration || 0,
        source: "Pexels"
      };
    }).filter(Boolean);

    res.json({ videos });

  } catch (error) {
    console.error("Pexels search error:", error.message);
    res.status(500).json({ error: "Unable to search videos." });
  }
});

// ------------------------------------------
// PEXELS: SAFE VIDEO PROXY
// ------------------------------------------

function safePexelsURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "videos.pexels.com";
  } catch {
    return false;
  }
}

app.get("/api/clip", async (req, res) => {
  try {
    const url = String(req.query.url || "");

    if (!safePexelsURL(url)) {
      return res.status(400).send("Invalid video source.");
    }

    const upstream = await fetch(url, {
      signal: AbortSignal.timeout(120000)
    });

    if (!upstream.ok || !upstream.body) {
      return res.status(502).send("Unable to retrieve video.");
    }

    res.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "video/mp4"
    );
    res.setHeader("Cache-Control", "private, max-age=300");

    const { Readable } = await import("node:stream");
    Readable.fromWeb(upstream.body).pipe(res);

  } catch (error) {
    console.error("Video proxy error:", error.message);
    if (!res.headersSent) {
      res.status(500).send("Video download failed.");
    }
  }
});

// ------------------------------------------
// WEBSITE
// ------------------------------------------

app.use(express.static(path.join(ROOT, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(ROOT, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Paperhouse Inc. running on port ${PORT}`);
});
