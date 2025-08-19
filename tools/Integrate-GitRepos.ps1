[CmdletBinding()]
param(
    [string]$SourceRepoPath = "C:\src\vscode-fabric.bsl",
    [string]$TargetRepoPath = "C:\src\vscode-fabric-pr",
    [string]$TargetSourceCommit, # The source commit you want to integrate
    [switch]$DryRun
)

[hashtable]$PathMap = @{
    "Localize" = "localization"
    # Add more mappings as needed
}

function Map-SourceToTargetPath {
    param([string]$sourcePath)
    foreach ($prefix in $PathMap.Keys) {
        if ($sourcePath -like "$prefix*") {
            $rest = $sourcePath.Substring($prefix.Length)
            return Join-Path $PathMap[$prefix] $rest
        }
    }
    return $sourcePath # No mapping, use as-is
}

function Ensure-DirectoryExists {
    param([string]$dirPath)
    if (-not (Test-Path $dirPath)) {
        New-Item -ItemType Directory -Path $dirPath -Force | Out-Null
    }
}

function Get-LatestIntegrationTag {
    param($RepoPath)
    Push-Location $RepoPath
    $tags = git tag --list "integration/*"
    $latestTag = $null
    $latestCommit = $null
    $latestDate = 0
    foreach ($tag in $tags) {
        $commitId = $tag -replace "^integration/", ""
        $tagCommit = git rev-list -n 1 $tag
        $tagDate = [int](git show -s --format=%ct $tagCommit)
        if ($tagDate -gt $latestDate) {
            $latestTag = $tag
            $latestCommit = $tagCommit
            $latestDate = $tagDate
        }
    }
    Pop-Location
    return @{
        tag = $latestTag
        sourceCommit = if ($latestTag) { $latestTag -replace "^integration/", "" } else { $null }
        targetCommit = $latestCommit
    }
}

function Get-IntegrationCommits {
    param($RepoPath)
    Push-Location $RepoPath
    $tags = git tag --list "integration/*"
    $integrationCommits = @()
    foreach ($tag in $tags) {
        $sha = git rev-list -n 1 $tag
        $integrationCommits += $sha
    }
    Pop-Location
    return $integrationCommits
}

function Get-NonIntegrationCommits {
    param($RepoPath, $integrationCommits)
    Push-Location $RepoPath
    $allCommits = git rev-list HEAD
    $nonIntegrationCommits = $allCommits | Where-Object { $integrationCommits -notcontains $_ }
    Pop-Location
    return $nonIntegrationCommits
}

 # Get latest integration tag info
$latestIntegration = Get-LatestIntegrationTag -RepoPath $TargetRepoPath
$lastSourceCommit = $latestIntegration.sourceCommit
$lastTargetCommit = $latestIntegration.targetCommit

 # Get target source commit
if (-not $TargetSourceCommit) {
    Push-Location $SourceRepoPath
    $TargetSourceCommit = git rev-parse HEAD
    Pop-Location
}

if (-not $lastSourceCommit) {
    Write-Host "No previous integration tag found. Using initial commit in source repo."
    Push-Location $SourceRepoPath
    $lastSourceCommit = git rev-list --max-parents=0 HEAD
    Pop-Location
}

Write-Host "Source commit range for integration:"
Write-Host "    From: $lastSourceCommit"
Write-Host "    To:   $TargetSourceCommit"

Push-Location $SourceRepoPath
Write-Verbose "Running: git diff --name-status -M $lastSourceCommit $TargetSourceCommit"
$sourceDiff = git diff --name-status -M $lastSourceCommit $TargetSourceCommit
Pop-Location

 # Get integration and non-integration commits in target repo
$integrationCommits = Get-IntegrationCommits -RepoPath $TargetRepoPath
$nonIntegrationCommits = Get-NonIntegrationCommits -RepoPath $TargetRepoPath -integrationCommits $integrationCommits

$added = @()
$modified = @()
$deleted = @()
$conflicts = @()
$autoIntegrateAdd = @()
$autoIntegrateMod = @()
$autoIntegrateDel = @()
$skippedMod = @()
$skippedAdd = @()

foreach ($line in $sourceDiff) {
    Write-Verbose "Processing diff line: $line"
    # Handle renames (R or R100, R99, etc)
    if ($line.StartsWith('R')) {
        $parts = $line -split "\t"
        if ($parts.Count -ge 3) {
            $oldFile = $parts[1]
            $newFile = $parts[2]
            $mappedOldFile = Map-SourceToTargetPath $oldFile
            $mappedNewFile = Map-SourceToTargetPath $newFile
            Write-Verbose "`tRename detected: oldFile='$oldFile', newFile='$newFile'"
            # Check if oldFile was modified in non-integration commit
            Push-Location $TargetRepoPath
            $fileCommits = git log --pretty=format:"%H" -- $mappedOldFile
            $conflictingCommits = $fileCommits | Where-Object { $nonIntegrationCommits -contains $_ }
            Pop-Location
            if ($conflictingCommits) {
                Write-Verbose "`t`tConflict detected for rename: $mappedOldFile -> $mappedNewFile (manual resolution needed)"
                $conflicts += "RENAME $mappedOldFile -> $mappedNewFile (manual resolution needed)"
            } else {
                Write-Verbose "`t`tAuto-integrating rename: deleting '$mappedOldFile', adding '$mappedNewFile'"
                $autoIntegrateDel += $mappedOldFile
                $autoIntegrateAdd += $mappedNewFile
            }
            continue
        }
    }
    # Handle normal add/modify/delete
    if ($line -match "^(A|M|D)\s+(.+)$") {
        $status = $matches[1]
        $file = $matches[2]
        $mappedFile = Map-SourceToTargetPath $file
        Write-Verbose "`tMatched status: $status, file: $file -> $mappedFile"

        $fileChangedInNonIntegration = $false
        $fileExistsInTargetRepo = $false
        $parentDirExistsInTargetRepo = $false

        if ($status -eq "M") {
            Write-Verbose "`t`tChecking for non-integration modifications to: $mappedFile"
            Push-Location $TargetRepoPath
            $fileCommits = git log --pretty=format:"%H" -- $mappedFile
            $conflictingCommits = $fileCommits | Where-Object { $nonIntegrationCommits -contains $_ }
            if ($conflictingCommits) { $fileChangedInNonIntegration = $true }
            if (Test-Path $mappedFile) { $fileExistsInTargetRepo = $true }
            Pop-Location
        }

        if ($status -eq "A") {
            Write-Verbose "`t`tChecking parent directory for added file: $mappedFile"
            $parentDir = Split-Path $mappedFile -Parent
            if ($parentDir -eq "") {
                $parentDirExistsInTargetRepo = $true
            } else {
                $parentDirPath = Join-Path $TargetRepoPath $parentDir
                if (Test-Path $parentDirPath) { $parentDirExistsInTargetRepo = $true }
            }
            if ($parentDirExistsInTargetRepo) {
                Write-Verbose "`t`t`tAdding file: $mappedFile"
                $added += $mappedFile
                $autoIntegrateAdd += $mappedFile
            } else {
                $srcPath = Join-Path $SourceRepoPath $file
                $dstPath = Join-Path $TargetRepoPath $mappedFile
                Write-Verbose "`t`t`tSkipping added file (parent directory missing): $srcPath -> $dstPath"
                $skippedAdd += "$status $srcPath -> $dstPath"
            }
        } elseif ($status -eq "M") {
            if (-not $fileExistsInTargetRepo) {
                $srcPath = Join-Path $SourceRepoPath $file
                $dstPath = Join-Path $TargetRepoPath $mappedFile
                Write-Verbose "`t`t`tSkipping modified file (does not exist in target repo): $srcPath -> $dstPath"
                $skippedMod += "$status $srcPath -> $dstPath"
            } elseif ($fileChangedInNonIntegration) {
                $srcPath = Join-Path $SourceRepoPath $file
                $dstPath = Join-Path $TargetRepoPath $mappedFile
                Write-Verbose "`t`t`tConflict detected for modified file (changed in non-integration commit): $srcPath -> $dstPath"
                $conflicts += "$status (conflict) $srcPath -> $dstPath"
            } else {
                Write-Verbose "`t`t`tAdding modified file: $mappedFile"
                $modified += $mappedFile
                $autoIntegrateMod += $mappedFile
            }
        } elseif ($status -eq "D") {
            Write-Verbose "`t`tDeleting file: $mappedFile"
            $deleted += $mappedFile
            $autoIntegrateDel += $mappedFile
        }
    }
}

if ($DryRun) {
    Write-Host "`n[DRY RUN] Modified files to be copied to target repo (only if they exist in target repo):"
    $autoIntegrateMod | ForEach-Object { Write-Host $_ }
    if ($skippedMod.Count -gt 0) {
        Write-Host "`n[DRY RUN] Modified files skipped (do not exist in target repo):"
        $skippedMod | ForEach-Object { Write-Host $_ }
    }

    Write-Host "`n[DRY RUN] Added files to be copied to target repo (only if parent directory exists):"
    $autoIntegrateAdd | ForEach-Object { Write-Host $_ }
    if ($skippedAdd.Count -gt 0) {
        Write-Host "`n[DRY RUN] Added files skipped (parent directory does not exist in target repo):"
        $skippedAdd | ForEach-Object { Write-Host $_ }
    }

    Write-Host "`n[DRY RUN] Deleted files to be removed from target repo:"
    $autoIntegrateDel | ForEach-Object { Write-Host $_ }
    if ($conflicts.Count -gt 0) {
        Write-Host "`n[DRY RUN] Conflicts detected (manual resolution needed):"
        $conflicts | ForEach-Object { Write-Host $_ }
    } else {
        Write-Host "`n[DRY RUN] No conflicts detected."
    }

    Write-Host "`n[DRY RUN] After integration, tag the new commit in target repo:"
    Write-Host "    git tag integration/$TargetSourceCommit <new-target-commit>"
} else {
    foreach ($file in $autoIntegrateAdd) {
        $src = Join-Path $SourceRepoPath $file
        $dst = Join-Path $TargetRepoPath $file
        $dstDir = Split-Path $dst -Parent
        Ensure-DirectoryExists $dstDir
        Copy-Item -Path $src -Destination $dst -Force
        Write-Host "Copied: $file"
    }
    foreach ($file in $autoIntegrateMod) {
        $src = Join-Path $SourceRepoPath $file
        $dst = Join-Path $TargetRepoPath $file
        $dstDir = Split-Path $dst -Parent
        Ensure-DirectoryExists $dstDir
        if (Test-Path $dst) {
            Copy-Item -Path $src -Destination $dst -Force
            Write-Host "Copied: $file"
        } else {
            Write-Host "Skipped (does not exist in target repo): $file"
        }
    }
    foreach ($file in $autoIntegrateDel) {
        $dst = Join-Path $TargetRepoPath $file
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
    Write-Host "`nIntegration complete. Tag the new commit in target repo:"
    Write-Host "    git tag integration/$TargetSourceCommit <new-target-commit>"
}