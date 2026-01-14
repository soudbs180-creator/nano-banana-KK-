import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("Missing GEMINI_API_KEY in environment variables");
        return res.status(500).json({ error: "Server configuration error" });
    }

    try {
        const { prompt, model: modelName = "gemini-1.5-flash", config = {} } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: "Prompt is required" });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName });

        // Handle image input if present in config (simplified for text-to-image/text-to-text)
        // Note: Gemini implementation details depend on exact use case (text or image input)
        // For now, assuming text prompt -> text generation (or handled by model)

        // If generationConfig is passed
        const generationConfig = {
            temperature: config.temperature || 0.7,
            topK: config.topK || 40,
            topP: config.topP || 0.95,
            maxOutputTokens: config.maxOutputTokens || 1024,
        };

        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig,
        });

        const response = await result.response;
        const text = response.text();

        return res.status(200).json({ text });
    } catch (error) {
        console.error("Generation error:", error);
        return res.status(500).json({ error: error.message || "Failed to generate content" });
    }
}
