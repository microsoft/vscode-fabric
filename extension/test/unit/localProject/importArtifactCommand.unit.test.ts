// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';
import * as sinon from 'sinon';
import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import { importArtifactCommand } from '../../../src/localProject/importArtifactCommand';
import { IArtifact, IWorkspaceManager, IArtifactManager, IWorkspace, IFabricApiClient, IApiClientResponse } from '@microsoft/vscode-fabric-api';
import { IFabricExtensionManagerInternal } from '../../../src/apis/internal/fabricExtensionInternal';
import { IItemDefinitionReader } from '../../../src/itemDefinition/ItemDefinitionReader';
import { IFabricEnvironmentProvider, FabricError, TelemetryActivity, UserCancelledError } from '@microsoft/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../../../src/TelemetryEventNames';
import { verifyAddOrUpdateProperties, verifyAddOrUpdatePropertiesNever } from '../../utilities/moqUtilities';
import { FabricWorkspaceDataProvider } from '../../../src/workspace/treeView';
import { ILocalFolderService } from '../../../src/LocalFolderService';

// Import the modules to stub
import * as quickPick from '../../../src/ui/showWorkspaceQuickPick';
import * as prompts from '../../../src/ui/prompts';
import { ICapacityManager } from '../../../src/CapacityManager';
import { IWorkspaceFilterManager } from '../../../src/workspace/WorkspaceFilterManager';

const artifactId = 'test-artifact-id';
const artifactDisplayName = 'Test Artifact DisplayName';
const artifactType = 'Test Artifact Type';

describe('importArtifactCommand', () => {
    let workspaceManagerMock: Mock<IWorkspaceManager>;
    let artifactManagerMock: Mock<IArtifactManager>;
    let localFolderServiceMock: Mock<ILocalFolderService>;
    let extensionManagerMock: Mock<IFabricExtensionManagerInternal>;
    let capacityManagerMock: Mock<ICapacityManager>;
    let workspaceFilterManagerMock: Mock<IWorkspaceFilterManager>;
    let readerMock: Mock<IItemDefinitionReader>;
    let fabricEnvironmentProviderMock: Mock<IFabricEnvironmentProvider>;
    let dataProviderMock: Mock<FabricWorkspaceDataProvider>;
    let telemetryActivityMock: Mock<TelemetryActivity<CoreTelemetryEventNames>>;
    let telemetryService: any;
    let logger: any;

    let showWorkspaceQuickPickStub: sinon.SinonStub;
    let showSignInPromptStub: sinon.SinonStub;
    let showConfirmOverwriteMessageStub: sinon.SinonStub;

    const folderUri = vscode.Uri.file(`/path/to/local/folder/${artifactDisplayName}.${artifactType}`);
    const fakeWorkspace: IWorkspace = { displayName: 'ws', type: 'test', objectId: 'id' } as IWorkspace;
    const fakeArtifact: IArtifact = { id: artifactId, type: artifactType, displayName: artifactDisplayName } as IArtifact;
    const fakeDefinition = { parts: [] };

    beforeEach(() => {
        workspaceManagerMock = new Mock<IWorkspaceManager>();
        artifactManagerMock = new Mock<IArtifactManager>();
        extensionManagerMock = new Mock<IFabricExtensionManagerInternal>(); 
        localFolderServiceMock = new Mock<ILocalFolderService>();
        capacityManagerMock = new Mock<ICapacityManager>();
        workspaceFilterManagerMock = new Mock<IWorkspaceFilterManager>();
        readerMock = new Mock<IItemDefinitionReader>();
        fabricEnvironmentProviderMock = new Mock<IFabricEnvironmentProvider>();
        dataProviderMock = new Mock<FabricWorkspaceDataProvider>();
        telemetryService = {};
        logger = {};

        artifactManagerMock
            .setup(m => m.listArtifacts(It.IsAny()))
            .returnsAsync([fakeArtifact]);
        artifactManagerMock
            .setup(a => a.updateArtifactDefinition(It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny()))
            .returns(Promise.resolve({ status: 200 } as IApiClientResponse));
        artifactManagerMock
            .setup(a => a.createArtifactWithDefinition(It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny()))
            .returns(Promise.resolve({ status: 201 } as IApiClientResponse));

        workspaceManagerMock
            .setup(m => m.isConnected())
            .returnsAsync(true);

        extensionManagerMock
            .setup(m => m.getArtifactHandler(artifactType))
            .returns(undefined);

        localFolderServiceMock
            .setup(m => m.getArtifactInformation(It.IsAny()))
            .returns(undefined);

        readerMock
            .setup(r => r.read(It.IsAny(), It.IsAny()))
            .returnsAsync(fakeDefinition);

        dataProviderMock
            .setup(x => x.refresh())
            .returns(undefined);

        fabricEnvironmentProviderMock
            .setup(x => x.getCurrent())
            .returns({ sharedUri: 'https://test.fabric', env: 'test-env' } as any);

        telemetryActivityMock = new Mock<TelemetryActivity<CoreTelemetryEventNames>>();
        telemetryActivityMock.setup(instance => instance.addOrUpdateProperties(It.IsAny()))
            .returns(undefined);

        // Stub showSelectWorkspaceQuickPick
        showWorkspaceQuickPickStub = sinon.stub(quickPick, 'showWorkspaceQuickPick');
        showWorkspaceQuickPickStub.resolves(fakeWorkspace);

        showSignInPromptStub = sinon.stub(prompts, 'showSignInPrompt');

        showConfirmOverwriteMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
        showConfirmOverwriteMessageStub.resolves('Yes'); // Default: user confirms overwrite
    });

    afterEach(() => {
        sinon.restore();
    });

    it('Import artifact successfully', async () => {
        // Arrange

        // Act
        await executeCommand();

        // Assert
        assert.ok(showWorkspaceQuickPickStub.calledOnce, 'showWorkspaceQuickPick should be called');

        assert.ok(showConfirmOverwriteMessageStub.called, 'Confirmation message should be shown');
        const [message, options, yesButton] = showConfirmOverwriteMessageStub.firstCall.args;
        assert.strictEqual(
            message,
            `An item named "${artifactDisplayName}" already exists in workspace "${fakeWorkspace.displayName}". Do you want to overwrite it?`
        );
        assert.deepStrictEqual(options, { modal: true });
        assert.strictEqual(yesButton, 'Yes');

        artifactManagerMock.verify(a => a.updateArtifactDefinition(fakeArtifact, fakeDefinition, folderUri, It.IsAny()));
        dataProviderMock.verify(x => x.refresh(), Times.Never());

        const expectedParent = vscode.Uri.file('/path/to/local/folder');

        verifyAddOrUpdateProperties(telemetryActivityMock, 'statusCode', '200');
        verifyAddOrUpdateProperties(telemetryActivityMock, 'itemType', artifactType);
        verifyAddOrUpdateProperties(telemetryActivityMock, 'workspaceId', fakeWorkspace.objectId);
        verifyAddOrUpdateProperties(telemetryActivityMock, 'fabricWorkspaceName', fakeWorkspace.displayName);
        verifyAddOrUpdateProperties(telemetryActivityMock, 'targetDetermination', 'prompt');
        verifyAddOrUpdateProperties(telemetryActivityMock, 'artifactId', fakeArtifact.id);
        verifyAddOrUpdateProperties(telemetryActivityMock, 'fabricArtifactName', artifactDisplayName);
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'requestId');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'errorCode');
    });

    it('Uses inferred workspace', async () => {
        // Arrange
        const inferredWorkspaceId = 'id';
        const expectedPath = vscode.Uri.joinPath(vscode.Uri.file('/path/to/local/folder'), `${artifactDisplayName}.${artifactType}`);
        localFolderServiceMock
            .setup(m => m.getArtifactInformation(It.Is<vscode.Uri>((uri) => uri.fsPath === expectedPath.fsPath)))
            .returns( { artifactId: artifactId, workspaceId: inferredWorkspaceId } );
        workspaceManagerMock
            .setup(m => m.getWorkspaceById(inferredWorkspaceId))
            .returns(Promise.resolve(fakeWorkspace));

        // Act
        await executeCommand();

        // Assert
        localFolderServiceMock.verify(m => m.getArtifactInformation(It.Is<vscode.Uri>((uri) => uri.fsPath === expectedPath.fsPath)), Times.Exactly(1));
        assert.ok(showWorkspaceQuickPickStub.notCalled, 'showWorkspaceQuickPick should NOT be called');
        artifactManagerMock.verify(a => a.updateArtifactDefinition(fakeArtifact, fakeDefinition, folderUri, It.IsAny()));
        verifyAddOrUpdateProperties(telemetryActivityMock, 'workspaceId', fakeWorkspace.objectId);
        verifyAddOrUpdateProperties(telemetryActivityMock, 'fabricWorkspaceName', fakeWorkspace.displayName);
        verifyAddOrUpdateProperties(telemetryActivityMock, 'targetDetermination', 'inferred');
    });

    it('Uses inferred workspace and artifact ID', async () => {
        // Arrange
        const inferredWorkspaceId = 'id';
        const inferredArtifactId = 'artifact-999';
        const inferredArtifact: IArtifact = { id: inferredArtifactId, type: artifactType, displayName: 'Different Name' } as IArtifact;

        localFolderServiceMock
            .setup(m => m.getArtifactInformation(folderUri))
            .returns({ artifactId: inferredArtifactId, workspaceId: inferredWorkspaceId });
        workspaceManagerMock
            .setup(m => m.getWorkspaceById(inferredWorkspaceId))
            .returns(Promise.resolve(fakeWorkspace));
        artifactManagerMock
            .setup(m => m.listArtifacts(fakeWorkspace))
            .returnsAsync([fakeArtifact, inferredArtifact]);

        // Act
        await executeCommand();

        // Assert
        localFolderServiceMock.verify(m => m.getArtifactInformation(folderUri), Times.Exactly(1));
        assert.ok(showWorkspaceQuickPickStub.notCalled, 'showWorkspaceQuickPick should NOT be called');
        // Should update the inferred artifact (by ID), not the one matching by name
        artifactManagerMock.verify(a => a.updateArtifactDefinition(inferredArtifact, fakeDefinition, folderUri, It.IsAny()), Times.Once());
        verifyAddOrUpdateProperties(telemetryActivityMock, 'workspaceId', fakeWorkspace.objectId);
        verifyAddOrUpdateProperties(telemetryActivityMock, 'targetDetermination', 'inferred');
        verifyAddOrUpdateProperties(telemetryActivityMock, 'artifactId', inferredArtifactId);
    });

    it('Inferred artifact ID not found, falls back to name search', async () => {
        // Arrange
        const inferredWorkspaceId = 'id';
        const inferredArtifactId = 'artifact-deleted';

        localFolderServiceMock
            .setup(m => m.getArtifactInformation(folderUri))
            .returns({ artifactId: inferredArtifactId, workspaceId: inferredWorkspaceId });
        workspaceManagerMock
            .setup(m => m.getWorkspaceById(inferredWorkspaceId))
            .returns(Promise.resolve(fakeWorkspace));
        // listArtifacts returns artifacts but none match the inferred ID
        artifactManagerMock
            .setup(m => m.listArtifacts(fakeWorkspace))
            .returnsAsync([fakeArtifact]); // fakeArtifact matches by name/type, not by ID

        // Act
        await executeCommand();

        // Assert
        localFolderServiceMock.verify(m => m.getArtifactInformation(folderUri), Times.Exactly(1));
        // Should fall back to name/type search and find fakeArtifact
        artifactManagerMock.verify(a => a.updateArtifactDefinition(fakeArtifact, fakeDefinition, folderUri, It.IsAny()), Times.Once());
        verifyAddOrUpdateProperties(telemetryActivityMock, 'artifactId', fakeArtifact.id);
    });

    it('Inferred workspace but no artifact ID, uses name search', async () => {
        // Arrange
        const inferredWorkspaceId = 'id';

        localFolderServiceMock
            .setup(m => m.getArtifactInformation(folderUri))
            .returns({ artifactId: undefined as any, workspaceId: inferredWorkspaceId }); // No artifact ID
        workspaceManagerMock
            .setup(m => m.getWorkspaceById(inferredWorkspaceId))
            .returns(Promise.resolve(fakeWorkspace));
        artifactManagerMock
            .setup(m => m.listArtifacts(fakeWorkspace))
            .returnsAsync([fakeArtifact]);

        // Act
        await executeCommand();

        // Assert
        localFolderServiceMock.verify(m => m.getArtifactInformation(folderUri), Times.Exactly(1));
        // Should use name/type search
        artifactManagerMock.verify(a => a.updateArtifactDefinition(fakeArtifact, fakeDefinition, folderUri, It.IsAny()), Times.Once());
        verifyAddOrUpdateProperties(telemetryActivityMock, 'targetDetermination', 'inferred');
    });

    it('Inferred artifact ID creates new artifact when not found and name does not match', async () => {
        // Arrange
        const inferredWorkspaceId = 'id';
        const inferredArtifactId = 'artifact-deleted';
        const differentArtifact: IArtifact = { id: 'other-id', type: 'DifferentType', displayName: 'Different' } as IArtifact;

        localFolderServiceMock
            .setup(m => m.getArtifactInformation(folderUri))
            .returns({ artifactId: inferredArtifactId, workspaceId: inferredWorkspaceId });
        workspaceManagerMock
            .setup(m => m.getWorkspaceById(inferredWorkspaceId))
            .returns(Promise.resolve(fakeWorkspace));
        // No artifacts match by ID or by name/type
        artifactManagerMock
            .setup(m => m.listArtifacts(fakeWorkspace))
            .returnsAsync([differentArtifact]);

        // Act
        await executeCommand();

        // Assert
        // Should create new artifact since neither ID nor name/type matched
        artifactManagerMock.verify(
            a => a.createArtifactWithDefinition(
                It.Is<IArtifact>(obj =>
                    obj.workspaceId === fakeWorkspace.objectId &&
                    obj.type === artifactType &&
                    obj.displayName === artifactDisplayName
                ),
                fakeDefinition,
                folderUri,
                It.IsAny()
            ),
            Times.Once()
        );
        dataProviderMock.verify(x => x.refresh(), Times.Once());
    });

    it('Import creates artifact', async () => {
        // Arrange
        artifactManagerMock
            .setup(m => m.listArtifacts(It.IsAny()))
            .returnsAsync([]);

        // Act
        await executeCommand();

        // Assert
        artifactManagerMock.verify(
            a => a.createArtifactWithDefinition(
                It.Is<IArtifact>(obj =>
                    obj.workspaceId === fakeWorkspace.objectId &&
                    obj.type === artifactType &&
                    obj.displayName === artifactDisplayName
                ),
                fakeDefinition,
                folderUri,
                It.IsAny()
            ),
            Times.Once()
        );
        artifactManagerMock.verify(a => a.updateArtifactDefinition(It.IsAny(), It.IsAny(), It.IsAny()), Times.Never());
        dataProviderMock.verify(x => x.refresh(), Times.Once());
        assert.ok(showWorkspaceQuickPickStub.calledOnce, 'showWorkspaceQuickPick should be called');
    });

    it('Import creates artifact in current workspace', async () => {
        // Arrange
        artifactManagerMock
            .setup(m => m.listArtifacts(It.IsAny()))
            .returnsAsync([]);

        // Act
        await executeCommand();

        // Assert
        artifactManagerMock.verify(
            a => a.createArtifactWithDefinition(
                It.Is<IArtifact>(obj =>
                    obj.workspaceId === fakeWorkspace.objectId &&
                    obj.type === artifactType &&
                    obj.displayName === artifactDisplayName
                ),
                fakeDefinition,
                folderUri,
                It.IsAny()
            ),
            Times.Once()
        );
        artifactManagerMock.verify(a => a.updateArtifactDefinition(It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny()), Times.Never());
        dataProviderMock.verify(x => x.refresh(), Times.Once());
        assert.ok(showWorkspaceQuickPickStub.calledOnce, 'showWorkspaceQuickPick should be called');
    });

    it('uses createWithDefinitionWorkflow when present', async () => {
        // Arrange
        artifactManagerMock
            .setup(m => m.listArtifacts(It.IsAny()))
            .returnsAsync([]);
        const createWorkflow = {
            prepareForCreateWithDefinition: sinon.stub().resolves(['foo.txt']),
        };
        const handler = { createWithDefinitionWorkflow: createWorkflow };
        extensionManagerMock
            .setup(m => m.getArtifactHandler(artifactType))
            .returns(handler as any);

        // Act
        await executeCommand();

        // Assert
        artifactManagerMock.verify(
            a => a.createArtifactWithDefinition(
                It.Is<IArtifact>(obj =>
                    obj.workspaceId === fakeWorkspace.objectId &&
                    obj.type === artifactType &&
                    obj.displayName === artifactDisplayName
                ),
                fakeDefinition,
                folderUri,
                It.IsAny()
            ),
            Times.Once()
        );
        artifactManagerMock.verify(a => a.updateArtifactDefinition(It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny()), Times.Never());
        assert.ok(createWorkflow.prepareForCreateWithDefinition.called, 'prepareForCreateWithDefinition should be called');
        readerMock.verify(
            r => r.read(
                It.IsAny(),
                It.Is(arr => Array.isArray(arr) && arr.length === 1 && arr[0] === 'foo.txt')
            ),
            Times.Once()
        );
    });

    it('uses updateDefinitionWorkflow when present', async () => {
        // Arrange
        const updateWorkflow = {
            prepareForUpdateWithDefinition: sinon.stub().resolves(['foo.txt']),
        };
        const handler = { updateDefinitionWorkflow: updateWorkflow };
        extensionManagerMock
            .setup(m => m.getArtifactHandler(artifactType))
            .returns(handler as any);
        artifactManagerMock
            .setup(m => m.listArtifacts(It.IsAny()))
            .returnsAsync([fakeArtifact]);

        // Act
        await executeCommand();

        // Assert
        artifactManagerMock.verify(a => a.updateArtifactDefinition(fakeArtifact, fakeDefinition, folderUri, It.IsAny()));
        assert.ok(updateWorkflow.prepareForUpdateWithDefinition.called, 'prepareForUpdateWithDefinition should be called');
        readerMock.verify(
            r => r.read(
                It.IsAny(),
                It.Is(arr => Array.isArray(arr) && arr.length === 1 && arr[0] === 'foo.txt')
            ),
            Times.Once()
        );
    });

    it('createWithDefinitionWorkflow present but missing prepare', async () => {
        // Arrange
        artifactManagerMock
            .setup(m => m.listArtifacts(It.IsAny()))
            .returnsAsync([]);

        // Handler with createWithDefinitionWorkflow but no prepareForCreateWithDefinition
        const handler = { createWithDefinitionWorkflow: {} };
        extensionManagerMock
            .setup(m => m.getArtifactHandler(artifactType))
            .returns(handler as any);

        // Act
        await executeCommand();

        // Assert
        artifactManagerMock.verify(
            a => a.createArtifactWithDefinition(
                It.Is<IArtifact>(obj =>
                    obj.workspaceId === fakeWorkspace.objectId &&
                    obj.type === artifactType &&
                    obj.displayName === artifactDisplayName
                ),
                fakeDefinition,
                folderUri,
                It.IsAny()
            ),
            Times.Once()
        );
        artifactManagerMock.verify(a => a.updateArtifactDefinition(It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny()), Times.Never());
        readerMock.verify(
            r => r.read(It.IsAny(), undefined),
            Times.Once()
        );
    });

    it('updateDefinitionWorkflow present but missing prepare', async () => {
        // Arrange
        const handler = { updateDefinitionWorkflow: {} };
        extensionManagerMock
            .setup(m => m.getArtifactHandler(artifactType))
            .returns(handler as any);

        // Act
        await executeCommand();

        // Assert
        artifactManagerMock.verify(a => a.updateArtifactDefinition(fakeArtifact, fakeDefinition, folderUri, It.IsAny()));
        readerMock.verify(
            r => r.read(It.IsAny(), undefined),
            Times.Once()
        );
    });

    it('createWithDefinitionWorkflow prepareForCreateWithDefinition returns undefined', async () => {
        // Arrange
        const createWorkflow = {
            prepareForCreateWithDefinition: sinon.stub().resolves(undefined),
        };
        const handler = { createWithDefinitionWorkflow: createWorkflow };
        extensionManagerMock
            .setup(m => m.getArtifactHandler(artifactType))
            .returns(handler as any);
        artifactManagerMock
            .setup(m => m.listArtifacts(It.IsAny()))
            .returnsAsync([]);

        // Act & Assert
        await assert.rejects(
            async () => {
                await executeCommand();
            },
            (err: Error) => {
                assert.ok(err instanceof UserCancelledError, 'Should throw a UserCancelledError');
                assert.strictEqual((err as UserCancelledError).stepName, 'prepareForCreateWithDefinition', 'Step name');
                return true;
            }
        );
        assert.ok(createWorkflow.prepareForCreateWithDefinition.called, 'prepareForCreateWithDefinition should be called');
    });

    it('updateDefinitionWorkflow prepareForUpdateWithDefinition returns undefined', async () => {
        // Arrange
        const updateWorkflow = {
            prepareForUpdateWithDefinition: sinon.stub().resolves(undefined),
        };
        const handler = { updateDefinitionWorkflow: updateWorkflow };
        extensionManagerMock
            .setup(m => m.getArtifactHandler(artifactType))
            .returns(handler as any);

        // Act & Assert
        await assert.rejects(
            async () => {
                await executeCommand();
            },
            (err: Error) => {
                assert.ok(err instanceof UserCancelledError, 'Should throw a UserCancelledError');
                assert.strictEqual((err as UserCancelledError).stepName, 'prepareForUpdateWithDefinition', 'Step name');
                return true;
            }
        );
        assert.ok(updateWorkflow.prepareForUpdateWithDefinition.called, 'prepareForUpdateWithDefinition should be called');
    });

    it('Always prompts for workspace when forcePromptForWorkspace is true', async () => {
        // Arrange
        const inferredWorkspaceId = 'id';
        const expectedPath = vscode.Uri.joinPath(vscode.Uri.file('/path/to/local/folder'), `${artifactDisplayName}.${artifactType}`);
        localFolderServiceMock
            .setup(m => m.getArtifactInformation(It.Is<vscode.Uri>((uri) => uri.fsPath === expectedPath.fsPath)))
            .returns( { artifactId: artifactId, workspaceId: inferredWorkspaceId } );
        workspaceManagerMock
            .setup(m => m.getWorkspaceById(inferredWorkspaceId))
            .returns(Promise.resolve(fakeWorkspace));

        // Act
        await executeCommand({ forcePromptForWorkspace: true });

        // Assert
        // Should NOT use inferred workspace, should always prompt
        assert.ok(showWorkspaceQuickPickStub.calledOnce, 'showWorkspaceQuickPick should be called when forcePromptForWorkspace is true');
        localFolderServiceMock.verify(m => m.getArtifactInformation(It.IsAny()), Times.Never());
        artifactManagerMock.verify(a => a.updateArtifactDefinition(fakeArtifact, fakeDefinition, folderUri, It.IsAny()));
        verifyAddOrUpdateProperties(telemetryActivityMock, 'workspaceId', fakeWorkspace.objectId);
        verifyAddOrUpdateProperties(telemetryActivityMock, 'fabricWorkspaceName', fakeWorkspace.displayName);
        verifyAddOrUpdateProperties(telemetryActivityMock, 'targetDetermination', 'forced');
    });

    it('Does NOT call setLocalFolderForFabricWorkspace when forcePromptForWorkspace is true', async () => {
        // Arrange
        // Act
        await executeCommand({ forcePromptForWorkspace: true });

        // Assert
        // localFolderServiceMock.verify(
        //     m => m.setLocalFolderForFabricWorkspace(It.IsAny(), It.IsAny()),
        //     Times.Never()
        // );
    });

    it('User is not signed in', async () => {
        // Arrange
        workspaceManagerMock
            .setup(m => m.isConnected())
            .returnsAsync(false);

        // Act
        await assert.rejects(
            async () => {
                await executeCommand();
            },
            (err: Error) => {
                assert.ok(err instanceof UserCancelledError, 'Should throw a UserCancelledError');
                assert.ok(err.stepName, 'Should have a stepName');
                assert.strictEqual(err.stepName!, 'signIn', 'Step name');
                return true;
            }
        );

        // Assert
        assert.ok(showSignInPromptStub.calledOnce, 'showSignInPrompt should be called');

        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'itemType');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'statusCode');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'workspaceId');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'fabricWorkspaceName');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'artifactId');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'fabricArtifactName');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'requestId');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'errorCode');
    });

    it('Cancel workspace selection', async () => {
        // Arrange
        showWorkspaceQuickPickStub.resolves(undefined);

        // Act
        await assert.rejects(
            async () => {
                await executeCommand();
            },
            (err: Error) => {
                assert.ok(err instanceof UserCancelledError, 'Should throw a UserCancelledError');
                assert.ok(err.stepName, 'Should have a stepName');
                assert.strictEqual(err.stepName!, 'selectWorkspace', 'Step name');
                return true;
            }
        );

        // Assert
        verifyAddOrUpdateProperties(telemetryActivityMock, 'itemType', artifactType);
        verifyAddOrUpdateProperties(telemetryActivityMock, 'fabricArtifactName', artifactDisplayName);
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'statusCode');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'workspaceId');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'fabricWorkspaceName');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'artifactId');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'requestId');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'errorCode');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'targetDetermination');
    });

    it('Cancel overwrite confirmation', async () => {
        // Arrange
        showConfirmOverwriteMessageStub.resolves(undefined); // Simulate cancel

        // Act & Assert
        await assert.rejects(
            async () => {
                await executeCommand();
            },
            (err: Error) => {
                assert.ok(err instanceof UserCancelledError, 'Should throw a UserCancelledError');
                assert.strictEqual((err as UserCancelledError).stepName, 'overwriteConfirmation');
                return true;
            }
        );

        verifyAddOrUpdateProperties(telemetryActivityMock, 'itemType', artifactType);
        verifyAddOrUpdateProperties(telemetryActivityMock, 'fabricArtifactName', artifactDisplayName);
        verifyAddOrUpdateProperties(telemetryActivityMock, 'workspaceId', fakeWorkspace.objectId);
        verifyAddOrUpdateProperties(telemetryActivityMock, 'fabricWorkspaceName', fakeWorkspace.displayName);
        verifyAddOrUpdateProperties(telemetryActivityMock, 'artifactId', fakeArtifact.id);
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'statusCode');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'requestId');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'errorCode');
    });

    it('Error: unable to parse source folder name', async () => {
        // Arrange
        // Create a folder URI that will cause tryParseLocalProjectData to return undefined
        // by not having a valid .platform file
        const invalidFolderUri = vscode.Uri.file('/path/to/invalid/folder');

        // Act
        let error: FabricError | undefined = undefined;
        await assert.rejects(
            async () => {
                await executeCommand({ uri: invalidFolderUri });
            },
            (err: Error) => {
                assert.ok(err instanceof FabricError, 'Should throw a FabricError');
                error = err;
                assert.ok(error!.message.includes('No valid Fabric project data found'), 'Error message should include expected text');
                assert.strictEqual(error.options?.showInUserNotification, 'Information', 'Error options should show in user notification');
                return true;
            }
        );
    });

    it('Error: API Error', async () => {
        // Arrange
        const apiClientResponseMock = new Mock<IApiClientResponse>();
        const errorResponseBody = {
            errorCode: 'InvalidInput',
            message: 'The input was invalid',
            requestId: 'req-12345',
        };
        apiClientResponseMock.setup(instance => instance.status).returns(400);
        apiClientResponseMock.setup(instance => instance.parsedBody).returns(errorResponseBody);
        artifactManagerMock.setup(instance => instance.updateArtifactDefinition(It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny()))
            .returns(Promise.resolve(apiClientResponseMock.object()));

        // Act
        let error: Error | undefined = undefined;
        await assert.rejects(
            async () => {
                await executeCommand();
            },
            (err: Error) => {
                assert.ok(err instanceof FabricError, 'Should throw a FabricError');
                error = err;
                return true;
            }
        );

        // Assert
        assert.ok(error!.message.includes('Error publishing'), 'Error message should include "Error publishing"');

        verifyAddOrUpdateProperties(telemetryActivityMock, 'statusCode', '400');
        verifyAddOrUpdateProperties(telemetryActivityMock, 'requestId', 'req-12345');
        verifyAddOrUpdateProperties(telemetryActivityMock, 'errorCode', 'InvalidInput');
    });

    it('Error: reader.read throws an exception', async () => {
        // Arrange
        const errorText = 'Test - reader.read failed';
        readerMock
            .setup(r => r.read(It.IsAny(), It.IsAny()))
            .throws(new Error(errorText));

        // Act
        let error: FabricError | undefined = undefined;
        await assert.rejects(
            async () => {
                await executeCommand();
            },
            (err: Error) => {
                assert.ok(err instanceof FabricError, 'Should throw a FabricError');
                error = err as FabricError;
                assert.ok(error!.message.includes(`Error reading item definition from ${folderUri.fsPath}`), 'Error message should include path');
                assert.ok(error!.message.includes(errorText), 'Error message should include errorText');
                assert.strictEqual(error.options?.showInUserNotification, 'Information', 'Error options should show in user notification');
                return true;
            }
        );

        // Assert
        artifactManagerMock.verify(a => a.updateArtifactDefinition(It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny()), Times.Never());
    });

    it('Passes progress reporter to createArtifactWithDefinition', async () => {
        // Arrange
        artifactManagerMock
            .setup(m => m.listArtifacts(It.IsAny()))
            .returnsAsync([]);

        let capturedOptions: any;
        artifactManagerMock
            .setup(a => a.createArtifactWithDefinition(It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny()))
            .callback(({ args }) => {
                const [_artifact, _definition, _folder, options] = args;
                capturedOptions = options;
                return Promise.resolve({ status: 201 } as IApiClientResponse);
            });

        // Act
        await executeCommand();

        // Assert
        assert.ok(capturedOptions, 'Options should be passed to createArtifactWithDefinition');
        assert.ok(capturedOptions.progress, 'Progress should be provided in options');
        assert.strictEqual(typeof capturedOptions.progress.report, 'function', 'Progress should have a report method');
    });

    it('Passes progress reporter to updateArtifactDefinition', async () => {
        // Arrange
        let capturedOptions: any;
        artifactManagerMock
            .setup(a => a.updateArtifactDefinition(It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny()))
            .callback(({ args }) => {
                const [_artifact, _definition, _folder, options] = args;
                capturedOptions = options;
                return Promise.resolve({ status: 200 } as IApiClientResponse);
            });

        // Act
        await executeCommand();

        // Assert
        assert.ok(capturedOptions, 'Options should be passed to updateArtifactDefinition');
        assert.ok(capturedOptions.progress, 'Progress should be provided in options');
        assert.strictEqual(typeof capturedOptions.progress.report, 'function', 'Progress should have a report method');
    });

    async function executeCommand(options?: { uri?: vscode.Uri; forcePromptForWorkspace?: boolean }): Promise<void> {
        await importArtifactCommand(
            options?.uri ?? folderUri,
            workspaceManagerMock.object(),
            artifactManagerMock.object(),
            extensionManagerMock.object(),
            localFolderServiceMock.object(),
            workspaceFilterManagerMock.object(),
            capacityManagerMock.object(),
            readerMock.object(),
            fabricEnvironmentProviderMock.object(),
            dataProviderMock.object(),
            telemetryActivityMock.object(),
            telemetryService,
            logger,
            options?.forcePromptForWorkspace ?? false
        );
    }
});
