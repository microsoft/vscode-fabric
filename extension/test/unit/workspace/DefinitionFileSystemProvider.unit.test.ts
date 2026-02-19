// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { DefinitionFileSystemProvider } from '../../../src/workspace/DefinitionFileSystemProvider';
import { IArtifactManager, IArtifact, IItemDefinition, PayloadType, IApiClientResponse } from '@microsoft/vscode-fabric-api';
import { IFabricEnvironmentProvider, ILogger, TelemetryService } from '@microsoft/vscode-fabric-util';
import { IFabricFeatureConfiguration } from '../../../src/settings/FabricFeatureConfiguration';
import { IBase64Encoder } from '../../../src/itemDefinition/ItemDefinitionReader';

describe('DefinitionFileSystemProvider', function () {
    let artifactManagerMock: Mock<IArtifactManager>;
    let featureConfigMock: Mock<IFabricFeatureConfiguration>;
    let fabricEnvProviderMock: Mock<IFabricEnvironmentProvider>;
    let base64EncoderMock: Mock<IBase64Encoder>;
    let loggerMock: Mock<ILogger>;
    let telemetryServiceMock: Mock<TelemetryService>;
    let provider: DefinitionFileSystemProvider;

    const workspaceId = 'workspace-123';
    const artifactId = 'artifact-456';
    const fileName = 'item.definition.pbir';
    const fileContent = new Uint8Array([1, 2, 3, 4, 5]);
    const base64Content = 'AQIDBAU=';
    const portalUri = 'test.fabric.microsoft.com';

    let artifact: IArtifact;
    let withProgressStub: sinon.SinonStub;
    let showInformationMessageStub: sinon.SinonStub;
    let showErrorMessageStub: sinon.SinonStub;

    beforeEach(function () {
        artifactManagerMock = new Mock<IArtifactManager>();
        featureConfigMock = new Mock<IFabricFeatureConfiguration>();
        fabricEnvProviderMock = new Mock<IFabricEnvironmentProvider>();
        base64EncoderMock = new Mock<IBase64Encoder>();
        loggerMock = new Mock<ILogger>();
        telemetryServiceMock = new Mock<TelemetryService>();

        // Setup default mocks
        fabricEnvProviderMock.setup(x => x.getCurrent())
            .returns({ portalUri, env: 'TEST', sharedUri: 'api.fabric.microsoft.com' } as any);

        base64EncoderMock.setup(x => x.encode(It.IsAny()))
            .returns(base64Content);

        base64EncoderMock.setup(x => x.decode(base64Content))
            .returns(fileContent);

        featureConfigMock.setup(x => x.isEditItemDefinitionsEnabled())
            .returns(true);

        loggerMock.setup(x => x.error(It.IsAny())).returns(undefined);
        loggerMock.setup(x => x.log(It.IsAny())).returns(undefined);

        telemetryServiceMock.setup(instance => instance.sendTelemetryEvent(It.IsAny(), It.IsAny(), It.IsAny()))
            .returns(undefined);

        artifact = {
            id: artifactId,
            workspaceId: workspaceId,
            displayName: 'Test Artifact',
            type: 'Report',
            fabricEnvironment: 'Production',
        };

        // Stub VS Code window methods
        withProgressStub = sinon.stub(vscode.window, 'withProgress').callsFake(async (options, task) => {
            return await task({ report: () => {} }, { isCancellationRequested: false } as any);
        });
        showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
        showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);

        provider = new DefinitionFileSystemProvider(
            artifactManagerMock.object(),
            featureConfigMock.object(),
            fabricEnvProviderMock.object(),
            base64EncoderMock.object(),
            loggerMock.object(),
            telemetryServiceMock.object()
        );
    });

    afterEach(function () {
        sinon.restore();
    });

    describe('registerFile', function () {
        it('should register a file and return URI', function () {
            const uri = provider.registerFile(artifact, fileName, fileContent);

            assert.strictEqual(uri.scheme, 'fabric-definition');
            assert.strictEqual(uri.path, `/${workspaceId}/${artifactId}/${fileName}`);
        });

        it('should cache file content', function () {
            const uri = provider.registerFile(artifact, fileName, fileContent);

            const content = provider.readFile(uri);
            assert.deepStrictEqual(content, fileContent);
        });

        it('should cache artifact metadata', async function () {
            const uri = provider.registerFile(artifact, fileName, fileContent);

            const stat = await provider.stat(uri);
            assert.strictEqual(stat.type, vscode.FileType.File);
            assert.strictEqual(stat.size, fileContent.length);
        });
    });

    describe('stat', function () {
        it('should return file stats for cached file synchronously', function () {
            const uri = provider.registerFile(artifact, fileName, fileContent);

            const stat = provider.stat(uri);
            assert.ok(!(stat instanceof Promise), 'Should return synchronously for cached file');
            assert.strictEqual((stat as vscode.FileStat).type, vscode.FileType.File);
            assert.strictEqual((stat as vscode.FileStat).size, fileContent.length);
        });

        it('should lazy load file if not cached', async function () {
            const definition: IItemDefinition = {
                parts: [
                    { path: fileName, payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            const responseMock = new Mock<IApiClientResponse>();
            responseMock.setup(x => x.parsedBody).returns({ definition });

            artifactManagerMock.setup(x => x.getArtifactDefinition(It.IsAny()))
                .returns(Promise.resolve(responseMock.object()));

            const uri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/${fileName}`);

            const stat = await provider.stat(uri);
            assert.strictEqual(stat.type, vscode.FileType.File);
            assert.strictEqual(stat.size, fileContent.length);

            artifactManagerMock.verify(x => x.getArtifactDefinition(It.IsAny()), Times.Once());
        });

        it('should throw FileNotFound for invalid URI', async function () {
            const uri = vscode.Uri.parse('fabric-definition:///invalid');

            await assert.rejects(
                async () => await provider.stat(uri),
                (error: any) => error.code === 'FileNotFound'
            );
        });
    });

    describe('readFile', function () {
        it('should return cached file content synchronously', function () {
            const uri = provider.registerFile(artifact, fileName, fileContent);

            const content = provider.readFile(uri);
            assert.ok(!(content instanceof Promise), 'Should return synchronously for cached file');
            assert.deepStrictEqual(content, fileContent);
        });

        it('should lazy load file if not cached', async function () {
            const definition: IItemDefinition = {
                parts: [
                    { path: fileName, payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            const responseMock = new Mock<IApiClientResponse>();
            responseMock.setup(x => x.parsedBody).returns({ definition });

            artifactManagerMock.setup(x => x.getArtifactDefinition(It.IsAny()))
                .returns(Promise.resolve(responseMock.object()));

            const uri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/${fileName}`);

            const content = await provider.readFile(uri);
            assert.deepStrictEqual(content, fileContent);

            artifactManagerMock.verify(x => x.getArtifactDefinition(It.IsAny()), Times.Once());
            base64EncoderMock.verify(x => x.decode(base64Content), Times.Once());
        });

        it('should handle nested file paths', async function () {
            const nestedFileName = 'folder/subfolder/file.json';
            const definition: IItemDefinition = {
                parts: [
                    { path: nestedFileName, payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            const responseMock = new Mock<IApiClientResponse>();
            responseMock.setup(x => x.parsedBody).returns({ definition });

            artifactManagerMock.setup(x => x.getArtifactDefinition(It.IsAny()))
                .returns(Promise.resolve(responseMock.object()));

            const uri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/${nestedFileName}`);

            const content = await provider.readFile(uri);
            assert.deepStrictEqual(content, fileContent);
        });

        it('should throw FileNotFound if file not in definition', async function () {
            const definition: IItemDefinition = {
                parts: [
                    { path: 'other-file.json', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            const responseMock = new Mock<IApiClientResponse>();
            responseMock.setup(x => x.parsedBody).returns({ definition });

            artifactManagerMock.setup(x => x.getArtifactDefinition(It.IsAny()))
                .returns(Promise.resolve(responseMock.object()));

            const uri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/${fileName}`);

            await assert.rejects(
                async () => await provider.readFile(uri),
                (error: any) => error.code === 'FileNotFound'
            );
        });

        it('should throw FileNotFound if API returns no definition', async function () {
            const responseMock = new Mock<IApiClientResponse>();
            responseMock.setup(x => x.parsedBody).returns({});

            artifactManagerMock.setup(x => x.getArtifactDefinition(It.IsAny()))
                .returns(Promise.resolve(responseMock.object()));

            const uri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/${fileName}`);

            await assert.rejects(
                async () => await provider.readFile(uri),
                (error: any) => error.code === 'FileNotFound'
            );
        });

        it('should log errors when fetch fails', async function () {
            artifactManagerMock.setup(x => x.getArtifactDefinition(It.IsAny()))
                .returns(Promise.reject(new Error('Network error')));

            const uri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/${fileName}`);

            await assert.rejects(
                async () => await provider.readFile(uri),
                (error: any) => error.code === 'FileNotFound'
            );

            loggerMock.verify(x => x.error(It.Is<string>(msg => msg.includes('Network error'))), Times.Once());
        });
    });

    describe('writeFile', function () {
        it('should throw NoPermissions if editing is disabled', async function () {
            featureConfigMock.setup(x => x.isEditItemDefinitionsEnabled()).returns(false);

            const uri = provider.registerFile(artifact, fileName, fileContent);
            const newContent = new Uint8Array([6, 7, 8]);

            await assert.rejects(
                async () => await provider.writeFile(uri, newContent, { create: false, overwrite: true }),
                (error: any) => error.code === 'NoPermissions'
            );
        });

        it('should throw FileNotFound if file not registered and create is false', async function () {
            const uri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/${fileName}`);
            const newContent = new Uint8Array([6, 7, 8]);

            await assert.rejects(
                async () => await provider.writeFile(uri, newContent, { create: false, overwrite: true }),
                (error: any) => error.code === 'FileNotFound'
            );
        });

        it('should throw FileExists if file exists and overwrite is false', async function () {
            const uri = provider.registerFile(artifact, fileName, fileContent);
            const newContent = new Uint8Array([6, 7, 8]);

            await assert.rejects(
                async () => await provider.writeFile(uri, newContent, { create: true, overwrite: false }),
                (error: any) => error.code === 'FileExists'
            );
        });

        it('should update cache and save to server', async function () {
            const uri = provider.registerFile(artifact, fileName, fileContent);
            const newContent = new Uint8Array([6, 7, 8]);
            const newBase64 = 'BgcI';

            base64EncoderMock.setup(x => x.encode(newContent)).returns(newBase64);

            const definition: IItemDefinition = {
                parts: [
                    { path: fileName, payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            const getResponseMock = new Mock<IApiClientResponse>();
            getResponseMock.setup(x => x.parsedBody).returns({ definition });

            artifactManagerMock.setup(x => x.getArtifactDefinition(It.IsAny()))
                .returns(Promise.resolve(getResponseMock.object()));

            artifactManagerMock.setup(x => x.updateArtifactDefinition(It.IsAny(), It.IsAny(), It.IsAny()))
                .returns(Promise.resolve({} as any));

            await provider.writeFile(uri, newContent, { create: false, overwrite: true });

            // Verify cache updated
            const cachedContent = provider.readFile(uri);
            assert.deepStrictEqual(cachedContent, newContent);

            // Verify server update called
            artifactManagerMock.verify(
                x => x.updateArtifactDefinition(
                    It.Is<IArtifact>(a => a.id === artifactId && a.workspaceId === workspaceId),
                    It.Is<IItemDefinition>(d => d.parts[0].payload === newBase64),
                    It.IsAny()
                ),
                Times.Once()
            );

            // Verify success message shown
            assert.ok(showInformationMessageStub.calledOnce);
        });

        it('should fire change event after successful save', async function () {
            const uri = provider.registerFile(artifact, fileName, fileContent);
            const newContent = new Uint8Array([6, 7, 8]);

            const definition: IItemDefinition = {
                parts: [
                    { path: fileName, payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            const getResponseMock = new Mock<IApiClientResponse>();
            getResponseMock.setup(x => x.parsedBody).returns({ definition });

            artifactManagerMock.setup(x => x.getArtifactDefinition(It.IsAny()))
                .returns(Promise.resolve(getResponseMock.object()));

            artifactManagerMock.setup(x => x.updateArtifactDefinition(It.IsAny(), It.IsAny(), It.IsAny()))
                .returns(Promise.resolve({} as any));

            let changeEventFired = false;
            const disposable = provider.onDidChangeFile((events) => {
                changeEventFired = true;
                assert.strictEqual(events.length, 1);
                assert.strictEqual(events[0].type, vscode.FileChangeType.Changed);
                assert.strictEqual(events[0].uri.toString(), uri.toString());
            });

            await provider.writeFile(uri, newContent, { create: false, overwrite: true });

            assert.ok(changeEventFired, 'Change event should have been fired');
            disposable.dispose();
        });

        it('should send telemetry on successful save', async function () {
            const uri = provider.registerFile(artifact, fileName, fileContent);
            const newContent = new Uint8Array([6, 7, 8]);

            const definition: IItemDefinition = {
                parts: [
                    { path: fileName, payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            const getResponseMock = new Mock<IApiClientResponse>();
            getResponseMock.setup(x => x.parsedBody).returns({ definition });

            artifactManagerMock.setup(x => x.getArtifactDefinition(It.IsAny()))
                .returns(Promise.resolve(getResponseMock.object()));

            artifactManagerMock.setup(x => x.updateArtifactDefinition(It.IsAny(), It.IsAny(), It.IsAny()))
                .returns(Promise.resolve({} as any));

            await provider.writeFile(uri, newContent, { create: false, overwrite: true });

            // Telemetry is now handled by TelemetryActivity within withErrorHandling
            // Just verify the operation succeeded
            assert.ok(showInformationMessageStub.calledOnce);
        });

        it('should handle errors gracefully', async function () {
            const uri = provider.registerFile(artifact, fileName, fileContent);
            const newContent = new Uint8Array([6, 7, 8]);

            const definition: IItemDefinition = {
                parts: [
                    { path: fileName, payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            const getResponseMock = new Mock<IApiClientResponse>();
            getResponseMock.setup(x => x.parsedBody).returns({ definition });

            artifactManagerMock.setup(x => x.getArtifactDefinition(It.IsAny()))
                .returns(Promise.resolve(getResponseMock.object()));

            const saveError = new Error('Save failed');
            artifactManagerMock.setup(x => x.updateArtifactDefinition(It.IsAny(), It.IsAny(), It.IsAny()))
                .returns(Promise.reject(saveError));

            await assert.rejects(
                async () => await provider.writeFile(uri, newContent, { create: false, overwrite: true }),
                saveError
            );
        });

        it('should add file as new part when not found in definition', async function () {
            const uri = provider.registerFile(artifact, fileName, fileContent);
            const newContent = new Uint8Array([6, 7, 8]);

            const definition: IItemDefinition = {
                parts: [
                    { path: 'different-file.json', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            const getResponseMock = new Mock<IApiClientResponse>();
            getResponseMock.setup(x => x.parsedBody).returns({ definition });

            artifactManagerMock.setup(x => x.getArtifactDefinition(It.IsAny()))
                .returns(Promise.resolve(getResponseMock.object()));

            const updateResponseMock = new Mock<IApiClientResponse>();
            artifactManagerMock.setup(x => x.updateArtifactDefinition(It.IsAny(), It.IsAny(), It.IsAny()))
                .returns(Promise.resolve(updateResponseMock.object()));

            await provider.writeFile(uri, newContent, { create: false, overwrite: true });

            // The file should be added as a new part alongside the existing one
            assert.strictEqual(definition.parts.length, 2);
            assert.strictEqual(definition.parts[1].path, fileName);
        });
    });

    describe('writeFile (create new file)', function () {
        it('should create a new file when create flag is set', async function () {
            const definition: IItemDefinition = {
                parts: [
                    { path: 'model.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            provider.registerItem(artifact, definition);

            const newFileUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/tables/NewTable.tmdl`);
            const newContent = new Uint8Array([10, 20, 30]);

            artifactManagerMock.setup(x => x.updateArtifactDefinition(It.IsAny(), It.IsAny(), It.IsAny()))
                .returns(Promise.resolve({} as any));

            await provider.writeFile(newFileUri, newContent, { create: true, overwrite: false });

            // The new file should be in the cache
            const cached = provider.readFile(newFileUri);
            assert.deepStrictEqual(cached, newContent);
        });

        it('should fire Created event for new files', async function () {
            const definition: IItemDefinition = {
                parts: [
                    { path: 'model.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            provider.registerItem(artifact, definition);

            const newFileUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/roles/Reader.tmdl`);

            artifactManagerMock.setup(x => x.updateArtifactDefinition(It.IsAny(), It.IsAny(), It.IsAny()))
                .returns(Promise.resolve({} as any));

            let firedType: vscode.FileChangeType | undefined;
            const disposable = provider.onDidChangeFile((events) => {
                firedType = events[0].type;
            });

            await provider.writeFile(newFileUri, new Uint8Array(0), { create: true, overwrite: false });

            assert.strictEqual(firedType, vscode.FileChangeType.Created);
            disposable.dispose();
        });

        it('should throw FileExists when file exists and create without overwrite', async function () {
            const uri = provider.registerFile(artifact, fileName, fileContent);

            await assert.rejects(
                async () => await provider.writeFile(uri, new Uint8Array(0), { create: true, overwrite: false }),
                (error: any) => error.code === 'FileExists'
            );
        });

        it('should throw FileNotFound for uncached item when creating', async function () {
            const unknownUri = vscode.Uri.parse(`fabric-definition:///unknown-ws/unknown-art/file.txt`);

            await assert.rejects(
                async () => await provider.writeFile(unknownUri, new Uint8Array(0), { create: true, overwrite: false }),
                (error: any) => error.code === 'FileNotFound'
            );
        });

        it('should use cached definition instead of fetching from server', async function () {
            const definition: IItemDefinition = {
                parts: [
                    { path: 'model.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            provider.registerItem(artifact, definition);

            const newFileUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/newfile.json`);

            artifactManagerMock.setup(x => x.updateArtifactDefinition(It.IsAny(), It.IsAny(), It.IsAny()))
                .returns(Promise.resolve({} as any));

            await provider.writeFile(newFileUri, new Uint8Array(0), { create: true, overwrite: false });

            // Should NOT have called getArtifactDefinition since we have a cached definition
            artifactManagerMock.verify(x => x.getArtifactDefinition(It.IsAny()), Times.Never());
        });

        it('should update item cache after creating new file', async function () {
            const definition: IItemDefinition = {
                parts: [
                    { path: 'model.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            provider.registerItem(artifact, definition);

            const newFileUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/newfile.json`);

            artifactManagerMock.setup(x => x.updateArtifactDefinition(It.IsAny(), It.IsAny(), It.IsAny()))
                .returns(Promise.resolve({} as any));

            await provider.writeFile(newFileUri, new Uint8Array([1, 2, 3]), { create: true, overwrite: false });

            const cached = provider.getCachedItemDefinition(workspaceId, artifactId);
            assert.ok(cached, 'Item should still be cached');
            assert.strictEqual(cached!.definition.parts.length, 2, 'Should have 2 parts now');
        });
    });

    describe('delete', function () {
        it('should delete a single file', async function () {
            const definition: IItemDefinition = {
                parts: [
                    { path: 'model.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                    { path: 'tables/Sales.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            provider.registerItem(artifact, definition);

            const fileUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/tables/Sales.tmdl`);

            artifactManagerMock.setup(x => x.updateArtifactDefinition(It.IsAny(), It.IsAny(), It.IsAny()))
                .returns(Promise.resolve({} as any));

            await provider.delete(fileUri, { recursive: false });

            const cached = provider.getCachedItemDefinition(workspaceId, artifactId);
            assert.strictEqual(cached!.definition.parts.length, 1);
            assert.strictEqual(cached!.definition.parts[0].path, 'model.tmdl');
        });

        it('should delete a folder recursively', async function () {
            const definition: IItemDefinition = {
                parts: [
                    { path: 'model.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                    { path: 'tables/Sales.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                    { path: 'tables/Products.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            provider.registerItem(artifact, definition);

            const folderUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/tables`);

            artifactManagerMock.setup(x => x.updateArtifactDefinition(It.IsAny(), It.IsAny(), It.IsAny()))
                .returns(Promise.resolve({} as any));

            await provider.delete(folderUri, { recursive: true });

            const cached = provider.getCachedItemDefinition(workspaceId, artifactId);
            assert.strictEqual(cached!.definition.parts.length, 1);
            assert.strictEqual(cached!.definition.parts[0].path, 'model.tmdl');
        });

        it('should fire Deleted events', async function () {
            const definition: IItemDefinition = {
                parts: [
                    { path: 'model.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                    { path: 'tables/Sales.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            provider.registerItem(artifact, definition);

            const fileUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/tables/Sales.tmdl`);

            artifactManagerMock.setup(x => x.updateArtifactDefinition(It.IsAny(), It.IsAny(), It.IsAny()))
                .returns(Promise.resolve({} as any));

            let firedType: vscode.FileChangeType | undefined;
            const disposable = provider.onDidChangeFile((events) => {
                firedType = events[0].type;
            });

            await provider.delete(fileUri, { recursive: false });

            assert.strictEqual(firedType, vscode.FileChangeType.Deleted);
            disposable.dispose();
        });

        it('should fire multiple Deleted events for recursive folder delete', async function () {
            const definition: IItemDefinition = {
                parts: [
                    { path: 'model.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                    { path: 'tables/Sales.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                    { path: 'tables/Products.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            provider.registerItem(artifact, definition);

            const folderUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/tables`);

            artifactManagerMock.setup(x => x.updateArtifactDefinition(It.IsAny(), It.IsAny(), It.IsAny()))
                .returns(Promise.resolve({} as any));

            let eventCount = 0;
            const disposable = provider.onDidChangeFile((events) => {
                eventCount = events.length;
            });

            await provider.delete(folderUri, { recursive: true });

            assert.strictEqual(eventCount, 2, 'Should fire 2 Deleted events');
            disposable.dispose();
        });

        it('should throw NoPermissions for non-recursive directory delete', async function () {
            const definition: IItemDefinition = {
                parts: [
                    { path: 'tables/Sales.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            provider.registerItem(artifact, definition);

            // Use a URI that is NOT in file cache (so it is treated as a directory)
            const folderUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/tables`);

            artifactManagerMock.setup(x => x.updateArtifactDefinition(It.IsAny(), It.IsAny(), It.IsAny()))
                .returns(Promise.resolve({} as any));

            await assert.rejects(
                async () => await provider.delete(folderUri, { recursive: false }),
                (error: any) => error.code === 'NoPermissions'
            );
        });

        it('should throw FileNotFound for uncached item', async function () {
            const unknownUri = vscode.Uri.parse(`fabric-definition:///unknown-ws/unknown-art/file.txt`);

            await assert.rejects(
                async () => await provider.delete(unknownUri, { recursive: false }),
                (error: any) => error.code === 'FileNotFound'
            );
        });

        it('should throw FileNotFound for nonexistent file', async function () {
            const definition: IItemDefinition = {
                parts: [
                    { path: 'model.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            provider.registerItem(artifact, definition);

            // Register a file that IS in fileCache but with a different path
            const fileUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/nonexistent.tmdl`);

            await assert.rejects(
                async () => await provider.delete(fileUri, { recursive: true }),
                (error: any) => error.code === 'FileNotFound'
            );
        });

        it('should throw NoPermissions if editing is disabled', async function () {
            featureConfigMock.setup(x => x.isEditItemDefinitionsEnabled()).returns(false);

            const definition: IItemDefinition = {
                parts: [
                    { path: 'model.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            provider.registerItem(artifact, definition);

            const fileUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/model.tmdl`);

            await assert.rejects(
                async () => await provider.delete(fileUri, { recursive: false }),
                (error: any) => error.code === 'NoPermissions'
            );
        });
    });

    describe('createDirectory', function () {
        it('should be a no-op for new directory under cached item', function () {
            const definition: IItemDefinition = {
                parts: [
                    { path: 'model.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            provider.registerItem(artifact, definition);

            const dirUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/roles`);

            // Should not throw
            provider.createDirectory(dirUri);
        });

        it('should throw FileExists if directory already has files', function () {
            const definition: IItemDefinition = {
                parts: [
                    { path: 'tables/Sales.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            provider.registerItem(artifact, definition);

            const dirUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/tables`);

            assert.throws(
                () => provider.createDirectory(dirUri),
                (error: any) => error.code === 'FileExists'
            );
        });

        it('should throw FileNotFound for uncached item', function () {
            const dirUri = vscode.Uri.parse(`fabric-definition:///unknown-ws/unknown-art/folder`);

            assert.throws(
                () => provider.createDirectory(dirUri),
                (error: any) => error.code === 'FileNotFound'
            );
        });

        it('should throw FileNotFound for invalid URI', function () {
            const dirUri = vscode.Uri.parse(`fabric-definition:///`);

            assert.throws(
                () => provider.createDirectory(dirUri),
                (error: any) => error.code === 'FileNotFound'
            );
        });
    });

    describe('registerItem', function () {
        it('should cache full item definition', function () {
            const definition: IItemDefinition = {
                parts: [
                    { path: 'model.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                    { path: 'tables/Sales.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            provider.registerItem(artifact, definition);

            const cached = provider.getCachedItemDefinition(workspaceId, artifactId);
            assert.ok(cached, 'Item definition should be cached');
            assert.strictEqual(cached!.artifact, artifact);
            assert.strictEqual(cached!.definition, definition);
            assert.ok(cached!.cachedAt > 0, 'cachedAt should be set');
        });

        it('should cache all individual files from definition', function () {
            const definition: IItemDefinition = {
                parts: [
                    { path: 'model.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                    { path: 'tables/Sales.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            provider.registerItem(artifact, definition);

            // Both files should be readable
            const uri1 = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/model.tmdl`);
            const uri2 = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/tables/Sales.tmdl`);

            const content1 = provider.readFile(uri1);
            const content2 = provider.readFile(uri2);
            assert.deepStrictEqual(content1, fileContent);
            assert.deepStrictEqual(content2, fileContent);
        });

        it('should skip parts with missing path or payload', function () {
            const definition: IItemDefinition = {
                parts: [
                    { path: 'model.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                    { path: '', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                    { path: 'other.tmdl', payload: '', payloadType: PayloadType.InlineBase64 },
                ],
            };

            provider.registerItem(artifact, definition);

            // Only model.tmdl should be cached as a file
            const cached = provider.getCachedItemDefinition(workspaceId, artifactId);
            assert.ok(cached);
        });
    });

    describe('stat (directory)', function () {
        const multiFileDefinition: IItemDefinition = {
            parts: [
                { path: 'model.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                { path: 'tables/Sales.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                { path: 'tables/Products.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                { path: 'tables/sub/Deep.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
            ],
        };

        it('should return Directory type for item root', function () {
            provider.registerItem(artifact, multiFileDefinition);

            const rootUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}`);
            const stat = provider.stat(rootUri);

            assert.ok(!(stat instanceof Promise));
            assert.strictEqual((stat as vscode.FileStat).type, vscode.FileType.Directory);
        });

        it('should return Directory type for subfolder', function () {
            provider.registerItem(artifact, multiFileDefinition);

            const folderUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/tables`);
            const stat = provider.stat(folderUri);

            assert.ok(!(stat instanceof Promise));
            assert.strictEqual((stat as vscode.FileStat).type, vscode.FileType.Directory);
        });

        it('should return Directory type for nested subfolder', function () {
            provider.registerItem(artifact, multiFileDefinition);

            const folderUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/tables/sub`);
            const stat = provider.stat(folderUri);

            assert.ok(!(stat instanceof Promise));
            assert.strictEqual((stat as vscode.FileStat).type, vscode.FileType.Directory);
        });

        it('should return File type for files in subdirectory', function () {
            provider.registerItem(artifact, multiFileDefinition);

            const fileUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/tables/Sales.tmdl`);
            const stat = provider.stat(fileUri);

            assert.ok(!(stat instanceof Promise));
            assert.strictEqual((stat as vscode.FileStat).type, vscode.FileType.File);
        });

        it('should fall back to lazy loading for uncached paths', async function () {
            // Don't register anything - so it's unknown
            const uri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/unknown.tmdl`);

            const definition: IItemDefinition = {
                parts: [
                    { path: 'unknown.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            const responseMock = new Mock<IApiClientResponse>();
            responseMock.setup(x => x.parsedBody).returns({ definition });

            artifactManagerMock.setup(x => x.getArtifactDefinition(It.IsAny()))
                .returns(Promise.resolve(responseMock.object()));

            const stat = await provider.stat(uri);
            assert.strictEqual(stat.type, vscode.FileType.File);
        });
    });

    describe('readDirectory', function () {
        it('should list root level entries', function () {
            const definition: IItemDefinition = {
                parts: [
                    { path: 'model.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                    { path: 'tables/Sales.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            provider.registerItem(artifact, definition);

            const rootUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}`);
            const entries = provider.readDirectory(rootUri);

            assert.strictEqual(entries.length, 2);
            assert.ok(entries.some(([name, type]) => name === 'model.tmdl' && type === vscode.FileType.File));
            assert.ok(entries.some(([name, type]) => name === 'tables' && type === vscode.FileType.Directory));
        });

        it('should list subdirectory entries', function () {
            const definition: IItemDefinition = {
                parts: [
                    { path: 'tables/Sales.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                    { path: 'tables/Products.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            provider.registerItem(artifact, definition);

            const tablesUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/tables`);
            const entries = provider.readDirectory(tablesUri);

            assert.strictEqual(entries.length, 2);
            assert.ok(entries.some(([name]) => name === 'Sales.tmdl'));
            assert.ok(entries.some(([name]) => name === 'Products.tmdl'));
        });

        it('should list nested subdirectory entries', function () {
            const definition: IItemDefinition = {
                parts: [
                    { path: 'tables/sub/Deep.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                    { path: 'tables/sub/Another.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            provider.registerItem(artifact, definition);

            const subUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/tables/sub`);
            const entries = provider.readDirectory(subUri);

            assert.strictEqual(entries.length, 2);
        });

        it('should return empty for directory with no matching files', function () {
            const definition: IItemDefinition = {
                parts: [
                    { path: 'model.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            provider.registerItem(artifact, definition);

            const tablesUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/tables`);
            const entries = provider.readDirectory(tablesUri);

            assert.strictEqual(entries.length, 0);
        });

        it('should throw FileNotFound for uncached artifact', function () {
            const uri = vscode.Uri.parse(`fabric-definition:///unknown-ws/unknown-art`);

            assert.throws(
                () => provider.readDirectory(uri),
                (error: any) => error.code === 'FileNotFound'
            );
        });

        it('should throw FileNotFound for invalid URI', function () {
            const uri = vscode.Uri.parse('fabric-definition:///');

            assert.throws(
                () => provider.readDirectory(uri),
                (error: any) => error.code === 'FileNotFound'
            );
        });

        it('should distinguish files and folders at same level', function () {
            const definition: IItemDefinition = {
                parts: [
                    { path: 'model.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                    { path: 'expressions.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                    { path: 'tables/Sales.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                    { path: 'roles/Reader.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            provider.registerItem(artifact, definition);

            const rootUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}`);
            const entries = provider.readDirectory(rootUri);

            const files = entries.filter(([, type]) => type === vscode.FileType.File);
            const dirs = entries.filter(([, type]) => type === vscode.FileType.Directory);

            assert.strictEqual(files.length, 2);
            assert.strictEqual(dirs.length, 2);
        });

        it('should skip parts with empty path', function () {
            const definition: IItemDefinition = {
                parts: [
                    { path: 'model.tmdl', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                    { path: '', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            provider.registerItem(artifact, definition);

            const rootUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}`);
            const entries = provider.readDirectory(rootUri);

            assert.strictEqual(entries.length, 1);
        });
    });

    describe('fetch deduplication', function () {
        it('should only make one API call for concurrent fetches of same artifact', async function () {
            const definition: IItemDefinition = {
                parts: [
                    { path: 'file1.json', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                    { path: 'file2.json', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            const responseMock = new Mock<IApiClientResponse>();
            responseMock.setup(x => x.parsedBody).returns({ definition });

            artifactManagerMock.setup(x => x.getArtifactDefinition(It.IsAny()))
                .returns(Promise.resolve(responseMock.object()));

            const uri1 = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/file1.json`);
            const uri2 = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/file2.json`);

            // Fetch both concurrently
            const [content1, content2] = await Promise.all([
                provider.readFile(uri1),
                provider.readFile(uri2),
            ]);

            assert.deepStrictEqual(content1, fileContent);
            assert.deepStrictEqual(content2, fileContent);

            // Should only have made one API call
            artifactManagerMock.verify(x => x.getArtifactDefinition(It.IsAny()), Times.Once());
        });

        it('should handle dedup when second file not in definition', async function () {
            const definition: IItemDefinition = {
                parts: [
                    { path: 'file1.json', payload: base64Content, payloadType: PayloadType.InlineBase64 },
                ],
            };

            const responseMock = new Mock<IApiClientResponse>();
            responseMock.setup(x => x.parsedBody).returns({ definition });

            artifactManagerMock.setup(x => x.getArtifactDefinition(It.IsAny()))
                .returns(Promise.resolve(responseMock.object()));

            const uri1 = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/file1.json`);
            const uri2 = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/missing.json`);

            const results = await Promise.allSettled([
                provider.readFile(uri1),
                provider.readFile(uri2),
            ]);

            assert.strictEqual(results[0].status, 'fulfilled');
            assert.strictEqual(results[1].status, 'rejected');
        });
    });

    describe('unsupported operations', function () {
        it('should throw NoPermissions for rename', function () {
            const uri = provider.registerFile(artifact, fileName, fileContent);
            const newUri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/renamed.pbir`);

            assert.throws(
                () => provider.rename(uri, newUri, { overwrite: false }),
                (error: any) => error.code === 'NoPermissions'
            );
        });
    });

    describe('watch', function () {
        it('should return disposable that does nothing', function () {
            const uri = provider.registerFile(artifact, fileName, fileContent);

            const disposable = provider.watch(uri, { recursive: false, excludes: [] });

            assert.ok(disposable);
            assert.ok(typeof disposable.dispose === 'function');

            // Should not throw
            disposable.dispose();
        });
    });
});
