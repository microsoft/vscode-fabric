// This is configuration for unit & integration tests only. UI Tests are configured via .mocharc.js

import { defineConfig } from '@vscode/test-cli';
// After repo directory flattening, the shared test config file now resides in the same folder
// instead of the parent directory. Adjust the relative import accordingly.
import { getMochaReporterOptions } from './.vscode-test.shared.cjs';

// https://github.com/microsoft/vscode-test-cli/issues/40#issuecomment-2124849239
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
	tests: [
	{
		label: 'unit',
		files: '**/test/unit/**/*.test.js',
		mocha: {
			ui: 'bdd',
			...getMochaReporterOptions('core-unit')
		}
	},
	{
		label: 'integration',
		files: '**/test/integration/**/*.test.js',
		extensionDevelopmentPath: ['.'],
		mocha: {
			ui: 'bdd',
			...getMochaReporterOptions('core-integration')
		},
		env: {
			VSCODE_FABRIC_ENABLE_TEST_HOOKS: 'true',
			VSCODE_FABRIC_ENABLE_TEST_FAKES: 'true'
		}
	},
	{
		label: 'e2e',
		files: '**/test/e2e/**/*.test.js',
		extensionDevelopmentPath: ['.'],
		mocha: {
			ui: 'bdd',
			...getMochaReporterOptions('core-e2e')
		},
		env: {
			VSCODE_FABRIC_ENABLE_TEST_HOOKS: 'true',
			VSCODE_FABRIC_ENABLE_TEST_FAKES: 'true'
		}
	}],
	coverage: {
		reporter: ['cobertura'],
		exclude: [
			'**\\packages\\**', // works for windows
			'**\\test\\**',
			'**\\dist\\**',
			join(__dirname, '..', '..', 'packages', '**'), // works for linux/mac
			join(__dirname, 'out', 'test', '**'),
			join(__dirname, 'src', 'test', '**'),
			join(__dirname, 'dist', '**'),
		],
		includeAll: true
	}
});
