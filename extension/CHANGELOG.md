# Change Log

## [0.36] 2026-01-06

### Added
- New local folder commands to download item definitions, open folders for items, and change folder mappings.
- Progress indicators for long running operations (Open in Explorer and Publish commands) displayed in the notification area.
- "Open in Fabric" button added to publish notification toast, allowing quick browser launch to newly created/updated items.
- Sign-up button displayed when user does not have a Fabric account (detects 401 Unlicensed errors and initiates free trial sign-up flow).
- "Create Item" command now available on artifact type nodes, pre-selecting the artifact type to streamline item creation.
- Local folder scanning now recurses beyond top-level directories, allowing flexible folder structures in the local folder view.

### Changed
- Improved error messaging for API version mismatches between core and satellite extensions, including version numbers and guidance to use latest releases.
- URI handler updated to use "Download Item Definition" command instead of deprecated API, with improved prompting and error handling.

### Fixed
- Security updates: upgraded `js-yaml` (4.1.0 to 4.1.1, 3.14.1 to 3.14.2) to fix prototype pollution vulnerability.
- Security updates: upgraded `jws` (3.2.2 to 3.2.3).
- Removed obsolete `cpx` dev dependency.

## [0.26] - 2025-09-11

### Added
- Added support for displaying and managing multiple workspaces in the Fabric tree view.
- Infer the target workspace for publishing based on the folder location, reducing manual selection. 
- New command to publish to a specific workplace.
- Can select a specific semantic model when publishing a Report.

### Changed
- Added prompts to confirm overwriting items during publish and open operations.
- The local folder view is always visible.

### Fixed
- Workspace creation failures by adding a Content-Type header to API calls.

## [0.24] - 2025-08-14

### Added
- Integrate SQL database handling into the extension, allowing users to open SQL databases in the SQL Server extension and copy their connection strings directly from the workspace view.
- "Open in Explorer" commands for item types which support item definitions, downloading the item definition and opening the folder in code explorer
- Publishing supported items types to be published from local projects.
- Support for switching tenant.

## [0.22] - 2025-06-23

### Added
- [Support for switching tenant within the Fabric extension.](https://github.com/microsoft/microsoft-fabric-vscode-extension/issues/4)
- Enhanced CRUD operations for all Fabric item types.

### Changed
- Feedback Tree View: now visible by default with improved size ratios.
- Updated prompts for deleting artifacts in the remote workspace view.
- Improved error handling and validation for workspace folders.
