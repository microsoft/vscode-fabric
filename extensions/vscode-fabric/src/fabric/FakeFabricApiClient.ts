/* eslint-disable security/detect-non-literal-fs-filename */
/* eslint-disable security/detect-object-injection */
import * as azApi from '@azure/core-rest-pipeline';
import { TelemetryService } from '@microsoft/vscode-fabric-util';
import { IConfigurationProvider } from '@microsoft/vscode-fabric-util';
import { IFabricEnvironmentProvider } from '@microsoft/vscode-fabric-util';
import { ILogger } from '@microsoft/vscode-fabric-util';
import { IFakeFabricApiClient, SendRequestCallback } from '@microsoft/vscode-fabric-api';

import { FabricApiClient } from './FabricApiClient';
import { IAccountProvider } from '../authentication/interfaces';

/**
 * FakeFabricApiClient extends FabricApiClient to allow injection of a custom callback
 * in place of the normal pipeLine.sendRequest call. This enables testing and mocking
 * of HTTP requests at the pipeline level.
 */
export class FakeFabricApiClient extends FabricApiClient implements IFakeFabricApiClient {
    constructor(
        auth: IAccountProvider,
        config: IConfigurationProvider,
        fabricEnvironmentProvider: IFabricEnvironmentProvider,
        telemetryService: TelemetryService | null,
        logger: ILogger,
        private sendRequestCallback?: SendRequestCallback
    ) {
        // Create a custom pipeline factory that uses our callback
        const customPipelineFactory = () => {
            const pipeline = azApi.createPipelineFromOptions({
                retryOptions: { maxRetries: 0 }
            });

            // Override the sendRequest method of the pipeline
            const originalSendRequest = pipeline.sendRequest.bind(pipeline);
            pipeline.sendRequest = async (httpClient: azApi.HttpClient, request: azApi.PipelineRequest): Promise<azApi.PipelineResponse> => {
                if (this.sendRequestCallback) {
                    return await this.sendRequestCallback(httpClient, request);
                }
                return await originalSendRequest(httpClient, request);
            };

            return pipeline;
        };

        super(auth, config, fabricEnvironmentProvider, telemetryService, logger, customPipelineFactory);
    }

    /**
     * Configure the client to respond to all requests with a JSON body and status.
     * This mirrors tests that set pipelineMock.sendRequest = async () => fakeResponse.
     */
    public respondWithJson(status: number, body: unknown, extraHeaders?: azApi.RawHttpHeadersInput): void {
        this.sendRequestCallback = async (_httpClient: azApi.HttpClient, request: azApi.PipelineRequest): Promise<azApi.PipelineResponse> => {
            const baseHeaders: azApi.RawHttpHeadersInput = { 'content-type': 'application/json' };
            const headers: azApi.HttpHeaders = azApi.createHttpHeaders({ ...(baseHeaders as azApi.RawHttpHeadersInput), ...(extraHeaders ?? {}) });
            return {
                status: status,
                headers: headers,
                bodyAsText: JSON.stringify(body),
                request: request
            };
        };
    }

    /**
     * Configure the client to respond to all requests with plain text and status.
     */
    public respondWithText(status: number, text: string, extraHeaders?: azApi.RawHttpHeadersInput): void {
        this.sendRequestCallback = async (_httpClient: azApi.HttpClient, request: azApi.PipelineRequest): Promise<azApi.PipelineResponse> => {
            const baseHeaders: azApi.RawHttpHeadersInput = { 'content-type': 'text/plain' };
            const headers: azApi.HttpHeaders = azApi.createHttpHeaders({ ...(baseHeaders as azApi.RawHttpHeadersInput), ...(extraHeaders ?? {}) });
            return {
                status: status,
                headers: headers,
                bodyAsText: text,
                request: request
            };
        };
    }

    /**
     * Configure the client with a custom response factory based on the PipelineRequest.
     */
    public respondWith(factory: (request: azApi.PipelineRequest) => Promise<azApi.PipelineResponse> | azApi.PipelineResponse): void {
        this.sendRequestCallback = async (_httpClient: azApi.HttpClient, request: azApi.PipelineRequest): Promise<azApi.PipelineResponse> => {
            return await factory(request);
        };
    }

    /**
     * Configure the client to throw the provided error from the pipeline sendRequest.
     */
    public throwOnSend(error: Error): void {
        this.sendRequestCallback = async (_httpClient: azApi.HttpClient, request: azApi.PipelineRequest): Promise<azApi.PipelineResponse> => {
            throw error;
        };
    }

    /**
     * Sets or updates the callback function that will be used instead of the normal pipeline.sendRequest
     * @param callback The callback function to use for intercepting requests
     */
    public setSendRequestCallback(callback: SendRequestCallback): void {
        this.sendRequestCallback = callback;
    }

    /**
     * Removes the callback, causing the client to use the normal pipeline.sendRequest behavior
     */
    public clearSendRequestCallback(): void {
        this.sendRequestCallback = undefined;
    }

    /**
     * Gets the current callback function, if any
     */
    public getSendRequestCallback(): SendRequestCallback | undefined {
        return this.sendRequestCallback;
    }
}
