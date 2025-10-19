# Copyright (c) Microsoft Corporation.
# Licensed under the MIT License.

param(
    [switch]$SignOut
)

# Define the token file path
$userhome = [System.Environment]::GetFolderPath('UserProfile')
$tokenFile = "$userhome/.fabric-token"

# Handle sign out flag
if ($SignOut) {
    if (Test-Path $tokenFile) {
        Remove-Item $tokenFile -Force
        Write-Output "Token file removed: $tokenFile"
    } else {
        Write-Output "No token file found at: $tokenFile"
    }
    exit 0
}

# Set the correct Azure subscription
az account set --subscription "47d8d56c-3a05-4e1a-805b-87cc4b1ba5a3"

# Get secret from Azure Key Vault (use latest version)
$secretResponse = az keyvault secret show --vault-name appdev-team-kv --name appdev-vscode-e2e | ConvertFrom-Json
$clientSecret = $secretResponse.value
# Debug: Check if we got a valid secret
if ([string]::IsNullOrEmpty($clientSecret)) {
    Write-Error "Failed to retrieve client secret from Key Vault"
    exit 1
}

Write-Output "Retrieved client secret of length: $($clientSecret.Length)"

# Define OAuth2 parameters
$tenantId = "b8190856-7271-4139-8bae-a598a014373f"
$clientId = "51440ebf-78c2-41c6-bc2d-dc78edad78cf"
$tokenEndpoint = "https://login.windows.net/$tenantId/oauth2/v2.0/token"

# Prepare the request body
$body = @{
    client_id     = $clientId
    grant_type    = "client_credentials"
    scope         = "https://analysis.windows.net/powerbi/api/.default"
    client_secret = $clientSecret
}

# Get the access token
try {
    $tokenResponse = Invoke-RestMethod -Method Post -Uri $tokenEndpoint -ContentType "application/x-www-form-urlencoded" -Body $body
    Write-Output "Successfully obtained access token"
}
catch {
    Write-Error "Failed to get access token: $($_.Exception.Message)"
    Write-Output "Response: $($_.ErrorDetails.Message)"
    exit 1
}

# Save the access token to a file
$tokenResponse.access_token | Out-File -FilePath $tokenFile -Encoding utf8
Write-Output "Access token saved to $tokenFile"