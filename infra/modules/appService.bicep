param appServiceName string
param location string
param appServicePlanId string
param applicationInsightsName string
param coreResourceGroupName string
param linuxFxVersion string
param additionEnvironmentVariables array
param startupCommand string = 'node dist/server.js'
// When true, only APIM outbound IPs are allowed; all other public traffic is denied
param restrictToApim bool = false
// Requires Standard SKU or higher — only enable on prd
param withStagingSlot bool

resource resAppInsights 'Microsoft.Insights/components@2020-02-02' existing = {
  name: applicationInsightsName
  scope: resourceGroup(coreResourceGroupName)
}

var baseEnvironmentVariables = [
  {
    name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
    value: resAppInsights.properties.ConnectionString
  }
  {
    name: 'ApplicationInsightsAgent_EXTENSION_VERSION'
    value: '~2'
  }
]

var environmentVariables = concat(baseEnvironmentVariables, additionEnvironmentVariables)

var apimOnlyRestrictions = [
  {
    name: 'AllowAPIM'
    description: 'Allow inbound traffic from APIM only'
    action: 'Allow'
    priority: 100
    tag: 'ServiceTag'
    ipAddress: 'ApiManagement'
  }
]

var siteConfigBase = {
  appSettings: environmentVariables
  linuxFxVersion: linuxFxVersion
  minTlsVersion: '1.2'
  appCommandLine: startupCommand
}

var siteConfig = restrictToApim ? union(siteConfigBase, {
  ipSecurityRestrictions: apimOnlyRestrictions
  ipSecurityRestrictionsDefaultAction: 'Deny'
  scmIpSecurityRestrictionsDefaultAction: 'Deny'
}) : siteConfigBase

resource resAppService 'Microsoft.Web/sites@2025-03-01' = {
  name: appServiceName
  location: location
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlanId
    httpsOnly: true
    siteConfig: siteConfig
  }
}

// staging slot requires Standard SKU or higher
resource resWebAppSlot 'Microsoft.Web/sites/slots@2025-03-01' = if (withStagingSlot) {
  parent: resAppService
  name: 'staging'
  location: location
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    siteConfig: siteConfig
  }
}

module diagnostics 'app-diagnostics.bicep' = {
  name: '${appServiceName}-diagnostics'
  params: {
    appName: appServiceName
    kind: 'webapp'
    loganalyticsWorkspaceId: resAppInsights.properties.WorkspaceResourceId
  }
  dependsOn: [resAppService]
}

output url string = 'https://${resAppService.properties.defaultHostName}'
output principalId string = resAppService.identity.principalId
