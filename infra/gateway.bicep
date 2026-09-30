// Phase 2: wires the backend App Service into APIM (REST API import + MCP server).
// Deployed AFTER the backend app code is live, so the openapi.yaml it imports is never stale.
// Deploy directly against the core resource group (where apim-cdk-<env> lives).
param environment string
param apim object
param apiBackend object
param mcpServer object
param backendUrl string

var apimName = '${apim.name}-${environment}'

// ── APIM: backend REST API ────────────────────────────────────────────────────

module modApimApi 'br/modules:apim-api:latest' = {
  name: 'modApimApi'
  params: {
    apiManagementName: apimName
    api: apiBackend
    // Backend serves its own spec at /openapi.yaml, already redeployed by the time this runs.
    openapiLink: '${backendUrl}/openapi.yaml'
    backend: {
      name: apiBackend.backendName
      description: apiBackend.backendDescription
      url: backendUrl
    }
  }
}

// ── APIM: MCP server (exposes API operations as tools for AI agents) ─────────
// Tool list lives in mcp-tools.json, generated from openapi.yaml operationIds

module modMcpServer 'modules/mcp-server.bicep' = {
  name: 'modMcpServer'
  params: {
    apiManagementName: apimName
    backingApiName: apiBackend.name
    mcpServer: mcpServer
    productName: apiBackend.product.name
    tools: loadJsonContent('mcp-tools.json').tools
  }
  dependsOn: [modApimApi]
}

output apimGatewayUrl string = 'https://${apimName}.azure-api.net'
output mcpServerUrl string = modMcpServer.outputs.mcpServerUrl
