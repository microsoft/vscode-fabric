// This is configuration for unit & integration tests only. UI Tests are configured via .mocharc.js

import { defineConfig } from '@vscode/test-cli';
import { getMochaReporterOptions } from '../.vscode-test.shared.cjs';

// https://github.com/microsoft/vscode-test-cli/issues/40#issuecomment-2124849239
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
	tests: [
	{
		files: '**/test/unit/**/*.test.js',
		mocha: {
			ui: 'bdd',
			...getMochaReporterOptions('core-unit')
		}
	},
	{
		files: '**/test/integration/**/*.test.js',
		mocha: {
			ui: 'bdd',
			...getMochaReporterOptions('core-integration')
		},
		env: {
			// VSCODE_FABRIC_USE_MOCKS: 'true',
			// VSCODE_FABRIC_ENABLE_TEST_HOOKS: 'true'
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
