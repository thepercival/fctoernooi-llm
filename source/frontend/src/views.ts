import { icons } from './icons.js';
import type { Tournament, TournamentShell, User } from './api.js';

// Markup follows the Angular app (Bootswatch Sandstone): navbar, card-auth cards, bg-fct footer.

export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export type Alert = { type: 'success' | 'danger' | 'info' | 'warning'; message: string };

// Short codes in the query string (?melding=...) map to fixed texts, so no user input is ever echoed.
export const MESSAGES: Record<string, Alert> = {
  uitgelogd: { type: 'info', message: 'je bent uitgelogd' },
  geregistreerd: { type: 'success', message: 'bedankt voor het registreren! Je ontvangt een mail om je emailadres te bevestigen.' },
  wachtwoordgewijzigd: { type: 'success', message: 'je wachtwoord is gewijzigd, je kunt nu inloggen' },
  profielopgeslagen: { type: 'success', message: 'je profiel is opgeslagen' },
  validatiemail: { type: 'success', message: 'de validatiemail is opnieuw verstuurd' },
  aangemaakt: { type: 'success', message: 'het toernooi is aangemaakt' },
  opgeslagen: { type: 'success', message: 'het toernooi is opgeslagen' },
  verwijderd: { type: 'success', message: 'het toernooi is verwijderd' },
  sessieverlopen: { type: 'warning', message: 'je sessie is verlopen, log opnieuw in' },
};

export type Page = {
  title: string;
  body: string;
  user: boolean;
  csrf: string;
};

function nav(page: Page): string {
  const right = page.user
    ? `<a href="/mijn-toernooien" class="btn btn-navbar py-0" aria-label="mijn toernooien">${icons.trophy}<span class="d-none d-sm-inline ms-1">mijn toernooien</span></a>
       <div class="vr my-0"></div>
       <a href="/user/profile" class="btn btn-navbar py-0" aria-label="account">${icons.user}<span class="d-none d-sm-inline ms-1">account</span></a>
       <div class="vr my-0"></div>
       <form method="post" action="/user/logout" class="m-0 d-flex">
         <input type="hidden" name="_csrf" value="${esc(page.csrf)}">
         <button type="submit" class="btn btn-navbar py-0" aria-label="uitloggen">${icons.signOut}<span class="d-none d-sm-inline ms-1">uitloggen</span></button>
       </form>`
    : `<a href="/user/login" class="btn btn-navbar py-0" aria-label="inloggen">${icons.signIn}<span class="d-none d-sm-inline ms-1">inloggen</span></a>`;
  return `<nav class="navbar p-0 mb-0 d-flex flex-nowrap">
    <div class="d-flex flex-nowrap flex-shrink-0">
      <a href="/" class="btn btn-navbar py-0" aria-label="home">${icons.home}</a>
      <div class="vr my-0"></div>
    </div>
    <h1 class="px-2 my-0 overflow-hidden text-nowrap text-truncate flex-grow-1 text-center" style="min-width: 0;">${esc(page.title)}</h1>
    <div class="d-flex flex-nowrap flex-shrink-0">
      <div class="vr my-0"></div>
      ${right}
    </div>
  </nav>`;
}

export function layout(page: Page): string {
  return `<!doctype html>
<html lang="nl" data-bs-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <script>
    // Follow the system colour scheme (Bootstrap 5.3 data-bs-theme), also when it changes while the page is open.
    (function () {
      var query = matchMedia('(prefers-color-scheme: dark)');
      function apply() { document.documentElement.setAttribute('data-bs-theme', query.matches ? 'dark' : 'light'); }
      apply();
      query.addEventListener('change', apply);
    })();
  </script>
  <title>FCToernooi, ${esc(page.title)}</title>
  <link rel="apple-touch-icon" sizes="180x180" href="/favicon/apple-touch-icon.png">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon/favicon-16x16.png">
  <link rel="shortcut icon" href="/favicon/favicon.ico">
  <meta name="theme-color" content="#3e3e3e">
  <link rel="stylesheet" href="/styles.css">
</head>
<body class="d-flex flex-column min-vh-100">
  ${nav(page)}
  <div class="content-wrapper mt-2">
    <div class="container">
      ${page.body}
    </div>
  </div>
  <footer class="footer pt-0 mt-3 bg-fct">
    <div class="container">
      <div class="row">
        <div class="col-sm-4 mt-3">
          <p class="h5 text-white">contact</p>
          <ul class="list-unstyled mb-3">
            <li><a href="mailto:info@fctoernooi.nl" rel="noopener">info&#64;fctoernooi.nl</a></li>
          </ul>
        </div>
      </div>
    </div>
  </footer>
</body>
</html>`;
}

export function alertHtml(alert?: Alert): string {
  return alert ? `<div class="alert alert-${alert.type}" role="alert">${esc(alert.message)}</div>` : '';
}

function hidden(csrf: string): string { return `<input type="hidden" name="_csrf" value="${esc(csrf)}">`; }

// Row with label + control, same grid as the Angular forms.
function field(id: string, label: string, control: string): string {
  return `<div class="row mb-3">
    <div class="col-3 text-end"><label for="${id}" class="col-form-label">${esc(label)}</label></div>
    <div class="col-9">${control}</div>
  </div>`;
}

function input(id: string, type: string, value = '', extra = ''): string {
  return `<input class="form-control" id="${id}" name="${id}" type="${type}" value="${esc(value)}" ${extra}>`;
}

function buttons(...items: string[]): string {
  return `<div class="row mb-3"><div class="col-9 offset-3 text-start">${items.join(' ')}</div></div>`;
}

function authCard(title: string, icon: string, alert: Alert | undefined, content: string, wide = false): string {
  const col = wide ? 'col-sm-12 col-md-10 col-lg-8' : 'col-sm-11 col-md-8 col-lg-6 col-xl-5';
  return `<div class="container-fluid"><div class="row justify-content-center"><div class="${col} g-0">
    <div class="card card-auth my-3">
      <div class="card-header text-center"><h1>${icon}<small class="ms-2">${esc(title)}</small></h1></div>
      <div class="card-body mx-auto form-validate border-top-0 border-primary w-100">
        ${alertHtml(alert)}
        ${content}
      </div>
    </div>
  </div></div></div>`;
}

// ── Account pages ───────────────────────────────────────────────────────────────

export function loginPage(csrf: string, next: string, emailaddress: string, alert?: Alert): string {
  return authCard('inloggen', icons.signIn, alert, `<form method="post" action="/user/login" novalidate>
    ${hidden(csrf)}<input type="hidden" name="next" value="${esc(next)}">
    ${field('emailaddress', 'emailadres', input('emailaddress', 'email', emailaddress, 'required maxlength="100" autocomplete="username" autofocus'))}
    ${field('password', 'wachtwoord', input('password', 'password', '', 'required autocomplete="current-password" placeholder="min. 8 karakters"'))}
    ${buttons('<button type="submit" class="btn btn-primary">inloggen</button>')}
    <div class="row mb-3"><div class="offset-3 col-9 text-start">
      <a href="/user/register" class="me-3">registreren</a>
      <a href="/user/passwordreset">wachtwoord vergeten</a>
    </div></div>
  </form>`);
}

export function registerPage(csrf: string, emailaddress: string, alert?: Alert): string {
  return authCard('registreren', icons.userPlus, alert, `<form method="post" action="/user/register" novalidate>
    ${hidden(csrf)}
    ${field('emailaddress', 'emailadres', input('emailaddress', 'email', emailaddress, 'required maxlength="100" autocomplete="username" autofocus'))}
    ${field('password', 'wachtwoord', input('password', 'password', '', 'required minlength="8" autocomplete="new-password" placeholder="min. 8 karakters"'))}
    ${field('passwordRepeat', 'herhaal wachtwoord', input('passwordRepeat', 'password', '', 'required minlength="8" autocomplete="new-password" placeholder="min. 8 karakters"'))}
    ${buttons('<button type="submit" class="btn btn-primary">registreren</button>')}
  </form>`);
}

export function passwordResetPage(csrf: string, emailaddress: string, alert?: Alert): string {
  return authCard('wachtwoord vergeten', icons.key, alert, `<form method="post" action="/user/passwordreset" novalidate>
    ${hidden(csrf)}
    ${field('emailaddress', 'emailadres', input('emailaddress', 'email', emailaddress, 'required maxlength="100" autofocus'))}
    ${buttons('<button type="submit" class="btn btn-primary">verstuur mail</button>', '<a href="/user/login" class="btn btn-outline-secondary">terug</a>')}
  </form>`);
}

export function passwordChangePage(csrf: string, emailaddress: string, token: string, alert?: Alert): string {
  return authCard('nieuw wachtwoord', icons.key, alert, `<form method="post" action="/user/passwordchange" novalidate>
    ${hidden(csrf)}<input type="hidden" name="token" value="${esc(token)}"><input type="hidden" name="emailaddress" value="${esc(emailaddress)}">
    ${field('emailaddressShown', 'emailadres', `<input class="form-control" id="emailaddressShown" value="${esc(emailaddress)}" disabled>`)}
    ${field('password', 'wachtwoord', input('password', 'password', '', 'required minlength="8" autocomplete="new-password" autofocus placeholder="min. 8 karakters"'))}
    ${field('passwordRepeat', 'herhaal wachtwoord', input('passwordRepeat', 'password', '', 'required minlength="8" autocomplete="new-password"'))}
    ${buttons('<button type="submit" class="btn btn-primary">opslaan</button>')}
  </form>`);
}

export function messagePage(title: string, icon: string, alert: Alert, links: string): string {
  return authCard(title, icon, alert, `<div class="text-center">${links}</div>`);
}

export function profilePage(csrf: string, user: User, alert?: Alert): string {
  const validation = user.validated
    ? '<span class="text-success">gevalideerd</span>'
    : `<span class="text-warning">nog niet gevalideerd</span>
       <form method="post" action="/user/profile/validationrequest" class="d-inline ms-2">${hidden(csrf)}<button type="submit" class="btn btn-sm btn-outline-secondary">stuur validatiemail opnieuw</button></form>`;
  return authCard('profiel', icons.user, alert, `<form method="post" action="/user/profile" novalidate>
    ${hidden(csrf)}
    ${field('emailaddress', 'emailadres', input('emailaddress', 'email', user.emailaddress, 'required maxlength="100"'))}
    <div class="row mb-3"><div class="col-9 offset-3 text-start small">${validation}</div></div>
    ${field('name', 'naam', input('name', 'text', user.name ?? '', 'maxlength="15" placeholder="max. 15 karakters"'))}
    ${buttons(`<button type="submit" class="btn btn-primary">${icons.save} opslaan</button>`)}
  </form>`);
}

// ── Tournaments ───────────────────────────────────────────────────────────────

const ROLE_LABELS: [number, string][] = [[1, 'beheerder'], [2, 'rollenbeheerder'], [4, 'uitslagen'], [8, 'scheidsrechter']];
const ROLE_ADMIN = 1;

function roleLabels(roles: number): string {
  return ROLE_LABELS.filter(([bit]) => (roles & bit) !== 0).map(([, label]) => label).join(', ');
}

const TIME_ZONE = 'Europe/Amsterdam';

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('nl-NL', { timeZone: TIME_ZONE, dateStyle: 'short', timeStyle: 'short' });
}

export function publicTournamentsPage(shells: TournamentShell[] | null, error?: string): string {
  const rows = (shells ?? []).map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(formatDateTime(s.startDateTime))}</td></tr>`).join('');
  return `<h2 class="my-3">openbare toernooien</h2>
    ${error ? alertHtml({ type: 'danger', message: `toernooien konden niet worden geladen: ${error}` }) : (rows
      ? `<table class="table table-striped"><thead><tr><th>naam</th><th>start</th></tr></thead><tbody>${rows}</tbody></table>`
      : '<p class="text-muted">er zijn nog geen openbare toernooien</p>')}`;
}

export function myTournamentsPage(shells: TournamentShell[], alert?: Alert): string {
  const rows = shells.map((s) => {
    const canEdit = (s.roles & ROLE_ADMIN) !== 0;
    const actions = canEdit
      ? `<a class="btn btn-sm btn-outline-secondary me-1" href="/mijn-toernooien/${s.tournamentId}/bewerken">${icons.edit} bewerken</a>
         <a class="btn btn-sm btn-outline-danger" href="/mijn-toernooien/${s.tournamentId}/verwijderen">${icons.remove} verwijderen</a>`
      : '';
    return `<tr><td>${esc(s.name)}</td><td>${esc(formatDateTime(s.startDateTime))}</td><td>${s.public ? 'openbaar' : 'privé'}</td><td>${esc(roleLabels(s.roles))}</td><td class="text-end text-nowrap">${actions}</td></tr>`;
  }).join('');
  return `<div class="d-flex justify-content-between align-items-center my-3">
      <h2 class="m-0">mijn toernooien</h2>
      <a class="btn btn-primary" href="/mijn-toernooien/nieuw">${icons.plus} nieuw toernooi</a>
    </div>
    ${alertHtml(alert)}
    ${rows
      ? `<table class="table table-striped"><thead><tr><th>naam</th><th>start</th><th>zichtbaarheid</th><th>rollen</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
      : '<p class="text-muted">je hebt nog geen toernooien, maak je eerste toernooi aan</p>'}`;
}

export type TournamentForm = { name: string; startDateTimeLocal: string; public: boolean; intro: string; location: string };

export function tournamentFormPage(csrf: string, action: string, title: string, form: TournamentForm, alert?: Alert): string {
  return authCard(title, icons.trophy, alert, `<form method="post" action="${esc(action)}" novalidate>
    ${hidden(csrf)}
    ${field('name', 'naam', input('name', 'text', form.name, 'required maxlength="100" autofocus'))}
    ${field('startDateTime', 'start', input('startDateTime', 'datetime-local', form.startDateTimeLocal, 'required'))}
    ${field('public', 'openbaar', `<div class="form-check mt-2"><input class="form-check-input" type="checkbox" id="public" name="public" value="1" ${form.public ? 'checked' : ''}><label class="form-check-label" for="public">iedereen mag dit toernooi bekijken</label></div>`)}
    ${field('location', 'locatie', input('location', 'text', form.location, 'maxlength="80"'))}
    ${field('intro', 'omschrijving', `<textarea class="form-control" id="intro" name="intro" rows="3" maxlength="400">${esc(form.intro)}</textarea>`)}
    ${buttons(`<button type="submit" class="btn btn-primary">${icons.save} opslaan</button>`, '<a href="/mijn-toernooien" class="btn btn-outline-secondary">annuleren</a>')}
  </form>`, true);
}

export function deleteTournamentPage(csrf: string, t: Tournament): string {
  return authCard('toernooi verwijderen', icons.remove, undefined, `<form method="post" action="/mijn-toernooien/${t.id}/verwijderen">
    ${hidden(csrf)}
    <p>Weet je zeker dat je <strong>${esc(t.name)}</strong> wilt verwijderen? Alle bijbehorende gegevens (deelnemers, sponsors, regels, rollen) worden ook verwijderd. Dit kan niet ongedaan worden gemaakt.</p>
    <button type="submit" class="btn btn-danger">${icons.remove} verwijderen</button>
    <a href="/mijn-toernooien" class="btn btn-outline-secondary ms-2">annuleren</a>
  </form>`);
}
