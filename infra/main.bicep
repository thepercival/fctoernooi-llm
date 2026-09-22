import { FoundryProjectRoleAssignment, FoundryProjectRoleAssignmentTemplate } from 'br/modules:types:latest'

param location string = resourceGroup().location
@minLength(3)
param environment string
param coreResourceGroupName string
@secure()
param entraAdminPrincipalId string

param logAnalyticsWorkspace object
param keyVault object
param apim object
param appServicePlan object
param applicationInsights object
param appServiceBackend object
param apiBackend object
param mcpServer object

param appServiceFrontend object
param openaiAccount object
param openaiProject object
// param apiFrontend object
param database object

var apimName = '${apim.name}-${environment}'
var appServicePlanName = '${appServicePlan.name}-${environment}'
var applicationInsightsName = '${applicationInsights.name}-${environment}'
var appServiceBackendName = '${appServiceBackend.name}-${environment}'
// var cosmosDbAccountName = '${cosmosDb.name}-${environment}'
var keyVaultName = '${keyVault.name}-${environment}'
var dbName = database.name[environment]
var appServiceFrontendName = '${appServiceFrontend.name}-${environment}'



resource resLogAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: '${logAnalyticsWorkspace.name}-${environment}'
  scope: resourceGroup(coreResourceGroupName)
}

module modAppServicePlan 'br/modules:app-serviceplan:latest' = {
  name: 'modAppServicePlan'
  params: {
    planName: appServicePlanName
    location: location
    skuName: appServicePlan.sku[environment].name
    skuTier: appServicePlan.sku[environment].tier
    loganalyticsWorkspaceId: resLogAnalyticsWorkspace.id
  }
}

resource resKeyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
  scope: resourceGroup(coreResourceGroupName)
}

// ── Cosmos DB (MongoDB serverless) ───────────────────────────────────────────

// VPS IN USE
// module modCosmosDb 'br/modules:cosmos-db:latest' = {
//   name: 'modCosmosDb'
//   params: {
//     accountName: cosmosDbAccountName
//     location: location
//     databaseName: cosmosDb.databaseName
//     loganalyticsWorkspaceId: resLogAnalyticsWorkspace.id
//   }
// }

// ── Backend App Service ───────────────────────────────────────────────────────

resource resAppInsights 'Microsoft.Insights/components@2020-02-02' existing = {
  name: applicationInsightsName
  scope: resourceGroup(coreResourceGroupName)
}


// resource resCosmosDb 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' existing = {
//   name: cosmosDbAccountName
// }

var dbPasswordSecretName = '${dbName}-db-password'
module modAppServiceBackend 'modules/app-service-backend.bicep' = {
  name: 'modAppServiceBackend'
  params: {
    appServiceName: appServiceBackendName
    location: location
    appKind: appServiceBackend.kind
    linuxFxVersion: appServiceBackend.linuxFxVersion
    appServicePlanId: modAppServicePlan.outputs.appServicePlanId
    appInsightsConnectionString: resAppInsights.properties.ConnectionString
    appInsightsWorkspaceResourceId: resAppInsights.properties.WorkspaceResourceId
    withStagingSlot: appServicePlan.sku[environment].tier == 'Standard' ? true : false
    dbHost: database.host
    dbName: dbName
    dbPassword: resKeyVault.getSecret(dbPasswordSecretName)
  }
}

// ///
// add apiKeySecretUri to addionalEnvironmentVariables for backend app service
// param apiKeySecretUri string = ''
// var environmentVariables = apiKeySecretUri != '' ? concat(environmentVariablesTmp, [
//   {
//     name: 'API_KEY'
//     value: apiKeySecretUri
//   }  
// ]) : environmentVariablesTmp

// // ///
// param dbConnectionString string = ''

// @description('SQL Database resource')
// resource webAppStagingConfig 'Microsoft.Web/sites/slots/config@2024-04-01' = if (dbConnectionString != '') {
//   parent: resWebAppSlot
//   name: 'web'
//   properties: {
//     connectionStrings: [
//       {
//         name: 'OdsDbConnection'
//         connectionString: dbConnectionString
//         type: 'SQLAzure'
//       }
//     ]
//   }
// }
// ///


// OpenAI
var projectRoleAssignmentTemplates FoundryProjectRoleAssignmentTemplate[] = openaiProject.roleAssignmentTemplates
var projectRoleAssignments FoundryProjectRoleAssignment[] = [for roleAssignmentTemplate in projectRoleAssignmentTemplates: union(roleAssignmentTemplate, {
  principalId: entraAdminPrincipalId
})]

module modOpenaiProject 'br/modules:openai-project:latest' = if(openaiProject.deploy[environment]) {
  name: 'modOpenaiProject'
  scope: resourceGroup(coreResourceGroupName)
  params: {
    accountName: '${openaiAccount.name}-${environment}'
    name: '${openaiProject.name}-${environment}'
    description: openaiProject.description
    location: location
    roleAssignments: projectRoleAssignments
  }
}

// ── Frontend App Service ──────────────────────────────────────────────────────

var apiBaseUrl = appServiceFrontend.apiBaseUrl[environment]
var apiKeySecretName = appServiceFrontend.apiKeySecretName

// ── APIM: chatbot frontend ────────────────────────────────────────────────────
module modAppServiceFrontend 'modules/app-service-frontend.bicep' = {
  name: 'modAppServiceFrontend'
  params: {
    appServiceName: appServiceFrontendName
    location: location
    appKind: appServiceFrontend.kind
    linuxFxVersion: appServiceFrontend.linuxFxVersion
    appServicePlanId: modAppServicePlan.outputs.appServicePlanId
    appInsightsConnectionString: resAppInsights.properties.ConnectionString
    appInsightsWorkspaceResourceId: resAppInsights.properties.WorkspaceResourceId
    withStagingSlot: appServicePlan.sku[environment].tier == 'Standard' ? true : false
    backendApiBaseUrl: apiBaseUrl
    // Secret isn't provisioned for acc yet — keep the value empty there instead of failing the deployment.
    backendApiKey: environment == 'acc' ? '' : resKeyVault.getSecret(apiKeySecretName)
  }
}


// ── APIM: backend REST API ────────────────────────────────────────────────────

module modApimApi 'br/modules:apim-api:latest' = {
  name: 'modApimApi'
  scope: resourceGroup(coreResourceGroupName)
  params: {
    apiManagementName: apimName
    api: apiBackend
    openapiLink: apiBackend.openapiLink
    backend: {
      name: apiBackend.backendName
      description: apiBackend.backendDescription
      url: modAppServiceBackend.outputs.url
    }
  }
}

// ── APIM: MCP server (exposes API operations as tools for AI agents) ─────────
// Tool list lives in mcp-tools.json, generated from openapi.yaml operationIds

module modMcpServer 'modules/mcp-server.bicep' = {
  name: 'modMcpServer'
  scope: resourceGroup(coreResourceGroupName)
  params: {
    apiManagementName: apimName
    backingApiName: apiBackend.name
    mcpServer: mcpServer
    productName: apiBackend.product.name
    tools: loadJsonContent('mcp-tools.json').tools
  }
  dependsOn: [modApimApi]
}

output backendUrl string = modAppServiceBackend.outputs.url
output frontendUrl string = modAppServiceFrontend.outputs.url
output apimGatewayUrl string = 'https://${apimName}.azure-api.net'
output mcpServerUrl string = modMcpServer.outputs.mcpServerUrl
output openaiAccountName string = openaiAccount.name
output openaiProjectName string = openaiProject.name

