# Copyright (c) Microsoft Corporation.
# Licensed under the MIT License.

<#!
.SYNOPSIS
Adds (or verifies) Microsoft copyright & license headers to source files.

.DESCRIPTION
Scans a repository for:
  - extension/src/**/*.ts
  - api/src/**/*.ts
  - util/src/**/*.ts
  - Any top-level or nested *.js build/config scripts (webpack, jest, etc.)
  - Any *.ps1 scripts

Inserts the appropriate header at the top of files missing it, preserving an existing shebang (#!) for PowerShell/Node scripts.
Idempotent: if the correct header already exists (anywhere at very top allowing for UTF-8 BOM), the file is skipped unless -Force is supplied.

.PARAMETER Path
Root path to scan. Defaults to parent folder of /tools (i.e. repo root when invoked from tools directory).

.PARAMETER DryRun
If specified, shows what would change without modifying files.

.PARAMETER Force
Rewrites header if a different Microsoft header variant is present (rare) or formatting deviates.

.PARAMETER Verbose
Shows per-file decisions.

.EXAMPLE
pwsh ./tools/Add-CopyrightHeaders.ps1 -DryRun

.EXAMPLE
pwsh ./tools/Add-CopyrightHeaders.ps1 -Path .. -Verbose

.NOTES
Designed for CI integration; exit code 0 unless an unexpected error occurs. Provides a summary object.
#>
[CmdletBinding()] param(
    [Parameter(Position=0)]
    [string] $Path = (Join-Path $PSScriptRoot '..'),

    [switch] $DryRun,
    [switch] $Force,
    [switch] $Json  # When supplied, emit machine-readable JSON summary (reduced noise)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Region: Logging helpers ----------------------------------------------------
$IsVerbose = ($PSBoundParameters.ContainsKey('Verbose') -or $VerbosePreference -eq 'Continue')
function Write-Log {
    param(
        [string]$Message,
        [ConsoleColor]$Color = [ConsoleColor]::Gray,
        [switch]$VerboseOnly
    )
    if($VerboseOnly -and -not $IsVerbose){ return }
    Write-Host $Message -ForegroundColor $Color
}

function Write-VerboseMsg([string]$msg){ if($IsVerbose){ Write-Host "[verbose] $msg" -ForegroundColor DarkGray } }

# Normalize path
$Root = (Resolve-Path -Path $Path).ProviderPath
if(-not (Test-Path $Root -PathType Container)){
    throw "Path '$Path' does not exist or is not a directory."
}

# Define headers
$HeaderTsJs = @(
    '// Copyright (c) Microsoft Corporation.',
    '// Licensed under the MIT License.'
) -join [Environment]::NewLine

$HeaderPs1 = @(
    '# Copyright (c) Microsoft Corporation.',
    '# Licensed under the MIT License.'
) -join [Environment]::NewLine

# (Removed unused $JsTsExtensions array)

# Collect candidate files
$tsFiles = Get-ChildItem -Path $Root -Recurse -File -Include *.ts | Where-Object {
    $_.FullName -match "extension[\\/].*?src[\\/].+\.ts$" -or
    $_.FullName -match "api[\\/].*?src[\\/].+\.ts$" -or
    $_.FullName -match "util[\\/].*?src[\\/].+\.ts$"
}
$jsFiles = Get-ChildItem -Path $Root -Recurse -File -Include *.js | Where-Object {
    $_.FullName -notmatch 'node_modules' -and 
    $_.FullName -notmatch '[\\/](out|dist|lib)[\\/]' -and 
    (
        $_.Name -match 'webpack\\.config\\.js' -or
        $_.Name -match 'jest\\.config' -or
        $_.Name -match 'mocha\\.config' -or
        $_.DirectoryName -match '[\\/]tools[\\/]' -or
        $_.DirectoryName -match '[\\/]scripts[\\/]'
    )
}
$ps1Files = Get-ChildItem -Path $Root -Recurse -File -Include *.ps1 | Where-Object { $_.FullName -notmatch 'node_modules' -and $_.FullName -notmatch '[\\/](out|dist)[\\/]' }

# De-duplicate JS that might also be matched by ts transpilation outputs - (we only target source, not lib)
$jsFiles = $jsFiles | Where-Object { $_.FullName -notmatch "[\\/]lib[\\/]" }

# Filter out declaration files (.d.ts) and generated localization bundles
$tsFiles = $tsFiles | Where-Object { $_.Name -notmatch '\.d\.ts$' -and $_.FullName -notmatch 'bundle\.l10n\.json' }

# Merge & tag with discovery logging
$candidates = @()
foreach($f in $tsFiles){
    Write-Log "Discover(ts): $($f.FullName)" -Color DarkCyan -VerboseOnly
    $candidates += [pscustomobject]@{ File=$f; Kind='ts' }
}
foreach($f in $jsFiles){
    Write-Log "Discover(js): $($f.FullName)" -Color DarkCyan -VerboseOnly
    $candidates += [pscustomobject]@{ File=$f; Kind='js' }
}
foreach($f in $ps1Files){
    Write-Log "Discover(ps1): $($f.FullName)" -Color DarkCyan -VerboseOnly
    $candidates += [pscustomobject]@{ File=$f; Kind='ps1' }
}

# Distinct by full name
$candidates = $candidates | Sort-Object { $_.File.FullName } -Unique

$modified = @()
$skipped  = @()

function Has-Header($content, $kind){
    if($kind -eq 'ps1'){
        return $content -match '(?m)^# Copyright \(c\) Microsoft Corporation\.' -and $content -match '(?m)^# Licensed under the MIT License\.'
    } else {
        return $content -match '(?m)^// Copyright \(c\) Microsoft Corporation\.' -and $content -match '(?m)^// Licensed under the MIT License\.'
    }
}

function Insert-Header($text, $header, $kind){
    # Preserve BOM if present
    $bom = ''
    if($text.Length -gt 0 -and [int]($text[0]) -eq 0xFEFF){
        $text = $text.Substring(1)
        $bom = [char]0xFEFF
    }

    # For ps1 / js with shebang, keep shebang first line
    $lines = $text -split '\r?\n'
    if($lines.Count -gt 0 -and $lines[0] -match '^#!'){
        $first = $lines[0]
        $rest = ($lines | Select-Object -Skip 1) -join [Environment]::NewLine
        return $bom + $first + [Environment]::NewLine + $header + [Environment]::NewLine + [Environment]::NewLine + $rest
    }

    if([string]::IsNullOrWhiteSpace($text)){
        return $bom + $header + [Environment]::NewLine
    } else {
        return $bom + $header + [Environment]::NewLine + [Environment]::NewLine + $text
    }
}

Write-VerboseMsg "Scanning $($candidates.Count) candidate files under $Root"

foreach($entry in $candidates){
    $file = $entry.File
    $kind = $entry.Kind
    $path = $file.FullName
    Write-Log "Check($kind): $path" -Color DarkYellow -VerboseOnly
    $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
    # Capture exact trailing newline sequence (could be \n, \r\n, or none)
    $trailingMatch = [regex]::Match($raw, '(\r?\n)$')
    $originalTerminator = if($trailingMatch.Success){ $trailingMatch.Groups[1].Value } else { '' }
    $has = Has-Header -content $raw -kind $kind
    if($has){
        Write-Log "Header($kind): Present - $path" -Color Green -VerboseOnly
    } else {
        Write-Log "Header($kind): Missing - $path" -Color Red -VerboseOnly
    }

    if($has -and -not $Force){
    $skipped += [pscustomobject]@{ File=$path; Reason='Exists' }
        Write-Log "Skip (exists): $path" -Color DarkGray
        continue
    }

    $header = if($kind -eq 'ps1'){ $HeaderPs1 } else { $HeaderTsJs }

    if($has -and $Force){
        # Remove existing header lines at very top matching pattern then reinsert to normalize formatting
        $lines = $raw -split '\r?\n'
        $startIndex = 0
        while($startIndex -lt $lines.Count -and (
            ($kind -eq 'ps1' -and $lines[$startIndex] -match '^# (Copyright \(c\) Microsoft Corporation\.|Licensed under the MIT License\.)') -or
            ($kind -ne 'ps1' -and $lines[$startIndex] -match '^// (Copyright \(c\) Microsoft Corporation\.|Licensed under the MIT License\.)')
        )){ $startIndex++ }
        $remaining = ($lines | Select-Object -Skip $startIndex) -join [Environment]::NewLine
        $updated = Insert-Header -text $remaining -header $header -kind $kind
    } else {
        if($has){
            # (Force false, already handled) unreachable
            continue
        }
        $updated = Insert-Header -text $raw -header $header -kind $kind
    }

    # Normalize trailing newline(s) to match original file's end-of-file newline presence
    $updated = $updated -replace "(\r?\n)+$",""  # strip all trailing newlines
    # Reappend original terminator exactly as it was (none if none)
    $updated += $originalTerminator

    $action = if($has){'Normalize'} else {'Add'}
    if($DryRun){
        $modified += [pscustomobject]@{ File=$path; Kind=$kind; Action=$action }
        Write-Log "[DRYRUN] $($action): $path" -Color Yellow
    } else {
        # Use -NoNewline because $updated already contains exact intended terminator (or none)
        Set-Content -LiteralPath $path -Value $updated -Encoding UTF8 -NoNewline
        $modified += [pscustomobject]@{ File=$path; Kind=$kind; Action=$action }
        Write-Log "$($action): $path" -Color Green
    }
}

$added = ($modified | Where-Object Action -eq 'Add')
$normalized = ($modified | Where-Object Action -eq 'Normalize')
$summary = [pscustomobject]@{
    Root       = $Root
    Candidates = $candidates.Count
    Modified   = (@($modified)).Count
    Skipped    = (@($skipped)).Count
    Added      = (@($added)).Count
    Normalized = (@($normalized)).Count
}

if($Json){
    # Machine readable output only (no extra summary lines besides JSON)
    $summary | ConvertTo-Json -Depth 5
    return $summary
} else {
    Write-Host "`nSummary:" -ForegroundColor Cyan
    Write-Host "  Root:        $($summary.Root)"
    Write-Host "  Candidates:  $($summary.Candidates)"
    if($summary.Modified -gt 0){
        Write-Host "  Modified:    $($summary.Modified)" -ForegroundColor Yellow
    } else {
        Write-Host "  Modified:    $($summary.Modified)" -ForegroundColor Gray
    }
    Write-Host "    Added:      $($summary.Added)"
    Write-Host "    Normalized: $($summary.Normalized)"
    Write-Host "  Skipped:     $($summary.Skipped)"

    if($IsVerbose -and $skipped.Count -gt 0){
        Write-Host "\nSkipped (exists):" -ForegroundColor DarkCyan
        $skipped | Sort-Object File | ForEach-Object { Write-Host $_.File -ForegroundColor DarkGray }
    }
    return $summary
}
