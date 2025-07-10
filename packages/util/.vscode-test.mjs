import { defineConfig } from '@vscode/test-cli';
import { getMochaReporterOptions } from '../../extensions/.vscode-test.shared.cjs';

import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// https://github.com/microsoft/vscode-test-cli/issues/40#issuecomment-2124849239

export default defineConfig({
	tests:[{
		files: 'out/test/**/*.test.js',
		mocha: {
			ui: 'bdd',
			...getMochaReporterOptions('util')
		}
	}],
	coverage: {
		reporter: ['cobertura'],
		exclude: [
			'**\\api\\**', // works for windows
			'**\\test\\**',
			join(__dirname, '..', 'api', '**'), // works for linux/mac
			join(__dirname, 'out', 'test', '**'),
			join(__dirname, 'src', 'test', '**'),
		],
		includeAll: true
	}
});
