const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models';

export function defaultVisionModel() {
  return process.env.GEMINI_VISION_MODEL || 'gemini-3.1-flash-lite';
}

export function defaultTextModel() {
  return process.env.GEMINI_TEXT_MODEL || 'gemini-3.1-flash-lite';
}

export function parseGeminiJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Could not parse model JSON');
    return JSON.parse(match[0]);
  }
}

export async function geminiGenerate({
  apiKey,
  model,
  systemPrompt,
  parts,
  temperature = 0.2,
  maxOutputTokens = 1200,
}) {
  const res = await fetch(`${GEMINI_API}/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      systemInstruction: systemPrompt
        ? { parts: [{ text: systemPrompt }] }
        : undefined,
      generationConfig: {
        temperature,
        maxOutputTokens,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API request failed (${res.status}): ${err.slice(0, 280)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini model');
  return parseGeminiJson(text);
}

export async function analyzeFoodWithGemini(apiKey, body, model = defaultVisionModel()) {
  const { image, mimeType = 'image/jpeg', prompt, context, userNotes } = body;
  const parts = [];
  if (userNotes?.trim()) {
    parts.push({
      text: `User description of the meal (trust for hidden ingredients, cooking method, portion size, and anything not visible in the photo):\n${userNotes.trim()}`,
    });
  }
  if (context) {
    parts.push({
      text: `Context from user clarifications:\n${JSON.stringify(context, null, 2)}`,
    });
  }
  parts.push({ text: prompt });
  parts.push({ inline_data: { mime_type: mimeType, data: image } });

  return geminiGenerate({
    apiKey,
    model,
    systemPrompt:
      'You are a precise nutrition analysis engine. Always respond with a single valid JSON object. Support all world cuisines. Use USDA and UK PHE reference values.',
    parts,
    temperature: 0.2,
    maxOutputTokens: 1200,
  });
}
