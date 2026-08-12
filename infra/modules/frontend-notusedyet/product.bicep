param apiManagementName string
param product object
param apiName string
param subscriptionName string

resource resApiManagementService 'Microsoft.ApiManagement/service@2021-08-01' existing = {
  name: apiManagementName
}

resource resProduct 'Microsoft.ApiManagement/service/products@2021-08-01' = {
  parent: resApiManagementService
  name: product.name
  properties: product.properties
}

resource resProductGroup 'Microsoft.ApiManagement/service/products/groups@2021-08-01' = [for group in product.?groups ?? []: {
  name: group
  parent: resProduct
}]

module modProductApi 'product-api.bicep' = {
  name: 'modProductApi'
  params: {
    apiManagementName: resApiManagementService.name
    apiName: apiName
    productName: resProduct.name
    subscriptionName: subscriptionName
  }
}
