import 'dotenv/config';
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { api, ApiError, type Tournament, type TournamentInput } from './api.js';
import { icons } from './icons.js';
import {
  alertHtml, deleteTournamentPage, layout, loginPage, MESSAGES, messagePage, myTournamentsPage, passwordChangePage,
  passwordResetPage, profilePage, publicTournamentsPage, registerPage, tournamentFormPage, type Alert, type TournamentForm,
} from './views.js';

// ── Config ────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 8080);
const TOKEN_COOKIE = 'fct_token';
const CSRF_COOKIE = 'fct_csrf';
const TOKEN_MAX_AGE_MS = 8 * 60 * 60 * 1000; // same lifetime as the API's JWT
const ALL_ROLES = 1 | 2 | 4 | 8;
const TIME_ZONE = 'Europe/Amsterdam';
const MIN_PASSWORD_LENGTH = 8;
const MAX_EMAIL_LENGTH = 100;

// ── Cookies, CSRF and session ─────────────────────────────────────────────────

// The API's JWT lives in an httpOnly cookie, so page scripts can never read it. State-changing
// requests are POSTs protected by SameSite=Lax plus a per-browser CSRF token (cookie + hidden field).

type Ctx = { token?: string; csrf: string };

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

function cookieOptions(req: Request, maxAge?: number): express.CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/', ...(maxAge === undefined ? {} : { maxAge }) };
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function ctx(res: Response): Ctx { return res.locals.ctx as Ctx; }

function render(res: Response, title: string, body: string): string {
  const { token, csrf } = ctx(res);
  return layout({ title, body, user: !!token, csrf });
}

const session: RequestHandler = (req, res, next) => {
  const cookies = parseCookies(req.headers.cookie);
  let csrf = cookies[CSRF_COOKIE];
  if (!csrf) {
    csrf = randomBytes(24).toString('hex');
    res.cookie(CSRF_COOKIE, csrf, cookieOptions(req));
  }
  res.locals.ctx = { token: cookies[TOKEN_COOKIE], csrf } satisfies Ctx;
  if (req.method === 'POST' && !safeEqual(String((req.body as Record<string, unknown>)?._csrf ?? ''), csrf)) {
    res.status(403).send(render(res, 'verboden', messagePage('verboden', icons.key,
      { type: 'danger', message: 'het formulier is verlopen, probeer het opnieuw' }, '<a class="btn btn-outline-secondary" href="/">home</a>')));
    return;
  }
  next();
};

function setLogin(req: Request, res: Response, token: string): void {
  res.cookie(TOKEN_COOKIE, token, cookieOptions(req, TOKEN_MAX_AGE_MS));
}

function alertFromQuery(req: Request): Alert | undefined {
  return typeof req.query.melding === 'string' ? MESSAGES[req.query.melding] : undefined;
}

// Only same-site relative paths are accepted as redirect targets.
function safeNext(value: unknown): string {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : '/mijn-toernooien';
}

function formBody(req: Request): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.body as Record<string, unknown>)) {
    if (typeof value === 'string') result[key] = value;
  }
  return result;
}

const handle = (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => { fn(req, res).catch(next); };

// Runs a handler for a logged-in user; an expired/invalid token sends the user back to the login page.
function requireLogin(fn: (req: Request, res: Response, token: string) => Promise<void>): RequestHandler {
  return handle(async (req, res) => {
    const { token } = ctx(res);
    if (!token) { res.redirect(`/user/login?next=${encodeURIComponent(req.originalUrl)}`); return; }
    try {
      await fn(req, res, token);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        res.clearCookie(TOKEN_COOKIE, cookieOptions(req));
        res.redirect('/user/login?melding=sessieverlopen');
        return;
      }
      throw err;
    }
  });
}

function errorAlert(err: unknown): Alert {
  return { type: 'danger', message: err instanceof ApiError ? err.message : 'er ging iets mis, probeer het later opnieuw' };
}

// The user id is the `userId` claim of the API's JWT. The API verifies the signature on every call,
// and /users/{id} only answers for the caller's own id.
function userIdFromToken(token: string): number {
  const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { userId: number };
  return payload.userId;
}

// ── Time zone: <input type="datetime-local"> has no zone, the API wants an ISO instant ──

function tzOffsetMs(date: Date): number {
  const local = date.toLocaleString('sv-SE', { timeZone: TIME_ZONE });
  return Date.parse(`${local.replace(' ', 'T')}Z`) - Math.floor(date.getTime() / 1000) * 1000;
}

function localInputToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const asUtc = Date.parse(`${local}:00Z`);
  if (Number.isNaN(asUtc)) return null;
  let instant = asUtc - tzOffsetMs(new Date(asUtc));
  instant = asUtc - tzOffsetMs(new Date(instant)); // second pass around DST changes
  return new Date(instant).toISOString();
}

function isoToLocalInput(iso: string): string {
  return new Date(iso).toLocaleString('sv-SE', { timeZone: TIME_ZONE }).replace(' ', 'T').slice(0, 16);
}

function readTournamentForm(req: Request): { form: TournamentForm; input?: TournamentInput; error?: string } {
  const b = formBody(req);
  const form: TournamentForm = {
    name: (b.name ?? '').trim(), startDateTimeLocal: b.startDateTime ?? '', public: b.public === '1',
    intro: (b.intro ?? '').trim(), location: (b.location ?? '').trim(),
  };
  const startDateTime = localInputToIso(form.startDateTimeLocal);
  if (!form.name || form.name.length > 100) return { form, error: 'vul een naam in van maximaal 100 karakters' };
  if (!startDateTime) return { form, error: 'vul een geldige startdatum en -tijd in' };
  if (form.location.length > 80) return { form, error: 'de locatie mag maximaal 80 karakters zijn' };
  if (form.intro.length > 400) return { form, error: 'de omschrijving mag maximaal 400 karakters zijn' };
  return { form, input: { name: form.name, startDateTime, public: form.public, intro: form.intro, location: form.location || null } };
}

// ── App ───────────────────────────────────────────────────────────────────────

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
// dist/public holds the compiled CSS and static assets; resolves the same from src/ (tsx) and dist/.
app.use(express.static(path.join(__dirname, '..', 'dist', 'public')));
app.use(express.urlencoded({ extended: false }));
app.use(session);

app.get('/', handle(async (_req, res) => {
  try {
    res.send(render(res, 'FCToernooi', publicTournamentsPage(await api.listPublicShells(ctx(res).token))));
  } catch (err) {
    res.status(502).send(render(res, 'FCToernooi', publicTournamentsPage(null, err instanceof Error ? err.message : 'onbekende fout')));
  }
}));

// ── /user ─────────────────────────────────────────────────────────────────────

app.get('/user/login', (req, res) => {
  res.send(render(res, 'inloggen', loginPage(ctx(res).csrf, safeNext(req.query.next), '', alertFromQuery(req))));
});

app.post('/user/login', handle(async (req, res) => {
  const b = formBody(req);
  try {
    const { token } = await api.login(b.emailaddress ?? '', b.password ?? '');
    setLogin(req, res, token);
    res.redirect(safeNext(b.next));
  } catch (err) {
    const invalid = err instanceof ApiError && (err.status === 401 || err.status === 400);
    res.status(invalid ? 401 : 502).send(render(res, 'inloggen', loginPage(ctx(res).csrf, safeNext(b.next), b.emailaddress ?? '',
      invalid ? { type: 'danger', message: 'emailadres of wachtwoord is onjuist' } : errorAlert(err))));
  }
}));

app.post('/user/logout', (req, res) => {
  res.clearCookie(TOKEN_COOKIE, cookieOptions(req));
  res.redirect('/user/login?melding=uitgelogd');
});

app.get('/user/register', (req, res) => {
  res.send(render(res, 'registreren', registerPage(ctx(res).csrf, '', alertFromQuery(req))));
});

app.post('/user/register', handle(async (req, res) => {
  const b = formBody(req);
  const emailaddress = (b.emailaddress ?? '').trim();
  const password = b.password ?? '';
  const fail = (status: number, message: string): void => {
    res.status(status).send(render(res, 'registreren', registerPage(ctx(res).csrf, emailaddress, { type: 'danger', message })));
  };
  if (!emailaddress || emailaddress.length > MAX_EMAIL_LENGTH || !emailaddress.includes('@')) { fail(400, 'vul een geldig emailadres in'); return; }
  if (password.length < MIN_PASSWORD_LENGTH) { fail(400, `het wachtwoord moet minimaal ${MIN_PASSWORD_LENGTH} karakters bevatten`); return; }
  if (password !== b.passwordRepeat) { fail(400, 'de wachtwoorden komen niet overeen'); return; }
  try {
    await api.register(emailaddress, password);
    const { token } = await api.login(emailaddress, password);
    setLogin(req, res, token);
    res.redirect('/mijn-toernooien?melding=geregistreerd');
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) fail(409, 'dit emailadres is al in gebruik');
    else if (err instanceof ApiError && err.status === 400) fail(400, 'vul een geldig emailadres en wachtwoord in');
    else fail(502, errorAlert(err).message);
  }
}));

app.get('/user/passwordreset', (_req, res) => {
  res.send(render(res, 'wachtwoord vergeten', passwordResetPage(ctx(res).csrf, '')));
});

app.post('/user/passwordreset', handle(async (req, res) => {
  const emailaddress = (formBody(req).emailaddress ?? '').trim();
  try {
    if (emailaddress) await api.passwordReset(emailaddress);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 400) {
      res.status(502).send(render(res, 'wachtwoord vergeten', passwordResetPage(ctx(res).csrf, emailaddress, errorAlert(err))));
      return;
    }
  }
  // Same answer whether or not the address exists.
  res.send(render(res, 'wachtwoord vergeten', messagePage('wachtwoord vergeten', icons.key,
    { type: 'info', message: 'als dit emailadres bekend is, is er een mail verstuurd met een link om een nieuw wachtwoord in te stellen' },
    '<a class="btn btn-outline-secondary" href="/user/login">naar inloggen</a>')));
}));

app.get('/user/passwordchange', (req, res) => {
  const emailaddress = typeof req.query.emailaddress === 'string' ? req.query.emailaddress : '';
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  res.send(render(res, 'nieuw wachtwoord', passwordChangePage(ctx(res).csrf, emailaddress, token)));
});

app.post('/user/passwordchange', handle(async (req, res) => {
  const b = formBody(req);
  const page = (alert: Alert): string => render(res, 'nieuw wachtwoord', passwordChangePage(ctx(res).csrf, b.emailaddress ?? '', b.token ?? '', alert));
  if ((b.password ?? '').length < MIN_PASSWORD_LENGTH) { res.status(400).send(page({ type: 'danger', message: `het wachtwoord moet minimaal ${MIN_PASSWORD_LENGTH} karakters bevatten` })); return; }
  if (b.password !== b.passwordRepeat) { res.status(400).send(page({ type: 'danger', message: 'de wachtwoorden komen niet overeen' })); return; }
  try {
    await api.passwordChange(b.emailaddress ?? '', b.password ?? '', b.token ?? '');
    res.redirect('/user/login?melding=wachtwoordgewijzigd');
  } catch (err) {
    const invalid = err instanceof ApiError && err.status === 400;
    res.status(invalid ? 400 : 502).send(page(invalid ? { type: 'danger', message: 'de link is ongeldig of verlopen, vraag een nieuwe aan' } : errorAlert(err)));
  }
}));

app.get('/user/validate', requireLogin(async (req, res, token) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  let alert: Alert = { type: 'success', message: 'je emailadres is gevalideerd' };
  try {
    await api.validate(token, code);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 400) throw err;
    alert = { type: 'danger', message: 'de validatielink is ongeldig of verlopen, vraag een nieuwe aan via je profiel' };
  }
  res.send(render(res, 'emailadres valideren', messagePage('emailadres valideren', icons.user, alert, '<a class="btn btn-outline-secondary" href="/user/profile">naar profiel</a>')));
}));

app.get('/user/profile', requireLogin(async (req, res, token) => {
  const user = await api.getUser(token, userIdFromToken(token));
  res.send(render(res, 'profiel', profilePage(ctx(res).csrf, user, alertFromQuery(req))));
}));

app.post('/user/profile', requireLogin(async (req, res, token) => {
  const b = formBody(req);
  const userId = userIdFromToken(token);
  try {
    await api.updateUser(token, userId, { emailaddress: (b.emailaddress ?? '').trim(), name: (b.name ?? '').trim() || null });
    res.redirect('/user/profile?melding=profielopgeslagen');
  } catch (err) {
    if (!(err instanceof ApiError) || err.status === 401) throw err;
    const user = await api.getUser(token, userId);
    const conflict = err.status === 409;
    res.status(conflict || err.status === 400 ? err.status : 502).send(render(res, 'profiel', profilePage(ctx(res).csrf, user,
      conflict ? { type: 'danger', message: 'dit emailadres is al in gebruik' } : errorAlert(err))));
  }
}));

app.post('/user/profile/validationrequest', requireLogin(async (_req, res, token) => {
  await api.validationRequest(token);
  res.redirect('/user/profile?melding=validatiemail');
}));

// ── /mijn-toernooien ──────────────────────────────────────────────────────────
// "My tournaments" are the tournaments the user holds a role in (no owner field exists).

app.get('/mijn-toernooien', requireLogin(async (req, res, token) => {
  res.send(render(res, 'mijn toernooien', myTournamentsPage(await api.listMyShells(token, ALL_ROLES), alertFromQuery(req))));
}));

const NEW_ACTION = '/mijn-toernooien/nieuw';

app.get(NEW_ACTION, requireLogin(async (_req, res) => {
  const form: TournamentForm = { name: '', startDateTimeLocal: isoToLocalInput(new Date().toISOString()), public: true, intro: '', location: '' };
  res.send(render(res, 'nieuw toernooi', tournamentFormPage(ctx(res).csrf, NEW_ACTION, 'nieuw toernooi', form)));
}));

app.post(NEW_ACTION, requireLogin(async (req, res, token) => {
  const { form, input, error } = readTournamentForm(req);
  if (!input) {
    res.status(400).send(render(res, 'nieuw toernooi', tournamentFormPage(ctx(res).csrf, NEW_ACTION, 'nieuw toernooi', form, { type: 'danger', message: error! })));
    return;
  }
  await api.createTournament(token, input);
  res.redirect('/mijn-toernooien?melding=aangemaakt');
}));

function tournamentId(req: Request): number { return Number(req.params.id); }

// The API decides (403: no Admin role / not allowed to see it, 404: unknown); show that as a plain message.
function tournamentDenied(res: Response, err: unknown): boolean {
  if (!(err instanceof ApiError) || (err.status !== 403 && err.status !== 404)) return false;
  res.status(err.status).send(render(res, 'toernooi', messagePage('toernooi', icons.trophy,
    { type: 'danger', message: err.status === 403 ? 'je hebt geen rechten voor dit toernooi' : 'dit toernooi bestaat niet' },
    '<a class="btn btn-outline-secondary" href="/mijn-toernooien">naar mijn toernooien</a>')));
  return true;
}

async function withTournament(req: Request, res: Response, token: string, fn: (t: Tournament) => void): Promise<void> {
  try {
    fn(await api.getTournament(token, tournamentId(req)));
  } catch (err) {
    if (!tournamentDenied(res, err)) throw err;
  }
}

app.get('/mijn-toernooien/:id/bewerken', requireLogin((req, res, token) => withTournament(req, res, token, (t) => {
  const form: TournamentForm = {
    name: t.name, startDateTimeLocal: isoToLocalInput(t.startDateTime), public: t.public, intro: t.intro ?? '', location: t.location ?? '',
  };
  res.send(render(res, 'toernooi bewerken', tournamentFormPage(ctx(res).csrf, `/mijn-toernooien/${t.id}/bewerken`, 'toernooi bewerken', form)));
})));

app.post('/mijn-toernooien/:id/bewerken', requireLogin(async (req, res, token) => {
  const { form, input, error } = readTournamentForm(req);
  const action = `/mijn-toernooien/${tournamentId(req)}/bewerken`;
  if (!input) {
    res.status(400).send(render(res, 'toernooi bewerken', tournamentFormPage(ctx(res).csrf, action, 'toernooi bewerken', form, { type: 'danger', message: error! })));
    return;
  }
  try {
    await api.updateTournament(token, tournamentId(req), input);
    res.redirect('/mijn-toernooien?melding=opgeslagen');
  } catch (err) {
    if (!tournamentDenied(res, err)) throw err;
  }
}));

app.get('/mijn-toernooien/:id/verwijderen', requireLogin((req, res, token) => withTournament(req, res, token, (t) => {
  res.send(render(res, 'toernooi verwijderen', deleteTournamentPage(ctx(res).csrf, t)));
})));

app.post('/mijn-toernooien/:id/verwijderen', requireLogin(async (req, res, token) => {
  try {
    await api.deleteTournament(token, tournamentId(req));
    res.redirect('/mijn-toernooien?melding=verwijderd');
  } catch (err) {
    if (!tournamentDenied(res, err)) throw err;
  }
}));

// ── Errors ────────────────────────────────────────────────────────────────────

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  const local = res.locals.ctx as Ctx | undefined;
  res.status(502).send(layout({
    title: 'fout', user: !!local?.token, csrf: local?.csrf ?? '',
    body: alertHtml({ type: 'danger', message: 'er ging iets mis, probeer het later opnieuw' }),
  }));
});

app.listen(PORT, () => console.log(`fctoernooi-frontend listening on :${PORT}`));
