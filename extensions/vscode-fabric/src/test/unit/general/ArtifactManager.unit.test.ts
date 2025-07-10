import * as Mocha from 'mocha';
import * as assert from 'assert';
import {
    IApiClientResponse,
    IArtifact,
    RuntimeType,
    InputType
} from '@fabric/vscode-fabric-api';
import { FabricEnvironmentName, MockApiClient, TelemetryService } from '@fabric/vscode-fabric-util';
import { MockArtifactManagerStub, MockFabricEnvironmentProvider, MockLoggerStub, initializeServiceCollection } from './serviceCollection';

class MockArtifactManager extends MockArtifactManagerStub {
    async getArtifactData(artifact: IArtifact): Promise<IApiClientResponse> {
        const returnData: IApiClientResponse = {
            parsedBody: {
                payloadContentType: 'InlineJson',
                workloadPayload: 'boom'
            },
            status: 200
        };
        return Promise.resolve(returnData);
    }
}

interface IExceptionInfo {
    methodName: string,
    faultMessage: string | null,
    eventName: string
}

class MockLogger extends MockLoggerStub {
    public exceptionInfo: IExceptionInfo[] = [];

    reportExceptionTelemetryAndLog(methodName: string, eventName: string, exception: unknown, telemetryService: TelemetryService | null, properties?: { [key: string]: string; } | undefined): void {
        let faultMessage: string | null = null;
        if (properties?.fault) {
            faultMessage = properties.fault;
            delete properties.fault;
        }
        else if (exception instanceof Error) {
            faultMessage = exception.message;
        }
        this.exceptionInfo.push({ methodName: methodName, faultMessage: faultMessage, eventName: eventName });
    }
}

describe('ArtifactManager tests that do not require VSCode', () => {
    it('getArtifactPayload: Invalid JSON', async () => {
        const logger: MockLogger = new MockLogger();
        const artifactManager: MockArtifactManager = new MockArtifactManager(null!, null!, new MockFabricEnvironmentProvider(), null!, logger, null, null!);
        const artifact: IArtifact = {
            id: 'FakeId',
            type: 'FakeType',
            displayName: 'FakeDisplayName',
            description: 'FakeDescription',
            workspaceId: 'FakeWorkspaceId',
            attributes: { runtime: RuntimeType.DotNet },
            fabricEnvironment: FabricEnvironmentName.MOCK
        };
        initializeServiceCollection(artifactManager, undefined, logger, undefined);
        try {
            await artifactManager.getArtifactPayload(artifact);
            assert.fail('getArtifactPayload should have issued an error');
        }
        catch (error) {
            assert.equal(logger.exceptionInfo.length, 1, 'Expected 1 call to reportExceptionTelemetryAndLog');
            assert.equal(logger.exceptionInfo[0].eventName, 'json-parse');
            assert.equal(logger.exceptionInfo[0].methodName, 'getArtifactPayload');
        }
    });
});
