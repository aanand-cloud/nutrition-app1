/** Search packaged food via Open Food Facts (free, no API key). */

import { lookupBarcodeProduct } from './barcode.js';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function previewKcal(product) {
  const n = product.nutriments || {};
  const servingG = num(product.serving_quantity) || 100;
  const factor = servingG / 100;
  const kcal100 = num(n['energy-kcal_100g']) || num(n.energy_kcal_100g) || num(n.energy_100g) / 4.184;
  return Math.round(kcal100 * factor) || Math.round(num(n['energy-kcal_serving']) || num(n.energy_kcal_serving)) || null;
}

export async function searchFoodProducts(query, { pageSize = 15 } = {}) {
  const q = String(query || '').trim();
  if (q.length < 2) {
    throw new Error('Type at least 2 characters to search');
  }

  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&action=process&json=1&page_size=${pageSize}&fields=code,product_name,brands,quantity,serving_size,serving_quantity,nutriments,image_front_small_url&search_terms=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Search failed — check your connection');

  const data = await res.json();
  const products = (data.products || []).filter((p) => p.product_name && p.code);

  return products.map((p) => ({
    code: String(p.code),
    name: [p.product_name, p.brands].filter(Boolean).join(' — '),
    detail: [p.quantity, p.serving_size].filter(Boolean).join(' · '),
    imageUrl: p.image_front_small_url || null,
    kcalPreview: previewKcal(p),
  }));
}

export async function lookupFoodProduct(code) {
  const product = await lookupBarcodeProduct(code);
  return { ...product, source: 'food_search' };
}
