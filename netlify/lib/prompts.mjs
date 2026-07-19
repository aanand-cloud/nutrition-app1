export const ANALYSIS_PROMPT = `Analyse this photo of food and return ONLY valid JSON matching the format below — no extra text.
Rules:
1. Identify ALL visible food and drink items.
2. Support ANY cuisine worldwide.
3. Estimate portions; mark confidence level (0–1). This is an estimate, not a lab measurement.
4. Calculate approximate nutrition using USDA / UK reference values.
5. Use user meal hints when provided.
6. If unsure, add up to 4 short clarification_questions.
JSON FORMAT:
{
  "meal_summary": "Short name",
  "total_calories_kcal": number,
  "total_nutrition": { "protein_g": number, "carbs_g": number, "fat_g": number, "sugar_g": number, "fibre_g": number, "salt_mg": number },
  "confidence_score": number,
  "items": [{ "name": string, "portion_estimate": string, "calories_kcal": number, "nutrition": { "protein_g": number, "carbs_g": number, "fat_g": number }, "confidence": number }],
  "clarification_questions": []
}`;

export const CLARIFY_PROMPT = `Refine the previous meal estimate using the user's clarification answers. Return ONLY valid JSON in the same format. Set clarification_questions to []. Use USDA / UK reference values.`;
