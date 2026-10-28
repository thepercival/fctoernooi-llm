import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';

// Serves the Angular build (dist/browser) and injects runtime settings, so one build runs in every environment.

const PORT = Number(process.env.PORT ?? 8080);
const API_BASEURL = process.env.FCTOERNOOI_API_BASEURL ?? '';
const BROWSER_DIR = path.join(__dirname, 'browser');

// The token is kept in localStorage, so scripts are only allowed from this origin. The API is called from the browser.
function contentSecurityPolicy(): string {
  const apiOrigin = API_BASEURL ? new URL(API_BASEURL).origin : '';
  return [
    "default-src 'self'",
    "script-src 'self'",
    // ng-bootstrap and Angular set inline styles; scripts stay strictly same-origin (no inline scripts in the build)
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data:",
    `connect-src 'self' ${apiOrigin}`.trim(),
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', contentSecurityPolicy());
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.get('/config.js', (_req, res) => {
  res.type('application/javascript').setHeader('Cache-Control', 'no-store');
  res.send(`window.__FCT_CONFIG__ = ${JSON.stringify({ apiurl: API_BASEURL })};`);
});

// Hashed build files are immutable; index.html must always be revalidated.
app.use(express.static(BROWSER_DIR, {
  index: false,
  setHeaders: (res, filePath) => {
    if (/-[0-9A-Za-z]{8}\.(js|css)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));

// Client-side routes fall back to index.html; a missing file with an extension is a real 404.
app.get('*', (req, res, next) => {
  if (path.extname(req.path)) { next(); return; }
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(BROWSER_DIR, 'index.html'));
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).send('Internal server error');
});

app.listen(PORT, () => console.log(`fctoernooi-frontend listening on :${PORT}`));
