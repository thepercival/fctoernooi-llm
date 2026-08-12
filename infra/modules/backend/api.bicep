param api object
param apiManagementName string
param backend object

resource resApiManagement 'Microsoft.ApiManagement/service@2021-08-01' existing = {
  name: apiManagementName
}

resource resApiVersionSet 'Microsoft.ApiManagement/service/apiVersionSets@2022-08-01' = {
  parent: resApiManagement
  name: api.versionSet.name
  properties: api.versionSet.properties
}

var updatedApiProperties = union(api.properties, {
  apiVersionSetId: resApiVersionSet.id
  value: string(loadYamlContent('openapi.yaml'))
})

module modApimBackend './apiBackend.bicep' = {
  name: 'fctoernooi-api-backend'
  params: {
    apiManagementName: apiManagementName
    name: backend.name
    url: backend.url
    backendDescription: backend.description
    protocol: 'http'
  }
}

resource resApi 'Microsoft.ApiManagement/service/apis@2022-08-01' = {
  parent: resApiManagement
  name: api.name
  properties: updatedApiProperties
  dependsOn: [modApimBackend]
}

var subscriptionName = '${api.name}-appservice'

module modProduct './product.bicep' = {
  name: api.product.name
  params: {
    apiName: api.name
    apiManagementName: apiManagementName
    product: api.product
    subscriptionName: subscriptionName
  }
  dependsOn: [resApi]
}

resource apiPolicy 'Microsoft.ApiManagement/service/apis/policies@2022-08-01' = {
  name: 'policy'
  parent: resApi
  properties: {
    format: 'rawxml'
#disable-next-line prefer-interpolation
    value: concat('''
<policies>
  <inbound>
    <base />
    <set-backend-service backend-id="''', backend.name, '''" />
  </inbound>
  <backend>
    <forward-request />
  </backend>
  <outbound>
    <base />
  </outbound>
  <on-error>
    <base />
  </on-error>
</policies>
''')
  }
}

output subscriptionName string = subscriptionName
