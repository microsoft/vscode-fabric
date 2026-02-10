// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';
import * as vscode from 'vscode';
import { Mock } from 'moq.ts';

import { showLocalFolderQuickPick } from '../../../src/ui/showLocalFolderQuickPick';
import { IWorkspace } from '@microsoft/vscode-fabric-api';
import { IGitOperator } from '../../../src/apis/internal/fabricExtensionInternal';

describe('showLocalFolderQuickPick', () => {
    it('always returns undefined (not supported in web)', async () => {
        const folderPath = vscode.Uri.file('/path/to/local/folder');
        const workspace = new Mock<IWorkspace>().object();
        const gitOperator = new Mock<IGitOperator>().object();

        const result = await showLocalFolderQuickPick(folderPath, workspace, gitOperator);

        assert.strictEqual(result, undefined);
    });
});
