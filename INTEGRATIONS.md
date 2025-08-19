# INTEGRATIONS.md

## Summary


This repository uses a PowerShell script (e.g., `Integrate-GitRepos.ps1`) to automate the integration of changes from a source git repository into a target git repository. The script:

- Finds the latest integration tag in the target repo (`integration/<source-commit-id>`) to determine the last source commit that was integrated.
- Compares the specified source commit to the last integrated source commit and lists all files added, modified, or deleted in the source repo since the last integration.
- For each modified file, checks if it was changed in any target repo commit that is **not** an integration commit. If so, flags it as a conflict for manual resolution.
- Prepares actions to copy, delete, or skip files based on their status and existence in the target repo.
- In dry run mode, prints what would be copied, deleted, skipped, or flagged as a conflict.
- In actual mode, performs the copy/delete actions.
- After a successful integration, you manually tag the new target repo commit with `integration/<source-commit-id>` to mark the sync point for future runs.

## Integration Checklist

### Before Running the Script


- [ ] Ensure your local target repository is up to date with the remote.
- [ ] Ensure your local source repository is up to date with the remote.
- [ ] Identify the source commit ID you want to integrate.
- [ ] Confirm that all previous integrations have been tagged in the target repo as `integration/<source-commit-id>`.
- [ ] Review and resolve any outstanding conflicts or manual changes in the target repository.
- [ ] (Optional) Run the script in dry run mode to preview the changes and conflicts:
  ```
  pwsh -File .\tools\Integrate-GitRepos.ps1 -SourceRepoPath "<path-to-source-repo>" -TargetRepoPath "<path-to-target-repo>" -TargetSourceCommit <source-commit-id> -DryRun
  ```

### After Merging Changes


- [ ] Review the changes in the target repository and resolve any flagged conflicts.
- [ ] Commit and push the merged changes to the target remote.
- [ ] Tag the new target repo commit with the integrated source commit ID:
  ```
  git tag integration/<source-commit-id> <new-target-commit-sha>
  git push origin integration/<source-commit-id>
  ```
- [ ] Document the integration in your release notes or change log as needed.

---

**Note:**  
This process ensures that all manual changes in the target repository are detected and flagged, and that integration points are clearly tracked using tags for reliable future merges.