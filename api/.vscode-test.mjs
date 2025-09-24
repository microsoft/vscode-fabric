import { defineConfig } from '@vscode/test-cli';
import { getMochaReporterOptions } from '../extension/.vscode-test.shared.cjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
		exclude: [
			'**\\test\\**',
			join(__dirname, 'test', '**'),
			join(__dirname, 'out', 'test', '**'),
		],
		includeAll: true,
	}
});
