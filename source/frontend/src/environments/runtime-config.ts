// Runtime settings injected by the Express server through /config.js (see server/server.ts),
// so the same build runs in dev, acc and prd.
interface RuntimeConfig { apiurl?: string }

export function runtimeApiUrl(fallback: string): string {
  const configured = (window as unknown as { __FCT_CONFIG__?: RuntimeConfig }).__FCT_CONFIG__?.apiurl;
  const url = configured || fallback;
  return url.endsWith('/') ? url : url + '/';
}
