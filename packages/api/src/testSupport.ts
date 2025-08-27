import * as azApi from '@azure/core-rest-pipeline';
import { IFabricApiClient } from './FabricApiClient';

/**
 * Callback function type for intercepting pipeline.sendRequest calls
 */
export type SendRequestCallback = (
    httpClient: azApi.HttpClient,
    request: azApi.PipelineRequest
) => Promise<azApi.PipelineResponse>;

/**
 * Interface for FakeFabricApiClient used in testing scenarios.
 * This extends the standard IFabricApiClient with additional methods for controlling
 * HTTP responses during tests.
 * 
 * Satellite extensions should use this interface type and access concrete instances
 * through the extension manager's test hooks system.
 */
export interface IFakeFabricApiClient extends IFabricApiClient {
    /**
     * Configure the client to respond to all requests with a JSON body and status.
     * This mirrors tests that set pipelineMock.sendRequest = async () => fakeResponse.
     * @param status HTTP status code to return
     * @param body Object to serialize as JSON response body
     * @param extraHeaders Optional additional headers to include in response
     */
    respondWithJson(status: number, body: unknown, extraHeaders?: azApi.RawHttpHeadersInput): void;

    /**
     * Configure the client to respond to all requests with plain text and status.
     * @param status HTTP status code to return
     * @param text Plain text response body
     * @param extraHeaders Optional additional headers to include in response
     */
    respondWithText(status: number, text: string, extraHeaders?: azApi.RawHttpHeadersInput): void;

    /**
     * Configure the client with a custom response factory based on the PipelineRequest.
     * @param factory Function that takes a request and returns a response
     */
    respondWith(factory: (request: azApi.PipelineRequest) => Promise<azApi.PipelineResponse> | azApi.PipelineResponse): void;

    /**
     * Configure the client to throw the provided error from the pipeline sendRequest.
     * @param error Error to throw when sendRequest is called
     */
    throwOnSend(error: Error): void;

    /**
     * Sets or updates the callback function that will be used instead of the normal pipeline.sendRequest
     * @param callback The callback function to use for intercepting requests
     */
    setSendRequestCallback(callback: SendRequestCallback): void;

    /**
     * Removes the callback, causing the client to use the normal pipeline.sendRequest behavior
     */
    clearSendRequestCallback(): void;

    /**
     * Gets the current callback function, if any
     * @returns The current callback function or undefined if none is set
     */
    getSendRequestCallback(): SendRequestCallback | undefined;
}
