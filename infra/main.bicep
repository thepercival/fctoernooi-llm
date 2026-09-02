param location string = resourceGroup().location
@minLength(3)
param environment string
param coreResourceGroupName string
param entraAdminPrincipalId string

param logAnalyticsWorkspace object
param keyVault object
param apim object
param appServicePlan object
param applicationInsights object
param appServiceBackend object
param apiBackend object

// param appServiceFrontend object
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
// var appServiceFrontendName = '${appServiceFrontend.name}-${environment}'



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

resource resApim 'Microsoft.ApiManagement/service@2024-05-01' existing = {
  name: apimName
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
module modAppServiceBackend 'modules/app-service.bicep' = {
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
    apimIpAddresses: resApim.properties.publicIPAddresses
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


// 

// OpenAI

var principalIdsByVariableName = {
  entraAdminPrincipalId: entraAdminPrincipalId
}

var projectRoleAssignments = map(openaiProject.roleAssignments, roleAssignment => {
    projectPrincipalId: principalIdsByVariableName[roleAssignment.principalIdVarName]
    projectPrincipalType: roleAssignment.principalType
    roleDefinitionId: roleAssignment.roleDefinitionId
})


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

// Foundry agent endpoint is constructed from the account + project names
// var foundryAgentEndpoint = 'https://${openaiAccount.name}.services.ai.azure.com/api/projects/${openaiProject.name}'

// module modAppServiceFrontend 'modules/appService.bicep' = {
//   name: 'modAppServiceFrontend'
//   params: {
//     appServiceName: appServiceFrontendName
//     location: location
//     appServicePlanId: modAppServicePlan.outputs.appServicePlanId
//     applicationInsightsName: applicationInsightsName
//     coreResourceGroupName: coreResourceGroupName
//     linuxFxVersion: appServiceFrontend.linuxFxVersion
//     additionEnvironmentVariables: [
//       {
//         name: 'FOUNDRY_AGENT_ENDPOINT'
//         value: foundryAgentEndpoint
//       }
//       {
//         name: 'FOUNDRY_AGENT_ID'
//         value: appServiceFrontend.foundryAgentId
//       }
//       {
//         // Backend API URL via APIM – key injected at startup via Key Vault reference
//         name: 'API_BASEURL'
//         value: 'https://${apimName}.azure-api.net/${apiBackend.properties.path}/${apiBackend.version}'
//       }
//     ]
//   }
// }

// resource resFoundryProject 'Microsoft.CognitiveServices/accounts/projects@2026-03-01' existing = if(openaiAccount.deployOnEnvironment == environment) {
//   name: '${openaiAccount.name}/${openaiProject.name}'
// }

// resource resFrontendFoundryRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if(openaiAccount.deployOnEnvironment == environment) {
//   // Cognitive Services OpenAI User
//   name: guid(resFoundryProject.id, appServiceFrontendName, '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')
//   scope: resFoundryProject
//   properties: {
//     principalId: modAppServiceFrontend.outputs.principalId
//     roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')
//     principalType: 'ServicePrincipal'
//   }
// }


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

// ── APIM: chatbot frontend ────────────────────────────────────────────────────

// module modApimApiFrontend 'modules/fctoernooi-frontend/api.bicep' = {
//   name: 'modApimApiFrontend'
//   scope: resourceGroup(coreResourceGroupName)
//   params: {
//     apiManagementName: apimName
//     api: apiFrontend
//     backend: {
//       name: apiFrontend.backendName
//       description: apiFrontend.backendDescription
//       url: modAppServiceFrontend.outputs.url
//     }
//   }
// }

output backendUrl string = modAppServiceBackend.outputs.url
// output frontendUrl string = modAppServiceFrontend.outputs.url
output apimGatewayUrl string = 'https://${apimName}.azure-api.net'
output openaiAccountName string = openaiAccount.name
output openaiProjectName string = openaiProject.name

