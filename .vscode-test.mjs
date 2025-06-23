import { defineConfig } from '@vscode/test-cli';
import { resolve } from 'path';

export default defineConfig({
	files: 'out/test/**/*.test.js',
	workspaceFolder: resolve('./test-workspace'),
	launchArgs: ['--disable-extensions']
});
