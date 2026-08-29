param appServiceName string
param appKind string
param linuxFxVersion string
param location string
param appServicePlanId string
param appInsightsConnectionString string
param appInsightsWorkspaceResourceId string
param withStagingSlot bool
param restrictToApim bool
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
    restrictToApim: restrictToApim
  }
}


output principalId string = modAppService.outputs.principalId
output url string = modAppService.outputs.url
