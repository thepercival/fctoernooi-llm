param location string = resourceGroup().location
@minLength(3)
param environment string
param coreResourceGroupName string

param logAnalyticsWorkspace object
param apim object
param appServicePlan object
param applicationInsights object
param appServiceBackend object
param apiBackend object

// param appServiceFrontend object
param openaiAccount object
param openaiProject object
// param apiFrontend object

var apimName = '${apim.name}-${environment}'
var appServicePlanName = '${appServicePlan.name}-${environment}'
var applicationInsightsName = '${applicationInsights.name}-${environment}'
var appServiceBackendName = '${appServiceBackend.name}-${environment}'
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
    skuName: appServicePlan.sku.name
    skuTier: appServicePlan.sku.tier
    loganalyticsWorkspaceId: resLogAnalyticsWorkspace.id
  }
}

// ── Backend App Service ───────────────────────────────────────────────────────

resource resAppInsights 'Microsoft.Insights/components@2020-02-02' existing = {
  name: applicationInsightsName
  scope: resourceGroup(coreResourceGroupName)
}

module modAppServiceBackend 'br/modules:app-service:latest' = {
  name: 'modAppServiceBackend'
  params: {
    appServiceName: appServiceBackendName
    location: location
    appServicePlanId: modAppServicePlan.outputs.appServicePlanId    
    appInsightsConnectionString: resAppInsights.properties.ConnectionString
    appInsightsWorkspaceResourceId: resAppInsights.properties.WorkspaceResourceId
    linuxFxVersion: appServiceBackend.linuxFxVersion
    additionEnvironmentVariables: []
    appKind: appServiceBackend.kind
    // restrictToApim: true
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


module modOpenaiProject 'br/modules:openai-project:latest' = {
  name: 'modOpenaiProject'
  params: {
    accountName: openaiAccount.name
    name: openaiProject.name
    description: openaiProject.description
    location: openaiProject.location
    roleAssignments: openaiProject.roleAssignments
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

module modApimApiBackend 'modules/backend/api.bicep' = {
  name: 'modApimApiBackend'
  scope: resourceGroup(coreResourceGroupName)
  params: {
    apiManagementName: apimName
    api: apiBackend
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

