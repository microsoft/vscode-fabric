import { defineConfig } from '@vscode/test-cli';
import { getMochaReporterOptions } from '../../extensions/.vscode-test.shared.cjs';

export default defineConfig({
	tests:[{
		files: 'out/test/**/*.test.js',
		mocha: {
			ui: 'bdd',
			...getMochaReporterOptions('api')
		}
	}],
	coverage: {
		reporter: ['cobertura'],
		includeAll: true,
	}
});
