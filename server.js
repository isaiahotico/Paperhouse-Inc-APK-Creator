import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 10000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "20kb" }));

app.use(express.static(path.join(__dirname, "public")));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Too many AI requests. Please try again later."
  }
});

app.use("/api/plan", limiter);

app.get("/api/health", (req, res) => {
  res.json({
    status: "online",
    app: "Paperhouse Inc.",
    ai: Boolean(process.env.GEMINI_API_KEY)
  });
});

app.post("/api/plan", async (req, res) => {
  try {
    const { prompt, style, language } = req.body || {};

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: "Gemini is not configured on the server."
      });
    }

    if (typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({
        error: "Please enter a video prompt."
      });
    }

    if (prompt.length > 2000) {
      return res.status(400).json({
        error: "Your prompt is too long. Maximum 2,000 characters."
      });
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
    });

    const instruction = `
You are the intelligent video director for Paperhouse Inc.

Create a video storyboard using ONLY existing stock footage.
Never request AI-generated video footage.

USER PROMPT:
${prompt.trim()}

VIDEO STYLE:
${String(style || "Cinematic documentary").slice(0, 80)}

NARRATION LANGUAGE:
${String(language || "English").slice(0, 40)}

Return valid JSON only, in this structure:

{
  "title": "Video title",
  "concept": "Short concept",
  "narration": "Complete narration script",
  "scenes": [
    {
      "title": "Scene title",
      "description": "Visual description",
      "searchQuery": "Specific stock footage search phrase",
      "duration": 10,
      "narration": "Scene narration"
    }
  ]
}

Requirements:
- Exactly 6 scenes.
- Each scene is 10 seconds.
- Total video length is 60 seconds.
- Search queries must find realistic existing footage.
- Make the scenes follow a coherent story.
- Do not create footage or claim footage exists.
- Keep search queries short and practical.
`;

    const result = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      contents: instruction,
      config: {
        temperature: 0.7,
        responseMimeType: "application/json"
      }
    });

    const plan = JSON.parse(result.text);

    if (!Array.isArray(plan.scenes) || plan.scenes.length !== 6) {
      throw new Error("AI returned an invalid storyboard.");
    }

    const cleanScenes = plan.scenes.map((scene, index) => ({
      title: String(scene.title || `Scene ${index + 1}`).slice(0, 120),
      description: String(scene.description || "").slice(0, 500),
      searchQuery: String(scene.searchQuery || scene.title || prompt).slice(0, 180),
      duration: 10,
      narration: String(scene.narration || "").slice(0, 1000)
    }));

    res.json({
      title: String(plan.title || "Paperhouse Video").slice(0, 150),
      concept: String(plan.concept || "").slice(0, 500),
      narration: String(plan.narration || "").slice(0, 5000),
      scenes: cleanScenes
    });

  } catch (error) {
    console.error("AI planning error:", error.message);

    res.status(500).json({
      error: "Unable to create the video plan. Please try again."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Paperhouse Inc. running on port ${PORT}`);
});
