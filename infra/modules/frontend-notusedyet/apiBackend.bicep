param apiManagementName string
param name string
param backendDescription string
param url string
@allowed(['http', 'soap'])
param protocol string = 'http'

resource resApiManagement 'Microsoft.ApiManagement/service@2021-08-01' existing = {
  name: apiManagementName
}

resource apiManagementBackend 'Microsoft.ApiManagement/service/backends@2024-06-01-preview' = {
  name: name
  parent: resApiManagement
  properties: {
    description: backendDescription
    url: url
    protocol: protocol
  }
}
