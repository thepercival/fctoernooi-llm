param apiManagementName string
param backingApiName string
param mcpServer object
param productName string
param tools array

resource resApiManagement 'Microsoft.ApiManagement/service@2022-08-01' existing = {
  name: apiManagementName
}

resource resMcpServer 'Microsoft.ApiManagement/service/apis@2025-09-01-preview' = {
  parent: resApiManagement
  name: mcpServer.name
  properties: {
    type: 'mcp'
    displayName: mcpServer.displayName
    description: mcpServer.description
    path: mcpServer.path
    protocols: ['https']
    subscriptionRequired: false
  }
}

resource resMcpTools 'Microsoft.ApiManagement/service/apis/tools@2025-09-01-preview' = [for tool in tools: {
  parent: resMcpServer
  name: tool.operationId
  properties: {
    displayName: tool.displayName
    description: tool.description
    operationId: resourceId(
      'Microsoft.ApiManagement/service/apis/operations',
      apiManagementName,
      backingApiName,
      tool.operationId
    )
  }
}]

resource resProduct 'Microsoft.ApiManagement/service/products@2022-08-01' existing = {
  parent: resApiManagement
  name: productName
}

resource resProductBinding 'Microsoft.ApiManagement/service/products/apis@2022-08-01' = {
  parent: resProduct
  name: mcpServer.name
  dependsOn: [resMcpServer]
}

output mcpServerUrl string = '${resApiManagement.properties.gatewayUrl}/${mcpServer.path}/mcp'
