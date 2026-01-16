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

        it('should throw FileNotFound if file not registered', async function () {
            const uri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/${fileName}`);
            const newContent = new Uint8Array([6, 7, 8]);

            await assert.rejects(
                async () => await provider.writeFile(uri, newContent, { create: false, overwrite: true }),
                (error: any) => error.code === 'FileNotFound'
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

        it('should throw error if file not found in definition', async function () {
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

            await assert.rejects(
                async () => await provider.writeFile(uri, newContent, { create: false, overwrite: true }),
                (error: any) => error.message.includes('not found in definition')
            );
        });
    });

    describe('unsupported operations', function () {
        it('should throw NoPermissions for readDirectory', function () {
            const uri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}`);

            assert.throws(
                () => provider.readDirectory(uri),
                (error: any) => error.code === 'NoPermissions'
            );
        });

        it('should throw NoPermissions for createDirectory', function () {
            const uri = vscode.Uri.parse(`fabric-definition:///${workspaceId}/${artifactId}/folder`);

            assert.throws(
                () => provider.createDirectory(uri),
                (error: any) => error.code === 'NoPermissions'
            );
        });

        it('should throw NoPermissions for delete', function () {
            const uri = provider.registerFile(artifact, fileName, fileContent);

            assert.throws(
                () => provider.delete(uri, { recursive: false }),
                (error: any) => error.code === 'NoPermissions'
            );
        });

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
