<!--
SYNC IMPACT REPORT (Constitution Update)
Version Change: 1.1.0 → 1.2.0
Bump Type: MINOR (formalized structure, enhanced governance detail)
Rationale: Converted from draft to template-compliant format; added explicit governance procedures

Modified Principles:
- All principles retained with enhanced formatting and rationale sections
- No principle names changed

Added Sections:
- None (structure formalization only)

Removed Sections:
- None

Templates Requiring Updates:
- ✅ plan-template.md: Constitution Check section aligns (references TDD, DI, package boundaries)
- ✅ spec-template.md: No constitution-specific requirements (by design)
- ✅ tasks-template.md: TDD ordering aligns with Principle II
- ✅ agent-file-template.md: Generic template, no updates needed
- ✅ copilot-instructions.md: Detailed guidance aligns with all principles

Follow-up TODOs:
- None (all placeholders resolved)

Last Updated: 2025-10-01
-->

# Microsoft Fabric VS Code Extension Constitution

## Core Principles

### I. Constructor-Injected Services
All production code MUST resolve dependencies through the `@wessberg/di` container and pass them via constructors so services stay swappable for satellites and tests. Registrations MUST map interfaces to implementations (or factory lambdas) and avoid `new` outside of container setup. Tests MAY override registrations but MUST stay explicit about scopes to protect isolation.

*Rationale: Constructor injection keeps the extension modular, enables deterministic testing, and allows satellite extensions to reuse the same contracts without tight coupling.*

### II. Test-First with Moq.ts Discipline
Every change MUST begin with failing tests that describe the behavior. Unit tests MUST prefer `moq.ts`; sinon is only permitted when Moq cannot express the interaction. Integration flows MUST use the `FakeFabricApiClient` (and related fake token services) to intercept HTTP while keeping real business logic, and they MUST install the `VSCodeUIBypass` hooks (RFC 006) to stub `vscode.window` prompts instead of relying on manual interaction. End-to-end and UI tests MAY be written only when lower layers cannot validate the scenario and MUST be reviewed for maintenance cost.

*Rationale: TDD anchored in Moq provides fast feedback while preserving realistic flows through integration fakes, ensuring regression coverage without brittle test doubles.*

### III. Satellite-Friendly Reuse
Shared behavior that benefits both the core extension and satellites MUST live in the `@microsoft/vscode-fabric-util` package (for implementations) or `@microsoft/vscode-fabric-api` (for contracts). The API package ONLY exposes types, enums, and test hooks needed for satellite extensibility; it is not a dumping ground for every internal interface. Contract evolution MUST provide deprecation messaging, migration guides, and backwards-compatible shims until the next major release. The util package is the home for reusable code, and helpers placed there MUST be written in isolation (no extension imports) and covered by unit tests before adoption. The core extension MAY consume util helpers directly but MUST NOT duplicate logic that satellites could reuse.

*Rationale: Concentrating reusable logic in shared packages keeps satellites lightweight, minimizes drift, and ensures the published API remains the single source of truth.*

### IV. VS Code Native UX First
Features MUST favor built-in VS Code UI primitives (commands, tree views, quick picks, input boxes) before proposing custom WebViews. Any WebView usage MUST document why native UX was insufficient and include an accessibility plan. UI flows MUST respect localization/l10n assets and work within standard VS Code themes without additional styling hacks.

*Rationale: Leaning on native VS Code UX keeps experiences consistent, accessible, and maintainable across both the core extension and satellites.*

### V. Extensibility Contracts Are Sacred
Public APIs exported from `@microsoft/vscode-fabric-api` define the contract for satellites and MUST remain backward compatible unless a coordinated major release is scheduled. Breaking changes MUST ship with deprecation paths, migration guidance, and test coverage across core and satellites. The core extension MUST validate new contracts through integration tests exercising the fake API client.

*Rationale: Treating the API as a stable contract protects satellite investments and keeps the Fabric ecosystem coherent as it evolves.*

### VI. Tree View Stewardship
The Fabric workspace (remote) tree view and the local project tree view are the primary user surfaces. Changes MUST preserve their responsiveness, lazy-loading behavior, and error handling, and they MUST land alongside telemetry and regression tests that cover both happy path and filtered/empty states. Refresh commands, node providers, and iconography MUST remain consistent with the extensibility model so satellites can extend these views without regressions.

*Rationale: Tree views are where Fabric developers spend most of their time; protecting their performance and extensibility keeps the overall experience dependable.*

## Shared Package Boundaries

- `api/` MUST contain only the satellite-facing extensibility contracts (TypeScript interfaces, enums, light test hooks). It MUST NOT host general-purpose core interfaces. Runtime code belongs in `util/` or the extension.
- Any API surface change MUST document deprecation windows, migration steps, and compatibility expectations before release notes are published.
- `util/` MUST host cross-cutting implementations (telemetry, logging, helpers) that can be shipped to satellites; it MUST avoid importing the extension, and every helper added MUST ship with focused unit tests that run without VS Code scaffolding.
- The core extension MUST reference `api/` and `util/` but MUST NOT leak its internal modules back into those packages.
- Satellite extensions MUST depend on the published npm packages (`@microsoft/vscode-fabric-api` and `@microsoft/vscode-fabric-util`) instead of copying source.
- Dependency registration MUST happen once per package entry point to keep container graphs predictable across workspaces and tests.

## Development Workflow & Quality Gates

- Start with a plan that maps requirements to constructor-injected services and identifies existing utilities before writing new modules.
- Author unit tests with Moq first, confirm they fail, then implement code until they pass; repeat for integration scenarios with the fake clients.
- Run `npm run test:unit` and relevant integration suites before merging; integration suites MUST configure the `VSCodeUIBypass` so prompts never block automation. E2E/UI suites run only when scenarios demand them.
- Enforce linting (`npm run lint:check`) and workspace builds in CI; fixes MUST be included before review completes.
- Every pull request MUST document DI registrations, shared utility placements, and user-visible UX decisions to help reviewers enforce the principles above.
- Tree view updates (remote or local) MUST describe expected node structure changes, telemetry additions, and accessibility impacts within the PR.

## Governance

- This constitution supersedes conflicting guidance in other docs. Maintainers MUST verify compliance during reviews and request changes when violations appear.
- Amendments require consensus from the core extension maintainers and at least one representative from a satellite team. Proposed changes MUST include version impact analysis and updates for dependent templates.
- Semantic versioning applies to the constitution. Major bumps cover breaking governance changes, minor bumps add principles/sections, and patch bumps clarify wording.
- Compliance reviews occur quarterly; findings MUST be documented in `docs/` with action items tracked in the repository issue tracker.
- For runtime development guidance specific to AI assistants working with this codebase, refer to `.github/copilot-instructions.md` (GitHub Copilot), `AGENTS.md` (general agent discovery), and the `docs/` folder for architectural context.

**Version**: 1.2.0 | **Ratified**: 2025-09-26 | **Last Amended**: 2025-10-01