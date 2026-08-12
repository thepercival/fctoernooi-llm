param apiManagementName string
param productName string
param subscriptionName string
param apiName string

resource resApiManagementService 'Microsoft.ApiManagement/service@2021-08-01' existing = {
  name: apiManagementName
}

resource resProduct 'Microsoft.ApiManagement/service/products@2021-08-01' existing = {
  name: productName
  parent: resApiManagementService
}

resource resProductApi 'Microsoft.ApiManagement/service/products/apis@2021-08-01' = {
  name: apiName
  parent: resProduct
}

resource apiManagementSubscription 'Microsoft.ApiManagement/service/subscriptions@2021-08-01' = {
  name: subscriptionName
  parent: resApiManagementService
  properties: {
    displayName: subscriptionName
    scope: resProduct.id
  }
}
