/** Manual food name search modal (Open Food Facts). */

import { searchFoodProducts } from './food-search.js';

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function openFoodSearchModal() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'camera-modal';
    overlay.innerHTML = `
      <div class="camera-modal__panel camera-modal__panel--barcode food-search-panel">
        <h2 class="barcode-title">Search food</h2>
        <p class="barcode-hint">Find packaged food by name or brand — free, no AI scan</p>
        <label class="field full">
          <span>Food name</span>
          <input type="search" id="foodSearchInput" placeholder="e.g. Weetabix, Heinz baked beans" autocomplete="off"/>
        </label>
        <p class="fine-print food-search-status" id="foodSearchStatus">Type at least 2 characters</p>
        <div class="food-search-results" id="foodSearchResults" role="listbox" aria-label="Search results"></div>
        <div class="camera-modal__actions">
          <button type="button" class="btn btn-ghost" id="foodSearchCancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    const input = overlay.querySelector('#foodSearchInput');
    const resultsEl = overlay.querySelector('#foodSearchResults');
    const statusEl = overlay.querySelector('#foodSearchStatus');
    let done = false;
    let searchTimer = null;
    let searchSeq = 0;

    function finish(code) {
      if (done) return;
      done = true;
      if (searchTimer) clearTimeout(searchTimer);
      overlay.remove();
      document.body.style.overflow = '';
      resolve(code || null);
    }

    function renderResults(items) {
      if (!items.length) {
        resultsEl.innerHTML = `<p class="fine-print food-search-empty">No products found — try different words or scan the barcode.</p>`;
        return;
      }

      resultsEl.innerHTML = items
        .map(
          (item) => `
          <button type="button" class="food-search-item" data-code="${escapeHtml(item.code)}" role="option">
            ${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="" class="food-search-thumb" loading="lazy"/>` : `<span class="food-search-thumb food-search-thumb--empty">📦</span>`}
            <span class="food-search-copy">
              <strong>${escapeHtml(item.name)}</strong>
              ${item.detail ? `<span class="food-search-detail">${escapeHtml(item.detail)}</span>` : ''}
              ${item.kcalPreview ? `<span class="food-search-kcal">~${item.kcalPreview} kcal per serving</span>` : ''}
            </span>
          </button>
        `
        )
        .join('');

      resultsEl.querySelectorAll('.food-search-item').forEach((btn) => {
        btn.addEventListener('click', () => finish(btn.dataset.code));
      });
    }

    async function runSearch(query) {
      const seq = ++searchSeq;
      statusEl.textContent = 'Searching…';
      resultsEl.innerHTML = '';

      try {
        const items = await searchFoodProducts(query);
        if (seq !== searchSeq || done) return;
        statusEl.textContent = items.length ? `${items.length} result${items.length === 1 ? '' : 's'}` : 'No matches';
        renderResults(items);
      } catch (err) {
        if (seq !== searchSeq || done) return;
        statusEl.textContent = err.message || 'Search failed';
        resultsEl.innerHTML = '';
      }
    }

    function queueSearch() {
      const q = input.value.trim();
      if (searchTimer) clearTimeout(searchTimer);
      if (q.length < 2) {
        statusEl.textContent = 'Type at least 2 characters';
        resultsEl.innerHTML = '';
        return;
      }
      searchTimer = setTimeout(() => runSearch(q), 350);
    }

    overlay.querySelector('#foodSearchCancel').addEventListener('click', () => finish(null));
    input.addEventListener('input', queueSearch);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') finish(null);
    });

    setTimeout(() => input.focus(), 50);
  });
}
