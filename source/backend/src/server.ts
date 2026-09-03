import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import * as OpenApiValidator from 'express-openapi-validator';
import { apiReference } from '@scalar/express-api-reference';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import {
  MongoDb,
  type UserRecord, type TournamentRecord, type CompetitorRecord,
  type SponsorRecord, type LockerRoomRecord, type RecessRecord,
  type RuleRecord, type TournamentUserRecord, type InvitationRecord,
  type RegistrationRecord, type RegistrationSettingsRecord, type PaymentRecord,
} from './db.js';
import type { components } from './openapi.gen.js';

// ── Config ────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 8080);
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = '8h';
const BCRYPT_ROUNDS = 10;
const SPEC_PATH = path.join(__dirname, 'openapi.yaml');

// ── Request body type aliases (from generated spec) ───────────────────────────

type S = components['schemas'];

// ── Auth helpers ──────────────────────────────────────────────────────────────

type JwtPayload = { userId: number };
function signToken(userId: number): string { return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN }); }
function verifyToken(token: string): JwtPayload { return jwt.verify(token, JWT_SECRET) as JwtPayload; }

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { userId?: number; } }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const Role = { Admin: 1, GameAdmin: 2, RoleAdmin: 4 } as const;

function notFound(res: Response, msg = 'Not found'): void { res.status(404).json({ message: msg }); }
function forbidden(res: Response): void { res.status(403).json({ message: 'Forbidden' }); }

async function getTournamentUser(db: MongoDb, tournamentId: number, userId: number): Promise<TournamentUserRecord | null> {
  return (await db.find<TournamentUserRecord>('tournamentUsers', { tournamentId, userId })).at(0) ?? null;
}
function hasRole(tu: TournamentUserRecord, role: number): boolean { return (tu.roles & role) !== 0; }

function stripSensitive(u: UserRecord): S['User'] & { id: number } {
  const { passwordHash: _p, validateToken: _v, forgetPasswordToken: _f, ...safe } = u;
  return safe;
}

type ShellFilters = { startDate?: unknown; endDate?: unknown; name?: unknown; example?: unknown };

function matchesShellFilters(tournament: TournamentRecord, filters: ShellFilters): boolean {
  const tournamentDate = Date.parse(tournament.createdDateTime);
  const startDate = filters.startDate ? Date.parse(String(filters.startDate)) : null;
  const endDate = filters.endDate ? Date.parse(String(filters.endDate)) : null;
  const name = filters.name ? String(filters.name) : null;
  const example = filters.example === undefined ? null : filters.example === true || filters.example === 'true' || filters.example === '1';

  return (startDate === null || tournamentDate >= startDate)
    && (endDate === null || tournamentDate <= endDate)
    && (name === null || tournament.intro.includes(name))
    && (example === null || tournament.example === example);
}

function toTournamentShell(tournament: TournamentRecord, roles = 0): S['TournamentShell'] {
  return {
    tournamentId: tournament.id,
    singleCustomSport: 0,
    name: tournament.intro,
    startDateTime: tournament.createdDateTime,
    roles,
    public: tournament.public,
  };
}

async function getRolesByTournament(db: MongoDb, userId: number): Promise<Map<number, number>> {
  const tournamentUsers = await db.find<TournamentUserRecord>('tournamentUsers', { userId });
  return new Map(tournamentUsers.map((tournamentUser) => [tournamentUser.tournamentId, tournamentUser.roles]));
}

// ── App ───────────────────────────────────────────────────────────────────────

function buildApp(db: MongoDb): express.Express {
  const app = express();
  app.use(express.json());

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
            try { req.userId = verifyToken(header.slice(7)).userId; return Promise.resolve(true); }
            catch { return Promise.resolve(false); }
          },
        },
      },
    }),
  );

  // ── /public/auth ─────────────────────────────────────────────────────────

  app.post('/public/auth/register', async (req, res) => {
    const { emailaddress, password } = req.body as S['RegisterRequest'];
    if ((await db.find<UserRecord>('users', { emailaddress })).length > 0) {
      res.status(409).json({ message: 'Email address already in use.' }); return;
    }
    await db.create<UserRecord>('users', {
      emailaddress, passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      name: null, validated: false, nrOfCredits: 0,
      validateToken: Math.random().toString(36).slice(2), forgetPasswordToken: null,
    });
    res.status(201).end();
  });

  app.post('/public/auth/login', async (req, res) => {
    const { emailaddress, password } = req.body as S['LoginRequest'];
    const user = (await db.find<UserRecord>('users', { emailaddress })).at(0);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ message: 'Invalid credentials.' }); return;
    }
    res.json({ token: signToken(user.id), userId: user.id } satisfies S['TokenResponse']);
  });

  app.post('/public/auth/passwordreset', async (req, res) => {
    const { emailaddress } = req.body as { emailaddress: string };
    const user = (await db.find<UserRecord>('users', { emailaddress })).at(0);
    if (user) await db.update<UserRecord>('users', user.id, { forgetPasswordToken: Math.random().toString(36).slice(2) });
    res.status(200).end();
  });

  app.post('/public/auth/passwordchange', async (req, res) => {
    const { emailaddress, password, token } = req.body as S['ChangePasswordRequest'];
    const user = (await db.find<UserRecord>('users', { emailaddress })).at(0);
    if (!user || user.forgetPasswordToken !== token) { res.status(400).json({ message: 'Invalid or expired reset token.' }); return; }
    await db.update<UserRecord>('users', user.id, { passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS), forgetPasswordToken: null });
    res.status(200).end();
  });

  app.get('/public/shells', async (req, res) => {
    const tournaments = await db.find<TournamentRecord>('tournaments', { public: true });
    res.json(tournaments
      .filter((tournament) => matchesShellFilters(tournament, req.query))
      .slice(0, 100)
      .map((tournament) => toTournamentShell(tournament)));
  });

  app.get('/public/tournaments/:tournamentId', async (req, res) => {
    const t = await db.findOne<TournamentRecord>('tournaments', Number(req.params.tournamentId));
    if (!t) { notFound(res); return; }
    if (!t.public) { res.status(403).json({ message: 'Tournament is not public.' }); return; }
    res.json(t);
  });

  app.get('/public/tournaments/:tournamentId/structure', async (req, res) => {
    const t = await db.findOne<TournamentRecord>('tournaments', Number(req.params.tournamentId));
    if (!t) { notFound(res); return; }
    res.json({ tournamentId: t.id });
  });

  app.get('/public/tournaments/:tournamentId/rules', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    res.json((await db.find<RuleRecord>('rules', { tournamentId })).sort((a, b) => a.priority - b.priority));
  });

  app.get('/public/tournaments/:tournamentId/registrations/settings', async (req, res) => {
    const settings = await db.getRegistrationSettings(Number(req.params.tournamentId));
    if (!settings) { notFound(res, 'Registration settings not found.'); return; }
    res.json(settings);
  });

  app.post('/public/tournaments/:tournamentId/categories/:categoryId/registrations', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    if (!(await db.findOne<TournamentRecord>('tournaments', tournamentId))) { notFound(res, 'Tournament not found.'); return; }
    const body = req.body as S['RegistrationRequest'];
    res.status(201).json(await db.create<RegistrationRecord>('registrations', {
      tournamentId, categoryNr: Number(req.params.categoryId), state: 'Pending', competitorId: null,
      name: body.name, emailaddress: body.emailaddress, telephone: body.telephone, info: body.info ?? null,
    }));
  });

  // ── /auth ─────────────────────────────────────────────────────────────────

  app.post('/auth/extendtoken', (req, res) => { res.json({ token: signToken(req.userId!), userId: req.userId }); });

  app.post('/auth/validate/:code', async (req, res) => {
    const user = await db.findOne<UserRecord>('users', req.userId!);
    if (!user || user.validateToken !== req.params.code) { res.status(400).json({ message: 'Invalid validation code.' }); return; }
    await db.update<UserRecord>('users', user.id, { validated: true, validateToken: null });
    res.status(200).end();
  });

  app.post('/auth/validationrequest', async (req, res) => {
    const user = await db.findOne<UserRecord>('users', req.userId!);
    if (user && !user.validated) await db.update<UserRecord>('users', user.id, { validateToken: Math.random().toString(36).slice(2) });
    res.status(200).end();
  });

  app.put('/auth/profile/:userId', async (req, res) => {
    if (Number(req.params.userId) !== req.userId!) { forbidden(res); return; }
    const user = await db.findOne<UserRecord>('users', req.userId!);
    if (!user) { notFound(res); return; }
    const updated = await db.update<UserRecord>('users', user.id, req.body as S['UserUpdateRequest']);
    res.json(stripSensitive(updated!));
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
    res.json(stripSensitive((await db.update<UserRecord>('users', user.id, req.body as S['UserUpdateRequest']))!));
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

  // ── /tournaments ──────────────────────────────────────────────────────────

  app.get('/shells', async (req, res) => {
    const [tournaments, rolesByTournament] = await Promise.all([
      db.find<TournamentRecord>('tournaments', { public: true }),
      getRolesByTournament(db, req.userId!),
    ]);
    res.json(tournaments
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
    res.json(tournaments
      .filter((tournament) => ((rolesByTournament.get(tournament.id) ?? 0) & requestedRoles) !== 0)
      .map((tournament) => toTournamentShell(tournament, rolesByTournament.get(tournament.id) ?? 0)));
  });

  app.post('/tournaments', async (req, res) => {
    const tournament = await db.create<TournamentRecord>('tournaments', {
      createdDateTime: new Date().toISOString(), startEditMode: 'EditMode',
      example: false, location: null, logoExtension: null, theme: null,
      public: false,
      ...(req.body as S['TournamentRequest']),
    });
    await db.create<TournamentUserRecord>('tournamentUsers', {
      tournamentId: tournament.id, userId: req.userId!,
      roles: Role.Admin | Role.GameAdmin | Role.RoleAdmin,
    });
    res.status(201).json(tournament);
  });

  app.get('/tournaments/:tournamentId', async (req, res) => {
    const t = await db.findOne<TournamentRecord>('tournaments', Number(req.params.tournamentId));
    if (!t) { notFound(res); return; }
    res.json(t);
  });

  app.put('/tournaments/:tournamentId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    const updated = await db.update<TournamentRecord>('tournaments', tournamentId, req.body as S['TournamentRequest']);
    if (!updated) { notFound(res); return; }
    res.json(updated);
  });

  app.delete('/tournaments/:tournamentId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    await db.delete('tournaments', tournamentId);
    res.status(204).end();
  });

  // ── competitors ───────────────────────────────────────────────────────────

  app.get('/tournaments/:tournamentId/competitors', async (req, res) => {
    res.json(await db.find<CompetitorRecord>('competitors', { tournamentId: Number(req.params.tournamentId) }));
  });

  app.post('/tournaments/:tournamentId/competitors', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
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
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    const id = Number(req.params.competitorId);
    const existing = await db.findOne<CompetitorRecord>('competitors', id);
    if (!existing || existing.tournamentId !== tournamentId) { notFound(res); return; }
    res.json(await db.update<CompetitorRecord>('competitors', id, req.body as S['CompetitorRequest']));
  });

  app.delete('/tournaments/:tournamentId/competitors/:competitorId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    await db.delete('competitors', Number(req.params.competitorId));
    res.status(204).end();
  });

  app.put('/tournaments/:tournamentId/competitors/:competitorOneId/:competitorTwoId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
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
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    res.status(201).json(await db.create<SponsorRecord>('sponsors', {
      tournamentId, url: null, logoExtension: null,
      ...(req.body as S['SponsorRequest']),
      screenNr: (req.body as S['SponsorRequest']).screenNr ?? 1,
    }));
  });

  app.put('/tournaments/:tournamentId/sponsors/:sponsorId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    const id = Number(req.params.sponsorId);
    const existing = await db.findOne<SponsorRecord>('sponsors', id);
    if (!existing || existing.tournamentId !== tournamentId) { notFound(res); return; }
    res.json(await db.update<SponsorRecord>('sponsors', id, req.body as S['SponsorRequest']));
  });

  app.delete('/tournaments/:tournamentId/sponsors/:sponsorId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    await db.delete('sponsors', Number(req.params.sponsorId));
    res.status(204).end();
  });

  // ── locker rooms ──────────────────────────────────────────────────────────

  app.post('/tournaments/:tournamentId/lockerrooms', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    const lr = await db.create<LockerRoomRecord>('lockerRooms', { tournamentId, ...(req.body as S['LockerRoomRequest']) });
    res.status(201).json({ ...lr, competitors: [] } satisfies S['LockerRoom']);
  });

  app.put('/tournaments/:tournamentId/lockerrooms/:lockerRoomId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
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
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    const id = Number(req.params.lockerRoomId);
    await db.deleteLockerRoomCompetitors(id);
    await db.delete('lockerRooms', id);
    res.status(204).end();
  });

  app.post('/tournaments/:tournamentId/lockerrooms/:lockerRoomId/synccompetitors', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    await db.setLockerRoomCompetitors(Number(req.params.lockerRoomId), (req.body as { competitorIds: number[] }).competitorIds);
    res.status(200).end();
  });

  // ── recesses ──────────────────────────────────────────────────────────────

  app.post('/tournaments/:tournamentId/recesses', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    res.status(201).json(await db.create<RecessRecord>('recesses', { tournamentId, ...(req.body as S['RecessRequest']) }));
  });

  app.delete('/tournaments/:tournamentId/recesses/:recessId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    await db.delete('recesses', Number(req.params.recessId));
    res.status(204).end();
  });

  // ── rules ─────────────────────────────────────────────────────────────────

  app.get('/tournaments/:tournamentId/rules', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    res.json((await db.find<RuleRecord>('rules', { tournamentId })).sort((a, b) => a.priority - b.priority));
  });

  app.post('/tournaments/:tournamentId/rules', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    const count = (await db.find<RuleRecord>('rules', { tournamentId })).length;
    res.status(201).json(await db.create<RuleRecord>('rules', {
      tournamentId, priority: count + 1, ...(req.body as S['RuleRequest']),
    }));
  });

  app.put('/tournaments/:tournamentId/rules/:ruleId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    const id = Number(req.params.ruleId);
    const existing = await db.findOne<RuleRecord>('rules', id);
    if (!existing || existing.tournamentId !== tournamentId) { notFound(res); return; }
    res.json(await db.update<RuleRecord>('rules', id, req.body as S['RuleRequest']));
  });

  app.delete('/tournaments/:tournamentId/rules/:ruleId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.Admin)) { forbidden(res); return; }
    await db.delete('rules', Number(req.params.ruleId));
    res.status(204).end();
  });

  app.post('/tournaments/:tournamentId/rules/:ruleId/priorityup', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
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

  // ── tournament users ───────────────────────────────────────────────────────

  app.delete('/tournaments/:tournamentId/users/:tournamentUserId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.RoleAdmin)) { forbidden(res); return; }
    await db.delete('tournamentUsers', Number(req.params.tournamentUserId));
    res.status(204).end();
  });

  app.get('/tournaments/:tournamentId/users/:tournamentUserId/emailaddress', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.RoleAdmin)) { forbidden(res); return; }
    const targetTu = await db.findOne<TournamentUserRecord>('tournamentUsers', Number(req.params.tournamentUserId));
    if (!targetTu) { notFound(res); return; }
    res.json({ emailaddress: (await db.findOne<UserRecord>('users', targetTu.userId))?.emailaddress ?? null });
  });

  app.post('/tournaments/:tournamentId/users/:tournamentUserId/roles/:role', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.RoleAdmin)) { forbidden(res); return; }
    const id = Number(req.params.tournamentUserId);
    const target = await db.findOne<TournamentUserRecord>('tournamentUsers', id);
    if (!target) { notFound(res); return; }
    await db.update<TournamentUserRecord>('tournamentUsers', id, { roles: target.roles | Number(req.params.role) });
    res.status(200).end();
  });

  app.delete('/tournaments/:tournamentId/users/:tournamentUserId/roles/:role', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.RoleAdmin)) { forbidden(res); return; }
    const id = Number(req.params.tournamentUserId);
    const target = await db.findOne<TournamentUserRecord>('tournamentUsers', id);
    if (!target) { notFound(res); return; }
    await db.update<TournamentUserRecord>('tournamentUsers', id, { roles: target.roles & ~Number(req.params.role) });
    res.status(204).end();
  });

  // ── invitations ───────────────────────────────────────────────────────────

  app.get('/tournaments/:tournamentId/invitations', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.RoleAdmin)) { forbidden(res); return; }
    res.json(await db.find<InvitationRecord>('invitations', { tournamentId }));
  });

  app.post('/tournaments/:tournamentId/invitations', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.RoleAdmin)) { forbidden(res); return; }
    res.status(201).json(await db.create<InvitationRecord>('invitations', {
      tournamentId, createdDateTime: new Date().toISOString(), ...(req.body as S['InvitationRequest']),
    }));
  });

  app.delete('/tournaments/:tournamentId/invitations/:invitationId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.RoleAdmin)) { forbidden(res); return; }
    await db.delete('invitations', Number(req.params.invitationId));
    res.status(204).end();
  });

  app.post('/tournaments/:tournamentId/invitations/:invitationId/roles/:role', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.RoleAdmin)) { forbidden(res); return; }
    const id = Number(req.params.invitationId);
    const inv = await db.findOne<InvitationRecord>('invitations', id);
    if (!inv) { notFound(res); return; }
    await db.update<InvitationRecord>('invitations', id, { roles: inv.roles | Number(req.params.role) });
    res.status(200).end();
  });

  app.delete('/tournaments/:tournamentId/invitations/:invitationId/roles/:role', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
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
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.RoleAdmin)) { forbidden(res); return; }
    res.json(await db.find<RegistrationRecord>('registrations', { tournamentId, categoryNr: Number(req.params.categoryId) }));
  });

  app.post('/tournaments/:tournamentId/categories/:categoryId/registrations', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.RoleAdmin)) { forbidden(res); return; }
    const body = req.body as S['RegistrationRequest'];
    res.status(201).json(await db.create<RegistrationRecord>('registrations', {
      tournamentId, categoryNr: Number(req.params.categoryId), state: 'Pending', competitorId: null,
      name: body.name, emailaddress: body.emailaddress, telephone: body.telephone, info: body.info ?? null,
    }));
  });

  app.get('/tournaments/:tournamentId/categories/:categoryId/registrations/:registrationId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.RoleAdmin)) { forbidden(res); return; }
    const reg = await db.findOne<RegistrationRecord>('registrations', Number(req.params.registrationId));
    if (!reg || reg.tournamentId !== tournamentId) { notFound(res); return; }
    res.json(reg);
  });

  app.put('/tournaments/:tournamentId/categories/:categoryId/registrations/:registrationId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.RoleAdmin)) { forbidden(res); return; }
    const id = Number(req.params.registrationId);
    const existing = await db.findOne<RegistrationRecord>('registrations', id);
    if (!existing || existing.tournamentId !== tournamentId) { notFound(res); return; }
    res.json(await db.update<RegistrationRecord>('registrations', id, req.body as S['RegistrationUpdateRequest']));
  });

  app.delete('/tournaments/:tournamentId/categories/:categoryId/registrations/:registrationId', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
    if (!tu || !hasRole(tu, Role.RoleAdmin)) { forbidden(res); return; }
    await db.delete('registrations', Number(req.params.registrationId));
    res.status(204).end();
  });

  // ── registration settings ─────────────────────────────────────────────────

  app.get('/tournaments/:tournamentId/registrations/settings', async (req, res) => {
    const settings = await db.getRegistrationSettings(Number(req.params.tournamentId));
    if (!settings) { notFound(res, 'Registration settings not found.'); return; }
    res.json(settings);
  });

  app.put('/tournaments/:tournamentId/registrations/settings', async (req, res) => {
    const tournamentId = Number(req.params.tournamentId);
    const tu = await getTournamentUser(db, tournamentId, req.userId!);
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
  const app = buildApp(db);
  app.listen(PORT, () => {
    console.log(`FCToernooi API  →  http://localhost:${PORT}`);
    console.log(`Spec            →  ${SPEC_PATH}`);
  });
}

main().catch((err: unknown) => { console.error('Startup failed:', err); process.exit(1); });
