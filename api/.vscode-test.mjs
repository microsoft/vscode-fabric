import { defineConfig } from '@vscode/test-cli';
import { getMochaReporterOptions } from '../extension/.vscode-test.shared.cjs';

export default defineConfig({
	tests:[
	{
		label: 'unit',
		files: '**/test/unit/**/*.test.js',
		mocha: {
			ui: 'bdd',
			...getMochaReporterOptions('api-unit')
		}
	}],
	coverage: {
		reporter: ['cobertura'],
		includeAll: true,
	}
});
