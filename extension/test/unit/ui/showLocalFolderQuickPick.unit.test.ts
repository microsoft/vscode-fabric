// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { Mock, It, Times } from 'moq.ts';

import { showLocalFolderQuickPick } from '../../../src/ui/showLocalFolderQuickPick';
import { IWorkspace, ISourceControlInformation } from '@microsoft/vscode-fabric-api';
import { IGitOperator } from '../../../src/apis/internal/fabricExtensionInternal';

describe('showLocalFolderQuickPick', () => {
    let workspace: Mock<IWorkspace>;
    let gitOperatorMock: Mock<IGitOperator>;
    let showQuickPickStub: sinon.SinonStub;
    let showOpenDialogStub: sinon.SinonStub;

    const folderPath = vscode.Uri.file('/path/to/local/folder');

    beforeEach(() => {
        workspace = new Mock<IWorkspace>();
        gitOperatorMock = new Mock<IGitOperator>();

        workspace.setup(w => w.sourceControlInformation).returns(undefined);

        showQuickPickStub = sinon.stub(vscode.window, 'showQuickPick');
        showOpenDialogStub = sinon.stub(vscode.window, 'showOpenDialog');
    });

    afterEach(() => {
        sinon.restore();
    });

    it('returns the default folder when user selects it', async () => {
        // Arrange
        showQuickPickStub.callsFake((items: any[]) => {
            assert.equal(items.length, 2, 'Quick pick item count');
            return Promise.resolve(items[0]);
        });

        // Act
        const result = await act();

        // Assert
        assert.ok(result);
        assert.strictEqual(result.fsPath, folderPath.fsPath);
        assert.ok(showQuickPickStub.calledOnce, 'showQuickPick should be called');
        assert.ok(showOpenDialogStub.notCalled, 'showOpenDialog should not be called');
    });

    it('returns undefined if user cancels quick pick', async () => {
        // Arrange
        showQuickPickStub.resolves(undefined);

        // Act
        const result = await act();

        // Assert
        assert.strictEqual(result, undefined);
        assert.ok(showQuickPickStub.calledOnce, 'showQuickPick should be called');
    });

    it('returns a folder selected via Browse...', async () => {
        // Arrange
        const browseUri = vscode.Uri.file('/path/to/browsed/folder');

        showQuickPickStub.callsFake((items: any[]) => {
            assert.equal(items.length, 2, 'Quick pick item count');
            return Promise.resolve(items[1]);
        });

        showOpenDialogStub.callsFake((options? : vscode.OpenDialogOptions) => {
            assert.ok(options, 'showOpenDialog should be called with options');
            assert.ok(options.canSelectFolders, 'showOpenDialog should allow folder selection');
            assert.ok(!options.canSelectFiles, 'showOpenDialog should not allow file selection');
            assert.ok(!options.canSelectMany, 'showOpenDialog should not allow multiple selections');
            assert.strictEqual(options.openLabel, vscode.l10n.t('Select Folder'), 'Unexpected openLabel');
            return Promise.resolve([browseUri]);
        });

        // Act
        const result = await act();

        // Assert
        assert.ok(result);
        assert.strictEqual(result.fsPath, browseUri.fsPath);
        assert.ok(showQuickPickStub.calledOnce, 'showQuickPick should be called');
        assert.ok(showOpenDialogStub.calledOnce, 'showOpenDialog should be called');
    });

    it('returns undefined if user cancels Browse... dialog', async () => {
        // Arrange
        showQuickPickStub.callsFake((items: any[]) => {
            assert.equal(items.length, 2, 'Quick pick item count');
            return Promise.resolve(items[1]);
        });

        showOpenDialogStub.resolves(undefined);

        // Act
        const result = await act();

        // Assert
        assert.strictEqual(result, undefined);
        assert.ok(showQuickPickStub.calledOnce, 'showQuickPick should be called');
        assert.ok(showOpenDialogStub.calledOnce, 'showOpenDialog should be called');
    });

    describe('source control', () => {
        const browseUri = vscode.Uri.file('/path/to/clone/folder');
        const cloneUri = vscode.Uri.joinPath(browseUri, 'test-repo-url');
        let sourceControlInfoMock: Mock<ISourceControlInformation>;

        beforeEach(() => {
            sourceControlInfoMock = new Mock<ISourceControlInformation>();

            sourceControlInfoMock.setup(s => s.repository).returns('test-repo-url');
            sourceControlInfoMock.setup(s => s.branchName).returns('test-branch-name');

            workspace.setup(w => w.sourceControlInformation).returns(sourceControlInfoMock.object());

            gitOperatorMock.setup(g => g.cloneRepository(It.IsAny(), It.IsAny(), It.IsAny()))
                .returns(Promise.resolve(cloneUri));

            showQuickPickStub.callsFake((items: any[]) => {
                assert.equal(items.length, 3, 'Quick pick item count');
                return Promise.resolve(items[0]);
            });

            showOpenDialogStub.callsFake((options? : vscode.OpenDialogOptions) => {
                assert.ok(options, 'showOpenDialog should be called with options');
                assert.ok(options.canSelectFolders, 'showOpenDialog should allow folder selection');
                assert.ok(!options.canSelectFiles, 'showOpenDialog should not allow file selection');
                assert.ok(!options.canSelectMany, 'showOpenDialog should not allow multiple selections');
                assert.strictEqual(options.openLabel, vscode.l10n.t('Select a Repository Destination'), 'Unexpected openLabel');
                return Promise.resolve([browseUri]);
            });
        });

        [
            { directoryName: undefined },
            { directoryName: 'test/directory/name' },
        ].forEach(({ directoryName }) => {
            it(`clones to ${directoryName || 'default'} directory`, async () => {
                // Arrange
                let expectedCloneUri = cloneUri;
                if (directoryName) {
                    sourceControlInfoMock.setup(s => s.directoryName).returns(directoryName);
                    expectedCloneUri = vscode.Uri.joinPath(cloneUri, directoryName);
                }

                // Act
                const result = await act();

                // Assert
                assert.ok(result);
                assert.strictEqual(result.fsPath, expectedCloneUri.fsPath);
                assert.ok(showQuickPickStub.calledOnce, 'showQuickPick should be called');
                assert.ok(showOpenDialogStub.calledOnce, 'showOpenDialog should be called');
                gitOperatorMock.verify(g => g.cloneRepository('test-repo-url', browseUri, 'test-branch-name'), Times.Once());
            });
        });

        it('Cancel showOpenDialog', async () => {
            // Arrange
            showOpenDialogStub.resolves(undefined);

            // Act
            const result = await act();

            // Assert
            assert.strictEqual(result, undefined);
            assert.ok(showQuickPickStub.calledOnce, 'showQuickPick should be called');
            assert.ok(showOpenDialogStub.calledOnce, 'showOpenDialog should be called');
            gitOperatorMock.verify(g => g.cloneRepository(It.IsAny(), It.IsAny(), It.IsAny()), Times.Never());
        });

        it('cloneRepository returns undefined', async () => {
            // Arrange
            gitOperatorMock.setup(g => g.cloneRepository(It.IsAny(), It.IsAny(), It.IsAny()))
                .returns(Promise.resolve(undefined));

            // Act
            const result = await act();

            // Assert
            assert.strictEqual(result, undefined);
            assert.ok(showQuickPickStub.calledOnce, 'showQuickPick should be called');
            assert.ok(showOpenDialogStub, 'showOpenDialog should be called');
            gitOperatorMock.verify(g => g.cloneRepository(It.IsAny(), It.IsAny(), It.IsAny()), Times.Once());
        });
    });

    async function act(): Promise<vscode.Uri | undefined> {
        return showLocalFolderQuickPick(
            folderPath,
            workspace.object(),
            gitOperatorMock.object());
    }
});
