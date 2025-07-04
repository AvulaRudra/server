import express from 'express'; 
import { OpenAI } from 'openai';
import WrongEntry from '../models/WrongEntry.js';
import Correction from '../models/Correction.js';

const router = express.Router();

router.post('/generate-pitch', async (req, res) => {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const { projectInfo } = req.body;

    if (!projectInfo || !projectInfo["Project Name"]) {
      return res.status(400).json({ error: "Missing or invalid project info" });
    }

    const prompt = `
You are a real estate sales assistant helping a team pitch a residential project.

Here are the project details:

- Project Name: ${projectInfo["Project Name"]}
- Location: ${projectInfo["Location"]}
- Land Price Nearby: ${projectInfo["Price (per sq ft)"]}
- Metro Station Nearby: ${projectInfo["Metro Nearby"]}
- Possession: ${projectInfo["Possession"]}
- Configuration: ${projectInfo["Configuration"]}
- Amenities: ${projectInfo["Amenities"]}

Please generate the following sections in a clean numbered format:
1. Why This Project?
2. Top 3 Nearby Under-Construction Projects (include name, distance, and price per sq ft)
3. Best Pitch Lines (3–5 emotional or practical one-liners)
4. Top FAQs (3–5 most common queries)
5. WhatsApp Message (1 short message to send to leads)
6. Price Justification (2–3 strong lines)
7. Objection Handler (2–3 lines to overcome objections)
8. Finance & Tax Tips (real estate tax savings or home loan insights)
`.trim();

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    const raw = response.choices[0].message.content;
    console.log("\n🔍 RAW GPT RESPONSE:\n====================\n", raw, "\n====================\n");

    const sections = raw.split(/\n?\s*\d+\.\s+/).filter(Boolean);

    let result = {
      whyThis: sections[0]?.split("\n").map(l => l.trim()).filter(Boolean) || [],
      nearbyProjects: sections[1]?.split("\n").map(l => l.trim()).filter(Boolean) || [],
      pitchLines: sections[2]?.split("\n").map(l => l.trim()).filter(Boolean) || [],
      faqs: sections[3]?.split("\n").map(l => l.trim()).filter(Boolean) || [],
      whatsappMessage: sections[4]?.trim() || "",
      priceJustification: sections[5]?.split("\n").map(l => l.trim()).filter(Boolean) || [],
      objectionHandler: sections[6]?.split("\n").map(l => l.trim()).filter(Boolean) || [],
      financeTips: sections[7]?.split("\n").map(l => l.trim()).filter(Boolean) || [],
    };

    res.json(result);

  } catch (err) {
    console.error("❌ AI generation failed:", err);
    res.status(500).json({ error: "Something went wrong with AI generation" });
  }
});

export default router;
