# Change Log

## [0.40] 2026-10-01

### Added
- Preview support for Fabric App items, including create, rename, delete, a getting-started experience, and Rayfin app scaffolding from a local folder.
- Commands to create, rename, and delete folders in the remote workspace view.
- Item definition support for Lakehouses, ML experiments, and ML models.
- Integration with the Azure Cosmos DB and MSSQL extensions for their corresponding Fabric item types.

### Changed
- Companion extensions are now activated on demand when expanding supported items, with an install prompt when the required extension is unavailable.
- Item names are validated while creating an item, providing feedback before submission.

### Fixed
- Remote notebooks now open in the correct `.ipynb` format and can be viewed through the read-only item definition file system.
- Publishing Semantic Models no longer attempts to upload `.abf` files, and item definition errors now identify the file that failed processing.
- Updated dependencies to address security vulnerabilities.

## [0.38] 2026-02-19

### Added
- "Install extension" breadcrumb in local projects view.
- Prompt to install Fabric MCP server extension when GitHub Copilot Chat is detected, offering enhanced Fabric-aware Copilot functionality.
- Item definition files are now viewable directly in the remote workspace tree view: each item exposes an "Item definition" node listing its definition files as read-only previews.
- Item definition files can be directly edited via a virtual file system; saving automatically updates the item definition via the Fabric API. This feature is behind a Preview setting and is off by default.
- Fabric agent mode added with Copilot instructions for assisting users with and without the Fabric MCP server installed.

### Changed
- Local folder view now shows folders by default (no longer requires enabling a Preview setting).

### Fixed
- Fixed "Open in Fabric" navigation for Semantic Models, which was returning a 404 due to an incorrect portal path (`semanticmodels` → `datasets`).

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
- Security updates: upgraded `js-yaml` to fix prototype pollution vulnerability.
- Security updates: upgraded `jws`.
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
