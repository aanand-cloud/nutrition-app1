import { analyzeFoodWithGemini } from '../lib/gemini.mjs';

import { ANALYSIS_PROMPT, CLARIFY_PROMPT } from '../lib/prompts.mjs';

import { createClient } from '@supabase/supabase-js';

import {

  checkScanAllowed,

  consumeMealScan,

  isValidRefinementContext,

} from '../lib/scan-enforcement.mjs';

import { isDevEnvironment } from '../lib/is-dev.mjs';



const CORS = {

  'Access-Control-Allow-Origin': '*',

  'Access-Control-Allow-Headers': 'Content-Type, Authorization',

  'Access-Control-Allow-Methods': 'POST, OPTIONS',

};



const MAX_IMAGE_CHARS = 6_000_000;



const supabaseAdmin =

  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY

    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

    : null;



export default async (req) => {

  if (req.method === 'OPTIONS') {

    return new Response('', { status: 204, headers: CORS });

  }

  if (req.method !== 'POST') {

    return json({ error: 'Method not allowed' }, 405);

  }



  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {

    return json({ error: 'GEMINI_API_KEY not configured on server' }, 503);

  }



  let body;

  try {

    body = await req.json();

  } catch {

    return json({ error: 'Invalid JSON body' }, 400);

  }



  const { image, mimeType = 'image/jpeg', context, userNotes, accessToken, localDayKey } = body;

  if (!image) {

    return json({ error: 'image is required' }, 400);

  }

  if (typeof image !== 'string' || image.length > MAX_IMAGE_CHARS) {

    return json({ error: 'Image too large' }, 413);

  }



  const isRefinement = isValidRefinementContext(context);

  if (context && !isRefinement) {

    return json({ error: 'Invalid refinement context' }, 400);

  }



  const requireAuth = Boolean(supabaseAdmin) && !isDevEnvironment();

  if (requireAuth && !accessToken) {

    return json({ error: 'Sign in required to log meals with AI', requiresAuth: true }, 401);

  }



  let userId = null;

  if (accessToken && supabaseAdmin) {

    const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(accessToken);

    if (authErr || !userData?.user) {

      return json({ error: 'Invalid or expired session — sign in again', requiresAuth: true }, 401);

    }

    userId = userData.user.id;



    if (!isRefinement) {

      const scanCheck = await checkScanAllowed(supabaseAdmin, userId);

      if (!scanCheck.ok) {

        return json({ error: scanCheck.error || 'Scan limit reached' }, 429);

      }

    }

  } else if (requireAuth) {

    return json({ error: 'Sign in required to log meals with AI', requiresAuth: true }, 401);

  }



  const prompt = isRefinement ? CLARIFY_PROMPT : ANALYSIS_PROMPT;



  try {

    const analysis = await analyzeFoodWithGemini(apiKey, {

      image,

      mimeType,

      prompt,

      context: isRefinement ? context : undefined,

      userNotes,

    });



    let usage = null;

    if (userId && supabaseAdmin && !isRefinement) {

      const consumed = await consumeMealScan(supabaseAdmin, userId, { localDayKey });

      if (!consumed.ok) {

        return json({ error: consumed.error || 'Scan limit reached' }, 429);

      }

      usage = consumed.usage;

    }



    return json({ analysis, usage });

  } catch (e) {

    console.error(e);

    return json({ error: e.message || 'Server error during analysis' }, 502);

  }

};



function json(obj, status = 200) {

  return new Response(JSON.stringify(obj), {

    status,

    headers: { ...CORS, 'Content-Type': 'application/json' },

  });

}

