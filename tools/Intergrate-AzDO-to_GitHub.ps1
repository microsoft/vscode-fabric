param(
    [string]$AzDORepoPath = "C:\src\vscode-fabric.bsl",
    [string]$GitHubRepoPath = "C:\src\vscode-fabric-pr",
    [string]$IntegrationMarkerFile = ".last_integration",
    [switch]$DryRun
)

function Get-LastIntegrationCommits {
    param($RepoPath, $MarkerFile)
    $markerPath = Join-Path $RepoPath $MarkerFile
    if (Test-Path $markerPath) {
        $json = Get-Content $markerPath -Raw | ConvertFrom-Json
        return @{
            AzDO = $json.azdo
            GitHub = $json.github
        }
    } else {
        # Fallback: use initial commit in both repos
        Push-Location $RepoPath
        $commit = git rev-list --max-parents=0 HEAD
        Pop-Location
        return @{
            AzDO = $commit
            GitHub = $commit
        }
    }
}

function Set-LastIntegrationCommits {
    param($RepoPath, $MarkerFile, $AzDOCommit, $GitHubCommit)
    $markerPath = Join-Path $RepoPath $MarkerFile
    $json = @{
        azdo = $AzDOCommit
        github = $GitHubCommit
    } | ConvertTo-Json
    Set-Content -Path $markerPath -Value $json
}

# Read last integration points
$lastIntegration = Get-LastIntegrationCommits -RepoPath $GitHubRepoPath -MarkerFile $IntegrationMarkerFile
$lastAzDOCommit = $lastIntegration.AzDO
$lastGitHubCommit = $lastIntegration.GitHub

# Get latest AzDO commit
Push-Location $AzDORepoPath
$azdoLatest = git rev-parse HEAD
$azdoDiff = git diff --name-status $lastAzDOCommit $azdoLatest
Pop-Location

$added = @()
$modified = @()
$deleted = @()
$conflicts = @()
$autoIntegrateAdd = @()
$autoIntegrateMod = @()
$autoIntegrateDel = @()
$skippedMod = @()
$skippedAdd = @()

foreach ($line in $azdoDiff) {
    if ($line -match "^(A|M|D)\s+(.+)$") {
        $status = $matches[1]
        $file = $matches[2]

        $githubFileChanged = $false
        $fileExistsInGitHub = $false
        $parentDirExistsInGitHub = $false

        if ($status -eq "M") {
            Push-Location $GitHubRepoPath
            $githubDiff = git diff --name-only $lastGitHubCommit HEAD -- $file
            if ($githubDiff) { $githubFileChanged = $true }
            if (Test-Path $file) { $fileExistsInGitHub = $true }
            Pop-Location
        }

        if ($status -eq "A") {
            $parentDir = Split-Path $file -Parent
            if ($parentDir -eq "") {
                # File is at repo root, always exists
                $parentDirExistsInGitHub = $true
            } else {
                $parentDirPath = Join-Path $GitHubRepoPath $parentDir
                if (Test-Path $parentDirPath) { $parentDirExistsInGitHub = $true }
            }
            if ($parentDirExistsInGitHub) {
                $added += $file
                $autoIntegrateAdd += $file
            } else {
                $skippedAdd += $file
            }
        } elseif ($status -eq "M") {
            if (-not $fileExistsInGitHub) {
                $skippedMod += $file
            } elseif ($githubFileChanged) {
                $conflicts += "$status $file"
            } else {
                $modified += $file
                $autoIntegrateMod += $file
            }
        } elseif ($status -eq "D") {
            $deleted += $file
            $autoIntegrateDel += $file
        }
    }
}

if ($DryRun) {
    Write-Host "`n[DRY RUN] Added files to be copied to GitHub (only if parent directory exists):"
    $autoIntegrateAdd | ForEach-Object { Write-Host $_ }
    if ($skippedAdd.Count -gt 0) {
        Write-Host "`n[DRY RUN] Added files skipped (parent directory does not exist in GitHub):"
        $skippedAdd | ForEach-Object { Write-Host $_ }
    }
    Write-Host "`n[DRY RUN] Modified files to be copied to GitHub (only if they exist in GitHub):"
    $autoIntegrateMod | ForEach-Object { Write-Host $_ }
    if ($skippedMod.Count -gt 0) {
        Write-Host "`n[DRY RUN] Modified files skipped (do not exist in GitHub):"
        $skippedMod | ForEach-Object { Write-Host $_ }
    }
    Write-Host "`n[DRY RUN] Deleted files to be removed from GitHub:"
    $autoIntegrateDel | ForEach-Object { Write-Host $_ }
    if ($conflicts.Count -gt 0) {
        Write-Host "`n[DRY RUN] Conflicts detected (manual resolution needed):"
        $conflicts | ForEach-Object { Write-Host $_ }
    } else {
        Write-Host "`n[DRY RUN] No conflicts detected."
    }
    Write-Host "`n[DRY RUN] Integration marker would be updated to AzDO commit: $azdoLatest, GitHub commit: (current HEAD)"
} else {
    foreach ($file in $autoIntegrateAdd) {
        $src = Join-Path $AzDORepoPath $file
        $dst = Join-Path $GitHubRepoPath $file
        Copy-Item -Path $src -Destination $dst -Force
        Write-Host "Copied: $file"
    }
    foreach ($file in $autoIntegrateMod) {
        $src = Join-Path $AzDORepoPath $file
        $dst = Join-Path $GitHubRepoPath $file
        if (Test-Path $dst) {
            Copy-Item -Path $src -Destination $dst -Force
            Write-Host "Copied: $file"
        } else {
            Write-Host "Skipped (does not exist in GitHub): $file"
        }
    }
    foreach ($file in $autoIntegrateDel) {
        $dst = Join-Path $GitHubRepoPath $file
        if (Test-Path $dst) {
            Remove-Item $dst -Force
            Write-Host "Deleted: $file"
        }
    }
    if ($conflicts.Count -gt 0) {
        Write-Host "`nConflicts detected (manual resolution needed):"
        $conflicts | ForEach-Object { Write-Host $_ }
    } else {
        Write-Host "`nNo conflicts detected."
    }
    # Get new GitHub HEAD after integration
    Push-Location $GitHubRepoPath
    $githubLatest = git rev-parse HEAD
    Pop-Location
    Set-LastIntegrationCommits -RepoPath $GitHubRepoPath -MarkerFile $IntegrationMarkerFile -AzDOCommit $azdoLatest -GitHubCommit $githubLatest
    Write-Host "`nIntegration complete."
}