# Contributing

This project welcomes contributions and suggestions. Most contributions require you to
agree to a Contributor License Agreement (CLA) declaring that you have the right to,
and actually do, grant us the rights to use your contribution. For details, visit
https://cla.microsoft.com.

When you submit a pull request, a CLA-bot will automatically determine whether you need
to provide a CLA and decorate the PR appropriately (e.g., label, comment). Simply follow the
instructions provided by the bot. You will only need to do this once across all repositories using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/)
or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Building

Read the [developer quickstart](/docs/developer-quickstart.md) for step-by-step environment setup and build instructions.

## Issues & RFC

Start every contribution by [opening an issue](https://github.com/microsoft/vscode-fabric/issues/new); that conversation is where we agree on scope and approach before work begins. For larger or design-heavy proposals, consider drafting an RFC following the examples in [`docs/rfc/`](./docs/rfc).

## Pull Requests

>[!NOTE]
>If your pull request introduces a large change that materially impacts the extension or it's pacakges, make sure that it was **discussed and agreed upon** by the project maintainers. Pull requests with large changes that did not have a prior conversation and agreement may be closed.

Prior to submitting your PR, please run these pre-flight checks locally:

- `npm run build` – verify all packages compile successfully.
- `npm run lint:check` – confirm linting passes before formatting corrections hit CI.
- `npm run test:unit`
- `npm run test:integration`
- `npm run test:e2e`
- `npm run test:ui`
- If your changes touch the extension module or localization strings, run `npm run localization -w extension` to update the localized bundles.

Completing these steps before you open the PR helps keep reviews focused on the change itself.

## Resources

- [Developer Quickstart](/docs//developer-quickstart.md)
- [Architecture Overview](/docs/architecture-overview.md)
- [Extensibility Overview](/docs/extensibility-overview.md)