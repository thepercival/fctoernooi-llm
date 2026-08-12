# fctoernooi-llm

Chat assistant that helps logged-in users manage tournaments using the tournament-api and scheduler-api.

## CI/CD Pipeline

### Triggers & environment flow

**push to non-main branch**

```mermaid
flowchart LR
    push([PR merged into main])

    subgraph BUILD["Build  parallel jobs"]
        direction TB
        bb["build-backend"]
        bf["build-frontend"]
    end

    push --> BUILD
    
    subgraph PRD["PRD rg-fctoernooi-prd"]
        direction TB
        subgraph DEV_INFRA["Infra  deploy-infra job"]
            di1[OIDC login] --> di2[create resource group\nrg-fctoernooi-env]
            di2 --> di3["deployment\n---\nApp Service Plan\nAppServices \nApim-Api\nFoundryProject"]
        end
        subgraph DEV_SRC["Source-jobs in paralel"]
            ds1["deploy\n webapp as-fctoernooi-api-env"]
            ds2["deploy\n webapp as-fctoernooi-frontend-env"]
        end
        DEV_INFRA --> DEV_SRC
    end

    BUILD -- deployment ACC must succeed --> PRD
```

### Trigger rules

| Event | Condition | Environment |
|---|---|---|
| `push` | any branch except `main` | dev |
| `pull_request` closed | `merged == true` into `main` | acc |
| after acc succeeds | — | prd |

### Infra vs source — what each deploys

| Section | Bicep / command | Resources |
|---|---|---|
| **Infra** | `infra/main.bicep` + `parameters/<env>.json` | App Service Plan (`rg-fctoernooi-<env>`), backend App Service (APIM-restricted), frontend App Service, APIM backend + API + product (in `rg-core-<env>`) |
| **Source — backend** | `az webapp deploy` → staging slot → swap | `as-fctoernooi-api-<env>` |
| **Source — frontend** | `az webapp deploy` → staging slot → swap | `as-fctoernooi-frontend-<env>` |



## Architecture

### Approach: Function Calling (Tool Use)

The assistant uses **function calling** — not RAG or fine-tuning — because it needs live data from APIs.

| Approach | Verdict |
|---|---|
| Function calling / tools | ✅ Live API data, actions |

### Component Overview

```mermaid
sequenceDiagram
    participant U as Browser
    participant C as Chat Service
    participant L as gpt-5-mini
    participant T as tournament-api
    participant S as scheduler-api

    U->>C: user message
    C->>L: messages + tool definitions
    L-->>C: tool_call: getTournaments()
    C->>T: GET /tournaments
    T-->>C: tournament data
    C->>L: tool result
    L-->>C: final response
    C-->>U: answer
```

The LLM decides when to call a tool based on the user's question. The chat service executes the actual API call and returns the result to the LLM, which then formulates the response.

### API Keys & Secrets

All keys live in the **backend chat service** — never in the browser.

| Secret | Storage |
|---|---|
| Azure OpenAI `api-key` | Azure Key Vault → env var |
| tournament-api key | Azure Key Vault → env var |
| scheduler-api key | Azure Key Vault → env var |
| Local dev | `.env` file (gitignored) |
| GitHub Actions | GitHub Secrets |

### User Privacy & Data Isolation

The chat service must call the tournament-api and scheduler-api **in the name of the logged-in user** using the OAuth On-Behalf-Of (OBO) flow. Data filtering is enforced at the API level — never by the LLM.

```mermaid
sequenceDiagram
    participant U as Browser
    participant E as Entra ID
    participant C as Chat Service
    participant T as tournament-api
    participant S as scheduler-api

    U->>E: login
    E-->>U: user token
    U->>C: request + user token
    C->>E: OBO exchange (user token → scoped token)
    E-->>C: token scoped to tournament-api / scheduler-api
    C->>T: GET /tournaments (user-scoped token)
    T-->>C: only this user's data
    C->>S: GET /schedule (user-scoped token)
    S-->>C: only this user's data
    C-->>U: response
```

**Rules:**
- The tournament-api and scheduler-api validate the bearer token and only return data owned by that user (`oid`/`sub` claim)
- The LLM never sees tokens or keys
- Even a prompt injection attack cannot access another user's data — the token has no permission for it

## Infrastructure

Azure AIServices (`kind: 'AIServices'`) deployed via Bicep + GitHub Actions.

**Endpoint pattern:**
```
https://aoai-fctoernooi-{env}.cognitiveservices.azure.com/openai/v1/chat/completions?api-version=2025-04-01-preview
```

Environments: `dev` (capacity 10) · `acc` (capacity 20) · `prd` (capacity 50)
