param name string
param location string
param sku object

resource resAppServicePlan 'Microsoft.Web/serverfarms@2024-11-01' = {
  name: name
  location: location
  kind: 'linux'
  sku: sku
  properties: {
    reserved: true
  }
}

output appServicePlanId string = resAppServicePlan.id
