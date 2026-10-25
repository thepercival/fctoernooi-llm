// Thin client for the FCToernooi API (APIM gateway in Azure, the backend itself locally).

export type TournamentShell = {
  tournamentId: number;
  name: string;
  startDateTime: string;
  roles: number;
  public: boolean;
};

export type Tournament = {
  id: number;
  name: string;
  startDateTime: string;
  public: boolean;
  intro: string;
  location: string | null;
};

export type TournamentInput = {
  name: string;
  startDateTime: string;
  public: boolean;
  intro?: string;
  location?: string | null;
};

export type User = {
  id: number;
  emailaddress: string;
  name: string | null;
  validated: boolean;
  nrOfCredits: number;
};

export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

const BASEURL = (process.env.FCTOERNOOI_API_BASEURL ?? '').replace(/\/+$/, '');

async function call<T>(method: string, path: string, token?: string, body?: unknown): Promise<T> {
  if (!BASEURL) throw new ApiError(500, 'FCTOERNOOI_API_BASEURL is not configured');
  const response = await fetch(`${BASEURL}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    let message = `API responded with ${response.status}`;
    try { message = ((await response.json()) as { message?: string }).message ?? message; } catch { /* no body */ }
    throw new ApiError(response.status, message);
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  register: (emailaddress: string, password: string) => call<void>('POST', '/auth/register', undefined, { emailaddress, password }),
  login: (emailaddress: string, password: string) => call<{ token: string; userId: number }>('POST', '/auth/login', undefined, { emailaddress, password }),
  passwordReset: (emailaddress: string) => call<void>('POST', '/auth/passwordreset', undefined, { emailaddress }),
  passwordChange: (emailaddress: string, password: string, token: string) => call<void>('POST', '/auth/passwordchange', undefined, { emailaddress, password, token }),
  validate: (token: string, code: string) => call<void>('POST', `/auth/validate/${encodeURIComponent(code)}`, token),
  validationRequest: (token: string) => call<void>('POST', '/auth/validationrequest', token),
  getUser: (token: string, userId: number) => call<User>('GET', `/users/${userId}`, token),
  updateUser: (token: string, userId: number, body: { name?: string | null; emailaddress?: string }) => call<User>('PUT', `/users/${userId}`, token, body),

  listPublicShells: (token?: string) => call<TournamentShell[]>('GET', '/shells', token),
  listMyShells: (token: string, roles: number) => call<TournamentShell[]>('GET', `/shellswithrole?roles=${roles}`, token),
  getTournament: (token: string, id: number) => call<Tournament>('GET', `/tournaments/${id}`, token),
  createTournament: (token: string, body: TournamentInput) => call<Tournament>('POST', '/tournaments', token, body),
  updateTournament: (token: string, id: number, body: TournamentInput) => call<Tournament>('PUT', `/tournaments/${id}`, token, body),
  deleteTournament: (token: string, id: number) => call<void>('DELETE', `/tournaments/${id}`, token),
};
