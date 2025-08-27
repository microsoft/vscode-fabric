/* eslint-disable security/detect-non-literal-fs-filename */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as fse from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import JSZip = require('jszip');
import * as glob from 'glob';
import * as crypto from 'crypto';

/*
 * Options for creating and unzipping a zip file 
 */
export interface IZipOptions {
    respectGitIgnoreFile?: boolean; // use the .gitignore file to filter out files and folders (if found)
    calculateHash?: boolean; // calculate the hash of the entries added to the zip file
    calculateHashOnly?: boolean; // does not create the zip file, just calculates the hash: performance optimization
    progress?: vscode.Progress<{}> | null;
    debug?: boolean; // for tests
    reporter?: IMessageReporter; // show to the user in the output channel window any zip differences
    filterFolder?: (rootFolder: vscode.Uri, folder: vscode.Uri) => Promise<boolean>; // Folder: return true to include the folder and its contents

    // local.settings.json can be anywhere in folder structure, and we don't want to zip/store it or include it in hash calculations so replace contents with '' before zip and hash calc 
    filterFile?: (rootFolder: vscode.Uri, filename: string) => Promise<{ include: boolean, replaceWithEmpty?: boolean }>;
}

export interface IMessageReporter {
    report(message: string): void;
}

export async function unzipZipFile(srczip: vscode.Uri, destfolder: vscode.Uri, zipOptions?: IZipOptions): Promise<{ hash: string, nEntries: number }> {
    let hash = '';
    let nEntries = 0;

    // Check if source zip file exists
    try {
        const stat = await vscode.workspace.fs.stat(srczip);
        if (stat.type !== vscode.FileType.File) {
            throw new Error(`${srczip.toString()} is not a file`);
        }
    }
    catch (error) {
        throw new Error(`Cannot find file ${srczip.toString()}`);
    }

    zipOptions?.reporter?.report(`Unzipping ${srczip.toString()} to ${destfolder.toString()}`);

    // Read the zip file contents
    const zipData = await vscode.workspace.fs.readFile(srczip);

    // Load the zip file using JSZip
    const zip = new JSZip();
    const zipContents = await zip.loadAsync(zipData);

    // Create destination directory if it doesn't exist
    try {
        await vscode.workspace.fs.createDirectory(destfolder);
    }
    catch (error) {
        // Directory might already exist, that's okay
    }

    let hasher: crypto.Hash | undefined;
    if (zipOptions?.calculateHash) {
        hasher = crypto.createHash('sha256');
    }

    // Process each file in the zip
    const filePromises: Promise<void>[] = [];

    zipContents.forEach((relativePath, zipEntry) => {
        if (!zipEntry.dir) {
            // It's a file
            const filePromise = (async () => {
                const fileUri = vscode.Uri.joinPath(destfolder, relativePath);
                const fileContent = await zipEntry.async('uint8array');

                // Create directory structure if needed
                const parentDir = vscode.Uri.joinPath(fileUri, '..');
                try {
                    await vscode.workspace.fs.createDirectory(parentDir);
                }
                catch (error) {
                    // Directory might already exist, that's okay
                }

                // Write the file
                await vscode.workspace.fs.writeFile(fileUri, fileContent);

                // Update hash if needed
                if (hasher) {
                    const textContent = Buffer.from(fileContent).toString('utf8');
                    const normalizedString = normalizeLineEndings(textContent);
                    hasher.update(normalizedString);
                }

                nEntries++;
            })();

            filePromises.push(filePromise);
        }
        else {
            // It's a directory
            const dirPromise = (async () => {
                const dirUri = vscode.Uri.joinPath(destfolder, relativePath);
                try {
                    await vscode.workspace.fs.createDirectory(dirUri);
                }
                catch (error) {
                    // Directory might already exist, that's okay
                }
                nEntries++;
            })();

            filePromises.push(dirPromise);
        }
    });

    // Wait for all files to be processed
    await Promise.all(filePromises);

    if (hasher) {
        hash = hasher.digest('base64');
    }

    return { hash, nEntries };
}

function normalizeLineEndings(text: string): string {
    // Replace all line endings so works with windows and linux
    const normalizedString = text.replace(/\r?\n|\n?\r|\r/g, '\n');
    return normalizedString;
}

async function getArrayOfFilesToIncludeFromGitIgnore(srcDir: vscode.Uri, zipOptions?: IZipOptions): Promise<string[]> {
    const fabricIgnoreFileName = '.fabricignore';
    const gitgnoreFileName = '.gitignore';
    let arrayFilesToInclude: string[] = [];

    if (zipOptions?.respectGitIgnoreFile) {
        // For now, we'll use the file system path for gitignore processing
        // This can be enhanced later to work fully with VSCode file system
        const srcDirPath = srcDir.fsPath;

        // we'll use a '.fabricignore' file to specify what to include in the zip. If it doesn't exist, we'll use the '.gitignore' file if it exists
        // that way the user can have different settings for FabricIgnore. The .gitignore semantics is slightly different how we're using it here
        // for example, nested .gitignore's will not be processed. Also, negated patterns are not supported
        const fabricIgnoreFullPathName = path.resolve(srcDirPath, fabricIgnoreFileName);
        let gitIgnoreFileFullPathName = path.resolve(srcDirPath, gitgnoreFileName);

        if (fs.existsSync(fabricIgnoreFullPathName)) {
            zipOptions?.reporter?.report(`Using .fabricignore file ${fabricIgnoreFullPathName}`);
            gitIgnoreFileFullPathName = fabricIgnoreFullPathName;
        }

        if (fs.existsSync(gitIgnoreFileFullPathName)) {
            zipOptions?.reporter?.report(`Reading gitignore file ${gitIgnoreFileFullPathName}`);
            let gitIgnoreLines = fs.readFileSync(gitIgnoreFileFullPathName).toString().split('\n').filter((line) => {
                // remove blank, comment and negation ('!**/packages/build/', '!*.[Cc]ache/')
                return line.trim().length > 0 && !line.startsWith('#') && !line.startsWith('!');
            });
            // convert the gitignore pattern to a minimatch pattern, removing cr/lf
            gitIgnoreLines = gitIgnoreLines.map(e => gitignoreToMinimatch(e.trim()));

            arrayFilesToInclude = glob.sync(
                '**/*.*',
                {
                    cwd: srcDirPath,
                    ignore: gitIgnoreLines,
                    dot: false, // whether to include files that start with '.' like .gitignore, but we want to exclude .vscode
                    posix: true, // whether, in the case of windows, to use / instead of \
                });
            // we want to include any .ignore files
            [fabricIgnoreFileName, gitgnoreFileName].forEach((file) => {
                if (fs.existsSync(path.resolve(srcDirPath, file))) {
                    arrayFilesToInclude.push(file);
                }
            });
            if (zipOptions?.debug) {
                console.log(`gitIgnoreLines.length = ${gitIgnoreLines.length}  arrayFilesToInclude.length = ${arrayFilesToInclude.length}`);
                arrayFilesToInclude.forEach((file) => {
                    console.log(`File to include ${file}`);
                });
            }
            //TODO: performance:  if we use a Set() and include the intermediate directories, then lookup will be faster
        }
    }
    return arrayFilesToInclude;
}

/**
 * Create a zip file from a directory. If the provided destdir is empty, will create a temp file name
 */
export async function createZipFile(
    destZipFile: vscode.Uri,
    srcDir: vscode.Uri,
    zipOptions?: IZipOptions
): Promise<{ zipFileName: vscode.Uri, hash: string, nEntries: number }> {
    let debugit = function (str: string) { };
    if (zipOptions?.debug) {
        debugit = function (str: string) {
            zipOptions?.reporter?.report(str);
        };
    }

    const zipCreate = new JSZip();
    let nEntriesAdded = 0;
    let hasher: crypto.Hash | undefined;
    let hash: string = '';
    if (zipOptions?.calculateHash || zipOptions?.calculateHashOnly) {
        hasher = crypto.createHash('sha256');
    }

    try {
        // Check if source directory exists
        try {
            const stat = await vscode.workspace.fs.stat(srcDir);
            if (stat.type !== vscode.FileType.Directory) {
                throw new Error(`srcdir is not a directory: ${srcDir.toString()}`);
            }
        }
        catch (error) {
            throw new Error(`srcdir does not exist: ${srcDir.toString()}`);
        }

        if (zipOptions?.calculateHashOnly) {
            console.log(`Calculating Hash Only  ${srcDir.toString()}`);
        }
        else {
            console.log(`Starting to zip ${srcDir.toString()} into ${destZipFile.toString()}`);
            zipOptions?.progress?.report({ increment: 10, message: 'Starting to Zip' });
        }

        // Process gitignore files if requested
        let arrayFilesToIncludeFromGitIgnore: string[] = await getArrayOfFilesToIncludeFromGitIgnore(srcDir, zipOptions);

        await addFolderToZip(zipCreate, srcDir, '');

        async function addFolderToZip(zip: JSZip, folderUri: vscode.Uri, relativePath: string) {
            const entries = await vscode.workspace.fs.readDirectory(folderUri);
            // Sort entries for consistent hash calculation
            entries.sort((a, b) => a[0].localeCompare(b[0]));

            for (const [fileName, fileType] of entries) {
                const fileUri = vscode.Uri.joinPath(folderUri, fileName);
                const currentRelativePath = relativePath ? `${relativePath}/${fileName}` : fileName;

                let includeit = false;
                // Check if file should be included based on gitignore rules
                if (arrayFilesToIncludeFromGitIgnore.length === 0) {
                    includeit = true;
                }
                else {
                    // find an entry in the arrayFilesToInclude that starts with the currentRelativePath
                    for (let i = 0; i < arrayFilesToIncludeFromGitIgnore.length; i++) {
                        // eslint-disable-next-line security/detect-object-injection
                        if (arrayFilesToIncludeFromGitIgnore[i].startsWith(currentRelativePath)) {
                            // eslint-disable-next-line security/detect-object-injection
                            if (arrayFilesToIncludeFromGitIgnore[i] === currentRelativePath) {
                                // remove it from the array
                                arrayFilesToIncludeFromGitIgnore.splice(i, 1);
                            }
                            includeit = true;
                            break;
                        }
                    }
                }

                if (includeit) {
                    includeit = false;
                    if (nEntriesAdded > 0 && nEntriesAdded % 1000 === 0) {
                        zipOptions?.progress?.report({ message: `zipping Entries = ${nEntriesAdded}` });
                    }

                    if (fileType === vscode.FileType.Directory) {
                        if (zipOptions?.filterFolder ? await zipOptions.filterFolder(srcDir, fileUri) : true) {
                            nEntriesAdded++;
                            const zf = zip.folder(fileName);
                            if (zf !== null) {
                                await addFolderToZip(zf, fileUri, currentRelativePath);
                            }
                        }
                    }
                    else if (fileType === vscode.FileType.File) {
                        let replWithEmpty = false;
                        if (zipOptions?.filterFile) {
                            const { include, replaceWithEmpty } = await zipOptions.filterFile(srcDir, currentRelativePath);
                            if (include) {
                                includeit = true;
                            }
                            replWithEmpty = replaceWithEmpty ? true : false;
                        }
                        else {
                            includeit = true;
                        }

                        if (includeit) {
                            nEntriesAdded++;
                            if (zipOptions?.calculateHash || zipOptions?.calculateHashOnly) {
                                let txt = '';
                                if (!replWithEmpty) {
                                    const fileContent = await vscode.workspace.fs.readFile(fileUri);
                                    txt = Buffer.from(fileContent).toString('utf8');
                                }
                                txt += currentRelativePath.replace(/\\/g, '/'); // Add relative path for hash consistency

                                const normalizedString = normalizeLineEndings(txt);
                                if (zipOptions?.debug) {
                                    let hasher2 = crypto.createHash('sha256');
                                    hasher2.update(normalizedString);
                                    const hash2 = hasher2.digest('base64');
                                    debugit(`Hashing ${fileUri.toString()} = ${hash2} replWithEmpty = ${replWithEmpty} len = ${normalizedString.length}`);
                                }
                                hasher?.update(normalizedString);
                            }

                            if (replWithEmpty) {
                                debugit(`Zeroing out file ${fileUri.toString()}`);
                                zip.file(fileName, '');
                            }
                            else {
                                const fileContent = await vscode.workspace.fs.readFile(fileUri);
                                zip.file(fileName, fileContent);
                            }
                        }
                    }
                }
            }
        }

        console.log(`Done collecting zip #Entries = ${nEntriesAdded}`);
        if (!zipOptions?.calculateHashOnly) {
            // Generate zip content
            const zipContent = await zipCreate.generateAsync({
                type: 'uint8array',
                compression: 'DEFLATE',
                compressionOptions: { level: 9 }
            });

            // Write zip file using VSCode file system
            await vscode.workspace.fs.writeFile(destZipFile, zipContent);
            console.log(`Done zip #Entries = ${nEntriesAdded}  ${destZipFile.toString()}`);
        }

        if (hasher) {
            hash = hasher.digest('base64');
            debugit(`${srcDir.toString()} Calculated Hash = '${hash}' #Entries = ${nEntriesAdded}`);
        }
    }
    catch (error) {
        debugit(`Error creating zip file ${destZipFile.toString()}  ${error}`);
        return Promise.reject(error);
    }

    return { zipFileName: destZipFile, hash: hash, nEntries: nEntriesAdded };
}


/**
https://github.com/humanwhocodes/gitignore-to-minimatch/blob/main/src/gitignore-to-minimatch.js 
* @fileoverview Utility to convert gitignore patterns to minimatch.
 * @author Nicholas C. Zakas
 */

/**
 * Converts a gitignore pattern to a minimatch pattern.
 * @param {string} pattern The gitignore pattern to convert. 
 * @returns {string} A minimatch pattern equivalent to `pattern`.
 */
export function gitignoreToMinimatch(pattern: string) {

    if (typeof pattern !== 'string') {
        throw new TypeError('Argument must be a string.');
    }

    // Special case: Empty string
    if (!pattern) {
        return pattern;
    }

    // strip off negation to make life easier
    const negated = pattern.startsWith('!');
    let patternToTest = negated ? pattern.slice(1) : pattern;
    let result = patternToTest;
    let leadingSlash = false;

    // strip off leading slash
    if (patternToTest[0] === '/') {
        leadingSlash = true;
        result = patternToTest.slice(1);
    }

    // For the most part, the first character determines what to do
    switch (result[0]) {

        case '*':
            if (patternToTest[1] !== '*') {
                result = '**/' + result;
            }
            break;

        default:
            if (!leadingSlash && !result.includes('/') || result.endsWith('/')) {
                result = '**/' + result;
            }

            // no further changes if the pattern ends with a wildcard
            if (result.endsWith('*') || result.endsWith('?')) {
                break;
            }

            // differentiate between filenames and directory names
            if (!/\.[a-z\d_-]+$/.test(result)) {
                if (!result.endsWith('/')) {
                    result += '/';
                }

                result += '**';
            }
    }

    return negated ? '!' + result : result;
}

export async function createTestZipFile(relativePath: string, descid: string): Promise<{ destZipFile: string, nEntriesAdded: number }> {
    let destdir: fs.PathLike = path.resolve(os.tmpdir(), `tempdir${descid}`);  // make dirs unique so tests can run in parallel
    if (!fs.existsSync(destdir)) {
        fs.mkdir(destdir, (p) => {
            console.log(p);
        });
    }
    else {
        await fse.emptyDir(destdir);
    }
    let srcdir: fs.PathLike = path.resolve(__dirname, relativePath);
    const destZipFile = destdir + '/MyZipFile.zip';

    // Convert to URIs for the new createZipFile signature
    const destZipFileUri = vscode.Uri.file(destZipFile);
    const srcdirUri = vscode.Uri.file(srcdir.toString());

    const resZip = await createZipFile(destZipFileUri, srcdirUri);
    return { destZipFile, nEntriesAdded: resZip.nEntries };
}