// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/* eslint-disable security/detect-non-literal-fs-filename */
import * as assert from 'assert';

import * as Mocha from 'mocha';
import { MemoryFileSystem } from '@microsoft/vscode-fabric-util/src/MemoryFileSystem';

//import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as JSZip from 'jszip';
import { PathLike } from 'fs';
import { createZipFile } from '@microsoft/vscode-fabric-util';
import { getOrCreateEmptyTempFolder } from '../../utils';

describe('Zip Unit test', () => {
    it('should zip and unzip', async function () {
        this.timeout(1000000);
        let destdir = await getOrCreateEmptyTempFolder('tempdir');
        let srcdir: fs.PathLike = path.resolve(__dirname, '../../../src');
        const destZipFile = destdir + '/MyZipFile.zip';
        const zipResult = await createZipFile( vscode.Uri.file(destZipFile), vscode.Uri.file(srcdir));

        console.log(destZipFile + ' created.');

        // now unzip entire thing into another folder. validate # entries in zip
        let unziptargetfolder = await getOrCreateEmptyTempFolder('unziptarget');
        let nentriesRead = await unzipZipFileToFolder(destZipFile, unziptargetfolder);

        console.log(`${destZipFile} done reading ${nentriesRead} entries`);
        assert.strictEqual(nentriesRead, zipResult.nEntries);
    });

    it('should throw because invalid path to zip', async () => {
        let srcdir: fs.PathLike = path.resolve(__dirname, '../../../srcNonExistentFolder');
        const destZipFile = '/MyZipFile.zip';
        let errorMessage = '';
        try {
            const zipResult = await createZipFile(vscode.Uri.file(destZipFile), vscode.Uri.file(srcdir));
        }
        catch (error: any) {
            errorMessage = error.message;
        }
        assert.strictEqual(errorMessage.includes('does not exist'), true);
    });
});

export async function unzipZipFileToFolder(srczip: string, destfolder: string): Promise<number> {
    if (!fs.existsSync(srczip)) {
        throw new Error(`Cannot find file ${srczip}`);
    }
    const content = fs.readFileSync(srczip);
    const zip = await JSZip.loadAsync(content);
    let nentriesRead = 0;
    let keys = Object.keys(zip.files);
    for (const entryName of keys) {
        let dest = path.resolve(destfolder, entryName);
        // eslint-disable-next-line security/detect-object-injection
        let zEntry = zip.files[entryName]!;
        if (zEntry.dir) {
            fs.mkdirSync(dest, { recursive: true }); // like "bin/debug"
            nentriesRead++;
        }
        else {
            let cont = await zEntry.async('nodebuffer'); //.then(c => {
            let tempEntryName = entryName;
            let partial = '';
            while (true) { // need to make intermediate directories
                let ndxSep = tempEntryName.indexOf('/'); // path.sep == "\\", but the zip file it's "/""
                if (ndxSep < 0) {
                    break;
                }
                let dirname = path.resolve(destfolder, partial + tempEntryName.substring(0, ndxSep));
                if (fs.pathExistsSync(dirname)) {
                    fs.mkdirsSync(dirname);
                }
                partial = tempEntryName.substring(0, ndxSep + 1); // include sep
                tempEntryName = tempEntryName.substring(ndxSep + 1);
            }
            fs.writeFileSync(dest, cont);
            nentriesRead++;
        }
    }
    return nentriesRead;
}
