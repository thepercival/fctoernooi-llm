param appServiceName string
param appKind string
param linuxFxVersion string
param location string
param appServicePlanId string
param appInsightsConnectionString string
param appInsightsWorkspaceResourceId string
param withStagingSlot bool
param dbHost string
param dbPort string = '27017'
param dbName string
@secure()
param dbPassword string

var mongoDbConnString string = 'mongodb://${dbName}:${dbPassword}@${dbHost}:${dbPort}/${dbName}?authSource=${dbName}&tls=true'

module modAppService 'br/modules:app-service:latest' = {
  name: 'modAppService'
  params: {
    appServiceName: appServiceName
    appKind: appKind
    location: location
    additionEnvironmentVariables: [
      {
        name: 'MONGODB_URI'
        value: mongoDbConnString
      }
    ]
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
