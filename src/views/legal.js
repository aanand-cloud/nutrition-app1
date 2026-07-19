const PRIVACY_HTML = `
  <h2>Privacy policy</h2>
  <p><strong>Last updated:</strong> July 2026</p>
  <p>NutriLog helps you track meals using photos, barcodes, and your own notes. This policy explains what we collect and why.</p>

  <h3>What we collect</h3>
  <ul>
    <li><strong>Account:</strong> email, first name, password (stored securely by Supabase).</li>
    <li><strong>Meals:</strong> photos you choose to log, AI estimates, nutrition totals, meal notes, and dates.</li>
    <li><strong>Goals & preferences:</strong> calorie targets, macros, energy units, notification settings.</li>
    <li><strong>Billing:</strong> subscription status via Stripe (we do not store full card numbers).</li>
    <li><strong>Discount eligibility:</strong> optional NHS/work email or self-declared 60+ status for pricing.</li>
  </ul>

  <h3>How we use data</h3>
  <ul>
    <li>Show your daily totals, reports, and personalised tips.</li>
    <li>Sync meals across your devices when signed in.</li>
    <li>Process subscriptions and meal-log allowances.</li>
    <li>Send optional reminders if you turn notifications on.</li>
  </ul>

  <h3>AI & third parties</h3>
  <ul>
    <li><strong>Google Gemini:</strong> meal photos are sent for AI nutrition estimates. Do not log sensitive documents.</li>
    <li><strong>Open Food Facts:</strong> barcode and name search for packaged food (no photo sent).</li>
    <li><strong>Supabase:</strong> account and cloud storage (EU-friendly hosting depending on your project region).</li>
    <li><strong>Stripe:</strong> secure payments.</li>
  </ul>

  <h3>Your rights (UK / GDPR)</h3>
  <p>You can export your data from Settings → Account. You may request deletion of your account and cloud data by contacting us. Local data on your device can be cleared by removing meals or signing out and clearing local storage.</p>

  <h3>Retention</h3>
  <p>We keep data while your account is active. You can delete individual meals in the app at any time.</p>

  <h3>Contact</h3>
  <p>Questions: use the support email shown on your NutriLog website or app store listing.</p>

  <p class="fine-print"><strong>Not medical advice.</strong> NutriLog provides estimates only. Speak to your GP or a dietitian for health concerns.</p>
`;

const TERMS_HTML = `
  <h2>Terms of use</h2>
  <p><strong>Last updated:</strong> July 2026</p>

  <h3>Wellness tool only</h3>
  <p>NutriLog gives AI-powered <em>estimates</em>, not laboratory nutrition analysis or medical advice. Always check food labels when accuracy matters.</p>

  <h3>Your account</h3>
  <ul>
    <li>Keep your password private.</li>
    <li>One person per account — do not share login details.</li>
    <li>Do not attempt to bypass meal-log limits or abuse free or paid allowances.</li>
  </ul>

  <h3>Subscriptions</h3>
  <ul>
    <li>Paid plans and top-ups are billed monthly via Stripe.</li>
    <li>Meal-log allowances reset as shown in the app (daily for free, monthly for paid).</li>
    <li>You can <strong>cancel or change your plan anytime</strong> in Goals → Plans → <em>Cancel or change plan</em> (Stripe billing portal).</li>
    <li>If you cancel, you keep access until the end of your current billing period, then return to the free plan.</li>
    <li>Refunds follow Stripe and applicable consumer law.</li>
  </ul>

  <h3>NHS & public sector discount</h3>
  <p>NutriLog is <strong>not affiliated with the NHS</strong>. Discounts are offered to eligible public-sector staff and over-60s who accurately declare eligibility.</p>

  <h3>Acceptable use</h3>
  <p>Do not upload illegal content, harass others, or automate abuse of our APIs, barcode lookups, or food search.</p>
`;

export function openLegalModal(kind = 'privacy') {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'camera-modal legal-modal';
    overlay.innerHTML = `
      <div class="camera-modal__panel legal-panel">
        <button type="button" class="legal-close" id="legalClose" aria-label="Close">✕</button>
        <div class="legal-body">${kind === 'terms' ? TERMS_HTML : PRIVACY_HTML}</div>
        <div class="camera-modal__actions">
          <button type="button" class="btn btn-primary full" id="legalOk">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    function close() {
      overlay.remove();
      document.body.style.overflow = '';
      resolve();
    }

    overlay.querySelector('#legalClose').addEventListener('click', close);
    overlay.querySelector('#legalOk').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
  });
}
