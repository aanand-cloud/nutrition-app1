/** Lookup packaged food via Open Food Facts (free, no API key). */

export async function lookupBarcodeProduct(code) {
  const barcode = String(code || '').replace(/\D/g, '');
  if (barcode.length < 8) {
    throw new Error('Enter a valid barcode (8+ digits)');
  }

  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=code,product_name,brands,quantity,serving_size,serving_quantity,nutriments,image_front_small_url`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not look up product');
  const data = await res.json();
  if (data.status !== 1 || !data.product) {
    throw new Error('Product not found — try photo logging instead');
  }
  return productToAnalysis(data.product, barcode);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function productToAnalysis(product, barcode, source = 'barcode') {
  const n = product.nutriments || {};
  const hasServing = Boolean(product.serving_quantity || product.serving_size);
  const servingG = num(product.serving_quantity) || 100;
  const factor = servingG / 100;

  const kcal100 = num(n['energy-kcal_100g']) || num(n.energy_kcal_100g) || (num(n.energy_100g) / 4.184);
  const kcal = Math.round(kcal100 * factor) || Math.round(num(n['energy-kcal_serving']) || num(n.energy_kcal_serving));

  const nutrition = {
    protein_g: round1(num(n.proteins_100g) * factor || num(n.proteins_serving)),
    carbs_g: round1(num(n.carbohydrates_100g) * factor || num(n.carbohydrates_serving)),
    fat_g: round1(num(n.fat_100g) * factor || num(n.fat_serving)),
    fibre_g: round1(num(n.fiber_100g) * factor || num(n.fibre_100g) * factor || num(n.fiber_serving)),
    sugar_g: round1(num(n.sugars_100g) * factor || num(n.sugars_serving)),
    salt_mg: round1((num(n.salt_100g) || num(n.sodium_100g) * 2.5) * factor * 1000),
  };

  const name = [product.product_name, product.brands].filter(Boolean).join(' — ') || 'Packaged food';
  const portion = product.serving_size || product.quantity || `${servingG}g serving`;
  const confidence = hasServing ? 0.88 : 0.72;

  return {
    meal_summary: name,
    total_calories_kcal: kcal,
    total_nutrition: nutrition,
    confidence_score: confidence,
    items: [
      {
        name,
        portion_estimate: portion,
        calories_kcal: kcal,
        nutrition: {
          protein_g: nutrition.protein_g,
          carbs_g: nutrition.carbs_g,
          fat_g: nutrition.fat_g,
        },
        confidence,
      },
    ],
    clarification_questions: [],
    source,
    barcode,
    imageUrl: product.image_front_small_url || null,
  };
}

function round1(v) {
  return Math.round(v * 10) / 10;
}
