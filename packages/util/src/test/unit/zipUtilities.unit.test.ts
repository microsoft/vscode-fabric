/* eslint-disable security/detect-non-literal-fs-filename */
import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as glob from 'glob';
import { minimatch } from 'minimatch';
import * as vscode from 'vscode';

import { gitignoreToMinimatch, sleep, createZipFile, IZipOptions, MockConsoleLogger } from '../../index';

describe('zipUtilities Unit Tests', function () {
    const sleepAmount = 100; // Reduced sleep for unit tests

    it('gitignoreToMinimatch test', async function () {
        console.log('minimatch test');
        let testPath = 'ggg/Bin\\jkhkj.obj';
        // replace all \ with / for minimatch
        testPath = testPath.replace(/\\/g, '/');
        let pattern = gitignoreToMinimatch('[Bb]in/');
        let mtch = new minimatch.Minimatch(pattern, { debug: true, noglobstar: false });
        let matchResult = mtch.match(testPath);

        console.log(`minimatch('${testPath}','${pattern}') = ${matchResult}`);

        // Assert that the pattern correctly matches
        assert.strictEqual(matchResult, true, 'Pattern should match the test path');

        await sleep(sleepAmount);
    });

    it('gitignoreToMinimatch comprehensive pattern tests', function () {
        // Test cases: [gitignorePattern, expectedMinimatchPattern, description]
        const testCases = [
            // Basic patterns
            ['*.log', '**/*.log', 'Simple wildcard file pattern'],
            ['temp', '**/temp/**', 'Simple directory pattern'],
            ['*.txt', '**/*.txt', 'File extension pattern'],

            // Directory patterns
            ['bin/', '**/bin/**', 'Directory with trailing slash'],
            ['node_modules/', '**/node_modules/**', 'Node modules directory'],
            ['dist/', '**/dist/**', 'Distribution directory'],

            // Absolute path patterns (leading slash)
            ['/config.json', 'config.json', 'Root level file'],
            ['/build/', '**/build/**', 'Root level directory'],
            ['/src/temp/', '**/src/temp/**', 'Nested root level directory'],

            // Glob patterns
            ['**/*.tmp', '**/*.tmp', 'Double wildcard pattern'],
            ['**/cache', '**/cache', 'Double wildcard directory'],
            ['src/**/*.js', 'src/**/*.js', 'Nested glob pattern'],

            // Character classes
            ['[Tt]emp/', '**/[Tt]emp/**', 'Character class directory'],
            ['*.{js,ts}', '**/*.{js,ts}', 'Brace expansion pattern'],

            // Question mark wildcards
            ['test?.log', '**/test?.log', 'Single character wildcard'],
            ['config?.json', '**/config?.json', 'Config file variants'],

            // Negation patterns
            ['!important.txt', '!**/important.txt', 'Negated file pattern'],
            ['!build/', '!**/build/**', 'Negated directory pattern'],
            ['!*.keep', '!**/*.keep', 'Negated extension pattern'],

            // Complex patterns
            ['src/main.js', 'src/main.js', 'Specific path pattern'],
            ['logs/*.log', 'logs/*.log', 'Directory specific files'],
            ['temp*', '**/temp*', 'Prefix wildcard'],

            // Edge cases
            ['', '', 'Empty string'],
            ['/', '/**', 'Root slash only'],
            ['*', '**/*', 'Single wildcard'],
            ['**', '**', 'Double wildcard alone'],
        ];

        testCases.forEach(([input, expected, description]) => {
            const result = gitignoreToMinimatch(input);
            assert.strictEqual(result, expected,
                `Failed for "${input}" (${description}): expected "${expected}", got "${result}"`);
        });

        // Test error cases
        assert.throws(() => {
            gitignoreToMinimatch(null as any);
        }, TypeError, 'Should throw TypeError for null input');

        assert.throws(() => {
            gitignoreToMinimatch(123 as any);
        }, TypeError, 'Should throw TypeError for non-string input');
    });

    it('gitignoreToMinimatch with minimatch integration test', function () {
        // Test actual pattern matching with minimatch
        const testFiles = [
            'src/main.js',
            'src/utils/helper.js',
            'build/output.js',
            'node_modules/package/index.js',
            'temp/file.txt',
            'logs/app.log',
            'config.json',
            'README.md',
        ];

        // Test different gitignore patterns and verify they match expected files
        const patternTests = [
            {
                gitignorePattern: '*.log',
                shouldMatch: ['logs/app.log'],
                shouldNotMatch: ['src/main.js', 'config.json', 'README.md'],
            },
            {
                gitignorePattern: 'node_modules/',
                shouldMatch: ['node_modules/package/index.js'],
                shouldNotMatch: ['src/main.js', 'build/output.js'],
            },
            {
                gitignorePattern: '/config.json',
                shouldMatch: ['config.json'],
                shouldNotMatch: ['src/main.js', 'logs/app.log'],
            },
            {
                gitignorePattern: 'src/',
                shouldMatch: ['src/main.js', 'src/utils/helper.js'],
                shouldNotMatch: ['build/output.js', 'config.json'],
            },
        ];

        patternTests.forEach(({ gitignorePattern, shouldMatch, shouldNotMatch }) => {
            const minimatchPattern = gitignoreToMinimatch(gitignorePattern);
            const matcher = new minimatch.Minimatch(minimatchPattern);

            shouldMatch.forEach(file => {
                const matches = matcher.match(file);
                assert.strictEqual(matches, true,
                    `Pattern "${gitignorePattern}" (converted to "${minimatchPattern}") should match "${file}"`);
            });

            shouldNotMatch.forEach(file => {
                const matches = matcher.match(file);
                assert.strictEqual(matches, false,
                    `Pattern "${gitignorePattern}" (converted to "${minimatchPattern}") should NOT match "${file}"`);
            });
        });
    });

    // createZipFile tests moved from ZipSource.test.ts
    const templateFolderDotnet = path.resolve(__dirname, '../../../../../Templates/DotNet');
    const sleepAmountZip = 1000;
    let targHashDotNetTemplate = 'ie4MQ4CgY7d4B48e4xMck71j8usN4kNaBfzIN0JPubQ=';
    let numFilesDotNetTemplate = 13;

    async function doZipSource(desc: string, options: IZipOptions): Promise<{ zipFileName: vscode.Uri, hash: string, nEntries: number }> {
        console.log(`ZipSourceTest: ${desc} useGitIgnore = ${options.respectGitIgnoreFile}`);
        let srcdir = templateFolderDotnet;
        let destdir = path.resolve(__dirname, 'tempdir');
        if (!fs.existsSync(destdir)) {
            fs.mkdirSync(destdir);
        }
        else {
            await fs.emptyDir(destdir);
        }
        let destZipFile = path.resolve(destdir, 'SrcCodeZipFile.zip');
        if (fs.existsSync(destZipFile)) {
            console.log(`Deleting existing file ${destZipFile}`);
            fs.unlinkSync(destZipFile);
        }
        const logger = new MockConsoleLogger('Fabric Tests');
        options.reporter = logger;
        let zipResult = await createZipFile(vscode.Uri.file(destZipFile), vscode.Uri.file(srcdir), options);
        console.log(`${destZipFile} created with ${zipResult.nEntries} entries  Hash = '${zipResult.hash}'`);
        await sleep(sleepAmountZip * 1);
        return zipResult;
    }

    it('createZipFile with .gitignore', async function () {
        // Skip test if template folder doesn't exist
        if (!fs.existsSync(templateFolderDotnet)) {
            console.log(`Template folder ${templateFolderDotnet} does not exist, skipping test`);
            this.skip();
            return;
        }

        const zipOptions: IZipOptions = {
            respectGitIgnoreFile: true,
            debug: true,
            calculateHash: true,
            calculateHashOnly: false,
        };
        const zipResult = await doZipSource('With .gitignore', zipOptions);
        console.log('ZipSourceTest');
        assert(fs.existsSync(zipResult.zipFileName.fsPath));
        assert(zipResult.nEntries === numFilesDotNetTemplate);
        assert(zipResult.hash === targHashDotNetTemplate, `Hash Mismatch. Hash = '${zipResult.hash}'  Should be: ${targHashDotNetTemplate}`);
    });

    it('createZipFile with folderIgnore', async function () {
        // Skip test if template folder doesn't exist
        if (!fs.existsSync(templateFolderDotnet)) {
            console.log(`Template folder ${templateFolderDotnet} does not exist, skipping test`);
            this.skip();
            return;
        }

        let excludeFolders = ['.vscode', 'obj', 'bin', '.venv', '__pycache__']; // We want .vscode folder in source, but for this test, we want to exclude it from the zip to match .gitignore
        excludeFolders.forEach((folder) => {
            console.log(`excludeFolder: ${folder}`);
        });
        const zipOptions: IZipOptions = {
            respectGitIgnoreFile: false,
            debug: true,
            reporter: new MockConsoleLogger('Fabric Tests'),
            filterFolder: async (rootFoler, folder) => {
                let includeInZip = true;
                for (const excludedFolder of excludeFolders) {
                    if (folder.fsPath.endsWith(path.sep + excludedFolder)) {
                        includeInZip = false;
                        break;
                    }
                }
                console.log(` zip?  ${includeInZip} ${folder}`);
                return includeInZip;
            },
            calculateHash: true,
            calculateHashOnly: false,
        };
        const zipResult = await doZipSource('With folderignore', zipOptions);
        console.log('ZipSourceTest');
        assert(fs.existsSync(zipResult.zipFileName.fsPath));
        assert(zipResult.nEntries === numFilesDotNetTemplate);
        assert(zipResult.hash === targHashDotNetTemplate, `Hash Mismatch. Hash = '${zipResult.hash}'  Should be: ${targHashDotNetTemplate}`);
    });

    it('createZipFile with fileIgnore', async function () {
        // Skip test if template folder doesn't exist
        if (!fs.existsSync(templateFolderDotnet)) {
            console.log(`Template folder ${templateFolderDotnet} does not exist, skipping test`);
            this.skip();
            return;
        }

        let excludeFolders = ['.vscode', 'obj', 'bin', '.venv', '__pycache__']; // We want .vscode folder in source, but for this test, we want to exclude it from the zip to match .gitignore
        excludeFolders.forEach((folder) => {
            console.log(`excludeFolder: ${folder}`);
        });
        const zipOptions: IZipOptions = {
            respectGitIgnoreFile: false,
            debug: true,
            filterFolder: async (rootFolder, folder) => {
                let includeInZip = true;
                for (const excludedFolder of excludeFolders) {
                    if (folder.fsPath.endsWith(path.sep + excludedFolder)) {
                        includeInZip = false;
                        break;
                    }
                }
                console.log(` zip?  ${includeInZip} ${folder}`);
                return includeInZip;
            },
            filterFile: async (file) => {
                let includeInZip = true;
                // if (file.endsWith('.dll')) {
                //     includeInZip = false;
                // }
                return { include: includeInZip };
            },
            calculateHash: true,
            calculateHashOnly: false,
        };
        const zipResult = await doZipSource('With folderignore', zipOptions);
        console.log('ZipSourceTest');
        assert(fs.existsSync(zipResult.zipFileName.fsPath));
        assert(zipResult.nEntries === numFilesDotNetTemplate);
        assert(zipResult.hash === targHashDotNetTemplate, `Hash Mismatch. Hash = '${zipResult.hash}'  Should be: ${targHashDotNetTemplate}`);
    });
});
