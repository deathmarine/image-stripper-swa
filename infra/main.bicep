targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the Azure Developer CLI environment.')
param environmentName string

@minLength(1)
@description('Azure region for the Static Web App resource.')
@metadata({
  azd: {
    type: 'location'
  }
})
param location string

var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
var tags = {
  'azd-env-name': environmentName
  workload: 'image-metadata-remover'
}
var resourceGroupName = 'rg-${environmentName}'
var staticWebAppName = 'swa-image-strip-${resourceToken}'

resource resourceGroup 'Microsoft.Resources/resourceGroups@2024-11-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module app 'static-web-app.bicep' = {
  name: 'static-web-app'
  scope: resourceGroup
  params: {
    location: location
    name: staticWebAppName
    tags: tags
  }
}

output AZURE_RESOURCE_GROUP string = resourceGroup.name
output STATIC_WEB_APP_NAME string = app.outputs.name
output STATIC_WEB_APP_HOSTNAME string = app.outputs.defaultHostname