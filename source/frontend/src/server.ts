import 'dotenv/config';
import express from 'express';

// ── Config ────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 8080);
const API_BASEURL = process.env.FCTOERNOOI_API_BASEURL ?? '';
// Not used by the public shells endpoint; reserved for future authenticated calls.
const API_KEY = process.env.FCTOERNOOI_API_KEY ?? '';

type TournamentShell = {
  tournamentId: number;
  name: string;
  startDateTime: string;
  public: boolean;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function renderPage(shells: TournamentShell[] | null, error?: string): string {
  const rows = shells?.map((shell) => `
    <tr>
      <td>${shell.tournamentId}</td>
      <td>${escapeHtml(shell.name)}</td>
      <td>${new Date(shell.startDateTime).toLocaleString()}</td>
    </tr>`).join('') ?? '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>FCToernooi</title>
</head>
<body>
  <header><h1>FCToernooi</h1></header>
  <main>
    <h2>Public tournaments</h2>
    ${error
      ? `<p>Could not load tournaments: ${escapeHtml(error)}</p>`
      : `<table>
          <thead><tr><th>ID</th><th>Name</th><th>Start</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`}
  </main>
</body>
</html>`;
}

const app = express();

app.get('/', async (_req, res) => {
  if (!API_BASEURL) {
    res.status(500).send(renderPage(null, 'FCTOERNOOI_API_BASEURL is not configured'));
    return;
  }
  try {
    const response = await fetch(`${API_BASEURL}/shells`);
    if (!response.ok) throw new Error(`API responded with ${response.status}`);
    const shells = await response.json() as TournamentShell[];
    res.send(renderPage(shells));
  } catch (err) {
    res.status(502).send(renderPage(null, err instanceof Error ? err.message : 'Unknown error'));
  }
});

app.listen(PORT, () => console.log(`fctoernooi-frontend listening on :${PORT}`));
