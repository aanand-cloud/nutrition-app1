import { resolve } from 'path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { analyzeFoodWithGemini } from './netlify/lib/gemini.mjs';
import { ANALYSIS_PROMPT, CLARIFY_PROMPT } from './netlify/lib/prompts.mjs';
import { generateCuisineTips } from './netlify/lib/cuisine-tips-core.mjs';
import { validateVoucherCode } from './netlify/lib/voucher.mjs';

function readJsonBody(req) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString()));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(obj));
}

function devCheckoutApi() {
  return {
    name: 'dev-checkout-api',
    configureServer(server) {
      server.middlewares.use('/api/create-subscription', async (req, res, next) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.end();
          return;
        }
        if (req.method !== 'POST') return next();
        try {
          const body = await readJsonBody(req);
          sendJson(res, 200, { mock: true, plan: body.plan || 'daily10' });
        } catch (e) {
          sendJson(res, 502, { error: e.message || 'Failed' });
        }
      });

      server.middlewares.use('/api/create-topup', async (req, res, next) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.end();
          return;
        }
        if (req.method !== 'POST') return next();
        sendJson(res, 200, { mock: true, type: 'topup', scans: 100 });
      });

      server.middlewares.use('/api/create-billing-portal', async (req, res, next) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.end();
          return;
        }
        if (req.method !== 'POST') return next();
        sendJson(res, 503, {
          error:
            'Billing portal needs live Stripe keys. Deploy to Netlify with STRIPE_SECRET_KEY, or cancel in Stripe Dashboard for test subscriptions.',
        });
      });

      server.middlewares.use('/api/verify-subscription', async (req, res, next) => {
        if (req.method !== 'GET') return next();
        const url = new URL(req.url, 'http://localhost');
        const sessionId = url.searchParams.get('session_id') || 'dev';
        sendJson(res, 200, {
          mock: true,
          ok: true,
          type: 'topup',
          scans: 100,
          sessionId,
          alreadyRedeemed: false,
        });
      });
    },
  };
}

function devGeminiApi(geminiKey, env = {}) {
  return {
    name: 'dev-gemini-api',
    configureServer(server) {
      server.middlewares.use('/api/analyze-food', async (req, res, next) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.end();
          return;
        }
        if (req.method !== 'POST') return next();

        try {
          const body = await readJsonBody(req);
          if (!body.image) {
            sendJson(res, 400, { error: 'image is required' });
            return;
          }
          if (!geminiKey) {
            sendJson(res, 503, {
              error: 'Add GEMINI_API_KEY to .env for real photo analysis',
              needsKey: true,
            });
            return;
          }
          const prompt = body.context ? CLARIFY_PROMPT : ANALYSIS_PROMPT;
          const analysis = await analyzeFoodWithGemini(geminiKey, { ...body, prompt });
          sendJson(res, 200, { analysis });
        } catch (e) {
          sendJson(res, 502, { error: e.message || 'Analysis failed' });
        }
      });

      server.middlewares.use('/api/cuisine-tips', async (req, res, next) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.end();
          return;
        }
        if (req.method !== 'POST') return next();

        try {
          if (!geminiKey) {
            sendJson(res, 503, { error: 'GEMINI_API_KEY not configured' });
            return;
          }
          const body = await readJsonBody(req);
          const data = await generateCuisineTips(geminiKey, body);
          sendJson(res, 200, data);
        } catch (e) {
          sendJson(res, 502, { error: e.message || 'Failed to generate tips' });
        }
      });

      server.middlewares.use('/api/validate-voucher', async (req, res, next) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.end();
          return;
        }
        if (req.method !== 'POST') return next();

        try {
          const body = await readJsonBody(req);
          const result = validateVoucherCode(body.code, env);
          if (!result.ok) {
            sendJson(res, 400, { error: result.error });
            return;
          }
          sendJson(res, 200, result);
        } catch (e) {
          sendJson(res, 502, { error: e.message || 'Voucher check failed' });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const useHttps = mode === 'https' || env.VITE_DEV_HTTPS === 'true';

  return {
    root: '.',
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || ''),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || ''),
      'import.meta.env.VITE_VAPID_PUBLIC_KEY': JSON.stringify(env.VITE_VAPID_PUBLIC_KEY || ''),
    },
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: resolve(__dirname, 'index.html'),
      },
    },
    plugins: [
      ...(useHttps ? [basicSsl()] : []),
      devGeminiApi(env.GEMINI_API_KEY || '', env),
      devCheckoutApi(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.js',
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
        manifest: {
          name: 'NutriLog — Photo Calorie Tracker',
          short_name: 'NutriLog',
          description: 'Track calories and nutrition by photographing your meals. Worldwide, multi-cuisine.',
          theme_color: '#0f766e',
          background_color: '#f0fdfa',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
  };
});
