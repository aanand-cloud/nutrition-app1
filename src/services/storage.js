const DB_NAME = 'nutrilog';
const DB_VERSION = 1;
const MEALS_STORE = 'meals';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(MEALS_STORE)) {
        const store = db.createObjectStore(MEALS_STORE, { keyPath: 'id' });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
}

function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function saveMeal(meal) {
  const db = await openDb();
  const record = await new Promise((resolve, reject) => {
    const tx = db.transaction(MEALS_STORE, 'readwrite');
    const store = tx.objectStore(MEALS_STORE);
    const rec = {
      ...meal,
      id: meal.id || generateId(),
      date: meal.date || todayKey(),
      createdAt: meal.createdAt || new Date().toISOString(),
    };
    store.put(rec);
    tx.oncomplete = () => resolve(rec);
    tx.onerror = () => reject(tx.error);
  });

  try {
    const { pushMeal } = await import('./sync.js');
    const pushed = await Promise.race([
      pushMeal(record),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000)),
    ]);
    return pushed;
  } catch (_) {
    return record;
  }
}

export async function getMealsForDate(dateKey) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEALS_STORE, 'readonly');
    const store = tx.objectStore(MEALS_STORE);
    const index = store.index('date');
    const req = index.getAll(dateKey);
    req.onsuccess = () => {
      const meals = (req.result || []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      resolve(meals);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getAllMeals() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEALS_STORE, 'readonly');
    const req = tx.objectStore(MEALS_STORE).getAll();
    req.onsuccess = () => {
      const meals = (req.result || []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      resolve(meals);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getMealsInRange(startDate, endDate) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEALS_STORE, 'readonly');
    const store = tx.objectStore(MEALS_STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const meals = (req.result || []).filter((m) => m.date >= startDate && m.date <= endDate);
      resolve(meals.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteMeal(id) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(MEALS_STORE, 'readwrite');
    tx.objectStore(MEALS_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  try {
    const { removeCloudMeal } = await import('./sync.js');
    await removeCloudMeal(id);
  } catch (_) {}
}

export async function clearAllLocalMeals() {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(MEALS_STORE, 'readwrite');
    tx.objectStore(MEALS_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function sumNutrition(meals) {
  const total = {
    calories_kcal: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    sugar_g: 0,
    fibre_g: 0,
    salt_mg: 0,
  };
  for (const meal of meals) {
    const n = meal.total_nutrition || meal.nutrition || {};
    total.calories_kcal += meal.total_calories_kcal || meal.calories_kcal || 0;
    total.protein_g += n.protein_g || 0;
    total.carbs_g += n.carbs_g || 0;
    total.fat_g += n.fat_g || 0;
    total.sugar_g += n.sugar_g || 0;
    total.fibre_g += n.fibre_g || 0;
    total.salt_mg += n.salt_mg || 0;
  }
  return total;
}

export { todayKey };
