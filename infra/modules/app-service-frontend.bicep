param appServiceName string
param appKind string
param linuxFxVersion string
param location string
param appServicePlanId string
param appInsightsConnectionString string
param appInsightsWorkspaceResourceId string
param withStagingSlot bool
param backendApiBaseUrl string
@secure()
param backendApiKey string = ''

module modAppService 'br/modules:app-service:latest' = {
  name: 'modAppServiceFrontend'
  params: {
    appServiceName: appServiceName
    appKind: appKind
    location: location
    additionalSharedEnvironmentVariables: [
      {
        name: 'FCTOERNOOI_API_BASEURL'
        value: backendApiBaseUrl
      }
    ]
    // Empty for environments without the secret provisioned (e.g. acc) — passed in by the caller.
    additionalProductionOnlyEnvironmentVariables: [
      {
        name: 'FCTOERNOOI_API_KEY'
        value: backendApiKey
      }
    ]
    additionalStagingOnlyEnvironmentVariables: []
    linuxFxVersion: linuxFxVersion
    appServicePlanId: appServicePlanId
    appInsightsConnectionString: appInsightsConnectionString
    appInsightsWorkspaceResourceId: appInsightsWorkspaceResourceId
    withStagingSlot: withStagingSlot
  }
}

resource resAppService 'Microsoft.Web/sites@2024-11-01' existing = {
  name: appServiceName
}

resource resAppServiceWebConfig 'Microsoft.Web/sites/config@2024-11-01' = {
  parent: resAppService
  name: 'web'
  properties: {
    appCommandLine: 'node dist/server.js'
    ipSecurityRestrictions: []
    ipSecurityRestrictionsDefaultAction: 'Allow'
    scmIpSecurityRestrictions: []
    scmIpSecurityRestrictionsDefaultAction: 'Allow'
    scmIpSecurityRestrictionsUseMain: false
  }
  dependsOn: [
    modAppService
  ]
}

output principalId string = modAppService.outputs.principalId
output url string = modAppService.outputs.url
