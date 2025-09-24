function getMochaReporterOptions(title) {
    let isCI = process.env.AGENT_OS || process.env.GITHUB_ACTIONS || process.env.CI;
    return isCI ? {
        reporter: 'mocha-multi-reporters',
        reporterOptions: {
            'reporterEnabled': 'spec,mocha-junit-reporter',
            'mochaJunitReporterReporterOptions': {
                'rootSuiteTitle': `vscode-fabric${title ? `-${title}` : ''}`,
                'mochaFile': `[rootSuiteTitle]-TestResults-${process.env.AGENT_OS}-[hash].xml`
            }
        }
    }: {
        // use defaults when not in CI environment (seems to work better with VS Code...)
    };
}

module.exports = { getMochaReporterOptions };