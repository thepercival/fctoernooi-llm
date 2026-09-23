# FCToernooi ChatApp — Agent Instructions

See [readme.md](../readme.md) for architecture, component list, and CI/CD flow diagrams.

## Structure
- `source/backend` — Node/Express/TS API (MCP tool implementations), Mongo-backed. Not the PHP `fctoernooi-api-old` repo.
- `source/frontend` — minimal Node/Express/TS app, renders public tournament shells (`GET /shells`) server-side. Env vars: `FCTOERNOOI_API_BASEURL` (shared, APIM gateway URL)
- `infra/` — `main.bicep` (all resources), `parameters.json` (single file, env-specific values passed as extra `--parameters key=value` overrides by CI, not per-env parameter files), `openapi.yaml` (mirrors the PHP API spec), `mcp-tools.json` (MCP tool list consumed via `loadJsonContent`), `modules/mcp-server.bicep`, `modules/app-service-backend.bicep` / `modules/app-service-frontend.bicep` (both wrap `br/modules:app-service:latest`), `agents/*.agent.json` (Foundry prompt agent definitions).
- Deploy: `.github/workflows/_deploy-env.yml` runs `az deployment group create --template-file infra/main.bicep --parameters infra/parameters.json ...` directly — `infra/main.json` is stale/unused, don't keep it in sync.
- App code deploy: only `prd` (Standard plan tier, `has-staging-slot: true` in [deploy.yml](../.github/workflows/deploy.yml)) deploys to the `staging` slot then swaps. `dev`/`acc` are Basic tier (no slot support) and deploy straight to production. Both `as-fctoernooi-api-<env>` and `as-fctoernooi-frontend-<env>` follow this same pattern.
- `br/modules:app-service:latest` (ACR-hosted, resolved via `bicepconfig.json`'s `br` alias) takes `additionalSharedEnvironmentVariables` / `additionalProductionOnlyEnvironmentVariables` / `additionalStagingOnlyEnvironmentVariables` (not a single `additionEnvironmentVariables` — that's an older/cached schema, re-run `az bicep restore --force` if the editor shows stale param errors and restart the Bicep language server). `resKeyVault.getSecret(...)` must be assigned directly to a module parameter (ternaries around it are fine, but never store the call in an intermediate `var`).

## Authorization model (see readme.md "Authorization Model" for full detail)
- No global user roles — only per-tournament roles via `TournamentRoleAssignment` (bitmask: `Admin=1, RoleAdmin=2, GameResultAdmin=4, Referee=8`, source of truth: `fctoernooi-api`'s `domain/Role.php`).
- `Tournament.public` (boolean, default `true`) drives visibility: `true` → tournament/rules/registration-settings/shells-listing readable by anyone + anyone can submit a registration. `false` → only an `Admin` role assignment can access it at all.
- Management writes (competitors, sponsors, lockerrooms, recesses, rules writes, invitations, registrations list/accept/decline, registration-settings writes, tournament PUT/DELETE, role assignments) always require their specific `x-roles` bit in `openapi.yaml`, regardless of `public`. `x-roles` is spec documentation; enforcement in `server.ts` is explicit inline `getTournamentRoleAssignment`/`hasRole` checks per handler (matching the codebase's existing style), not a generic spec-reading middleware.
- No `/public/*` path prefix in `openapi.yaml` — visibility is enforced by the rules above. The general public/private rule (no `x-roles`) is applied via a shared `canViewNonPublicTournament(tournamentId, userId)` helper in `server.ts`, called explicitly by each affected handler (tournament GET, rules GET, registration-settings GET, registration submit).
- `Tournament` never has a direct `userId` field — the only link between a `User` and a `Tournament` is `TournamentRoleAssignment`. Every tournament always has at least one `Admin` assignment, created together with the tournament.

## Gotchas
- `.gitignore` has a blanket `infra/**/*.json` rule. Any new JSON file under `infra/` needs an explicit `!infra/<path>` exception line right after it (existing: `!infra/mcp-tools.json`, `!infra/agents/*.json`), or git silently ignores it.
- APIM MCP `tools[].displayName` must match `^[\w]+$|^[\w][\w-]+[\w]$` — letters/digits/underscore/hyphen only, NO SPACES. Put human-readable text in `description` instead.
- Bicep `for`-loops creating `Microsoft.ApiManagement/service/apis/tools` need `@batchSize(1)` — concurrent writes under the same MCP server API cause `PreconditionFailed` (412) errors.
- Foundry prompt agent definition (`agent_update` via Foundry MCP tool) schema: `{ kind: "prompt", model: "<deployment-name-string>", instructions, tools: [...] }`. `model` is a plain string, not an object. Agent name/description are separate `agentName`/`creationOptions` args, not part of the definition body.
- MCP tool type schema: `{ type: "mcp", server_label, server_url, headers, allowed_tools, require_approval }`. `require_approval` is only `"always"` or `"never"` (plain string) — no per-tool object map.
- No ARM/Bicep resource type exists for individual Foundry agents — they're managed only through the Foundry Agent Service API (Foundry MCP tool's `agent_update`/`agent_get`/`agent_delete`, or the `azure-ai-projects` SDK).

## Naming conventions (per env: dev/acc/prd)
- APIM: `apim-cdk-<env>` (shared instance in `rg-core-<env>`, used by multiple projects).
- Foundry: account `ais-cdk-<env>`, project `aisp-fctoernooi-<env>`.
- Backend App Service: `as-fctoernooi-api-<env>` (Node backend — same name pattern as the unrelated PHP `fctoernooi-api` repo's own App Service, don't confuse them).
- APIM REST API path: `fctoernooi-api` (product `fctoernooi-api-product`, `subscriptionRequired: false` — the backend enforces its own JWT auth; APIM does not enforce OpenAPI `security` schemes at the gateway).
- APIM MCP server: `fctoernooi-api-mcp` (path `fctoernooi-api-mcp`, endpoint `.../mcp`, streamable HTTP transport, `subscriptionRequired: false`).
