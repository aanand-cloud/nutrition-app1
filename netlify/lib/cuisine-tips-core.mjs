import { defaultTextModel, geminiGenerate } from './gemini.mjs';

export const CUISINE_TIPS_PROMPT = `You are a multicultural nutrition coach. Given a user's weekly meal log patterns, return ONLY valid JSON:
{
  "patterns": ["short pattern labels, e.g. Frequent rice-based meals"],
  "tips": [
    {
      "title": "Short headline",
      "body": "1-2 sentence actionable tip referencing their actual foods and any nutrient gaps. Be specific to their cuisine mix.",
      "cuisine": "e.g. South Asian, East Asian, Mediterranean, Personalised"
    }
  ]
}
Rules:
- 2-4 tips max
- Reference their logged foods by name when possible
- If protein/fibre is low in insights, prioritise tips for that
- Support any world cuisine mix
- Friendly, practical tone — no medical claims`;

export async function generateCuisineTips(apiKey, { context, goals }, model = defaultTextModel()) {
  return geminiGenerate({
    apiKey,
    model,
    systemPrompt: CUISINE_TIPS_PROMPT,
    parts: [
      {
        text: `Weekly meal context:\n${JSON.stringify(context, null, 2)}\n\nUser goals:\n${JSON.stringify(goals, null, 2)}`,
      },
    ],
    temperature: 0.4,
    maxOutputTokens: 800,
  });
}
