// This is configuration for UI Tests only. All other tests are configured via .vscode-test.mjs

const { getMochaReporterOptions } = require('./.vscode-test.shared.cjs');

module.exports = {
    timeout: 180000, // 3 minutes
    ...getMochaReporterOptions('core-uitest')
};