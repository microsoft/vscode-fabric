import * as vscode from 'vscode';

import * as assert from 'assert';
import { Mock, It, Times } from 'moq.ts';
import * as sinon from 'sinon';
import { isDirectory, workspaceContainsDirectory, succeeded, formatErrorResponse, handleLongRunningOperation } from '../../../utilities';
import { IApiClientRequestOptions, IApiClientResponse, IFabricApiClient } from '@fabric/vscode-fabric-api';

describe('isDirectory', () => {
    it('Directory', async () => {
        await runWithStat(vscode.FileType.Directory, true);
    });

    it('File', async () => {
        await runWithStat(vscode.FileType.File, false);
    });

    it('Unknown', async () => {
        await runWithStat(vscode.FileType.Unknown, false);
    });

    it('Symbolic Link -> Directory', async () => {
        await runWithStat(vscode.FileType.SymbolicLink | vscode.FileType.Directory, false);
    });

    it('Symbolic Link -> File', async () => {
        await runWithStat(vscode.FileType.SymbolicLink | vscode.FileType.File, false);
    });

    it('Error, default value is false', async () => {
        await runWithError(false);
    });
    
    it('Error, default value is true', async () => {
        await runWithError(true);
    });

    async function runWithStat(type: vscode.FileType, expected: boolean): Promise<void> {
        const mockFileSystem = new Mock<vscode.FileSystem>()
            .setup(fs => fs.stat(It.IsAny()))
            .returns(Promise.resolve({ type: type } as vscode.FileStat));

        const uri = vscode.Uri.file('/path/to/local/thing');
        const result = await isDirectory(mockFileSystem.object(), uri);
        assert.strictEqual(result, expected);
    };

    async function runWithError(expected: boolean): Promise<void> {
        const mockFileSystem = new Mock<vscode.FileSystem>()
            .setup(fs => fs.stat(It.IsAny()))
            .throws(new Error('File not found'));

        const uri = vscode.Uri.file('/path/to/local/thing');
        const result = await isDirectory(mockFileSystem.object(), uri, expected);
        assert.strictEqual(result, expected);
    };
    
});

describe('workspaceContainsDirectory', () => {
    let workspaceFoldersStub: sinon.SinonStub;

    afterEach(() => {
        sinon.restore();
    });

    it('Undefined workspace', () => {
        workspaceFoldersStub = sinon.stub(vscode.workspace, 'workspaceFolders').value(undefined);

        const uri = vscode.Uri.file('/path/to/local/thing');
        const result = workspaceContainsDirectory(uri);
        assert.strictEqual(result, false);
    });

    it('Empty workspace', () => {
        workspaceFoldersStub = sinon.stub(vscode.workspace, 'workspaceFolders').value([]);

        const uri = vscode.Uri.file('/path/to/local/thing');
        const result = workspaceContainsDirectory(uri);
        assert.strictEqual(result, false);
    });

    it('Single folder, exact match', () => {
        workspaceFoldersStub = sinon.stub(vscode.workspace, 'workspaceFolders').value([
            {
                uri: vscode.Uri.file('/path/to/local/thing'),
                name: 'thing',
                index: 0,
            }
        ]);

        const uri = vscode.Uri.file('/path/to/local/thing');
        const result = workspaceContainsDirectory(uri);
        assert.strictEqual(result, true);
    });

    it('Multiple folders, exact match', () => {
        workspaceFoldersStub = sinon.stub(vscode.workspace, 'workspaceFolders').value([
            {
                uri: vscode.Uri.file('/path/to/local/thing'),
                name: 'thing',
                index: 0,
            },
            {
                uri: vscode.Uri.file('/path/to/local/different'),
                name: 'different',
                index: 1,
            }
        ]);

        const uri = vscode.Uri.file('/path/to/local/different');
        const result = workspaceContainsDirectory(uri);
        assert.strictEqual(result, true);
    });

    it('Multiple folders, child match', () => {
        workspaceFoldersStub = sinon.stub(vscode.workspace, 'workspaceFolders').value([
            {
                uri: vscode.Uri.file('/path/to/local/thing'),
                name: 'thing',
                index: 0,
            },
            {
                uri: vscode.Uri.file('/path/to/local/different'),
                name: 'different',
                index: 1,
            }
        ]);

        const uri = vscode.Uri.file('/path/to/local/thing/child');
        const result = workspaceContainsDirectory(uri);
        assert.strictEqual(result, true);
    });

    it('Multiple folders, descendant match', () => {
        workspaceFoldersStub = sinon.stub(vscode.workspace, 'workspaceFolders').value([
            {
                uri: vscode.Uri.file('/path/to/local/thing'),
                name: 'thing',
                index: 0,
            },
            {
                uri: vscode.Uri.file('/path/to/local/different'),
                name: 'different',
                index: 1,
            }
        ]);

        const uri = vscode.Uri.file('/path/to/local/different/child/another/andanother');
        const result = workspaceContainsDirectory(uri);
        assert.strictEqual(result, true);
    });

    it('Multiple folders, match start (false)', () => {
        workspaceFoldersStub = sinon.stub(vscode.workspace, 'workspaceFolders').value([
            {
                uri: vscode.Uri.file('/path/to/local/thing'),
                name: 'thing',
                index: 0,
            },
            {
                uri: vscode.Uri.file('/path/to/local/different'),
                name: 'different',
                index: 1,
            }
        ]);

        const uri = vscode.Uri.file('/path/to/local/differenter/child/another/andanother');
        const result = workspaceContainsDirectory( uri);
        assert.strictEqual(result, false);
    });

});

describe('succeeded', () => {
    [
        { status: 199, expected: false },
        { status: 200, expected: true },
        { status: 299, expected: true },
        { status: 300, expected: false }
    ].forEach(({ status, expected }) => {
        it(`returns ${expected} for status ${status}`, () => {
            const response = { status } as unknown as IApiClientResponse;
            const result = succeeded(response);
            assert.strictEqual(result, expected);
        });
    });
});

describe('formatErrorResponse', () => {
    function createResponse(overrides?: Partial<IApiClientResponse>): IApiClientResponse {
        return {
            status: 500,
            parsedBody: {},
            ...overrides
        } as IApiClientResponse;
    }

    it('should use parsedBody.message if present', () => {
        const response = createResponse({ status: 400, parsedBody: { message: 'Bad request' } });
        const err = formatErrorResponse('delete', response);
        assert.strictEqual(err, 'delete (400): Bad request');
    });

    it('should use parsedBody.errorCode if message is missing', () => {
        const response = createResponse({ status: 404, parsedBody: { errorCode: 'NOT_FOUND' } });
        const err = formatErrorResponse('fetch', response);
        assert.strictEqual(err, 'fetch (404): NOT_FOUND');
    });

    it('should use status if neither message nor errorCode is present', () => {
        const response = createResponse({ status: 403, parsedBody: {} });
        const err = formatErrorResponse('update', response);
        assert.strictEqual(err, 'update (403)');
    });
});

describe('handleLongRunningOperation', () => {
    [
        { status: 200 },
        { status: 400 }
    ].forEach(({ status }) => {
        it(`should return initial response for status ${status}`, async () => {
            // Arrange
            const initialResponse = { status: status } as IApiClientResponse;

            // Act
            const result = await handleLongRunningOperation({} as any, initialResponse);

            // Assert
            assert.strictEqual(result, initialResponse);
        });
    });

    [
        { locationUrl: 'https://test-fabric-url', operationId: undefined },
        { locationUrl: undefined, operationId: 'test-operation-id' },
    ].forEach(({ locationUrl, operationId }) => {
        it(`should return initial response for location: ${locationUrl}, operationId: ${operationId}`, async () => {
            // Arrange
            const initialResponse: IApiClientResponse = {
                status: 202,
                parsedBody: {},
                headers: {
                    get: (header: string) => {
                        switch (header.toLowerCase()) {
                            case 'location': return locationUrl;
                            case 'retry-after': return '20';
                            case 'x-ms-operation-id': return operationId;
                            default: return undefined;
                        }
                    }
                } as any
            };

            // Act
            const result = await handleLongRunningOperation({} as any, initialResponse);

            // Assert
            assert.strictEqual(result, initialResponse);
        });
    });

    [
        { succeeded: true, retryAfter: 15 },
        { succeeded: true, retryAfter: -10 },
        { succeeded: false, retryAfter: 0 },
    ].forEach(({ succeeded, retryAfter }) => {
        it(`should run (retry-after: ${retryAfter}) until operation ${succeeded ? 'succeeds' : 'fails'}`, async () => {
            // Arrange

            // Unable to stub the sleep function directly ("TypeError: Descriptor for property sleep is non-configurable and non-writable")
            // The implementation uses setTimeout, so stub that instead
            const setTimeoutStub = sinon.stub(global, 'setTimeout').callsFake((fn: (...args: any[]) => void, ms?: number) => {
                if (typeof fn === 'function') {
                    fn();
                }
                return 0 as unknown as NodeJS.Timeout;
            });

            const operationId = 'test-operation-id';
            const locationUrl = `https://test-fabric-url/v1/operations/${operationId}`;
            const resultUrl = `${locationUrl}/result`;

            const initialResponse: IApiClientResponse = {
                status: 202,
                parsedBody: {},
                headers: {
                    get: (header: string) => {
                        switch (header.toLowerCase()) {
                            case 'location': return locationUrl;
                            case 'retry-after': return retryAfter.toString();
                            case 'x-ms-operation-id': return operationId;
                            default: return undefined;
                        }
                    }
                } as any
            };
            const pollResponses: IApiClientResponse[] = [
                { 
                    status: 200, 
                    parsedBody: { 
                        status: 'Running',
                        percentComplete: '30'
                    }
                },
                { 
                    status: 200, 
                    parsedBody: { 
                        status: 'Running',
                        percentComplete: '60'
                    }
                },
                { 
                    status: 200, 
                    parsedBody: { 
                        status: succeeded ? 'Succeeded' : 'Failed',
                        percentComplete: '100'
                    }
                },
            ];
            
            const successResponseBody = {
                definition: {
                    parts: [
                        {
                            path: 'notebook-content.py',
                            payload:'ewogICIkc2NoZW1hIjogImh0dHBzOi8vZGV2ZWxvcGVyLm1pY3Jvc29mdC5jb20vanNvbi1zY2hlbWFzL2ZhYnJpYy9naXRJbnRlZ3JhdGlvbi9wbGF0Zm9ybVByb3BlcnRpZXMvMi4wLjAvc2NoZW1hLmpzb24iLAogICJtZXRhZGF0YSI6IHsKICAgICJ0eXBlIjogIk5vdGVib29rIiwKICAgICJkaXNwbGF5TmFtZSI6ICJOb3RlYm9vayA4IiwKICAgICJkZXNjcmlwdGlvbiI6ICJOZXcgbm90ZWJvb2siCiAgfSwKICAiY29uZmlnIjogewogICAgInZlcnNpb24iOiAiMi4wIiwKICAgICJsb2dpY2FsSWQiOiAiMDAwMDAwMDAtMDAwMC0wMDAwLTAwMDAtMDAwMDAwMDAwMDAwIgogIH0KfQ==',
                            payloadType: 'InlineBase64'
                        },
                        {
                            path: '.platform',
                            payload: 'ZG90UGxhdGZvcm1CYXNlNjRTdHJpbmc=',
                            payloadType: 'InlineBase64'
                        }
                    ]
                }
            };
            const errorResponseBody = {
                errorCode: 'InvalidInput',
                message: 'The input was invalid',
                requestId: 'req-12345',
            };

            const resultResponse: IApiClientResponse = {
                status: succeeded ? 200 : 400,
                parsedBody: succeeded ? successResponseBody : errorResponseBody,
            };

            const apiClientMock = new Mock<IFabricApiClient>();
            let pollCallCount = 0;
            apiClientMock
                .setup(api => api.sendRequest(It.Is<IApiClientRequestOptions>(obj => obj.url === locationUrl && obj.method === 'GET')))
                .callback(() => {
                    pollCallCount++;
                    return Promise.resolve(pollResponses[pollCallCount - 1]);
                });
            apiClientMock
                .setup(api => api.sendRequest(It.Is<IApiClientRequestOptions>(obj => obj.url === resultUrl && obj.method === 'GET')))
                .returnsAsync(resultResponse);

            // Act
            const result = await handleLongRunningOperation(apiClientMock.object(), initialResponse);

            // Assert
            apiClientMock.verify(api => api.sendRequest(It.Is<IApiClientRequestOptions>(obj => obj.url === locationUrl)), Times.Exactly(3));
            apiClientMock.verify(api => api.sendRequest(It.Is<IApiClientRequestOptions>(obj => obj.url === resultUrl)), Times.Once());
            assert.deepStrictEqual(result, resultResponse, 'Final result should match the expected result');
            assert.strictEqual(setTimeoutStub.callCount, 3, 'sleep should be called 3 times');
            const expectedSleepTime = retryAfter > 0 ? (retryAfter * 1000 / 5) : 1000;
            for (let i = 0; i < 3; i++) {
                assert.strictEqual(setTimeoutStub.getCall(i).args[1], expectedSleepTime, `sleep should be called with ${expectedSleepTime}ms`);
            }

            // Cleanup
            setTimeoutStub.restore();
        });
    });
});
