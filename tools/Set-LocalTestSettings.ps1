# Copyright (c) Microsoft Corporation.
# Licensed under the MIT License.

<#
.SYNOPSIS
Generates a local test settings file (settings.local.json) for UI testing with custom environments.

.DESCRIPTION
This script creates a settings.local.json file for local UI testing with custom Fabric environments.
It prompts for required values if not provided as parameters, ensuring developers can easily 
configure their local test environment without committing sensitive data.

The generated file will be used by 'npm run test:ui:local' to override the default test settings.

.PARAMETER EnvironmentName
The name of the custom environment

.PARAMETER ClientId
The Azure AD client ID for the test environment

.PARAMETER Scopes
The OAuth scopes for the test environment (defaults to PowerBI API scope)

.PARAMETER SharedUri
The API base URI for the test environment

.PARAMETER PortalUri
The portal URI for the test environment (without https://)

.PARAMETER SessionProvider
The session provider type (defaults to 'microsoft')

.PARAMETER Force
Overwrite existing settings.local.json file without prompting

.PARAMETER OutputPath
Custom output path for the settings file (defaults to extension/test/uitest/settings.local.json)

.EXAMPLE
.\New-LocalTestSettings.ps1 -EnvironmentName "TEST" -ClientId "12345678-1234-..." -SharedUri "https://api.fabric.microsoft.com"

.EXAMPLE
.\New-LocalTestSettings.ps1
# Will prompt for all required values interactively
#>

param(
    [Parameter(HelpMessage="Environment name")]
    [string]$EnvironmentName,
    
    [Parameter(HelpMessage="Azure AD Client ID for the test environment")]
    [string]$ClientId = "02fe4832-64e1-42d2-a605-d14958774a2e",
    
    [Parameter(HelpMessage="OAuth scopes (comma-separated)")]
    [string]$Scopes = "https://analysis.windows.net/powerbi/api/.default",
    
    [Parameter(HelpMessage="API base URI (e.g., https://api.fabric.microsoft.com)")]
    [string]$SharedUri,
    
    [Parameter(HelpMessage="Portal URI without https:// (e.g., app.fabric.microsoft.com)")]
    [string]$PortalUri,
    
    [Parameter(HelpMessage="Session provider type")]
    [string]$SessionProvider = "microsoft",
    
    [Parameter(HelpMessage="Overwrite existing file without prompting")]
    [switch]$Force,
    
    [Parameter(HelpMessage="Custom output path for settings file")]
    [string]$OutputPath
)

# Determine script and repo paths
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptPath

# Set default output path
if (-not $OutputPath) {
    $userhome = [System.Environment]::GetFolderPath('UserProfile')
    $OutputPath = Join-Path $userhome ".fabric-environment"
}

# Function to get value with default (prompts but uses default if empty input)
function Get-ValueWithDefault {
    param(
        [string]$PromptText,
        [string]$CurrentValue,
        [string]$DefaultValue
    )
    
    if ($CurrentValue) {
        return $CurrentValue
    }
    
    if ($DefaultValue) {
        $prompt = "$PromptText (default: $DefaultValue)"
    } else {
        $prompt = $PromptText
    }
    
    $value = Read-Host $prompt
    
    if (-not $value.Trim() -and $DefaultValue) {
        Write-Host "Using default value: $DefaultValue" -ForegroundColor Gray
        return $DefaultValue
    }
    
    return $value.Trim()
}

Write-Host "Fabric Local Test Settings Generator" -ForegroundColor Cyan
Write-Host "This will create a local test configuration for UI testing with custom environments." -ForegroundColor Gray
Write-Host ""

# Check if file exists and handle overwrite
if ((Test-Path $OutputPath) -and -not $Force) {
    Write-Host "File already exists: $(OutputPath)" -ForegroundColor Yellow
    Write-Host "Overwriting existing file (use -Force to suppress this message)" -ForegroundColor Gray
}

# Collect required values
Write-Host "Collecting environment configuration..." -ForegroundColor Green

$EnvironmentName = Get-ValueWithDefault "Environment name" $EnvironmentName "PROD"
$ClientId = Get-ValueWithDefault "Azure AD Client ID" $ClientId "02fe4832-64e1-42d2-a605-d14958774a2e"
$SharedUri = Get-ValueWithDefault "API base URI" $SharedUri "https://api.fabric.microsoft.com"
$PortalUri = Get-ValueWithDefault "Portal URI (without https://)" $PortalUri "app.fabric.microsoft.com"

# Collect optional values with provided defaults
$Scopes = Get-ValueWithDefault "OAuth scopes (comma-separated)" $Scopes $Scopes
$SessionProvider = Get-ValueWithDefault "Session provider" $SessionProvider $SessionProvider

# Convert scopes to array format
$scopesArray = $Scopes -split ',' | ForEach-Object { $_.Trim() }

# Create the settings object
$settings = @{
    "Fabric.Environment" = $EnvironmentName
    "Fabric.CustomEnvironments" = @(
        @{
            "env" = $EnvironmentName
            "clientId" = $ClientId
            "scopes" = $scopesArray
            "sharedUri" = $SharedUri
            "portalUri" = $PortalUri
            "sessionProvider" = $SessionProvider
        }
    )
}

# Create output directory if it doesn't exist
$outputDir = Split-Path -Parent $OutputPath
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

# Write the JSON file
try {
    $jsonContent = $settings | ConvertTo-Json -Depth 10 -Compress:$false
    # Write UTF8 without BOM to avoid parsing issues
    [System.IO.File]::WriteAllText($OutputPath, $jsonContent, [System.Text.UTF8Encoding]::new($false))
    
    Write-Host ""
    Write-Host "Successfully created local test settings!" -ForegroundColor Green
    Write-Host "File: $OutputPath" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Environment Configuration:" -ForegroundColor White
    Write-Host "   Name: $EnvironmentName" -ForegroundColor Gray
    Write-Host "   Portal: https://$PortalUri" -ForegroundColor Gray
    Write-Host "   API: $SharedUri" -ForegroundColor Gray
    Write-Host "   Session Provider: $SessionProvider" -ForegroundColor Gray
}
catch {
    Write-Host "Error creating settings file: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}