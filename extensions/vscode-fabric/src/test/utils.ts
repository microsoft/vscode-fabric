/* eslint-disable security/detect-non-literal-fs-filename */
import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';
import { createZipFile } from '@microsoft/vscode-fabric-util';

export function isRepoUser(): boolean {
    let isInuserlist = false;
    const userName = process.env['USERNAME'];
    let setUsers = ['calvinh', 'alpolava', 'mwade', 'kywhi', 'bebeckle']; // special users with longer timeouts (in case debugging)
    if (userName !== undefined && setUsers.includes(userName)) {
        isInuserlist = true;
    }
    return isInuserlist;
}

/** Get empty folder as subfolder of out
 *
*/
export async function getOrCreateEmptyTempFolder(name: string): Promise<string> {
    let destdir: fs.PathLike = path.resolve(__dirname, name);
    if (!fs.existsSync(destdir)) {
        fs.mkdir(destdir, (p) => {
            console.log(p);
        });
    }
    else {
        await fs.emptyDir(destdir);
    }
    return destdir;
}
