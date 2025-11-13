// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { ArtifactManager } from '../../../src/artifactManager/ArtifactManager';
import { IFabricExtensionManagerInternal } from '../../../src/apis/internal/fabricExtensionInternal';
import { IItemDefinition, PayloadType, IWorkspaceManager, IArtifact, IApiClientRequestOptions, IApiClientResponse, IFabricApiClient, IArtifactHandler, IReadArtifactWorkflow, OperationRequestType, ICreateArtifactWorkflow, IWorkspace, IRenameArtifactWorkflow, IDeleteArtifactWorkflow, IGetArtifactDefinitionWorkflow, IUpdateArtifactDefinitionWorkflow, ICreateArtifactWithDefinitionWorkflow } from '@microsoft/vscode-fabric-api';
import { FabricError, IFabricEnvironmentProvider, ILogger, TelemetryService } from '@microsoft/vscode-fabric-util';
import { FabricWorkspaceDataProvider } from '../../../src/workspace/treeView';
import { IObservableReadOnlyMap } from '../../../src/collections/definitions';
import * as utilities from '../../../src/utilities';
import { IWorkspaceFilterManager } from '../../../src/workspace/WorkspaceFilterManager';

describe('ArtifactManager', function () {
    let artifactMock: Mock<IArtifact>;
    let extensionManagerMock: Mock<IFabricExtensionManagerInternal>;
    let workspaceManagerMock: Mock<IWorkspaceManager>;
    let fabricEnvironmentProviderMock: Mock<IFabricEnvironmentProvider>;
    let apiClientMock: Mock<IFabricApiClient>;
    let loggerMock: Mock<ILogger>;
    let dataProviderMock: Mock<FabricWorkspaceDataProvider>;
    let telemetryServiceMock: Mock<TelemetryService>;
    let workspaceFilterManagerMock: Mock<IWorkspaceFilterManager>;
    let rootArtifactHandlersMock: Mock<IObservableReadOnlyMap<string, IArtifactHandler>>;

    let artifactManager: ArtifactManager;
    const artifactId = '5b218778-e7a5-4d73-8187-f10824047715';
    const workspaceId = 'cfafbeb1-8037-4d0c-896e-a46fb27ff229';
    const artifactType = 'Lakehouse';
    const artifactDisplayName = 'Test Lakehouse';

    beforeEach(function () {
        extensionManagerMock = new Mock<IFabricExtensionManagerInternal>();
        workspaceManagerMock = new Mock<IWorkspaceManager>();
        fabricEnvironmentProviderMock = new Mock<IFabricEnvironmentProvider>();
        apiClientMock = new Mock<IFabricApiClient>();
        loggerMock = new Mock<ILogger>();
        dataProviderMock = new Mock<FabricWorkspaceDataProvider>();
        telemetryServiceMock = new Mock<TelemetryService>();
        workspaceFilterManagerMock = new Mock<IWorkspaceFilterManager>();

        // Provide a default artifactHandlers map to satisfy ArtifactManager.getArtifactHandler
        rootArtifactHandlersMock = new Mock<IObservableReadOnlyMap<string, IArtifactHandler>>();
        rootArtifactHandlersMock.setup(m => m.get(It.IsAny())).returns(undefined);
        extensionManagerMock.setup(x => x.artifactHandlers).returns(rootArtifactHandlersMock.object());

        artifactMock = new Mock<IArtifact>();
        artifactMock.setup(a => a.id)
            .returns(artifactId);
        artifactMock.setup(a => a.workspaceId)
            .returns(workspaceId);
        artifactMock.setup(a => a.type)
            .returns(artifactType);
        artifactMock.setup(a => a.displayName)
            .returns(artifactDisplayName);

        extensionManagerMock.setup(x => x.getArtifactHandler(It.IsAny()))
            .returns(undefined);

        artifactManager = new ArtifactManager(
            extensionManagerMock.object(),
            workspaceManagerMock.object(),
            workspaceFilterManagerMock.object(),
            fabricEnvironmentProviderMock.object(),
            apiClientMock.object(),
            loggerMock.object(),
            telemetryServiceMock.object(),
            dataProviderMock.object()
        );
    });

    afterEach(function () {
        sinon.restore();
    });

    describe('createArtifact', function () {
        let customItemMetadata: any | undefined = undefined;

        let artifact: IArtifact;
        let apiResponse: IApiClientResponse;

        beforeEach(function () {
            artifact = {
                id: '',
                type: 'Notebook',
                displayName: 'MyNotebook',
                description: 'desc',
                workspaceId: 'ws1',
                fabricEnvironment: 'env',
            };
            apiResponse = {
                status: 201,
                parsedBody: { id: 'new-id' },
            };

            apiClientMock.setup(x => x.sendRequest(It.IsAny()))
                .returns(Promise.resolve(apiResponse));

        });

        afterEach(function () {
            sinon.restore();
        });

        [
            { status: 201 },
            { status: 400 },
        ].forEach(({ status }) => {
            it(`createArtifact (no handler): response status ${status}`, async function () {
                // Arrange
                if (status === 400) {
                    apiResponse = {
                        status: 400,
                        parsedBody: { errorCode: 'BadRequest', requestId: 'reqid' },
                        response: { bodyAsText: 'Bad request' } as any,
                    };
                }

                let sendRequestArgs: IApiClientRequestOptions | undefined;
                apiClientMock.setup(x => x.sendRequest(It.IsAny()))
                    .returns(Promise.resolve(apiResponse));

                // Act
                const result = await act();

                // Assert
                assert.strictEqual(result, apiResponse, 'Should return API response');
                apiClientMock.verify(x => x.sendRequest(It.IsAny()), Times.Once());
                apiClientMock.verify(
                    x => x.sendRequest(
                        It.Is<IApiClientRequestOptions>(req =>
                            req.method === 'POST' &&
                            !!req.pathTemplate && req.pathTemplate.includes('ws1') &&
                            req.body?.displayName === 'MyNotebook' &&
                            req.body?.type === 'Notebook'
                        )
                    ),
                    Times.Once()
                );
                dataProviderMock.verify(x => x.refresh(), Times.Never());
            });
        });

        it('Matching create workflow', async function () {
            // Arrange
            customItemMetadata = { custom: 'metadata' };

            const onBeforeCreateStub = sinon.stub().resolves();
            const onAfterCreateStub = sinon.stub().resolves();
            const showCreateStub = sinon.stub().resolves(customItemMetadata);

            const createWorkflowMock: ICreateArtifactWorkflow = {
                showCreate: showCreateStub,
                onBeforeCreate: onBeforeCreateStub,
                onAfterCreate: onAfterCreateStub,
            };

            const artifactHandlerMock = new Mock<IArtifactHandler>()
                .setup(h => h.createWorkflow)
                .returns(createWorkflowMock);

            extensionManagerMock.setup(x => x.getArtifactHandler(It.Is(a => a === 'Notebook')))
                .returns(artifactHandlerMock.object());

            // Act
            const result = await act();

            // Assert
            assert.strictEqual(result, apiResponse, 'Should return API response');
            assert.strictEqual(artifact.id, '', 'Artifact id should not be set from response');

            // Validate onBeforeCreate was called with the expected parameters
            assert.ok(onBeforeCreateStub.calledOnce, 'onBeforeCreate should be called once');
            const beforeArgs = onBeforeCreateStub.firstCall.args;
            assert.deepStrictEqual(beforeArgs[0], artifact, 'onBeforeCreate first argument should be the artifact');
            assert.strictEqual(typeof beforeArgs[1], 'object', 'onBeforeCreate second argument should be the request options');
            assert.strictEqual(beforeArgs[1].method, 'POST', 'onBeforeCreate request method should be POST');
            assert.ok(beforeArgs[1].pathTemplate.includes('ws1'), 'onBeforeCreate pathTemplate should include workspace id');
            assert.strictEqual(beforeArgs[1].body.displayName, 'MyNotebook', 'onBeforeCreate body.displayName should match');
            assert.strictEqual(beforeArgs[1].body.type, 'Notebook', 'onBeforeCreate body.type should match');
            assert.deepStrictEqual(beforeArgs[2], customItemMetadata, 'onBeforeCreate third argument should be customItemMetadata');

            // Validate onAfterCreate was called with the expected parameters
            assert.ok(onAfterCreateStub.calledOnce, 'onAfterCreate should be called once');
            const afterArgs = onAfterCreateStub.firstCall.args;
            assert.deepStrictEqual(afterArgs[0], artifact, 'onAfterCreate first argument should be the artifact');
            assert.deepStrictEqual(afterArgs[1], customItemMetadata, 'onAfterCreate second argument should be customItemMetadata');
            assert.deepStrictEqual(afterArgs[2], apiResponse, 'onAfterCreate third argument should be the apiResponse');

            assert.ok(showCreateStub.notCalled, 'showCreate should not be called');

            dataProviderMock.verify(x => x.refresh(), Times.Never());
            apiClientMock.verify(
                x => x.sendRequest(
                    It.Is<IApiClientRequestOptions>(req =>
                        req.method === 'POST' &&
                        typeof req.pathTemplate === 'string' && req.pathTemplate.includes('ws1') &&
                        req.body.displayName === 'MyNotebook' &&
                        req.body.type === 'Notebook'
                    )
                ),
                Times.Once()
            );
        });

        it('Mismatched create workflow', async function () {
            // Arrange
            const onBeforeRequestStub = sinon.stub().resolves();
            const onAfterRequestStub = sinon.stub().resolves();

            // Mock IArtifactHandler
            const artifactHandlerMock: IArtifactHandler = {
                artifactType: 'NotNotebook',
                onBeforeRequest: onBeforeRequestStub,
                onAfterRequest: onAfterRequestStub,
            };

            extensionManagerMock.setup(x => x.getArtifactHandler(It.Is(a => a === 'NotNotebook')))
                .returns(artifactHandlerMock);

            // Act
            const result = await act();

            // Assert
            assert.strictEqual(result, apiResponse, 'Should return API response');
            assert.strictEqual(artifact.id, '', 'Artifact id should not be set from response');
            assert.ok(onBeforeRequestStub.notCalled, 'onBeforeRequest should not be called');
            assert.ok(onAfterRequestStub.notCalled, 'onAfterRequest should not be called');
            dataProviderMock.verify(x => x.refresh(), Times.Never());
            apiClientMock.verify(
                x => x.sendRequest(
                    It.Is<IApiClientRequestOptions>(req =>
                        req.method === 'POST' &&
                        typeof req.pathTemplate === 'string' && req.pathTemplate.includes('ws1') &&
                        req.body.displayName === 'MyNotebook' &&
                        req.body.type === 'Notebook'
                    )
                ),
                Times.Once()
            );
        });

        async function act() {
            return artifactManager.createArtifact(artifact, customItemMetadata);
        }
    });

    describe('createArtifactDeprecated', function () {
        let artifactHandlersMock: Mock<IObservableReadOnlyMap<string, IArtifactHandler>>;

        let withProgressStub: sinon.SinonStub;

        let artifact: IArtifact;
        let apiResponse: IApiClientResponse;

        beforeEach(function () {
            artifactHandlersMock = new Mock<IObservableReadOnlyMap<string, IArtifactHandler>>();
            artifact = {
                id: '',
                type: 'Notebook',
                displayName: 'MyNotebook',
                description: 'desc',
                workspaceId: 'ws1',
                fabricEnvironment: 'env',
            };
            apiResponse = {
                status: 201,
                parsedBody: { id: 'new-id' },
            };

            artifactHandlersMock.setup(x => x.get(It.IsAny()))
                .returns(undefined); // No handlers for simplicity
            fabricEnvironmentProviderMock.setup(x => x.getCurrent())
                .returns({ sharedUri: 'https://test.fabric' } as any);
            extensionManagerMock.setup(x => x.artifactHandlers)
                .returns(artifactHandlersMock.object());
            apiClientMock.setup(x => x.sendRequest(It.IsAny()))
                .returns(Promise.resolve(apiResponse));
            dataProviderMock.setup(x => x.refresh())
                .returns(undefined);
            telemetryServiceMock.setup(instance => instance.sendTelemetryEvent(It.IsAny(), It.IsAny()))
                .returns(undefined);

            withProgressStub = sinon.stub(vscode.window, 'withProgress');
            withProgressStub.callsFake(async (_opts, cb) => cb({ report: () => { } }, {}));

            artifactManager = new ArtifactManager(
                extensionManagerMock.object(),
                workspaceManagerMock.object(),
                workspaceFilterManagerMock.object(),
                fabricEnvironmentProviderMock.object(),
                apiClientMock.object(),
                loggerMock.object(),
                telemetryServiceMock.object(),
                dataProviderMock.object()
            );
        });

        afterEach(function () {
            sinon.restore();
        });

        it('Success, no handlers', async function () {
            // Arrange

            // Act
            const result = await act();

            // Assert
            assert.strictEqual(result, apiResponse, 'Should return API response');
            assert.strictEqual(artifact.id, 'new-id', 'Artifact id should be set from response');
            dataProviderMock.verify(x => x.refresh(), Times.Once());
            apiClientMock.verify(x => x.sendRequest(It.IsAny()), Times.Once());
            apiClientMock.verify(
                x => x.sendRequest(
                    It.Is<IApiClientRequestOptions>(req =>
                        req.method === 'POST' &&
                        !!req.pathTemplate && req.pathTemplate.includes('ws1') &&
                        req.body?.displayName === 'MyNotebook' &&
                        req.body?.type === 'Notebook'
                    )
                ),
                Times.Once()
            );
        });

        it('Success, ignore create workflow', async function () {
            // Arrange
            const onBeforeCreateStub = sinon.stub().resolves();
            const onAfterCreateStub = sinon.stub().resolves();
            const showCreateStub = sinon.stub().resolves({ custom: 'metadata' });

            const createWorkflowMock = {
                showCreate: showCreateStub,
                onBeforeCreate: onBeforeCreateStub,
                onAfterCreate: onAfterCreateStub,
            };

            const handlerMock: IArtifactHandler = {
                artifactType: 'Notebook',
                createWorkflow: createWorkflowMock as any,
            };

            // Setup artifactHandlers to return the handler for 'Notebook'
            artifactHandlersMock.setup(x => x.get('Notebook'))
                .returns(handlerMock);

            // Act
            const result = await act();

            // Assert
            assert.strictEqual(result, apiResponse, 'Should return API response');
            assert.strictEqual(artifact.id, 'new-id', 'Artifact id should be set from response');

            // Validate onBeforeCreate was never called
            assert.ok(onBeforeCreateStub.notCalled, 'onBeforeCreate should never be called');

            // Validate onAfterCreate was never called
            assert.ok(onAfterCreateStub.notCalled, 'onAfterCreate should never be called');

            // Validate showCreate was never called
            assert.ok(showCreateStub.notCalled, 'showCreate should not be called');

            dataProviderMock.verify(x => x.refresh(), Times.Once());
            apiClientMock.verify(
                x => x.sendRequest(
                    It.Is<IApiClientRequestOptions>(req =>
                        req.method === 'POST' &&
                        typeof req.pathTemplate === 'string' && req.pathTemplate.includes('ws1') &&
                        req.body.displayName === 'MyNotebook' &&
                        req.body.type === 'Notebook'
                    )
                ),
                Times.Once()
            );
        });

        it('Success, use deprecated customizations', async function () {
            // Arrange
            const onBeforeRequestStub = sinon.stub().resolves();
            const onAfterRequestStub = sinon.stub().resolves();

            const handlerMock: IArtifactHandler = {
                artifactType: 'Notebook',
                onBeforeRequest: onBeforeRequestStub,
                onAfterRequest: onAfterRequestStub,
                // No createWorkflow
            };

            artifactHandlersMock.setup(x => x.get('Notebook')).returns(handlerMock);

            // Act
            const result = await act();

            // Assert
            assert.strictEqual(result, apiResponse, 'Should return API response');
            assert.strictEqual(artifact.id, 'new-id', 'Artifact id should be set from response');
            assert.ok(onBeforeRequestStub.calledOnce, 'onBeforeRequest should be called once');
            const beforeArgs = onBeforeRequestStub.firstCall.args;
            assert.strictEqual(beforeArgs[0], OperationRequestType.create, 'onBeforeRequest first argument should be OperationRequestType.create');
            assert.deepStrictEqual(beforeArgs[1], artifact, 'onBeforeRequest second argument should be the artifact');
            assert.strictEqual(typeof beforeArgs[2], 'object', 'onBeforeRequest third argument should be the request options');
            assert.strictEqual(beforeArgs[2].method, 'POST', 'onBeforeRequest request method should be POST');
            assert.ok(beforeArgs[2].pathTemplate.includes('ws1'), 'onBeforeRequest pathTemplate should include workspace id');
            assert.strictEqual(beforeArgs[2].body.displayName, 'MyNotebook', 'onBeforeRequest body.displayName should match');
            assert.strictEqual(beforeArgs[2].body.type, 'Notebook', 'onBeforeRequest body.type should match');

            assert.ok(onAfterRequestStub.calledOnce, 'onAfterRequest should be called once');
            const afterArgs = onAfterRequestStub.firstCall.args;
            assert.strictEqual(afterArgs[0], OperationRequestType.create, 'onAfterRequest first argument should be OperationRequestType.create');
            assert.deepStrictEqual(afterArgs[1], artifact, 'onAfterRequest second argument should be the artifact');
            assert.deepStrictEqual(afterArgs[2], apiResponse, 'onAfterRequest third argument should be the apiResponse');
        });

        it('Error: 400 status with Learn more selection', async function () {
            // Arrange
            apiResponse = {
                status: 400,
                parsedBody: { errorCode: 'UnsupportedCapacitySKU', requestId: 'reqid' },
                response: { bodyAsText: 'UnsupportedCapacitySKU' },
            } as any;

            apiClientMock.setup(x => x.sendRequest(It.IsAny()))
                .returns(Promise.resolve(apiResponse));

            const showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
            showErrorMessageStub.resolves('Learn more' as any);

            const openExternalStub = sinon.stub(vscode.env, 'openExternal');
            openExternalStub.resolves(true);

            // Act & Assert
            await assert.rejects(
                () => act(),
                /Create Artifact 'MyNotebook' failed: 400 UnsupportedCapacitySKU/
            );

            // Verify user notification was shown
            assert.ok(showErrorMessageStub.calledOnce, 'showErrorMessage should be called once');
            const errorCall = showErrorMessageStub.firstCall;
            assert.ok(errorCall.args[0].includes('MyNotebook'), 'Error message should contain artifact name');
            assert.ok(errorCall.args[0].includes('UnsupportedCapacitySKU'), 'Error message should contain error code');

            // Verify Learn more link was opened
            assert.ok(openExternalStub.calledOnce, 'openExternal should be called once');
            const openCall = openExternalStub.firstCall;
            assert.strictEqual(openCall.args[0].toString(), 'https://aka.ms/SupportedCapacitySkus', 'Should open correct Learn more URL');
        });

        it('Error: 400 status with no Learn more selection', async function () {
            // Arrange
            apiResponse = {
                status: 400,
                parsedBody: { errorCode: 'UnsupportedCapacitySKU', requestId: 'reqid' },
                response: { bodyAsText: 'UnsupportedCapacitySKU' },
            } as any;

            apiClientMock.setup(x => x.sendRequest(It.IsAny()))
                .returns(Promise.resolve(apiResponse));

            const showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
            showErrorMessageStub.resolves(undefined); // User dismisses dialog or selects a different option

            const openExternalStub = sinon.stub(vscode.env, 'openExternal');

            // Act & Assert
            await assert.rejects(
                () => act(),
                /Create Artifact 'MyNotebook' failed: 400 UnsupportedCapacitySKU/
            );

            // Verify user notification was shown
            assert.ok(showErrorMessageStub.calledOnce, 'showErrorMessage should be called once');
            const errorCall = showErrorMessageStub.firstCall;
            assert.ok(errorCall.args[0].includes('MyNotebook'), 'Error message should contain artifact name');
            assert.ok(errorCall.args[0].includes('UnsupportedCapacitySKU'), 'Error message should contain error code');

            // Verify Learn more link was NOT opened when user doesn't select it
            assert.ok(openExternalStub.notCalled, 'openExternal should not be called when user does not select Learn more');
        });

        it('Error: Non-400 status code', async function () {
            // Arrange
            apiResponse = {
                status: 500,
                parsedBody: { errorCode: 'InternalServerError', requestId: 'reqid' },
                response: { bodyAsText: 'Internal server error' },
            } as any;

            apiClientMock.setup(x => x.sendRequest(It.IsAny()))
                .returns(Promise.resolve(apiResponse));

            const showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');

            // Act & Assert
            await assert.rejects(
                () => act(),
                /Create Artifact 'MyNotebook' failed: 500 Internal server error/
            );

            // Verify no user notification dialog was shown for non-400 errors
            assert.ok(showErrorMessageStub.notCalled, 'showErrorMessage should not be called for non-400 errors');
        });
        async function act() {
            return artifactManager.createArtifactDeprecated(artifact);
        }
    });

    describe('getArtifact', function () {
        let apiResponse: IApiClientResponse;

        beforeEach(function () {
            apiResponse = {
                status: 200,
                parsedBody: {
                    displayName: 'Item 1',
                    description: 'Item 1 description',
                    type: artifactType,
                    workspaceId: workspaceId,
                    id: artifactId,
                },
            };

            apiClientMock.setup(x => x.sendRequest(It.IsAny()))
                .returns(Promise.resolve(apiResponse));
        });

        it('No read workflow', async function () {
            // Arrange

            // Act
            const result = await act();

            // Assert
            assert.strictEqual(result, apiResponse);

            apiClientMock.verify(
                x => x.sendRequest(It.Is<IApiClientRequestOptions>(opts =>
                    opts.method === 'GET' &&
                    opts.pathTemplate === `/v1/workspaces/${workspaceId}/items/${artifactId}`
                )),
                Times.Once()
            );

            artifactMock.verify(x => x.id, Times.AtLeastOnce());
            artifactMock.verify(x => x.workspaceId, Times.AtLeastOnce());
        });

        it('Incomplete read workflow', async function () {
            // Arrange
            const readArtifactWorkflowMock = new Mock<IReadArtifactWorkflow>();
            readArtifactWorkflowMock.setup(x => x.onBeforeRead)
                .returns(undefined);

            const artifactHandlerMock = new Mock<IArtifactHandler>()
                .setup(h => h.readWorkflow)
                .returns(readArtifactWorkflowMock.object());

            extensionManagerMock.setup(x => x.getArtifactHandler(It.Is(a => a === artifactType)))
                .returns(artifactHandlerMock.object());

            // Act
            const result = await act();

            // Assert
            assert.strictEqual(result, apiResponse);
            apiClientMock.verify(x => x.sendRequest(It.IsAny()), Times.Once());
            extensionManagerMock.verify(x => x.getArtifactHandler(It.Is(a => a === artifactType)), Times.Once());
            artifactHandlerMock.verify(h => h.readWorkflow, Times.Once());
        });

        it('Complete read workflow', async function () {
            // Arrange
            const apiClientRequestOptions: IApiClientRequestOptions = {
                method: 'OPTIONS',
                pathTemplate: 'test-path-template',
            };

            let calledArtifact: IArtifact | undefined;
            const onBeforeReadMock = new Mock<(artifact: IArtifact, options: IApiClientRequestOptions) => Promise<IApiClientRequestOptions>>();
            onBeforeReadMock.setup(fn => fn(It.IsAny(), It.IsAny()))
                .callback(({ args: [artifact, options] }) => {
                    calledArtifact = artifact;
                    return Promise.resolve(apiClientRequestOptions);
                });

            const artifactHandlerMock = new Mock<IArtifactHandler>()
                .setup(h => h.readWorkflow)
                .returns({
                    onBeforeRead: onBeforeReadMock.object(),
                });

            extensionManagerMock.setup(x => x.getArtifactHandler(It.Is(a => a === artifactType)))
                .returns(artifactHandlerMock.object());

            // Act
            const result = await act();

            // Assert
            assert.strictEqual(result, apiResponse);
            assert.strictEqual(calledArtifact, artifactMock.object());
            onBeforeReadMock.verify(
                fn => fn(
                    It.IsAny(),
                    It.Is<IApiClientRequestOptions>(opts =>
                        opts.method === 'GET' &&
                        opts.pathTemplate === `/v1/workspaces/${workspaceId}/items/${artifactId}`)
                ),
                Times.Once()
            );
            // Verify that the API client was called with the modified request options
            apiClientMock.verify(x => x.sendRequest(It.Is<IApiClientRequestOptions>(opts =>
                opts.method === 'OPTIONS' &&
                opts.pathTemplate === 'test-path-template'
            )), Times.Once());
            extensionManagerMock.verify(x => x.getArtifactHandler(It.Is(a => a === artifactType)), Times.Once());
            artifactHandlerMock.verify(h => h.readWorkflow, Times.AtLeastOnce());
            onBeforeReadMock.verify(fn => fn(It.IsAny(), It.IsAny()), Times.Once());
        });

        async function act() {
            return artifactManager.getArtifact(artifactMock.object());
        }

    });

    describe('listArtifacts', function () {
        let apiResponse: IApiClientResponse;
        let workspaceMock: Mock<IWorkspace>;

        beforeEach(function () {
            workspaceMock = new Mock<IWorkspace>();
            workspaceMock.setup(w => w.objectId).returns('ws1');
            workspaceMock.setup(w => w.displayName).returns('Workspace 1');

            fabricEnvironmentProviderMock.setup(f => f.getCurrent()).returns({ env: 'TestEnv' } as any);
        });

        it('returns artifacts when response is 200 and value is present', async function () {
            apiResponse = {
                status: 200,
                parsedBody: {
                    value: [
                        { id: 'a1', type: 'Lakehouse', displayName: 'Artifact 1', workspaceId: 'ws1' },
                        { id: 'a2', type: 'Notebook', displayName: 'Artifact 2', workspaceId: 'ws1' },
                    ],
                },
            };
            apiClientMock.setup(x => x.sendRequest(It.IsAny())).returns(Promise.resolve(apiResponse));

            const result = await artifactManager.listArtifacts(workspaceMock.object());

            assert.strictEqual(result.length, 2, 'Should return two artifacts');
            assert.strictEqual(result[0].id, 'a1');
            assert.strictEqual(result[1].id, 'a2');
            assert.strictEqual(result[0].fabricEnvironment, 'TestEnv', 'fabricEnvironment should be set');
            assert.strictEqual(result[1].fabricEnvironment, 'TestEnv', 'fabricEnvironment should be set');
            apiClientMock.verify(x => x.sendRequest(It.IsAny()), Times.Once());
        });

        it('returns empty array when response is 200 and value is missing', async function () {
            apiResponse = {
                status: 200,
                parsedBody: {},
            };
            apiClientMock.setup(x => x.sendRequest(It.IsAny())).returns(Promise.resolve(apiResponse));

            const result = await artifactManager.listArtifacts(workspaceMock.object());

            assert.ok(Array.isArray(result), 'Result should be an array');
            assert.strictEqual(result.length, 0, 'Should return empty array');
            apiClientMock.verify(x => x.sendRequest(It.IsAny()), Times.Once());
        });

        it('throws FabricError when response status is not 200', async function () {
            apiResponse = {
                status: 400,
                parsedBody: { errorCode: 'BadRequest', value: [] },
            };
            apiClientMock.setup(x => x.sendRequest(It.IsAny())).returns(Promise.resolve(apiResponse));

            await assert.rejects(
                () => artifactManager.listArtifacts(workspaceMock.object()),
                err => err instanceof FabricError && err.message.includes('Error listing items for workspace Workspace 1')
            );
            apiClientMock.verify(x => x.sendRequest(It.IsAny()), Times.Once());
        });

        it('sets fabricEnvironment for each artifact', async function () {
            apiResponse = {
                status: 200,
                parsedBody: {
                    value: [
                        { id: 'a1', type: 'Lakehouse', displayName: 'Artifact 1', workspaceId: 'ws1' },
                    ],
                },
            };
            apiClientMock.setup(x => x.sendRequest(It.IsAny())).returns(Promise.resolve(apiResponse));
            const result = await artifactManager.listArtifacts(workspaceMock.object());
            assert.strictEqual(result[0].fabricEnvironment, 'TestEnv', 'fabricEnvironment should be set for artifact');
        });
    });

    [
        { status: 200 },
        { status: 400 },
    ].forEach(({ status }) => {
        it(`updateArtifact: response status ${status}`, async function () {
            // Arrange
            const apiResponse: IApiClientResponse = {
                status: status,
                parsedBody: {
                    displayName: 'Item\'s New Name',
                    description: 'Item\'s New Description',
                    type: artifactType,
                    workspaceId: workspaceId,
                    id: artifactId,
                },
            };

            const body: Map<string, string> = new Map<string, string>();
            body.set('displayName', 'Item\'s New Name');
            body.set('description', 'Item\'s New Description');

            let sendRequestArgs: IApiClientRequestOptions | undefined;
            apiClientMock.setup(x => x.sendRequest(It.IsAny()))
                .callback(({ args }) => {
                    sendRequestArgs = args[0];
                    return Promise.resolve(apiResponse);
                });

            // Act
            const result = await artifactManager.updateArtifact(artifactMock.object(), body);

            // Assert
            assert.strictEqual(result, apiResponse);

            apiClientMock.verify(x => x.sendRequest(It.IsAny()), Times.Once());
            assert.ok(sendRequestArgs, 'sendRequest should have been called');
            assert.strictEqual(sendRequestArgs.method, 'PATCH', 'sendRequest: Method');
            assert.strictEqual(sendRequestArgs.pathTemplate, `/v1/workspaces/${workspaceId}/items/${artifactId}`, 'sendRequest: Path template');
            assert.ok(sendRequestArgs.headers, 'sendRequest: Headers should be defined');
            assert.strictEqual(sendRequestArgs.headers['Content-Type'], 'application/json; charset=utf-8', 'sendRequest headers: Content-Type');

            artifactMock.verify(x => x.id, Times.AtLeastOnce());
            artifactMock.verify(x => x.workspaceId, Times.AtLeastOnce());
        });
    });

    it('updateArtifact: invokes rename workflow hooks and modifies request', async function () {
        // Arrange
        const apiResponse: IApiClientResponse = { status: 200 } as any;
        const body: Map<string, string> = new Map<string, string>();
        body.set('displayName', 'New Name');
        body.set('description', 'Updated');

        const onBeforeRenameStub = sinon.stub().callsFake(async (_artifact: IArtifact, newName: string, options: IApiClientRequestOptions) => {
            // mutate options to validate downstream usage
            options.pathTemplate = options.pathTemplate + '?renamed=1';
            // eslint-disable-next-line @typescript-eslint/naming-convention
            options.headers = { ...(options.headers || {}), 'X-Test-Rename': 'true' };
            return options;
        });
        const onAfterRenameStub = sinon.stub().resolves();
        const renameWorkflow: IRenameArtifactWorkflow = {
            onBeforeRename: onBeforeRenameStub,
            onAfterRename: onAfterRenameStub,
        };
        const artifactHandlerMock = new Mock<IArtifactHandler>()
            .setup(h => h.renameWorkflow)
            .returns(renameWorkflow);
        const mapMock = new Mock<IObservableReadOnlyMap<string, IArtifactHandler>>();
        mapMock.setup(m => m.get(It.Is(a => a === artifactType))).returns(artifactHandlerMock.object());
        extensionManagerMock.setup(x => x.artifactHandlers).returns(mapMock.object());

        let sendRequestArgs: IApiClientRequestOptions | undefined;
        apiClientMock.setup(x => x.sendRequest(It.IsAny()))
            .callback(({ args }) => {
                sendRequestArgs = args[0];
                return Promise.resolve(apiResponse);
            });

        // Act
        const result = await artifactManager.updateArtifact(artifactMock.object(), body);

        // Assert
        assert.strictEqual(result, apiResponse, 'Should return API response');
        assert.ok(onBeforeRenameStub.calledOnce, 'onBeforeRename should be called once');
        assert.ok(onAfterRenameStub.calledOnce, 'onAfterRename should be called once');
        const beforeArgs = onBeforeRenameStub.firstCall.args;
        assert.strictEqual(beforeArgs[1], 'New Name', 'onBeforeRename newName argument');
        assert.ok(sendRequestArgs, 'sendRequest should have been called');
        assert.ok(sendRequestArgs, 'sendRequestArgs should be defined');
        assert.ok(sendRequestArgs!.pathTemplate!.endsWith('?renamed=1'), 'Modified pathTemplate should include query');
        assert.strictEqual(sendRequestArgs?.headers?.['X-Test-Rename'], 'true', 'Custom header should be present');
    });

    [
        { status: 200 },
        { status: 400 },
    ].forEach(({ status }) => {
        it(`deleteArtifact: response status ${status}`, async function () {
            // Arrange
            const apiResponse: IApiClientResponse = {
                status: status,
            };

            let sendRequestArgs: IApiClientRequestOptions | undefined;
            apiClientMock.setup(x => x.sendRequest(It.IsAny()))
                .callback(({ args }) => {
                    sendRequestArgs = args[0];
                    return Promise.resolve(apiResponse);
                });

            // Act
            const result = await artifactManager.deleteArtifact(artifactMock.object());

            // Assert
            assert.strictEqual(result, apiResponse);

            apiClientMock.verify(x => x.sendRequest(It.IsAny()), Times.Once());
            assert.ok(sendRequestArgs, 'sendRequest should have been called');
            assert.strictEqual(sendRequestArgs.method, 'DELETE', 'sendRequest: Method');
            assert.strictEqual(sendRequestArgs.pathTemplate, `/v1/workspaces/${workspaceId}/items/${artifactId}`, 'sendRequest: Path template');

            artifactMock.verify(x => x.id, Times.AtLeastOnce());
            artifactMock.verify(x => x.workspaceId, Times.AtLeastOnce());
        });
    });

    it('deleteArtifact: invokes delete workflow hooks and modifies request', async function () {
        // Arrange
        const apiResponse: IApiClientResponse = { status: 200 } as any;
        const onBeforeDeleteStub = sinon.stub().callsFake(async (_artifact: IArtifact, options: IApiClientRequestOptions) => {
            options.pathTemplate = options.pathTemplate + '?force=true';
            return options;
        });
        const onAfterDeleteStub = sinon.stub().resolves();
        const deleteWorkflow: IDeleteArtifactWorkflow = {
            onBeforeDelete: onBeforeDeleteStub,
            onAfterDelete: onAfterDeleteStub,
        };
        const artifactHandlerMock = new Mock<IArtifactHandler>()
            .setup(h => h.deleteWorkflow)
            .returns(deleteWorkflow);
        const mapMock = new Mock<IObservableReadOnlyMap<string, IArtifactHandler>>();
        mapMock.setup(m => m.get(It.Is(a => a === artifactType))).returns(artifactHandlerMock.object());
        extensionManagerMock.setup(x => x.artifactHandlers).returns(mapMock.object());

        let sendRequestArgs: IApiClientRequestOptions | undefined;
        apiClientMock.setup(x => x.sendRequest(It.IsAny()))
            .callback(({ args }) => {
                sendRequestArgs = args[0];
                return Promise.resolve(apiResponse);
            });

        // Act
        const result = await artifactManager.deleteArtifact(artifactMock.object());

        // Assert
        assert.strictEqual(result, apiResponse, 'Should return API response');
        assert.ok(onBeforeDeleteStub.calledOnce, 'onBeforeDelete should be called once');
        assert.ok(onAfterDeleteStub.calledOnce, 'onAfterDelete should be called once');
        assert.ok(sendRequestArgs, 'sendRequestArgs should be defined');
        assert.ok(sendRequestArgs!.pathTemplate!.endsWith('?force=true'), 'Path template should be modified by onBeforeDelete');
    });

    [
        { status: 200 },
        { status: 202 },
        { status: 400 },
    ].forEach(({ status }) => {
        it(`getArtifactDefinition: response status ${status}`, async function () {
            // Arrange
            const apiResponse: IApiClientResponse = {
                status: status,
            };

            let sendRequestArgs: IApiClientRequestOptions | undefined;
            apiClientMock.setup(x => x.sendRequest(It.IsAny()))
                .callback(({ args }) => {
                    sendRequestArgs = args[0];
                    return Promise.resolve(apiResponse);
                });

            const handleLongRunningOperationStub = sinon.stub(utilities, 'handleLongRunningOperation').resolves(apiResponse);

            // Act
            const result = await artifactManager.getArtifactDefinition(artifactMock.object());

            // Assert
            assert.strictEqual(result, apiResponse);

            apiClientMock.verify(x => x.sendRequest(It.IsAny()), Times.Once());
            assert.ok(sendRequestArgs, 'sendRequest should have been called');
            assert.strictEqual(sendRequestArgs.method, 'POST', 'sendRequest: Method');
            assert.strictEqual(sendRequestArgs.pathTemplate, `/v1/workspaces/${workspaceId}/items/${artifactId}/getDefinition`, 'sendRequest: Path template');

            artifactMock.verify(x => x.id, Times.AtLeastOnce());
            artifactMock.verify(x => x.workspaceId, Times.AtLeastOnce());

            assert.ok(handleLongRunningOperationStub.called, 'handleLongRunningOperation should be called');
        });
    });

    [
        { folderProvided: true },
        { folderProvided: false },
    ].forEach(({ folderProvided }) => {
        it(`getArtifactDefinition: correctly invokes get definition workflow hooks and modifies request ${folderProvided ? 'with' : 'without'} folder`, async function () {
            // Arrange
            const apiResponse: IApiClientResponse = { status: 200 } as any;
            const folderUri = vscode.Uri.file('/tmp/folder');

            const onBeforeGetDefinitionStub = sinon.stub().callsFake(async (_artifact: IArtifact, folder: vscode.Uri, options: IApiClientRequestOptions) => {
                assert.strictEqual(folder.toString(), folderUri.toString(), 'Folder should match expected');
                options.pathTemplate = options.pathTemplate + '?detail=full';
                return options;
            });
            const onAfterGetDefinitionStub = sinon.stub().resolves();
            const getWorkflow: IGetArtifactDefinitionWorkflow = {
                onBeforeGetDefinition: onBeforeGetDefinitionStub,
                onAfterGetDefinition: onAfterGetDefinitionStub,
            };
            const artifactHandlerMock = new Mock<IArtifactHandler>()
                .setup(h => h.getDefinitionWorkflow)
                .returns(getWorkflow);
            const mapMock = new Mock<IObservableReadOnlyMap<string, IArtifactHandler>>();
            mapMock.setup(m => m.get(It.Is(a => a === artifactType))).returns(artifactHandlerMock.object());
            extensionManagerMock.setup(x => x.artifactHandlers).returns(mapMock.object());

            const handleLongRunningOperationStub = sinon.stub(utilities, 'handleLongRunningOperation').resolves(apiResponse);

            let sendRequestArgs: IApiClientRequestOptions | undefined;
            apiClientMock.setup(x => x.sendRequest(It.IsAny()))
                .callback(({ args }) => {
                    sendRequestArgs = args[0];
                    return Promise.resolve(apiResponse);
                });

            // Act
            const result = await artifactManager.getArtifactDefinition(
                artifactMock.object(),
                folderProvided ? folderUri : undefined);

            // Assert
            assert.strictEqual(result, apiResponse, 'Should return final API response');
            assert.ok(sendRequestArgs, 'sendRequestArgs should be defined');
            assert.ok(handleLongRunningOperationStub.calledOnce, 'handleLongRunningOperation should be called');
            if (folderProvided) {
                assert.ok(onBeforeGetDefinitionStub.calledOnce, 'onBeforeGetDefinition should be called once');
                assert.ok(onAfterGetDefinitionStub.calledOnce, 'onAfterGetDefinition should be called once');
                assert.ok(sendRequestArgs!.pathTemplate!.endsWith('?detail=full'), 'Path template should be modified by onBeforeGetDefinition');
            }
            else {
                assert.ok(onBeforeGetDefinitionStub.notCalled, 'onBeforeGetDefinition should not be called');
                assert.ok(onAfterGetDefinitionStub.notCalled, 'onAfterGetDefinition should not be called');
            }
        });
    });

    it('getArtifactDefinition: passes progress reporter to handleLongRunningOperation', async function () {
        // Arrange
        const apiResponse: IApiClientResponse = { status: 200 } as any;
        const folderUri = vscode.Uri.file('/tmp/folder-get-with-progress');
        const progressReporter = {
            report: sinon.stub(),
        };

        apiClientMock.setup(x => x.sendRequest(It.IsAny()))
            .returns(Promise.resolve(apiResponse));

        const handleLongRunningOperationStub = sinon.stub(utilities, 'handleLongRunningOperation').resolves(apiResponse);

        // Act
        const result = await artifactManager.getArtifactDefinition(
            artifactMock.object(),
            folderUri,
            { progress: progressReporter as any }
        );

        // Assert
        assert.strictEqual(result, apiResponse, 'Should return final API response');
        assert.ok(handleLongRunningOperationStub.calledOnce, 'handleLongRunningOperation should be called once');
        const handleLroArgs = handleLongRunningOperationStub.firstCall.args;
        assert.strictEqual(handleLroArgs[3], progressReporter, 'Progress reporter should be passed to handleLongRunningOperation');
    });

    [
        { status: 201 },
        { status: 202 },
        { status: 400 },
    ].forEach(({ status }) => {
        it(`createArtifactWithDefinition: response status ${status}`, async function () {
            // Arrange
            const apiResponse: IApiClientResponse = {
                status: status,
            };
            const itemDefinition: IItemDefinition = {
                parts: [
                    {
                        path: 'notebook-content.py',
                        payload: 'IyBGYWJyaW',
                        payloadType: PayloadType.InlineBase64,
                    },
                    {
                        path: '.platform',
                        payload: 'ewogICIkc2N',
                        payloadType: PayloadType.InlineBase64,
                    },
                ],
            };

            let sendRequestArgs: IApiClientRequestOptions | undefined;
            apiClientMock.setup(x => x.sendRequest(It.IsAny()))
                .callback(({ args }) => {
                    sendRequestArgs = args[0];
                    return Promise.resolve(apiResponse);
                });

            const handleLongRunningOperationStub = sinon.stub(utilities, 'handleLongRunningOperation').resolves(apiResponse);

            // Act
            const result = await artifactManager.createArtifactWithDefinition(artifactMock.object(), itemDefinition, vscode.Uri.file('/tmp/create-def'));

            // Assert
            assert.strictEqual(result, apiResponse);

            apiClientMock.verify(x => x.sendRequest(It.IsAny()), Times.Once());
            assert.ok(sendRequestArgs, 'sendRequest should have been called');
            assert.strictEqual(sendRequestArgs.method, 'POST', 'sendRequest: Method');
            assert.strictEqual(sendRequestArgs.pathTemplate, `/v1/workspaces/${workspaceId}/items`, 'sendRequest: path template');
            assert.ok(sendRequestArgs.body, 'sendRequest: body should be defined');
            assert.strictEqual(sendRequestArgs.body.displayName, artifactDisplayName, 'sendRequest: displayName');
            assert.strictEqual(sendRequestArgs.body.type, artifactType, 'sendRequest: type');
            assert.ok(sendRequestArgs.body.definition, 'sendRequest: definition should be defined');
            assert.deepStrictEqual(sendRequestArgs.body.definition.parts, itemDefinition.parts, 'sendRequest body: parts should match');
            assert.ok(sendRequestArgs.headers, 'sendRequest: headers should be defined');
            assert.strictEqual(sendRequestArgs.headers['Content-Type'], 'application/json; charset=utf-8', 'sendRequest headers: Content-Type');

            artifactMock.verify(x => x.type, Times.AtLeastOnce());
            artifactMock.verify(x => x.displayName, Times.AtLeastOnce());
            artifactMock.verify(x => x.workspaceId, Times.AtLeastOnce());

            assert.ok(handleLongRunningOperationStub.called, 'handleLongRunningOperation should be called');
        });
    });

    it('createArtifactWithDefinition: invokes create-with-definition workflow hooks and modifies request', async function () {
        // Arrange
        const apiResponse: IApiClientResponse = { status: 201 } as any;
        const itemDefinition: IItemDefinition = { parts: [] };
        const folderUri = vscode.Uri.file('/tmp/folder-create-def');

        const onBeforeCreateWithDefinitionStub = sinon.stub().callsFake(async (_artifact: IArtifact, def: IItemDefinition, folder: vscode.Uri, options: IApiClientRequestOptions) => {
            assert.strictEqual(def, itemDefinition, 'Definition should match');
            assert.strictEqual(folder.toString(), folderUri.toString(), 'Folder should match expected');
            options.pathTemplate = options.pathTemplate + '?init=true';
            options.headers = { ...(options.headers || {}), 'X-Test-Create-With-Definition': 'true' };
            return options;
        });
        const onAfterCreateWithDefinitionStub = sinon.stub().resolves();
        const createWithDefinitionWorkflow: ICreateArtifactWithDefinitionWorkflow = {
            onBeforeCreateWithDefinition: onBeforeCreateWithDefinitionStub,
            onAfterCreateWithDefinition: onAfterCreateWithDefinitionStub,
        };
        const artifactHandlerMock = new Mock<IArtifactHandler>()
            .setup(h => h.createWithDefinitionWorkflow)
            .returns(createWithDefinitionWorkflow);
        const mapMock = new Mock<IObservableReadOnlyMap<string, IArtifactHandler>>();
        mapMock.setup(m => m.get(It.Is(a => a === artifactType))).returns(artifactHandlerMock.object());
        extensionManagerMock.setup(x => x.artifactHandlers).returns(mapMock.object());

        const handleLongRunningOperationStub = sinon.stub(utilities, 'handleLongRunningOperation').resolves(apiResponse);

        let sendRequestArgs: IApiClientRequestOptions | undefined;
        apiClientMock.setup(x => x.sendRequest(It.IsAny()))
            .callback(({ args }) => {
                sendRequestArgs = args[0];
                return Promise.resolve(apiResponse);
            });

        // Act
        const result = await artifactManager.createArtifactWithDefinition(artifactMock.object(), itemDefinition, folderUri);

        // Assert
        assert.strictEqual(result, apiResponse, 'Should return final API response');
        assert.ok(onBeforeCreateWithDefinitionStub.calledOnce, 'onBeforeCreateWithDefinition should be called once');
        assert.ok(onAfterCreateWithDefinitionStub.calledOnce, 'onAfterCreateWithDefinition should be called once');
        assert.ok(sendRequestArgs, 'sendRequestArgs should be defined');
        assert.ok(sendRequestArgs!.pathTemplate!.endsWith('?init=true'), 'Path template should be modified by onBeforeCreateWithDefinition');
        assert.strictEqual(sendRequestArgs?.headers?.['X-Test-Create-With-Definition'], 'true', 'Custom header should be present');
        assert.ok(handleLongRunningOperationStub.calledOnce, 'handleLongRunningOperation should be called');
    });

    it('createArtifactWithDefinition: passes progress reporter to handleLongRunningOperation', async function () {
        // Arrange
        const apiResponse: IApiClientResponse = { status: 201 } as any;
        const itemDefinition: IItemDefinition = { parts: [] };
        const folderUri = vscode.Uri.file('/tmp/folder-create-with-progress');
        const progressReporter = {
            report: sinon.stub(),
        };

        apiClientMock.setup(x => x.sendRequest(It.IsAny()))
            .returns(Promise.resolve(apiResponse));

        const handleLongRunningOperationStub = sinon.stub(utilities, 'handleLongRunningOperation').resolves(apiResponse);

        // Act
        const result = await artifactManager.createArtifactWithDefinition(
            artifactMock.object(),
            itemDefinition,
            folderUri,
            { progress: progressReporter as any }
        );

        // Assert
        assert.strictEqual(result, apiResponse, 'Should return final API response');
        assert.ok(handleLongRunningOperationStub.calledOnce, 'handleLongRunningOperation should be called once');
        const handleLroArgs = handleLongRunningOperationStub.firstCall.args;
        assert.strictEqual(handleLroArgs[3], progressReporter, 'Progress reporter should be passed to handleLongRunningOperation');
    });
    [
        { status: 200 },
        { status: 202 },
        { status: 400 },
    ].forEach(({ status }) => {
        it(`updateArtifactDefinition: response status ${status}`, async function () {
            // Arrange
            const apiResponse: IApiClientResponse = {
                status: status,
            };
            const itemDefinition: IItemDefinition = {
                parts: [
                    {
                        path: 'notebook-content.py',
                        payload: 'IyBGYWJyaW',
                        payloadType: PayloadType.InlineBase64,
                    },
                    {
                        path: '.platform',
                        payload: 'ewogICIkc2N',
                        payloadType: PayloadType.InlineBase64,
                    },
                ],
            };

            let sendRequestArgs: IApiClientRequestOptions | undefined;
            apiClientMock.setup(x => x.sendRequest(It.IsAny()))
                .callback(({ args }) => {
                    sendRequestArgs = args[0];
                    return Promise.resolve(apiResponse);
                });

            const handleLongRunningOperationStub = sinon.stub(utilities, 'handleLongRunningOperation').resolves(apiResponse);

            // Act
            const result = await artifactManager.updateArtifactDefinition(artifactMock.object(), itemDefinition, vscode.Uri.file('/tmp/udef'));

            // Assert
            assert.strictEqual(result, apiResponse);

            apiClientMock.verify(x => x.sendRequest(It.IsAny()), Times.Once());
            assert.ok(sendRequestArgs, 'sendRequest should have been called');
            assert.strictEqual(sendRequestArgs.method, 'POST', 'sendRequest: Method');
            assert.strictEqual(sendRequestArgs.pathTemplate, `/v1/workspaces/${workspaceId}/items/${artifactId}/updateDefinition`, 'sendRequest: path template');
            assert.ok(sendRequestArgs.body, 'sendRequest: body should be defined');
            assert.ok(sendRequestArgs.body.definition, 'sendRequest: definition should be defined');
            assert.deepStrictEqual(sendRequestArgs.body.definition.parts, itemDefinition.parts, 'sendRequest body: parts should match');
            assert.ok(sendRequestArgs.headers, 'sendRequest: headers should be defined');
            assert.strictEqual(sendRequestArgs.headers['Content-Type'], 'application/json; charset=utf-8', 'sendRequest headers: Content-Type');

            artifactMock.verify(x => x.id, Times.AtLeastOnce());
            artifactMock.verify(x => x.workspaceId, Times.AtLeastOnce());

            assert.ok(handleLongRunningOperationStub.called, 'handleLongRunningOperation should be called');
        });
    });

    it('updateArtifactDefinition: invokes update definition workflow hooks and modifies request', async function () {
        // Arrange
        const apiResponse: IApiClientResponse = { status: 200 } as any;
        const itemDefinition: IItemDefinition = { parts: [] };
        const folderUri = vscode.Uri.file('/tmp/folder2');

        const onBeforeUpdateDefinitionStub = sinon.stub().callsFake(async (_artifact: IArtifact, def: IItemDefinition, folder: vscode.Uri, options: IApiClientRequestOptions) => {
            assert.strictEqual(def, itemDefinition, 'Definition should match');
            assert.strictEqual(folder.toString(), folderUri.toString(), 'Folder should match expected');
            options.pathTemplate = options.pathTemplate + '?sync=true';
            return options;
        });
        const onAfterUpdateDefinitionStub = sinon.stub().resolves();
        const updateWorkflow: IUpdateArtifactDefinitionWorkflow = {
            onBeforeUpdateDefinition: onBeforeUpdateDefinitionStub,
            onAfterUpdateDefinition: onAfterUpdateDefinitionStub,
        };
        const artifactHandlerMock = new Mock<IArtifactHandler>()
            .setup(h => h.updateDefinitionWorkflow)
            .returns(updateWorkflow);
        const mapMock = new Mock<IObservableReadOnlyMap<string, IArtifactHandler>>();
        mapMock.setup(m => m.get(It.Is(a => a === artifactType))).returns(artifactHandlerMock.object());
        extensionManagerMock.setup(x => x.artifactHandlers).returns(mapMock.object());

        const handleLongRunningOperationStub = sinon.stub(utilities, 'handleLongRunningOperation').resolves(apiResponse);

        let sendRequestArgs: IApiClientRequestOptions | undefined;
        apiClientMock.setup(x => x.sendRequest(It.IsAny()))
            .callback(({ args }) => {
                sendRequestArgs = args[0];
                return Promise.resolve(apiResponse);
            });

        // Act
        const result = await artifactManager.updateArtifactDefinition(artifactMock.object(), itemDefinition, folderUri);

        // Assert
        assert.strictEqual(result, apiResponse, 'Should return final API response');
        assert.ok(onBeforeUpdateDefinitionStub.calledOnce, 'onBeforeUpdateDefinition should be called once');
        assert.ok(onAfterUpdateDefinitionStub.calledOnce, 'onAfterUpdateDefinition should be called once');
        assert.ok(sendRequestArgs, 'sendRequestArgs should be defined');
        assert.ok(sendRequestArgs!.pathTemplate!.endsWith('?sync=true'), 'Path template should be modified by onBeforeUpdateDefinition');
        assert.ok(handleLongRunningOperationStub.calledOnce, 'handleLongRunningOperation should be called');
    });

    it('updateArtifactDefinition: passes progress reporter to handleLongRunningOperation', async function () {
        // Arrange
        const apiResponse: IApiClientResponse = { status: 200 } as any;
        const itemDefinition: IItemDefinition = { parts: [] };
        const folderUri = vscode.Uri.file('/tmp/folder-update-with-progress');
        const progressReporter = {
            report: sinon.stub(),
        };

        apiClientMock.setup(x => x.sendRequest(It.IsAny()))
            .returns(Promise.resolve(apiResponse));

        const handleLongRunningOperationStub = sinon.stub(utilities, 'handleLongRunningOperation').resolves(apiResponse);

        // Act
        const result = await artifactManager.updateArtifactDefinition(
            artifactMock.object(),
            itemDefinition,
            folderUri,
            { progress: progressReporter as any }
        );

        // Assert
        assert.strictEqual(result, apiResponse, 'Should return final API response');
        assert.ok(handleLongRunningOperationStub.calledOnce, 'handleLongRunningOperation should be called once');
        const handleLroArgs = handleLongRunningOperationStub.firstCall.args;
        assert.strictEqual(handleLroArgs[3], progressReporter, 'Progress reporter should be passed to handleLongRunningOperation');
    });
});
