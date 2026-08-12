param appName string

@allowed(['functionapp', 'webapp'])
param kind string

param loganalyticsWorkspaceId string

param diagnosticLogCategoriesToEnable array = kind == 'functionapp' ? [
  'FunctionAppLogs'
] : [
  'AppServiceHTTPLogs'
  'AppServiceConsoleLogs'
  'AppServiceAppLogs'
  'AppServiceAuditLogs'
  'AppServiceIPSecAuditLogs'
  'AppServicePlatformLogs'
]

param diagnosticMetricsToEnable array = ['AllMetrics']

var diagnosticsLogs = [for category in diagnosticLogCategoriesToEnable: {
  category: category
  enabled: true
}]

var diagnosticsMetrics = [for metric in diagnosticMetricsToEnable: {
  category: metric
  timeGrain: null
  enabled: true
}]

resource app 'Microsoft.Web/sites@2022-03-01' existing = {
  name: appName
}

resource app_diagnosticSettings 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: '${appName}-diagnostics'
  scope: app
  properties: {
    workspaceId: loganalyticsWorkspaceId
    metrics: diagnosticsMetrics
    logs: diagnosticsLogs
  }
}
