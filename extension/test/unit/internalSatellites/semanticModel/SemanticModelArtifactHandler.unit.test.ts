// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { SemanticModelArtifactHandler } from '../../../../src/internalSatellites/semanticModel/SemanticModelArtifactHandler';
import { IArtifact } from '@microsoft/vscode-fabric-api';

describe('SemanticModelArtifactHandler', function () {
    let handler: SemanticModelArtifactHandler;

    const artifact: IArtifact = {
        id: 'sm-1',
        type: 'SemanticModel',
        workspaceId: 'ws-1',
        displayName: 'Test Semantic Model',
        description: '',
        fabricEnvironment: 'prod' as any,
    };

    beforeEach(function () {
        handler = new SemanticModelArtifactHandler();
    });

    describe('updateDefinitionWorkflow', function () {
        it('should have prepareForUpdateWithDefinition method', function () {
            assert.ok(handler.updateDefinitionWorkflow, 'updateDefinitionWorkflow should exist');
            assert.ok(handler.updateDefinitionWorkflow.prepareForUpdateWithDefinition, 'prepareForUpdateWithDefinition should exist');
        });

        it('should exclude .abf files from update', async function () {
            // Create a temporary directory structure for testing
            const testFolder = vscode.Uri.file(path.join(os.tmpdir(), 'test-semantic-model-' + Date.now()));

            // Create test directory and files
            await vscode.workspace.fs.createDirectory(testFolder);
            await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(testFolder, 'model.tmdl'), Buffer.from('test content'));
            await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(testFolder, 'data.abf'), Buffer.from('large binary content'));
            await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(testFolder, 'metadata.json'), Buffer.from('{"test": true}'));
            await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(testFolder, '.platform'), Buffer.from('platform file'));

            try {
                const files = await handler.updateDefinitionWorkflow.prepareForUpdateWithDefinition!(artifact, testFolder);

                assert.ok(files, 'Should return file list');
                assert.ok(Array.isArray(files), 'Should return an array');

                // Should include non-.abf files
                assert.ok(files.includes('model.tmdl'), 'Should include model.tmdl');
                assert.ok(files.includes('metadata.json'), 'Should include metadata.json');

                // Should exclude .abf files
                assert.ok(!files.includes('data.abf'), 'Should exclude data.abf');

                // Should exclude .platform
                assert.ok(!files.includes('.platform'), 'Should exclude .platform');
            }
            finally {
                // Clean up
                try {
                    await vscode.workspace.fs.delete(testFolder, { recursive: true });
                }
                catch {
                    // Ignore cleanup errors
                }
            }
        });

        it('should exclude .abf files with different cases', async function () {
            const testFolder = vscode.Uri.file(path.join(os.tmpdir(), 'test-semantic-model-case-' + Date.now()));

            await vscode.workspace.fs.createDirectory(testFolder);
            await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(testFolder, 'data.ABF'), Buffer.from('content'));
            await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(testFolder, 'other.Abf'), Buffer.from('content'));
            await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(testFolder, 'valid.txt'), Buffer.from('content'));

            try {
                const files = await handler.updateDefinitionWorkflow.prepareForUpdateWithDefinition!(artifact, testFolder);

                assert.ok(files, 'Should return file list');
                assert.ok(files.includes('valid.txt'), 'Should include valid.txt');
                assert.ok(!files.includes('data.ABF'), 'Should exclude data.ABF');
                assert.ok(!files.includes('other.Abf'), 'Should exclude other.Abf');
            }
            finally {
                try {
                    await vscode.workspace.fs.delete(testFolder, { recursive: true });
                }
                catch {
                    // Ignore cleanup errors
                }
            }
        });

        it('should handle nested directories', async function () {
            const testFolder = vscode.Uri.file(path.join(os.tmpdir(), 'test-semantic-model-nested-' + Date.now()));

            await vscode.workspace.fs.createDirectory(testFolder);
            await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(testFolder, 'subfolder'));
            await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(testFolder, 'root.tmdl'), Buffer.from('content'));
            await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(testFolder, 'subfolder', 'nested.json'), Buffer.from('content'));
            await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(testFolder, 'subfolder', 'data.abf'), Buffer.from('content'));

            try {
                const files = await handler.updateDefinitionWorkflow.prepareForUpdateWithDefinition!(artifact, testFolder);

                assert.ok(files, 'Should return file list');
                assert.ok(files.includes('root.tmdl'), 'Should include root.tmdl');
                assert.ok(files.includes('subfolder/nested.json'), 'Should include subfolder/nested.json');
                assert.ok(!files.includes('subfolder/data.abf'), 'Should exclude subfolder/data.abf');
            }
            finally {
                try {
                    await vscode.workspace.fs.delete(testFolder, { recursive: true });
                }
                catch {
                    // Ignore cleanup errors
                }
            }
        });
    });

    describe('createWithDefinitionWorkflow', function () {
        it('should have prepareForCreateWithDefinition method', function () {
            assert.ok(handler.createWithDefinitionWorkflow, 'createWithDefinitionWorkflow should exist');
            assert.ok(handler.createWithDefinitionWorkflow.prepareForCreateWithDefinition, 'prepareForCreateWithDefinition should exist');
        });

        it('should exclude .abf files from create', async function () {
            const testFolder = vscode.Uri.file(path.join(os.tmpdir(), 'test-semantic-model-create-' + Date.now()));

            await vscode.workspace.fs.createDirectory(testFolder);
            await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(testFolder, 'model.tmdl'), Buffer.from('content'));
            await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(testFolder, 'cache.abf'), Buffer.from('content'));

            try {
                const files = await handler.createWithDefinitionWorkflow.prepareForCreateWithDefinition!(artifact, testFolder);

                assert.ok(files, 'Should return file list');
                assert.ok(files.includes('model.tmdl'), 'Should include model.tmdl');
                assert.ok(!files.includes('cache.abf'), 'Should exclude cache.abf');
            }
            finally {
                try {
                    await vscode.workspace.fs.delete(testFolder, { recursive: true });
                }
                catch {
                    // Ignore cleanup errors
                }
            }
        });
    });

    describe('artifactType', function () {
        it('should be SemanticModel', function () {
            assert.strictEqual(handler.artifactType, 'SemanticModel');
        });
    });
});
