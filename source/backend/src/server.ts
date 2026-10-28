import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import { apiReference } from '@scalar/express-api-reference';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import {
  MongoDb,
  type UserRecord, type TournamentRecord, type CompetitorRecord,
  type SponsorRecord, type LockerRoomRecord, type RecessRecord,
  type RuleRecord, type TournamentRoleAssignmentRecord, type InvitationRecord,
  type RegistrationRecord, type RegistrationSettingsRecord, type PaymentRecord,
} from './db.js';
import type { components } from './openapi.gen.js';
import { createMailer, frontendLink, type Mailer } from './mailer.js';

// ── Config ────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 8080);
const DEV_JWT_SECRET = 'dev-secret-change-in-production';
const JWT_SECRET = process.env.JWT_SECRET || DEV_JWT_SECRET;
if (JWT_SECRET === DEV_JWT_SECRET) console.warn('JWT_SECRET is not set: using the insecure development secret. Tokens can be forged.');
const VALIDATE_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const JWT_EXPIRES_IN = '8h';
const BCRYPT_ROUNDS = 10;
const SPEC_PATH = path.join(__dirname, 'openapi.yaml');

// ── Request body type aliases (from generated spec) ───────────────────────────

type S = components['schemas'];

// ── Auth helpers ──────────────────────────────────────────────────────────────

type JwtPayload = { userId: number; subType: S['User']['subType'] };
function signToken(userId: number, subType: S['User']['subType']): string { return jwt.sign({ userId, subType }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN }); }
function verifyToken(token: string): JwtPayload { return jwt.verify(token, JWT_SECRET) as JwtPayload; }

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { userId?: number; subType?: S['User']['subType']; } }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Bitmask values must stay in sync with fctoernooi-api's domain/Role.php (source of truth).
enum Role {
  Admin = 1,
  RoleAdmin = 2,
  GameResultAdmin = 4,
  Referee = 8,
}

function notFound(res: Response, msg = 'Not found'): void { res.status(404).json({ message: msg }); }
function forbidden(res: Response): void { res.status(403).json({ message: 'Forbidden' }); }

async function getTournamentRoleAssignment(db: MongoDb, tournamentId: number, userId: number): Promise<TournamentRoleAssignmentRecord | null> {
  return (await db.find<TournamentRoleAssignmentRecord>('tournamentRoleAssignments', { tournamentId, userId })).at(0) ?? null;
}
function hasRole(tu: TournamentRoleAssignmentRecord, role: number): boolean { return (tu.roles & role) !== 0; }

function stripSensitive(u: UserRecord): S['User'] & { id: number } {
  const {
    passwordHash: _p, validateToken: _v, validateTokenExpires: _ve,
    forgetPasswordToken: _f, forgetPasswordTokenExpires: _fe, ...safe
  } = u;
  return safe;
}

// Email address is the login identifier: always compared trimmed + lowercase.
function normalizeEmail(emailaddress: string): string { return emailaddress.trim().toLowerCase(); }

// One-time tokens: the plain token only goes out by email; the database keeps a hash and an expiry.
function hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
function newToken(ttlMs: number): { token: string; hash: string; expires: string } {
  const token = randomBytes(32).toString('hex');
  return { token, hash: hashToken(token), expires: new Date(Date.now() + ttlMs).toISOString() };
}
function tokenMatches(storedHash: string | null, expires: string | null, supplied: string): boolean {
  if (!storedHash || !expires || Date.parse(expires) < Date.now()) return false;
  const a = Buffer.from(storedHash);
  const b = Buffer.from(hashToken(supplied));
  return a.length === b.length && timingSafeEqual(a, b);
}

function isDuplicateKey(err: unknown): boolean { return (err as { code?: number })?.code === 11000; }

// Older documents predate name/startDateTime/intro.
function toTournament(t: TournamentRecord): TournamentRecord {
  return { ...t, name: t.name ?? t.intro ?? '', startDateTime: t.startDateTime ?? t.createdDateTime, intro: t.intro ?? '' };
}

function tournamentFields(body: S['TournamentRequest']): Partial<Omit<TournamentRecord, 'id'>> {
  const fields: Partial<Omit<TournamentRecord, 'id'>> = { name: body.name, startDateTime: body.startDateTime };
  if (body.public !== undefined) fields.public = body.public;
  if (body.intro !== undefined) fields.intro = body.intro;
  if (body.location !== undefined) fields.location = body.location;
  if (body.theme !== undefined) fields.theme = body.theme;
  return fields;
}

type ShellFilters = { startDate?: unknown; endDate?: unknown; name?: unknown; example?: unknown };

function matchesShellFilters(tournament: TournamentRecord, filters: ShellFilters): boolean {
  const tournamentDate = Date.parse(tournament.startDateTime);
  const startDate = filters.startDate ? Date.parse(String(filters.startDate)) : null;
  const endDate = filters.endDate ? Date.parse(String(filters.endDate)) : null;
  const name = filters.name ? String(filters.name) : null;
  const example = filters.example === undefined ? null : filters.example === true || filters.example === 'true' || filters.example === '1';

  return (startDate === null || tournamentDate >= startDate)
    && (endDate === null || tournamentDate <= endDate)
    && (name === null || tournament.name.includes(name))
    && (example === null || tournament.example === example);
}

function toTournamentShell(tournament: TournamentRecord, roles = 0): S['TournamentShell'] {
  return {
    tournamentId: tournament.id,
    singleCustomSport: 0,
    name: tournament.name,
    startDateTime: tournament.startDateTime,
    roles,
    public: tournament.public,
  };
}

async function getRolesByTournament(db: MongoDb, userId: number): Promise<Map<number, number>> {
  const assignments = await db.find<TournamentRoleAssignmentRecord>('tournamentRoleAssignments', { userId });
  return new Map(assignments.map((assignment) => [assignment.tournamentId, assignment.roles]));
}

// ── App ───────────────────────────────────────────────────────────────────────

function buildApp(db: MongoDb, mailer: Mailer): express.Express {
  const app = express();
  app.use(express.json());

  // Local development only: in Azure, APIM applies the CORS policy and the backend is not reachable directly.
  const corsOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  if (corsOrigins.length > 0) {
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && corsOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      }
      if (req.method === 'OPTIONS') { res.status(204).end(); return; }
      next();
    });
  }

  app.get('/', (_req, res) => res.json({ service: 'fctoernooi-api', status: 'ok', spec: '/openapi.yaml' }));
  app.get('/openapi.yaml', (_req, res) => res.sendFile(SPEC_PATH));
  if (process.env.NODE_ENV !== 'production') {
    app.use('/docs', apiReference({ spec: { url: '/openapi.yaml' }, theme: 'default' }));
  }

  app.use(
    OpenApiValidator.middleware({
      apiSpec: SPEC_PATH,
      validateRequests: true,
      validateResponses: process.env.NODE_ENV !== 'production',
      formats: { decimal: { type: 'number', validate: (v: number) => !isNaN(v) } },
      validateSecurity: {
        handlers: {
          bearerAuth: (req: Request, _scopes: string[], _schema: unknown) => {
            const header = req.headers.authorization;
            if (!header?.startsWith('Bearer ')) return Promise.resolve(false);
            try {
              const payload = verifyToken(header.slice(7));
              req.userId = payload.userId;
              req.subType = payload.subType;
              return Promise.resolve(true);
            } catch { return Promise.resolve(false); }
          },
        },
      },
    }),
  );

  // ── /auth (public) ────────────────────────────────────────────────────────

  app.post('/auth/register', async (req, res) => {
    const { password, subType } = req.body as S['RegisterRequest'];
    const emailaddress = normalizeEmail((req.body as S['RegisterRequest']).emailaddress);
    if ((await db.find<UserRecord>('users', { emailaddress })).length > 0) {
      res.status(409).json({ message: 'Email address already in use.' }); return;
    }
    const validation = newToken(VALIDATE_TOKEN_TTL_MS);
    try {
      await db.create<UserRecord>('users', {
        emailaddress, passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
        name: null, validated: false, nrOfCredits: 0, subType: subType ?? 'human',
        validateToken: validation.hash, validateTokenExpires: validation.expires,
        forgetPasswordToken: null, forgetPasswordTokenExpires: null,
      });
    } catch (err) {
      if (isDuplicateKey(err)) { res.status(409).json({ message: 'Email address already in use.' }); return; }
      throw err;
    }
    await mailer.sendValidation(emailaddress, frontendLink('/user/validate/' + validation.token));
    res.status(201).end();
  });

  app.post('/auth/login', async (req, res) => {
    const { password } = req.body as S['LoginRequest'];
    const emailaddress = normalizeEmail((req.body as S['LoginRequest']).emailaddress);
    const user = (await db.find<UserRecord>('users', { emailaddress })).at(0);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ message: 'Invalid credentials.' }); return;
    }
    res.json({ token: signToken(user.id, user.subType), userId: user.id } satisfies S['TokenResponse']);
  });

  // Always 200, whether or not the address is known, so accounts cannot be enumerated.
  app.post('/auth/passwordreset', async (req, res) => {
    const emailaddress = normalizeEmail((req.body as { emailaddress: string }).emailaddress);
    const user = (await db.find<UserRecord>('users', { emailaddress })).at(0);
    if (user) {
      const reset = newToken(RESET_TOKEN_TTL_MS);
      await db.update<UserRecord>('users', user.id, { forgetPasswordToken: reset.hash, forgetPasswordTokenExpires: reset.expires });
      await mailer.sendPasswordReset(user.emailaddress, frontendLink('/user/passwordchange', { emailaddress: user.emailaddress, token: reset.token }));
    }
    res.status(200).end();
  });

  app.post('/auth/passwordchange', async (req, res) => {
    const { password, token } = req.body as S['ChangePasswordRequest'];
    const emailaddress = normalizeEmail((req.body as S['ChangePasswordRequest']).emailaddress);
    const user = (await db.find<UserRecord>('users', { emailaddress })).at(0);
    if (!user || !tokenMatches(user.forgetPasswordToken, user.forgetPasswordTokenExpires, token)) {
      res.status(400).json({ message: 'Invalid or expired reset token.' }); return;
    }
    await db.update<UserRecord>('users', user.id, {
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS), forgetPasswordToken: null, forgetPasswordTokenExpires: null,
    });
    res.status(200).end();
  });

  // ── Tournament shells / tournament / rules / registration settings ────────
  // Visibility follows the general rule: tournament.public → open to anyone;
  // private → requires an Admin role assignment.

  app.get('/shells', async (req, res) => {
    const rolesByTournament = req.userId ? await getRolesByTournament(db, req.userId) : new Map<number, number>();
    const publicTournaments = await db.find<TournamentRecord>('tournaments', { public: true });
    const ownPrivateTournaments = rolesByTournament.size > 0
      ? (await db.find<TournamentRecord>('tournaments', { public: false })).filter((t) => rolesByTournament.has(t.id))
      : [];
    res.json([...publicTournaments, ...ownPrivateTournaments].map(toTournament)
      .filter((tournament) => matchesShellFilters(tournament, req.query))
      .slice(0, 100)
      .map((tournament) => toTournamentShell(tournament, rolesByTournament.get(tournament.id) ?? 0)));
  });

  app.get('/shellswithrole', async (req, res) => {
    const requestedRoles = Number(req.query.roles ?? 0);
    const [tournaments, rolesByTournament] = await Promise.all([
      db.find<TournamentRecord>('tournaments', { example: false }),
      getRolesByTournament(db, req.userId!),
    ]);
    res.json(tournaments.map(toTournament)
      .filter((tournament) => ((rolesByTournament.get(tournament.id) ?? 0) & requestedRoles) !== 0)
      .map((tournament) => toTournamentShell(tournament, rolesByTournament.get(tournament.id) ?? 0)));
  });

  async function canViewNonPublicTournament(tournamentId: number, userId?: number): Promise<boolean> {
    const tu = userId ? await getTournamentRoleAssignment(db, tournamentId, userId) : null;
    return !!tu && hasRole(tu, Role.Admin);
  }

  app.post('/tournaments', async (req, res) => {
    const body = req.body as S['TournamentRequest'];
    const tournament = await db.create<TournamentRecord>('tournaments', {
      createdDateTime: new Date().toISOString(), startEditMode: 'EditMode',
      example: false, intro: '', location: null, logoExtension: null, theme: null,
      ...tournamentFields(body),
      name: body.name, startDateTime: body.startDateTime,
      public: body.public ?? true,
    });
    await db.create<TournamentRoleAssignmentRecord>('tournamentRoleAssignments', {
      tournamentId: tournament.id, userId: req.userId!,
      roles: Role.Admin | Role.RoleAdmin | Role.GameResultAdmin,
    });
    res.status(201).json(toTournament(tournament));
  });

  app.get('/tournaments/:tournamentId', async (req, res) => {
    const t = await db.findOne<TournamentRecord>('tournaments', Number(req.params.tournamentId));
    if (!t) { notFound(res); return; }
    if (!t.public && !(await canViewNonPublicTournament(t.id, req.userId))) { forbidden(res); return; }
    res.json(toTournament(t));
  });

  // ── /auth ─────────────────────────────────────────────────────────────────

  app.post('/auth/extendtoken', (req, res) => { res.json({ token: signToken(req.userId!, req.subType!), userId: req.userId }); });

  app.post('/auth/validate/:code', async (req, res) => {
    const user = await db.findOne<UserRecord>('users', req.userId!);
    if (!user || !tokenMatches(user.validateToken, user.validateTokenExpires, String(req.params.code))) {
      res.status(400).json({ message: 'Invalid or expired validation code.' }); return;
    }
    await db.update<UserRecord>('users', user.id, { validated: true, validateToken: null, validateTokenExpires: null });
    res.status(200).end();
  });

  async function sendValidationMail(user: UserRecord): Promise<void> {
    const validation = newToken(VALIDATE_TOKEN_TTL_MS);
    await db.update<UserRecord>('users', user.id, { validateToken: validation.hash, validateTokenExpires: validation.expires });
    await mailer.sendValidation(user.emailaddress, frontendLink('/user/validate/' + validation.token));
  }

  app.post('/auth/validationrequest', async (req, res) => {
    const user = await db.findOne<UserRecord>('users', req.userId!);
    if (user && !user.validated) await sendValidationMail(user);
    res.status(200).end();
  });

  // Only whitelisted fields are applied: the body is never spread into the document
  // (validated/nrOfCredits/passwordHash/... must not be client-writable).
  async function applyUserUpdate(user: UserRecord, body: S['UserUpdateRequest'], res: Response): Promise<void> {
    const patch: Partial<Omit<UserRecord, 'id'>> = {};
    if (body.name !== undefined) patch.name = body.name;
    let emailChanged = false;
    if (body.emailaddress !== undefined) {
      const emailaddress = normalizeEmail(body.emailaddress);
      if (emailaddress !== user.emailaddress) {
        if ((await db.find<UserRecord>('users', { emailaddress })).length > 0) {
          res.status(409).json({ message: 'Email address already in use.' }); return;
        }
        patch.emailaddress = emailaddress;
        patch.validated = false;
        emailChanged = true;
      }
    }
    let updated: UserRecord | null;
    try {
      updated = await db.update<UserRecord>('users', user.id, patch);
    } catch (err) {
      if (isDuplicateKey(err)) { res.status(409).json({ message: 'Email address already in use.' }); return; }
      throw err;
    }
    if (emailChanged && updated) await sendValidationMail(updated);
    res.json(stripSensitive((await db.findOne<UserRecord>('users', user.id))!));
  }

  app.put('/auth/profile/:userId', async (req, res) => {
    if (Number(req.params.userId) !== req.userId!) { forbidden(res); return; }
    const user = await db.findOne<UserRecord>('users', req.userId!);
    if (!user) { notFound(res); return; }
    await applyUserUpdate(user, { name: (req.body as S['UserUpdateRequest']).name }, res);
  });

  // ── /users ────────────────────────────────────────────────────────────────

  app.get('/users/:userId', async (req, res) => {
    if (Number(req.params.userId) !== req.userId!) { forbidden(res); return; }
    const user = await db.findOne<UserRecord>('users', Number(req.params.userId));
    if (!user) { notFound(res); return; }
    res.json(stripSensitive(user));
  });

  app.put('/users/:userId', async (req, res) => {
    if (Number(req.params.userId) !== req.userId!) { forbidden(res); return; }
    const user = await db.findOne<UserRecord>('users', Number(req.params.userId));
    if (!user) { notFound(res); return; }
    await applyUserUpdate(user, req.body as S['UserUpdateRequest'], res);
  });

  app.delete('/users/:userId', async (req, res) => {
    if (Number(req.params.userId) !== req.userId!) { forbidden(res); return; }
    await db.delete('users', Number(req.params.userId));
    res.status(204).end();
  });

  // ── /payments ─────────────────────────────────────────────────────────────

  app.get('/payments/methods', (_req, res) => res.json(['ideal', 'creditcard', 'bancontact']));

  app.get('/payments/idealissuers', (_req, res) => res.json([
    { id: 'INGBNL2A', name: 'ING' }, { id: 'RABONL2U', name: 'Rabobank' },
    { id: 'ABNANL2A', name: 'ABN AMRO' }, { id: 'SNSBNL2A', name: 'SNS Bank' },
  ] satisfies S['IDealIssuer'][]));

  app.post('/payments/buycredits', async (req, res) => {
    const { method, amount } = req.body as S['BuyCreditsRequest'];
    res.json(await db.create<PaymentRecord>('payments', {
      userId: req.userId!, paymentId: null, method, amount, state: 'Open', updatedAt: new Date().toISOString(),
    }));
  });

  app.get('/payments/mostrecentcreatedpayment', async (req, res) => {
    res.json((await db.find<PaymentRecord>('payments', { userId: req.userId! })).sort((a, b) => b.id - a.id).at(0) ?? null);
  });

  app.get('/payments/:paymentId', async (req, res) => {
    const payment = await db.findOne<PaymentRecord>('payments', Number(req.params.paymentId));
    if (!payment || payment.userId !== req.userId!) { notFound(res); return; }
    res.json(payment);
  });

  // ── /tournaments (write) ──────────────────────────────────────────────────

  app.put('/tournaments/:tournamentId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    const updated = await db.update<TournamentRecord>('tournaments', tournamentId, tournamentFields(req.body as S['TournamentRequest']));
    if (!updated) { notFound(res); return; }
    res.json(toTournament(updated));
  });

  app.delete('/tournaments/:tournamentId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    await db.deleteTournamentCascade(tournamentId);
    res.status(204).end();
  });

  // ── competitors ───────────────────────────────────────────────────────────

  app.get('/tournaments/:tournamentId/competitors', async (req, res) => {
    res.json(await db.find<CompetitorRecord>('competitors', { tournamentId: Number(req.params.tournamentId) }));
  });

  app.post('/tournaments/:tournamentId/competitors', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    res.status(201).json(await db.create<CompetitorRecord>('competitors', {
      tournamentId, present: false, logoExtension: null, publicInfo: null,
      privateInfo: null, emailaddress: null, telephone: null,
      ...(req.body as S['CompetitorRequest']),
    }));
  });

  app.get('/tournaments/:tournamentId/competitors/:competitorId', async (req, res) => {
    const c = await db.findOne<CompetitorRecord>('competitors', Number(req.params.competitorId));
    if (!c || c.tournamentId !== Number(req.params.tournamentId)) { notFound(res); return; }
    res.json(c);
  });

  app.put('/tournaments/:tournamentId/competitors/:competitorId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    const id = Number(req.params.competitorId);
    const existing = await db.findOne<CompetitorRecord>('competitors', id);
    if (!existing || existing.tournamentId !== tournamentId) { notFound(res); return; }
    res.json(await db.update<CompetitorRecord>('competitors', id, req.body as S['CompetitorRequest']));
  });

  app.delete('/tournaments/:tournamentId/competitors/:competitorId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    await db.delete('competitors', Number(req.params.competitorId));
    res.status(204).end();
  });

  app.put('/tournaments/:tournamentId/competitors/:competitorOneId/:competitorTwoId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    const [a, b] = await Promise.all([
      db.findOne<CompetitorRecord>('competitors', Number(req.params.competitorOneId)),
      db.findOne<CompetitorRecord>('competitors', Number(req.params.competitorTwoId)),
    ]);
    if (!a || !b) { notFound(res); return; }
    await Promise.all([
      db.update<CompetitorRecord>('competitors', a.id, { name: b.name }),
      db.update<CompetitorRecord>('competitors', b.id, { name: a.name }),
    ]);
    res.status(200).end();
  });

  // ── sponsors ──────────────────────────────────────────────────────────────

  app.get('/tournaments/:tournamentId/sponsors', async (req, res) => {
    res.json(await db.find<SponsorRecord>('sponsors', { tournamentId: Number(req.params.tournamentId) }));
  });

  app.post('/tournaments/:tournamentId/sponsors', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    res.status(201).json(await db.create<SponsorRecord>('sponsors', {
      tournamentId, url: null, logoExtension: null,
      ...(req.body as S['SponsorRequest']),
      screenNr: (req.body as S['SponsorRequest']).screenNr ?? 1,
    }));
  });

  app.put('/tournaments/:tournamentId/sponsors/:sponsorId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    const id = Number(req.params.sponsorId);
    const existing = await db.findOne<SponsorRecord>('sponsors', id);
    if (!existing || existing.tournamentId !== tournamentId) { notFound(res); return; }
    res.json(await db.update<SponsorRecord>('sponsors', id, req.body as S['SponsorRequest']));
  });

  app.delete('/tournaments/:tournamentId/sponsors/:sponsorId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    await db.delete('sponsors', Number(req.params.sponsorId));
    res.status(204).end();
  });

  // ── locker rooms ──────────────────────────────────────────────────────────

  app.post('/tournaments/:tournamentId/lockerrooms', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    const lr = await db.create<LockerRoomRecord>('lockerRooms', { tournamentId, ...(req.body as S['LockerRoomRequest']) });
    res.status(201).json({ ...lr, competitors: [] } satisfies S['LockerRoom']);
  });

  app.put('/tournaments/:tournamentId/lockerrooms/:lockerRoomId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    const id = Number(req.params.lockerRoomId);
    const existing = await db.findOne<LockerRoomRecord>('lockerRooms', id);
    if (!existing || existing.tournamentId !== tournamentId) { notFound(res); return; }
    const [updated, competitors] = await Promise.all([
      db.update<LockerRoomRecord>('lockerRooms', id, req.body as S['LockerRoomRequest']),
      db.getLockerRoomCompetitors(id),
    ]);
    res.json({ ...updated, competitors } satisfies S['LockerRoom']);
  });

  app.delete('/tournaments/:tournamentId/lockerrooms/:lockerRoomId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    const id = Number(req.params.lockerRoomId);
    await db.deleteLockerRoomCompetitors(id);
    await db.delete('lockerRooms', id);
    res.status(204).end();
  });

  app.post('/tournaments/:tournamentId/lockerrooms/:lockerRoomId/synccompetitors', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    await db.setLockerRoomCompetitors(Number(req.params.lockerRoomId), (req.body as { competitorIds: number[] }).competitorIds);
    res.status(200).end();
  });

  // ── recesses ──────────────────────────────────────────────────────────────

  app.post('/tournaments/:tournamentId/recesses', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    res.status(201).json(await db.create<RecessRecord>('recesses', { tournamentId, ...(req.body as S['RecessRequest']) }));
  });

  app.delete('/tournaments/:tournamentId/recesses/:recessId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    await db.delete('recesses', Number(req.params.recessId));
    res.status(204).end();
  });

  // ── rules ─────────────────────────────────────────────────────────────────

  app.get('/tournaments/:tournamentId/rules', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const t = await db.findOne<TournamentRecord>('tournaments', tournamentId);
    if (!t) { notFound(res); return; }
    if (!t.public && !(await canViewNonPublicTournament(tournamentId, req.userId))) { forbidden(res); return; }
    res.json((await db.find<RuleRecord>('rules', { tournamentId })).sort((a, b) => a.priority - b.priority));
  });

  app.post('/tournaments/:tournamentId/rules', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    const count = (await db.find<RuleRecord>('rules', { tournamentId })).length;
    res.status(201).json(await db.create<RuleRecord>('rules', {
      tournamentId, priority: count + 1, ...(req.body as S['RuleRequest']),
    }));
  });

  app.put('/tournaments/:tournamentId/rules/:ruleId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    const id = Number(req.params.ruleId);
    const existing = await db.findOne<RuleRecord>('rules', id);
    if (!existing || existing.tournamentId !== tournamentId) { notFound(res); return; }
    res.json(await db.update<RuleRecord>('rules', id, req.body as S['RuleRequest']));
  });

  app.delete('/tournaments/:tournamentId/rules/:ruleId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    await db.delete('rules', Number(req.params.ruleId));
    res.status(204).end();
  });

  app.post('/tournaments/:tournamentId/rules/:ruleId/priorityup', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    const id = Number(req.params.ruleId);
    const rules = (await db.find<RuleRecord>('rules', { tournamentId })).sort((a, b) => a.priority - b.priority);
    const idx = rules.findIndex((r) => r.id === id);
    if (idx > 0) {
      const [prev, curr] = [rules[idx - 1], rules[idx]];
      await Promise.all([
        db.update<RuleRecord>('rules', prev.id, { priority: curr.priority }),
        db.update<RuleRecord>('rules', curr.id, { priority: prev.priority }),
      ]);
    }
    res.status(200).end();
  });

  // ── tournament role assignments ────────────────────────────────────────────

  app.delete('/tournaments/:tournamentId/roleassignments/:roleAssignmentId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.RoleAdmin)) { forbidden(res); return; }
    await db.delete('tournamentRoleAssignments', Number(req.params.roleAssignmentId));
    res.status(204).end();
  });

  app.get('/tournaments/:tournamentId/roleassignments/:roleAssignmentId/emailaddress', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.RoleAdmin)) { forbidden(res); return; }
    const target = await db.findOne<TournamentRoleAssignmentRecord>('tournamentRoleAssignments', Number(req.params.roleAssignmentId));
    if (!target) { notFound(res); return; }
    res.json({ emailaddress: (await db.findOne<UserRecord>('users', target.userId))?.emailaddress ?? null });
  });

  app.post('/tournaments/:tournamentId/roleassignments/:roleAssignmentId/roles/:role', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.RoleAdmin)) { forbidden(res); return; }
    const id = Number(req.params.roleAssignmentId);
    const target = await db.findOne<TournamentRoleAssignmentRecord>('tournamentRoleAssignments', id);
    if (!target) { notFound(res); return; }
    await db.update<TournamentRoleAssignmentRecord>('tournamentRoleAssignments', id, { roles: target.roles | Number(req.params.role) });
    res.status(200).end();
  });

  app.delete('/tournaments/:tournamentId/roleassignments/:roleAssignmentId/roles/:role', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.RoleAdmin)) { forbidden(res); return; }
    const id = Number(req.params.roleAssignmentId);
    const target = await db.findOne<TournamentRoleAssignmentRecord>('tournamentRoleAssignments', id);
    if (!target) { notFound(res); return; }
    await db.update<TournamentRoleAssignmentRecord>('tournamentRoleAssignments', id, { roles: target.roles & ~Number(req.params.role) });
    res.status(204).end();
  });

  // ── invitations ───────────────────────────────────────────────────────────

  app.get('/tournaments/:tournamentId/invitations', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.RoleAdmin)) { forbidden(res); return; }
    res.json(await db.find<InvitationRecord>('invitations', { tournamentId }));
  });

  app.post('/tournaments/:tournamentId/invitations', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.RoleAdmin)) { forbidden(res); return; }
    res.status(201).json(await db.create<InvitationRecord>('invitations', {
      tournamentId, createdDateTime: new Date().toISOString(), ...(req.body as S['InvitationRequest']),
    }));
  });

  app.delete('/tournaments/:tournamentId/invitations/:invitationId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.RoleAdmin)) { forbidden(res); return; }
    await db.delete('invitations', Number(req.params.invitationId));
    res.status(204).end();
  });

  app.post('/tournaments/:tournamentId/invitations/:invitationId/roles/:role', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.RoleAdmin)) { forbidden(res); return; }
    const id = Number(req.params.invitationId);
    const inv = await db.findOne<InvitationRecord>('invitations', id);
    if (!inv) { notFound(res); return; }
    await db.update<InvitationRecord>('invitations', id, { roles: inv.roles | Number(req.params.role) });
    res.status(200).end();
  });

  app.delete('/tournaments/:tournamentId/invitations/:invitationId/roles/:role', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.RoleAdmin)) { forbidden(res); return; }
    const id = Number(req.params.invitationId);
    const inv = await db.findOne<InvitationRecord>('invitations', id);
    if (!inv) { notFound(res); return; }
    await db.update<InvitationRecord>('invitations', id, { roles: inv.roles & ~Number(req.params.role) });
    res.status(204).end();
  });

  // ── registrations ─────────────────────────────────────────────────────────

  app.get('/tournaments/:tournamentId/categories/:categoryId/registrations', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.RoleAdmin)) { forbidden(res); return; }
    res.json(await db.find<RegistrationRecord>('registrations', { tournamentId, categoryNr: Number(req.params.categoryId) }));
  });

  app.post('/tournaments/:tournamentId/categories/:categoryId/registrations', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const t = await db.findOne<TournamentRecord>('tournaments', tournamentId);
    if (!t) { notFound(res, 'Tournament not found.'); return; }
    if (!t.public && !(await canViewNonPublicTournament(tournamentId, req.userId))) { forbidden(res); return; }
    const body = req.body as S['RegistrationRequest'];
    res.status(201).json(await db.create<RegistrationRecord>('registrations', {
      tournamentId, categoryNr: Number(req.params.categoryId), state: 'Pending', competitorId: null,
      name: body.name, emailaddress: body.emailaddress, telephone: body.telephone, info: body.info ?? null,
    }));
  });

  app.get('/tournaments/:tournamentId/categories/:categoryId/registrations/:registrationId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.RoleAdmin)) { forbidden(res); return; }
    const reg = await db.findOne<RegistrationRecord>('registrations', Number(req.params.registrationId));
    if (!reg || reg.tournamentId !== tournamentId) { notFound(res); return; }
    res.json(reg);
  });

  app.put('/tournaments/:tournamentId/categories/:categoryId/registrations/:registrationId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.RoleAdmin)) { forbidden(res); return; }
    const id = Number(req.params.registrationId);
    const existing = await db.findOne<RegistrationRecord>('registrations', id);
    if (!existing || existing.tournamentId !== tournamentId) { notFound(res); return; }
    res.json(await db.update<RegistrationRecord>('registrations', id, req.body as S['RegistrationUpdateRequest']));
  });

  app.delete('/tournaments/:tournamentId/categories/:categoryId/registrations/:registrationId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.RoleAdmin)) { forbidden(res); return; }
    await db.delete('registrations', Number(req.params.registrationId));
    res.status(204).end();
  });

  // ── registration settings ─────────────────────────────────────────────────

  app.get('/tournaments/:tournamentId/registrations/settings', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const t = await db.findOne<TournamentRecord>('tournaments', tournamentId);
    if (!t) { notFound(res); return; }
    if (!t.public && !(await canViewNonPublicTournament(tournamentId, req.userId))) { forbidden(res); return; }
    const settings = await db.getRegistrationSettings(tournamentId);
    if (!settings) { notFound(res, 'Registration settings not found.'); return; }
    res.json(settings);
  });

  app.put('/tournaments/:tournamentId/registrations/settings', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentRoleAssignment(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    const body = req.body as S['RegistrationSettingsRequest'];
    res.json(await db.setRegistrationSettings(tournamentId, {
      enabled: body.enabled, endDateTime: body.endDateTime, mailAlert: body.mailAlert,
      remark: body.remark ?? null, acceptText: body.acceptText ?? null,
      acceptAsSubstituteText: body.acceptAsSubstituteText ?? null, declineText: body.declineText ?? null,
    }));
  });

  // ── Error handler ─────────────────────────────────────────────────────────

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const e = err as { status?: number; message?: string; errors?: unknown[] };
    res.status(e.status ?? 500).json({ message: e.message ?? 'Internal server error', ...(e.errors ? { errors: e.errors } : {}) });
  });

  return app;
}

// ── Start ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const db = await MongoDb.connect();
  const app = buildApp(db, createMailer());
  app.listen(PORT, () => {
    console.log(`FCToernooi API  →  http://localhost:${PORT}`);
    console.log(`Spec            →  ${SPEC_PATH}`);
  });
}

main().catch((err: unknown) => { console.error('Startup failed:', err); process.exit(1); });
