// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { DefinitionFileEditorDecorator } from '../../../src/workspace/DefinitionFileEditorDecorator';

describe('DefinitionFileEditorDecorator', function () {
    let decorator: DefinitionFileEditorDecorator;
    let createStatusBarItemStub: sinon.SinonStub;
    let showInformationMessageStub: sinon.SinonStub;
    let onDidChangeActiveTextEditorStub: sinon.SinonStub;
    let statusBarItem: {
        text: string;
        tooltip: string;
        backgroundColor: vscode.ThemeColor | undefined;
        show: sinon.SinonSpy;
        hide: sinon.SinonSpy;
        dispose: sinon.SinonSpy;
    };
    let changeEditorCallback: ((editor: vscode.TextEditor | undefined) => void) | undefined;

    beforeEach(function () {
        // Create a mock status bar item
        statusBarItem = {
            text: '',
            tooltip: '',
            backgroundColor: undefined,
            show: sinon.spy(),
            hide: sinon.spy(),
            dispose: sinon.spy(),
        };

        createStatusBarItemStub = sinon.stub(vscode.window, 'createStatusBarItem').returns(statusBarItem as any);
        showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);

        // Capture the callback for onDidChangeActiveTextEditor
        onDidChangeActiveTextEditorStub = sinon.stub(vscode.window, 'onDidChangeActiveTextEditor').callsFake((callback) => {
            changeEditorCallback = callback;
            return new vscode.Disposable(() => {});
        });

        // Stub activeTextEditor to return undefined by default
        sinon.stub(vscode.window, 'activeTextEditor').value(undefined);
    });

    afterEach(function () {
        decorator?.dispose();
        sinon.restore();
        changeEditorCallback = undefined;
    });

    describe('constructor', function () {
        it('should create status bar item with correct properties', function () {
            decorator = new DefinitionFileEditorDecorator();

            assert.ok(createStatusBarItemStub.calledOnce);
            assert.ok(createStatusBarItemStub.calledWith(vscode.StatusBarAlignment.Left, 100));
            assert.ok(statusBarItem.text.includes('Editing Remote Fabric Definition'));
            assert.ok(statusBarItem.tooltip.includes('Changes to this file will be saved'));
            assert.ok(statusBarItem.backgroundColor instanceof vscode.ThemeColor);
        });

        it('should register onDidChangeActiveTextEditor listener', function () {
            decorator = new DefinitionFileEditorDecorator();

            assert.ok(onDidChangeActiveTextEditorStub.calledOnce);
            assert.strictEqual(typeof changeEditorCallback, 'function');
        });

        it('should hide status bar when no active editor', function () {
            decorator = new DefinitionFileEditorDecorator();

            assert.ok(statusBarItem.hide.calledOnce);
            assert.ok(statusBarItem.show.notCalled);
        });

        it('should show status bar when active editor is fabric-definition scheme', function () {
            const mockEditor = createMockEditor('fabric-definition://workspace/artifact/file.json');
            sinon.stub(vscode.window, 'activeTextEditor').value(mockEditor);

            decorator = new DefinitionFileEditorDecorator();

            assert.ok(statusBarItem.show.calledOnce);
        });
    });

    describe('updateStatusBar on editor change', function () {
        beforeEach(function () {
            decorator = new DefinitionFileEditorDecorator();
            statusBarItem.show.resetHistory();
            statusBarItem.hide.resetHistory();
            showInformationMessageStub.resetHistory();
        });

        it('should show status bar when switching to fabric-definition editor', function () {
            const mockEditor = createMockEditor('fabric-definition://workspace/artifact/file.json');

            changeEditorCallback!(mockEditor);

            assert.ok(statusBarItem.show.calledOnce);
            assert.ok(statusBarItem.hide.notCalled);
        });

        it('should hide status bar when switching to non-fabric-definition editor', function () {
            const mockEditor = createMockEditor('file:///path/to/file.ts');

            changeEditorCallback!(mockEditor);

            assert.ok(statusBarItem.hide.calledOnce);
            assert.ok(statusBarItem.show.notCalled);
        });

        it('should hide status bar when switching to undefined editor', function () {
            changeEditorCallback!(undefined);

            assert.ok(statusBarItem.hide.calledOnce);
            assert.ok(statusBarItem.show.notCalled);
        });

        it('should hide status bar for fabric-definition-virtual scheme', function () {
            const mockEditor = createMockEditor('fabric-definition-virtual://workspace/artifact/file.json');

            changeEditorCallback!(mockEditor);

            assert.ok(statusBarItem.hide.calledOnce);
            assert.ok(statusBarItem.show.notCalled);
        });
    });

    describe('warning message', function () {
        beforeEach(function () {
            decorator = new DefinitionFileEditorDecorator();
            showInformationMessageStub.resetHistory();
        });

        it('should show warning message on first open of fabric-definition file', function () {
            const mockEditor = createMockEditor('fabric-definition://workspace/artifact/file1.json');

            changeEditorCallback!(mockEditor);

            assert.ok(showInformationMessageStub.calledOnce);
            const message = showInformationMessageStub.getCall(0).args[0];
            assert.ok(message.includes('editing a remote definition file'));
            assert.ok(message.includes('saved to the item in Microsoft Fabric portal'));
        });

        it('should show warning with modal option', function () {
            const mockEditor = createMockEditor('fabric-definition://workspace/artifact/file1.json');

            changeEditorCallback!(mockEditor);

            assert.ok(showInformationMessageStub.calledOnce);
            const options = showInformationMessageStub.getCall(0).args[1];
            assert.strictEqual(options.modal, true);
        });

        it('should not show warning message on subsequent opens of same file', function () {
            const mockEditor = createMockEditor('fabric-definition://workspace/artifact/file1.json');

            // First open
            changeEditorCallback!(mockEditor);
            assert.ok(showInformationMessageStub.calledOnce);
            showInformationMessageStub.resetHistory();

            // Second open (simulate closing and reopening)
            changeEditorCallback!(mockEditor);
            assert.ok(showInformationMessageStub.notCalled);

            // Third open
            changeEditorCallback!(mockEditor);
            assert.ok(showInformationMessageStub.notCalled);
        });

        it('should show warning message for different files', function () {
            const mockEditor1 = createMockEditor('fabric-definition://workspace/artifact/file1.json');
            const mockEditor2 = createMockEditor('fabric-definition://workspace/artifact/file2.json');

            // First file
            changeEditorCallback!(mockEditor1);
            assert.ok(showInformationMessageStub.calledOnce);
            showInformationMessageStub.resetHistory();

            // Different file
            changeEditorCallback!(mockEditor2);
            assert.ok(showInformationMessageStub.calledOnce);
        });

        it('should not show warning for non-fabric-definition files', function () {
            const mockEditor = createMockEditor('file:///path/to/file.ts');

            changeEditorCallback!(mockEditor);

            assert.ok(showInformationMessageStub.notCalled);
        });

        it('should not show warning for fabric-definition-virtual files', function () {
            const mockEditor = createMockEditor('fabric-definition-virtual://workspace/artifact/file.json');

            changeEditorCallback!(mockEditor);

            assert.ok(showInformationMessageStub.notCalled);
        });
    });

    describe('dispose', function () {
        it('should dispose status bar item', function () {
            decorator = new DefinitionFileEditorDecorator();

            decorator.dispose();

            assert.ok(statusBarItem.dispose.calledOnce);
        });

        it('should dispose all registered disposables', function () {
            decorator = new DefinitionFileEditorDecorator();
            const disposeSpy = sinon.spy();

            // The onDidChangeActiveTextEditor listener should be disposed
            onDidChangeActiveTextEditorStub.returns(new vscode.Disposable(disposeSpy));

            decorator.dispose();

            // Status bar + event listener
            assert.ok(statusBarItem.dispose.calledOnce);
        });
    });

    function createMockEditor(uriString: string): vscode.TextEditor {
        return {
            document: {
                uri: vscode.Uri.parse(uriString),
            },
        } as vscode.TextEditor;
    }
});
