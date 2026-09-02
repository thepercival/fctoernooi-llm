import { MongoClient, type Db } from 'mongodb';

// MongoDB document with integer _id (overrides the default ObjectId inference)
type IntDoc = { _id: number } & Record<string, unknown>;
import type { components } from './openapi.gen.js';

// ── Schema alias ──────────────────────────────────────────────────────────────

type S = components['schemas'];

// ── Record types (DB storage — all fields required; extend API schemas) ────────

// UserRecord adds auth fields not exposed by the API
export type UserRecord = Required<S['User']> & {
  passwordHash: string;
  validateToken: string | null;
  forgetPasswordToken: string | null;
};

export type TournamentRecord = Required<S['Tournament']>;

export type CompetitorRecord = Required<S['Competitor']> & { tournamentId: number };

export type SponsorRecord = Required<S['Sponsor']> & { tournamentId: number };

export type LockerRoomRecord = { id: number; tournamentId: number; name: string };

export type RecessRecord = Required<S['Recess']> & { tournamentId: number };

export type RuleRecord = Required<S['Rule']> & { tournamentId: number };

export type TournamentUserRecord = Required<S['TournamentUser']> & { tournamentId: number };

export type InvitationRecord = Required<S['Invitation']> & { tournamentId: number };

export type RegistrationRecord = Required<S['Registration']> & { tournamentId: number };

export type RegistrationSettingsRecord = Required<S['RegistrationSettings']> & { tournamentId: number };

export type PaymentRecord = Required<S['Payment']> & { userId: number };

// ── Collection map ────────────────────────────────────────────────────────────

export type CollectionName =
  | 'users' | 'tournaments' | 'competitors' | 'sponsors' | 'lockerRooms'
  | 'recesses' | 'rules' | 'tournamentUsers' | 'invitations'
  | 'registrations' | 'payments';

// ── MongoDB document helpers (integer _id instead of ObjectId) ─────────────────

type Doc<T extends { id: number }> = Omit<T, 'id'> & { _id: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromDoc<T extends { id: number }>(doc: any): T {
  const { _id, ...rest } = doc as { _id: number; [key: string]: unknown };
  return { ...rest, id: _id } as unknown as T;
}

// ── MongoDb ───────────────────────────────────────────────────────────────────

export class MongoDb {
  private constructor(private readonly mdb: Db) {}

  static async connect(): Promise<MongoDb> {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is not set.');
    const dbName = process.env.MONGODB_DB;
    if (!dbName) throw new Error('MONGODB_DB is not set.');
    const client = new MongoClient(uri);
    await client.connect();
    const instance = new MongoDb(client.db(dbName));
    // TODO: run migrate-mongo migrations here before ensureIndexes (add migrate-mongo package, call up())
    await instance.ensureIndexes();
    return instance;
  }

  private async nextId(collection: string): Promise<number> {
    const result = await this.mdb
      .collection<{ _id: string; seq: number }>('_counters')
      .findOneAndUpdate({ _id: collection }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
    return result!.seq;
  }

  // using IntDoc fixes _id typing: MongoDB infers ObjectId by default for Document
  private col(name: CollectionName) {
    return this.mdb.collection<IntDoc>(name);
  }

  private async ensureIndexes(): Promise<void> {
    await this.mdb.collection('users').createIndex({ emailaddress: 1 }, { unique: true });
    await this.mdb.collection('competitors').createIndex({ tournamentId: 1 });
    await this.mdb.collection('sponsors').createIndex({ tournamentId: 1 });
    await this.mdb.collection('lockerRooms').createIndex({ tournamentId: 1 });
    await this.mdb.collection('recesses').createIndex({ tournamentId: 1 });
    await this.mdb.collection('rules').createIndex({ tournamentId: 1 });
    await this.mdb.collection('tournamentUsers').createIndex({ tournamentId: 1, userId: 1 }, { unique: true });
    await this.mdb.collection('invitations').createIndex({ tournamentId: 1, emailaddress: 1 }, { unique: true });
    await this.mdb.collection('registrations').createIndex({ tournamentId: 1, categoryNr: 1 });
    await this.mdb.collection('payments').createIndex({ userId: 1 });
  }

  // ── Generic CRUD ──────────────────────────────────────────────────────────

  async findAll<T extends { id: number }>(collection: CollectionName): Promise<T[]> {
    const docs = await this.col(collection).find().toArray();
    return docs.map((d) => fromDoc<T>(d));
  }

  async findOne<T extends { id: number }>(collection: CollectionName, id: number): Promise<T | null> {
    const doc = await this.col(collection).findOne({ _id: id });
    return doc ? fromDoc<T>(doc) : null;
  }

  // filter is a plain equality object — maps directly to a MongoDB query
  async find<T extends { id: number }>(collection: CollectionName, filter: Partial<Omit<T, 'id'>>): Promise<T[]> {
    const docs = await this.col(collection).find(filter).toArray();
    return docs.map((d) => fromDoc<T>(d));
  }

  async create<T extends { id: number }>(collection: CollectionName, item: Omit<T, 'id'>): Promise<T> {
    const id = await this.nextId(collection);
    const doc = { ...item, _id: id } as IntDoc;
    await this.col(collection).insertOne(doc);
    return fromDoc<T>(doc);
  }

  async update<T extends { id: number }>(collection: CollectionName, id: number, patch: Partial<Omit<T, 'id'>>): Promise<T | null> {
    const doc = await this.col(collection).findOneAndUpdate(
      { _id: id },
      { $set: patch },
      { returnDocument: 'after' },
    );
    return doc ? fromDoc<T>(doc) : null;
  }

  async delete(collection: CollectionName, id: number): Promise<boolean> {
    const result = await this.col(collection).deleteOne({ _id: id });
    return result.deletedCount > 0;
  }

  // ── Registration settings (tournamentId is PK, no auto-id) ───────────────

  async getRegistrationSettings(tournamentId: number): Promise<RegistrationSettingsRecord | null> {
    const doc = await this.mdb
      .collection<RegistrationSettingsRecord & { _id: number }>('registrationSettings')
      .findOne({ _id: tournamentId });
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return { ...rest, id: _id, tournamentId: _id };
  }

  async setRegistrationSettings(tournamentId: number, settings: Omit<RegistrationSettingsRecord, 'id' | 'tournamentId'>): Promise<RegistrationSettingsRecord> {
    const doc = { ...settings, _id: tournamentId };
    await this.mdb
      .collection<typeof doc>('registrationSettings')
      .replaceOne({ _id: tournamentId }, doc, { upsert: true });
    return { ...settings, id: tournamentId, tournamentId };
  }

  // ── Locker room competitors (pivot — stored separately) ───────────────────

  async getLockerRoomCompetitors(lockerRoomId: number): Promise<number[]> {
    const doc = await this.mdb
      .collection<{ _id: number; competitorIds: number[] }>('lockerRoomCompetitors')
      .findOne({ _id: lockerRoomId });
    return doc?.competitorIds ?? [];
  }

  async setLockerRoomCompetitors(lockerRoomId: number, competitorIds: number[]): Promise<void> {
    await this.mdb
      .collection<IntDoc>('lockerRoomCompetitors')
      .replaceOne({ _id: lockerRoomId }, { _id: lockerRoomId, competitorIds } as IntDoc, { upsert: true });
  }

  async deleteLockerRoomCompetitors(lockerRoomId: number): Promise<void> {
    await this.mdb.collection<IntDoc>('lockerRoomCompetitors').deleteOne({ _id: lockerRoomId });
  }
}
