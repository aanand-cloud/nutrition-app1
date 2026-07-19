import { getMealsInRange } from '../services/storage.js';
import { weekReport, monthReport } from '../services/reports.js';
import { getCuisineTips } from '../services/cuisine-tips.js';
import { formatEnergy, formatEnergyParts, getUnitPrefs } from '../services/goals.js';
export async function renderReports(root, { profile, onLog } = {}) {
  const displayName = profile?.displayName || '';
  const end = new Date();
  const weekStart = new Date(end);
  weekStart.setDate(weekStart.getDate() - 6);
  const monthStart = new Date(end);
  monthStart.setDate(monthStart.getDate() - 29);

  const fmt = (d) => d.toISOString().slice(0, 10);
  const weekMeals = await getMealsInRange(fmt(weekStart), fmt(end));
  const monthMeals = await getMealsInRange(fmt(monthStart), fmt(end));

  const week = weekReport(weekMeals);
  const month = monthReport(monthMeals);
  let tab = 'week';
  let cuisineTips = weekMeals.length ? await getCuisineTips(weekMeals) : { tips: [], patterns: [] };

  function draw() {
    const report = tab === 'week' ? week : month;
    const label = tab === 'week' ? '7 days' : '30 days';
    const tips = tab === 'week' ? cuisineTips : { tips: [], patterns: [] };
    const prefs = getUnitPrefs();
    const avgEnergy = formatEnergyParts(report.averages.calories_kcal, prefs);
    const energyPerDay = `${avgEnergy.unit} / day`;

    root.innerHTML = `      <section class="section">
        <h2 class="report-greeting">${escapeHtml(displayName ? `${displayName}'s report` : 'Your report')}</h2>
        <p class="report-intro">${displayName ? `Hi ${escapeHtml(displayName)}, here's how you've been doing.` : 'Track meals to see personalised insights.'}</p>
        <div class="tab-bar">
          <button type="button" class="tab ${tab === 'week' ? 'active' : ''}" data-tab="week">Week</button>
          <button type="button" class="tab ${tab === 'month' ? 'active' : ''}" data-tab="month">Month</button>
        </div>
        <p class="report-sub">${report.daysWithData} days logged in the last ${label}</p>
      </section>

      <section class="card">
        <h2 class="card-title">Daily average</h2>
        <div class="avg-grid">
          <div class="avg-main">
            <span class="avg-value">${avgEnergy.value}</span>
            <span class="avg-label">${energyPerDay}</span>
          </div>          ${['protein_g', 'carbs_g', 'fat_g', 'fibre_g'].map((k) => {
            const meta = report.nutrients.find((n) => n.key === k);
            const goal = report.goals[meta.goalKey];
            const val = report.averages[k];
            const pct = goal ? Math.round((val / goal) * 100) : 0;
            return `
              <div class="avg-row">
                <span>${meta.label}</span>
                <div class="bar-wrap"><div class="bar" style="width:${Math.min(100, pct)}%"></div></div>
                <span class="avg-num">${Math.round(val)}g <small>(${pct}%)</small></span>
              </div>
            `;
          }).join('')}
        </div>
      </section>

      ${tips.tips?.length ? `
        <section class="section">
          <h2>AI coach tips (your cuisine)</h2>
          ${tips.patterns?.length ? `<p class="report-sub">Patterns: ${tips.patterns.map(escapeHtml).join(' · ')}</p>` : ''}
          ${tips.tips.map((tip) => `
            <article class="cuisine-tip card">
              <span class="cuisine-tag">${escapeHtml(tip.cuisine || 'Tip')}</span>
              <h3>${escapeHtml(tip.title)}</h3>
              <p>${escapeHtml(tip.body)}</p>
            </article>
          `).join('')}
          ${tips.source === 'demo' ? `<p class="fine-print">${import.meta.env.DEV ? 'Demo tips — add GEMINI_API_KEY for personalised AI coaching.' : 'Log more meals for personalised coaching tips.'}</p>` : ''}
        </section>
      ` : ''}

      <section class="card">
        <h2 class="card-title">Energy this ${tab}</h2>
        <div class="chart" role="img" aria-label="Daily energy chart">
          ${report.chartDays.map((d) => {
            const max = report.goals.calories_kcal || 2000;
            const h = Math.min(100, (d.calories_kcal / max) * 100);
            return `
              <div class="chart-col" title="${d.label}: ${formatEnergy(d.calories_kcal, prefs)}">
                <div class="chart-bar" style="height:${h}%"></div>
                <span class="chart-label">${d.label.split(' ')[0]}</span>
              </div>
            `;
          }).join('')}
        </div>
      </section>

      <section class="section">
        <h2>Insights & suggestions</h2>
        ${report.daysWithData === 0 ? `
          <div class="card muted-card empty-state">
            <p>No meals logged in this period yet.</p>
            <p class="fine-print">Log a few days of meals to unlock personalised insights and coaching tips.</p>
            ${onLog ? `<button type="button" class="btn btn-primary" id="reportsEmptyLog">Log a meal</button>` : ''}
          </div>
        ` : report.insights.length === 0 ? `
          <div class="card muted-card">
            <p>${displayName ? `${displayName}, looking good` : 'Looking good'} — no major gaps vs your goals this period. Keep logging meals for sharper trends.</p>
          </div>
        ` : report.insights.map((ins) => `
          <article class="insight-card ${ins.type}">
            <span class="insight-badge">${ins.type === 'low' ? '↓ Low' : '↑ High'} ${ins.label}</span>
            ${ins.daysUnderTarget ? `<p class="insight-meta">${ins.daysUnderTarget} of ${report.daysWithData} logged day(s) off target</p>` : ''}
            <p>${displayName ? `${escapeHtml(displayName)}, ${ins.message.charAt(0).toLowerCase()}${ins.message.slice(1)}` : ins.message}</p>
            ${ins.suggestions?.length ? `
              <ul class="suggest-list">
                ${ins.suggestions.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}
              </ul>
            ` : ''}
          </article>
        `).join('')}
      </section>
    `;

    root.querySelector('#reportsEmptyLog')?.addEventListener('click', () => onLog?.());
    root.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        tab = btn.dataset.tab;
        draw();
      });
    });
  }

  draw();
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
