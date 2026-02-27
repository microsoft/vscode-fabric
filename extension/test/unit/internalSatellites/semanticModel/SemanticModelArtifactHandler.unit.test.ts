// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';
import * as vscode from 'vscode';
import { Mock, It } from 'moq.ts';
import { SemanticModelArtifactHandler } from '../../../../src/internalSatellites/semanticModel/SemanticModelArtifactHandler';
import { IArtifact } from '@microsoft/vscode-fabric-api';

describe('SemanticModelArtifactHandler', function () {
    let handler: SemanticModelArtifactHandler;
    let fileSystemMock: Mock<vscode.FileSystem>;

    const artifact: IArtifact = {
        id: 'sm-1',
        type: 'SemanticModel',
        workspaceId: 'ws-1',
        displayName: 'Test Semantic Model',
        description: '',
        fabricEnvironment: 'prod' as any,
    };

    const rootUri = vscode.Uri.file('/test/semantic-model');

    beforeEach(function () {
        fileSystemMock = new Mock<vscode.FileSystem>();
        handler = new SemanticModelArtifactHandler(fileSystemMock.object());
    });

    describe('updateDefinitionWorkflow', function () {
        it('should have prepareForUpdateWithDefinition method', function () {
            assert.ok(handler.updateDefinitionWorkflow, 'updateDefinitionWorkflow should exist');
            assert.ok(handler.updateDefinitionWorkflow.prepareForUpdateWithDefinition, 'prepareForUpdateWithDefinition should exist');
        });

        it('should exclude .abf files from update', async function () {
            // Setup mock file system
            fileSystemMock
                .setup(fs => fs.readDirectory(rootUri))
                .returns(Promise.resolve([
                    ['model.tmdl', vscode.FileType.File],
                    ['data.abf', vscode.FileType.File],
                    ['metadata.json', vscode.FileType.File],
                    ['.platform', vscode.FileType.File],
                ]));

            const files = await handler.updateDefinitionWorkflow.prepareForUpdateWithDefinition!(artifact, rootUri);

            assert.ok(files, 'Should return file list');
            assert.ok(Array.isArray(files), 'Should return an array');

            // Should include non-.abf files
            assert.ok(files.includes('model.tmdl'), 'Should include model.tmdl');
            assert.ok(files.includes('metadata.json'), 'Should include metadata.json');

            // Should exclude .abf files
            assert.ok(!files.includes('data.abf'), 'Should exclude data.abf');

            // Should exclude .platform
            assert.ok(!files.includes('.platform'), 'Should exclude .platform');
        });

        it('should exclude .abf files with different cases', async function () {
            fileSystemMock
                .setup(fs => fs.readDirectory(rootUri))
                .returns(Promise.resolve([
                    ['data.ABF', vscode.FileType.File],
                    ['other.Abf', vscode.FileType.File],
                    ['valid.txt', vscode.FileType.File],
                ]));

            const files = await handler.updateDefinitionWorkflow.prepareForUpdateWithDefinition!(artifact, rootUri);

            assert.ok(files, 'Should return file list');
            assert.ok(files.includes('valid.txt'), 'Should include valid.txt');
            assert.ok(!files.includes('data.ABF'), 'Should exclude data.ABF');
            assert.ok(!files.includes('other.Abf'), 'Should exclude other.Abf');
        });

        it('should handle nested directories', async function () {
            fileSystemMock
                .setup(fs => fs.readDirectory(rootUri))
                .returns(Promise.resolve([
                    ['root.tmdl', vscode.FileType.File],
                    ['subfolder', vscode.FileType.Directory],
                ]));

            fileSystemMock
                .setup(fs => fs.readDirectory(It.Is<vscode.Uri>(u => u.fsPath.endsWith('subfolder'))))
                .returns(Promise.resolve([
                    ['nested.json', vscode.FileType.File],
                    ['data.abf', vscode.FileType.File],
                ]));

            const files = await handler.updateDefinitionWorkflow.prepareForUpdateWithDefinition!(artifact, rootUri);

            assert.ok(files, 'Should return file list');
            assert.ok(files.includes('root.tmdl'), 'Should include root.tmdl');
            assert.ok(files.includes('subfolder/nested.json'), 'Should include subfolder/nested.json');
            assert.ok(!files.includes('subfolder/data.abf'), 'Should exclude subfolder/data.abf');
        });

        it('should throw error with user-friendly message when directory read fails', async function () {
            const testError = new Error('Permission denied');
            fileSystemMock
                .setup(fs => fs.readDirectory(rootUri))
                .throws(testError);

            try {
                await handler.updateDefinitionWorkflow.prepareForUpdateWithDefinition!(artifact, rootUri);
                assert.fail('Should have thrown an error');
            }
            catch (error: any) {
                assert.ok(error.message.includes('Error gathering files'), 'Should have user-friendly error message');
                assert.ok(error.message.includes(rootUri.fsPath), 'Should include folder path in error');
            }
        });
    });

    describe('createWithDefinitionWorkflow', function () {
        it('should have prepareForCreateWithDefinition method', function () {
            assert.ok(handler.createWithDefinitionWorkflow, 'createWithDefinitionWorkflow should exist');
            assert.ok(handler.createWithDefinitionWorkflow.prepareForCreateWithDefinition, 'prepareForCreateWithDefinition should exist');
        });

        it('should exclude .abf files from create', async function () {
            fileSystemMock
                .setup(fs => fs.readDirectory(rootUri))
                .returns(Promise.resolve([
                    ['model.tmdl', vscode.FileType.File],
                    ['cache.abf', vscode.FileType.File],
                ]));

            const files = await handler.createWithDefinitionWorkflow.prepareForCreateWithDefinition!(artifact, rootUri);

            assert.ok(files, 'Should return file list');
            assert.ok(files.includes('model.tmdl'), 'Should include model.tmdl');
            assert.ok(!files.includes('cache.abf'), 'Should exclude cache.abf');
        });

        it('should throw error with user-friendly message when directory read fails', async function () {
            const testError = new Error('Access denied');
            fileSystemMock
                .setup(fs => fs.readDirectory(rootUri))
                .throws(testError);

            try {
                await handler.createWithDefinitionWorkflow.prepareForCreateWithDefinition!(artifact, rootUri);
                assert.fail('Should have thrown an error');
            }
            catch (error: any) {
                assert.ok(error.message.includes('Error gathering files'), 'Should have user-friendly error message');
                assert.ok(error.message.includes(rootUri.fsPath), 'Should include folder path in error');
            }
        });
    });

    describe('artifactType', function () {
        it('should be SemanticModel', function () {
            assert.strictEqual(handler.artifactType, 'SemanticModel');
        });
    });
});
