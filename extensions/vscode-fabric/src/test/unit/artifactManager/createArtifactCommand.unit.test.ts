import { Mock, It, Times } from 'moq.ts';
import * as vscode from 'vscode';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { IApiClientResponse, IArtifact, IArtifactManager } from '@fabric/vscode-fabric-api';
import { promptForArtifactTypeAndName, createArtifactCommand } from '../../../artifactManager/createArtifactCommand';
import { IFabricExtensionManagerInternal } from '../../../apis/internal/fabricExtensionInternal';
import { ICreateItemsProvider, ItemCreationDetails, CreationCapability } from '../../../metadata/definitions';
import { FabricError, ILogger, TelemetryActivity} from '@fabric/vscode-fabric-util';
import { CoreTelemetryEventNames } from '../../../TelemetryEventNames';
import { FabricWorkspaceDataProvider } from '../../../workspace/treeView';
import { verifyAddOrUpdateProperties, verifyAddOrUpdatePropertiesNever } from '../../utilities/moqUtilities';
import { UserCancelledError } from '@fabric/vscode-fabric-util';

describe('promptForArtifactTypeAndName', function() {
    let contextMock: Mock<vscode.ExtensionContext>;
    let itemsProviderMock: Mock<ICreateItemsProvider>;
    
    let showQuickPickStub: sinon.SinonStub;
    let showInputBoxStub: sinon.SinonStub;

    beforeEach(function() {
        contextMock = new Mock<vscode.ExtensionContext>();
        itemsProviderMock = new Mock<ICreateItemsProvider>();

        // Stub VS Code window methods
        showQuickPickStub = sinon.stub(vscode.window, 'showQuickPick');
        showInputBoxStub = sinon.stub(vscode.window, 'showInputBox');
    });

    afterEach(function() {
        sinon.restore();
    });

    it('Item type selection is alphabetized by display name', async function() {
        // Arrange
        const itemA: ItemCreationDetails = {
            type: 'type1',
            displayName: 'Alpha',
            description: 'Create type1',
            creationCapability: CreationCapability.supported
        };
        const itemC: ItemCreationDetails = {
            type: 'type2',
            displayName: 'Charlie',
            description: 'Create type2',
            creationCapability: CreationCapability.supported
        };
        const itemB: ItemCreationDetails = {
            type: 'type3',
            displayName: 'Bravo',
            description: 'Create type3',
            creationCapability: CreationCapability.supported
        };
        // Provide items out of order
        itemsProviderMock
            .setup(x => x.getItemsForCreate(It.IsAny()))
            .returns([itemC, itemA, itemB]);

        let receivedItems: any[] = [];
        showQuickPickStub.callsFake((items: any[]) => {
            receivedItems = items;
            // Return the first item to continue execution
            return Promise.resolve(items[0]);
        });
        showInputBoxStub.resolves('TestName');

        // Act
        const result = await act();

        // Assert
        assert(result, 'Result should not be undefined');
        assert.strictEqual(result.type, 'type1', 'Should select the first item');
        assert.strictEqual(result.name, 'TestName', 'Should use the provided name');
        assert.strictEqual(receivedItems.length, 3, 'Should receive three items');
        const displayNames = receivedItems.map(i => i.label || i.displayName);
        const sorted = [...displayNames].sort((a, b) => a.localeCompare(b));
        assert.deepStrictEqual(displayNames, sorted, 'Items should be alphabetized by displayName');
    });

    it('User cancels type selection', async function() {
        // Arrange
        itemsProviderMock.setup(x => x.getItemsForCreate(It.IsAny())).returns([]);
        showQuickPickStub.resolves(undefined);

        // Act
        const result = await act();

        // Assert
        assert(!result, 'Result should be undefined');
    });

    it('User cancels name', async function() {
        // Arrange
        const itemDetails: ItemCreationDetails = {
            type: 'Notebook',
            displayName: 'Notebook',
            description: 'Create a new Notebook',
            creationCapability: CreationCapability.supported
        };
        itemsProviderMock.setup(x => x.getItemsForCreate(It.IsAny())).returns([itemDetails]);
        showQuickPickStub.resolves({ details: itemDetails, label: 'Notebook' });
        showInputBoxStub.resolves(undefined);

        // Act
        const result = await act();

        // Assert
        assert(!result, 'Result should be undefined');
    });

    async function act(): Promise<{ type: string, name: string } | undefined> {
        return await promptForArtifactTypeAndName(
            contextMock.object(),
            itemsProviderMock.object(),
        );
    }
});

describe('createArtifactCommand', function() {
    let artifactManagerMock: Mock<IArtifactManager>;
    let extensionManagerMock: Mock<IFabricExtensionManagerInternal>;
    let artifactMock: Mock<IArtifact>;    
    let telemetryActivityMock: Mock<TelemetryActivity<CoreTelemetryEventNames>>;
    let loggerMock: Mock<ILogger>;
    let dataProviderMock: Mock<FabricWorkspaceDataProvider>;

    let showInformationMessageStub: sinon.SinonStub;

    beforeEach(function() {
        artifactManagerMock = new Mock<IArtifactManager>();
        extensionManagerMock = new Mock<IFabricExtensionManagerInternal>();
        artifactMock = new Mock<IArtifact>();

        loggerMock = new Mock<ILogger>();
        loggerMock.setup(l => l.reportExceptionTelemetryAndLog(It.IsAny(), It.IsAny(), It.IsAny(), It.IsAny()))
            .returns();

        telemetryActivityMock = new Mock<TelemetryActivity<CoreTelemetryEventNames>>();
        telemetryActivityMock.setup(instance => instance.addOrUpdateProperties(It.IsAny()))
            .returns(undefined);

        dataProviderMock = new Mock<FabricWorkspaceDataProvider>();
        dataProviderMock.setup(instance => instance.refresh())
            .returns(undefined);

        // Setup workspace and environment mocks
        artifactManagerMock.setup(x => x.createArtifact(It.IsAny(), It.IsAny())).returns(Promise.resolve({ status: 200, parsedBody: { id: 'test-created-artifact-id' } } as IApiClientResponse));
        extensionManagerMock.setup(x => x.getArtifactHandler(It.IsAny())).returns(undefined);

        showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');        
    });

    afterEach(function() {
        sinon.restore();
    });

    it('No custom wizard', async function() {
        // Arrange

        // Act
        await executeCommand();

        // Assert
        artifactManagerMock.verify(
            x => x.createArtifact(
                artifactMock.object(),
                undefined
            ),
            Times.Once()
        );

        dataProviderMock.verify(
            x => x.refresh(),
            Times.Once()
        );

        verifyAddOrUpdateProperties(telemetryActivityMock, 'statusCode', '200');
        verifyAddOrUpdateProperties(telemetryActivityMock, 'artifactId', 'test-created-artifact-id');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'requestId');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'errorCode');

        loggerMock.verify(
            l => l.reportExceptionTelemetryAndLog(
                It.IsAny(),
                It.IsAny(),
                It.IsAny(),
                It.IsAny()
            ),
            Times.Never()
        );
    });

    it('Custom wizard', async function() {
        // Arrange
        artifactMock.setup(x => x.type).returns('Notebook');

        // Mock ICreateArtifactWorkflow and its showCreate method
        const createArtifactWorkflowMock = new Mock<{ showCreate: (artifact: IArtifact) => Promise<any> }>();
        const itemSpecificMetadata = { custom: 'metadata' };
        createArtifactWorkflowMock
            .setup(x => x.showCreate(It.IsAny<IArtifact>()))
            .returns(Promise.resolve(itemSpecificMetadata));

        // Setup extensionManager to return the mock workflow for the Notebook type
        extensionManagerMock
            .setup(x => x.getArtifactHandler('Notebook'))
            .returns({ createWorkflow: createArtifactWorkflowMock.object() } as any);

        // Act
        await executeCommand();

        // Assert
        createArtifactWorkflowMock.verify(
            x => x.showCreate(
                artifactMock.object(),
            ),
            Times.Once()
        );
        artifactManagerMock.verify(
            x => x.createArtifact(
                artifactMock.object(),
                itemSpecificMetadata // Should pass the metadata from the wizard
            ),
            Times.Once()
        );
    });

    it('Custom wizard, cancel', async function() {
        // Arrange
        artifactMock.setup(x => x.type).returns('Notebook');
        
        // Mock ICreateArtifactWorkflow and its showCreate method
        const createArtifactWorkflowMock = new Mock<{ showCreate: (artifact: IArtifact) => Promise<any> }>();
        createArtifactWorkflowMock
            .setup(x => x.showCreate(It.IsAny<IArtifact>()))
            .returns(Promise.resolve(undefined));

        // Setup extensionManager to return the mock workflow for the Notebook type
        extensionManagerMock
            .setup(x => x.getArtifactHandler('Notebook'))
            .returns({ createWorkflow: createArtifactWorkflowMock.object() } as any);

        // Act
        await assert.rejects(
            async () => {
                await executeCommand();
            },
            (err: Error) => {
                assert.ok(err instanceof UserCancelledError, 'Should throw a UserCancelledError');
                assert.ok(err.stepName, 'Should have a stepName');
                assert.strictEqual(err.stepName!, 'createWorkflow', 'Step name');
                return true;
            } 
        );

        // Assert
        createArtifactWorkflowMock.verify(
            x => x.showCreate(
                artifactMock.object(),
            ),
            Times.Once()
        );
        artifactManagerMock.verify(
            x => x.createArtifact(It.IsAny(), It.IsAny()),
            Times.Never()
        );

        dataProviderMock.verify(
            x => x.refresh(),
            Times.Never()
        );

        telemetryActivityMock.verify(
            t => t.addOrUpdateProperties(It.IsAny()),
            Times.Never()
        );

    });

    it('Error handling', async function() {
        // Arrange
        const apiClientResponseMock = new Mock<IApiClientResponse>();
        const errorResponseBody = {
            errorCode: 'InvalidInput',
            message: 'The input was invalid',
            requestId: 'req-12345',
        };
        apiClientResponseMock.setup(instance => instance.status).returns(400);
        apiClientResponseMock.setup(instance => instance.parsedBody).returns(errorResponseBody);
        artifactManagerMock.setup(x => x.createArtifact(It.IsAny(), It.IsAny()))
            .returns(Promise.resolve(apiClientResponseMock.object()));

        // Act & Assert
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
        artifactManagerMock.verify(
            x => x.createArtifact(
                artifactMock.object(),
                undefined
            ),
            Times.Once()
        );

        dataProviderMock.verify(
            x => x.refresh(),
            Times.Never()
        );

        assert.ok(error!.message.includes('Create Artifact'), 'Error message should include Create Artifact');

        verifyAddOrUpdateProperties(telemetryActivityMock, 'statusCode', '400');
        verifyAddOrUpdateProperties(telemetryActivityMock, 'requestId', 'req-12345');
        verifyAddOrUpdateProperties(telemetryActivityMock, 'errorCode', 'InvalidInput');
        verifyAddOrUpdatePropertiesNever(telemetryActivityMock, 'artifactId');
    });

    async function executeCommand(): Promise<void> {
        await createArtifactCommand(
            artifactManagerMock.object(),
            extensionManagerMock.object(),
            artifactMock.object(),
            dataProviderMock.object(),
            telemetryActivityMock.object(),
        );
    }

});
