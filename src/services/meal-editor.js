import { saveMeal } from './storage.js';
import { MEAL_TYPES, defaultMealType } from './meal-types.js';
import { getUnitPrefs } from './goals.js';

/** Edit an existing saved meal or review fields before first save. */
export function openMealEditorModal(meal, { title = 'Edit meal' } = {}) {
  return new Promise((resolve) => {
    const n = meal.total_nutrition || {};
    const prefs = getUnitPrefs();
    const energyFieldNote = prefs.energy === 'kJ'
      ? 'Enter kcal — the app shows kJ on Today and Reports'
      : '';
    const overlay = document.createElement('div');
    overlay.className = 'camera-modal';
    overlay.innerHTML = `
      <div class="camera-modal__panel meal-editor-panel">
        <h2 class="barcode-title">${escapeHtml(title)}</h2>
        <form id="mealEditorForm" class="auth-form meal-editor-form">
          <label class="field full">
            <span>Name</span>
            <input type="text" name="meal_summary" value="${escapeAttr(meal.meal_summary || '')}" required/>
          </label>
          <label class="field full">
            <span>Meal hints (optional)</span>
            <textarea name="meal_notes" rows="2" placeholder="Notes about ingredients, portion, cooking…">${escapeHtml(meal.meal_notes || '')}</textarea>
          </label>
          <label class="field full">
            <span>Meal type</span>
            <select name="meal_type">
              ${MEAL_TYPES.map((t) => `<option value="${t.id}" ${meal.meal_type === t.id ? 'selected' : ''}>${t.icon} ${t.label}</option>`).join('')}
            </select>
          </label>
          <label class="field">
            <span>Energy (kcal)${energyFieldNote ? ` — ${energyFieldNote}` : ''}</span>
            <input type="number" name="calories" min="0" step="1" value="${Math.round(meal.total_calories_kcal || 0)}"/>
          </label>
          <label class="field">
            <span>Protein (g)</span>
            <input type="number" name="protein_g" min="0" step="0.1" value="${n.protein_g ?? ''}"/>
          </label>
          <label class="field">
            <span>Carbs (g)</span>
            <input type="number" name="carbs_g" min="0" step="0.1" value="${n.carbs_g ?? ''}"/>
          </label>
          <label class="field">
            <span>Fat (g)</span>
            <input type="number" name="fat_g" min="0" step="0.1" value="${n.fat_g ?? ''}"/>
          </label>
          <label class="field">
            <span>Fibre (g)</span>
            <input type="number" name="fibre_g" min="0" step="0.1" value="${n.fibre_g ?? ''}"/>
          </label>
          <label class="field">
            <span>Sugar (g)</span>
            <input type="number" name="sugar_g" min="0" step="0.1" value="${n.sugar_g ?? ''}"/>
          </label>
          <label class="field">
            <span>Salt (mg)</span>
            <input type="number" name="salt_mg" min="0" step="1" value="${n.salt_mg ?? ''}"/>
          </label>
          <p class="fine-print">Edited values are estimates — check packaging if unsure.</p>
          <div class="camera-modal__actions full">
            <button type="button" class="btn btn-ghost" id="mealEditorCancel">Cancel</button>
            <button type="submit" class="btn btn-primary">Save changes</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    function close(result) {
      overlay.remove();
      document.body.style.overflow = '';
      resolve(result);
    }

    overlay.querySelector('#mealEditorCancel').addEventListener('click', () => close(null));
    overlay.querySelector('#mealEditorForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const total_nutrition = {
        protein_g: Number(fd.get('protein_g')) || 0,
        carbs_g: Number(fd.get('carbs_g')) || 0,
        fat_g: Number(fd.get('fat_g')) || 0,
        fibre_g: Number(fd.get('fibre_g')) || 0,
        sugar_g: Number(fd.get('sugar_g')) || 0,
        salt_mg: Number(fd.get('salt_mg')) || 0,
      };
      const updated = {
        ...meal,
        meal_summary: String(fd.get('meal_summary') || '').trim(),
        meal_notes: String(fd.get('meal_notes') || '').trim(),
        meal_type: fd.get('meal_type') || defaultMealType(),
        total_calories_kcal: Number(fd.get('calories')) || 0,
        total_nutrition,
      };
      try {
        await saveMeal(updated);
        close(updated);
      } catch (err) {
        alert(err.message || 'Could not save');
      }
    });
  });
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

function escapeAttr(s) {
  return String(s || '').replace(/"/g, '&quot;');
}
