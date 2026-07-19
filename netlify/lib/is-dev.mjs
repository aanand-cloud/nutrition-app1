/** True only for local Netlify/Vite dev — never enable mock billing in production. */
export function isDevEnvironment(env = process.env) {
  if (env.NETLIFY_DEV === 'true') return true;
  const url = env.URL || env.DEPLOY_URL || '';
  return /localhost|127\.0\.0\.1|:5173|:8888/i.test(url);
}
