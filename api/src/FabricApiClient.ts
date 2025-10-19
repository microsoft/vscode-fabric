// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as azApi from '@azure/core-rest-pipeline';

/**
 * Primary interface for making HTTP requests to the Microsoft Fabric REST API.
 *
 * This client provides a high-level abstraction over the Azure Core REST Pipeline,
 * automatically handling common concerns such as:
 * - Base URI and API version configuration
 * - Authentication token management
 * - Request/response serialization
 * - Error handling and retry logic
 *
 * The client wraps @azure/core-rest-pipeline to provide Fabric-specific functionality
 * while maintaining compatibility with standard HTTP patterns.
 *
 * @see {@link https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/core/core-rest-pipeline/README.md Azure Core REST Pipeline}
 * @see {@link https://learn.microsoft.com/en-us/rest/api/fabric/ Microsoft Fabric REST API Documentation}
 */
export interface IFabricApiClient {
    /**
     * Sends an HTTP request to the Fabric API and returns the response.
     *
     * This method handles the complete request lifecycle including:
     * - URL construction (from pathTemplate or direct URL)
     * - Authentication header injection
     * - Request serialization and response deserialization
     * - Timeout management
     * - Error handling and status code processing
     *
     * @param options - Configuration options for the HTTP request
     * @returns Promise that resolves to the API response containing status, headers, and body
     * @throws Will throw an error if the request fails due to network issues, authentication problems, or API errors
     */
    sendRequest(options: IApiClientRequestOptions): Promise<IApiClientResponse>;
}

/**
 * Configuration options for making HTTP requests through the Fabric API client.
 * This interface provides comprehensive control over HTTP request behavior including
 * authentication, timeouts, content handling, and response processing.
 */
export interface IApiClientRequestOptions {
    /** The complete URL for the request. If not provided, pathTemplate will be used with the base URL. */
    url?: string;

    /** HTTP method for the request. Defaults to "GET" if not specified. */
    method?: azApi.HttpMethods;

    /** URL path template that will be combined with the base API URL. Used when url is not provided. */
    pathTemplate?: string;

    /** Request body content. Can be any serializable object that will be sent as the request payload. */
    body?: any;

    /** HTTP headers to include with the request. */
    headers?: azApi.RawHttpHeadersInput;

    /**
     * Authentication token to use for the request.
     * If provided, overrides the default token.
     */
    token?: string;

    /**
     * Type of authentication token. Defaults to "Bearer" if not specified.
     * This value is prepended to the token in the Authorization header.
     */
    tokenType?: string;

    /**
     * Request timeout in milliseconds.
     * Defaults to 0, which disables the timeout and allows the request to run indefinitely.
     */
    timeout?: number;

    /**
     * When true, logs the authentication token for debugging purposes.
     * Use with caution as this exposes sensitive authentication information.
     */
    dumpToken?: boolean;

    /**
     * Form data to send with the request to simulate a browser form post.
     * When provided, the request will be sent as multipart/form-data.
     */
    formData?: azApi.FormDataMap;

    /**
     * A set of HTTP status codes whose corresponding response bodies should be treated as streams.
     * This is useful for handling large responses or binary content that should not be loaded into memory.
     */
    streamResponseStatusCodes?: Set<number>;
}

/**
 * Response object returned by the Fabric API client after executing an HTTP request.
 *
 * This interface provides comprehensive information about both the request that was sent
 * and the response that was received, including performance metrics, parsed content,
 * and access to the underlying Azure pipeline objects for advanced scenarios.
 *
 * The response object is designed to support both simple usage patterns (accessing status
 * and parsed body) and advanced debugging scenarios (inspecting raw headers, timing data,
 * and the original request configuration).
 */
export interface IApiClientResponse {
    /**
     * The original request options that were used to make this API call.
     * Useful for debugging, logging, or retrying requests with the same configuration.
     */
    requestOptions?: IApiClientRequestOptions;

    /**
     * The underlying Azure pipeline request object.
     * Provides access to low-level request details for advanced debugging and logging scenarios.
     */
    request?: azApi.PipelineRequest;

    /**
     * The underlying Azure pipeline response object.
     * Contains the raw HTTP response data before any client-side processing or parsing.
     */
    response?: azApi.PipelineResponse;

    /**
     * The response body converted to a string representation.
     * This is the raw text content as received from the server before any JSON parsing.
     */
    bodyAsText?: string;

    /**
     * The response body parsed as a JavaScript object.
     * For JSON responses, this will be the deserialized object. For non-JSON responses,
     * this may be undefined or contain the raw content depending on the content type.
     */
    parsedBody?: any;

    /**
     * HTTP status code returned by the server.
     * Standard HTTP status codes (200, 404, 500, etc.) indicating the result of the request.
     */
    status: number;

    /**
     * Time taken to complete the API call in milliseconds.
     * Includes the full round-trip time from request initiation to response completion,
     * useful for performance monitoring and debugging slow requests.
     */
    elapsedms?: number;

    /**
     * HTTP response headers returned by the server.
     * Contains metadata about the response such as content type, caching directives,
     * rate limiting information, and other server-provided headers.
     */
    headers?: azApi.HttpHeaders;

    /**
     * The final URL that was actually requested.
     * May differ from the original URL if redirects occurred or if the URL was
     * constructed from a path template and base URI.
     */
    url?: string;
}

/* eslint-disable */
/** @deprecated */
export enum RuntimeType {
    DotNet = "DOTNET",  // upper case to match workload
    Python = "PYTHON"
}

/** @deprecated */
export enum InputType { // casing to match workload
    Http = "Http",
    EventStream = "EventStream",
}

/** @deprecated */
export enum BindingType {
    EventHubTrigger = "EventHubTrigger",
    HttpTrigger = "HttpTrigger",
}

/** @deprecated */
export const BindingTypeToInputTypeMapping: { [key in BindingType]: string } = {
    [BindingType.EventHubTrigger]: InputType.EventStream,
    [BindingType.HttpTrigger]: InputType.Http,
};
/* eslint-enable */

/** @deprecated */
export type RuntimeAttribute = RuntimeType.DotNet | RuntimeType.Python; // workload also has 'NOTASSIGNED', but we'll query user for value if not set
/** @deprecated */
export type InputTypeAttribute = InputType.Http | InputType.EventStream;

/** @deprecated */
export type ArtifactAttributes = {
    'runtime'?: RuntimeAttribute
    // 'inputType'?: InputTypeAttribute
};

/**
 * Represents a Microsoft Fabric artifact (item) as returned by the Fabric REST API.
 *
 * This interface defines the core properties that all Fabric artifacts share,
 * regardless of their specific type (notebook, dataset, report, etc.). It provides
 * the essential metadata needed to identify, display, and locate artifacts within
 * the Fabric workspace hierarchy.
 *
 * Note: This interface includes both standard API response fields and additional
 * client-side properties (like fabricEnvironment) that are added for enhanced
 * functionality within the VS Code extension.
 *
 * @see {@link https://learn.microsoft.com/en-us/rest/api/fabric/core/items Microsoft Fabric Items API}
 */
export interface IArtifact {
    /**
     * Unique identifier for the artifact within Microsoft Fabric.
     * This GUID is used for all API operations targeting this specific artifact.
     */
    id: string;
    folderId?: string,

    /**
     * The type of Fabric artifact (e.g., "Notebook", "Dataset", "Report", "Pipeline").
     * This determines the artifact's capabilities, available operations, and UI representation.
     */
    type: string;

    /**
     * Human-readable name for the artifact as displayed in the Fabric UI.
     * This is the name users see and use to identify the artifact in workspaces and lists.
     */
    displayName: string;

    /**
     * Optional description providing additional context about the artifact's purpose or content.
     * May be undefined if no description was provided when the artifact was created.
     */
    description?: string;

    /**
     * Unique identifier of the workspace that contains this artifact.
     * All artifacts belong to exactly one workspace, which determines access permissions and organization.
     */
    workspaceId: string;

    /**
     * Represents the Fabric environment this artifact exists in.
     *
     * **Note**: This property is not part of the standard Fabric API response but is added
     * by the client for environment-specific operations and display purposes. It enables
     * the extension to work across different Fabric deployment environments.
     *
     * While its inclusion in this interface is debatable since it's not part of the official
     * API contract, it's widely used throughout the codebase and provides valuable context
     * for multi-environment scenarios.
     */
    fabricEnvironment: string;

    /** @deprecated */
    attributes?: ArtifactAttributes;
}

/**
 * Represents the definition structure of a Microsoft Fabric item as used by the Item Definition APIs.
 *
 * This interface defines how Fabric artifacts (notebooks, datasets, reports, etc.) are structured
 * when retrieved via the Get Item Definition API or when being updated via the Update Item Definition API.
 * The definition contains the actual content and metadata of the item in a format that can be
 * downloaded, modified, and uploaded back to Fabric.
 *
 * Item definitions are composed of multiple parts, each representing different aspects or files
 * within the artifact (e.g., notebook content, metadata, configuration files).
 *
 * @see {@link https://learn.microsoft.com/en-us/rest/api/fabric/core/items/get-item-definition Get Item Definition API}
 * @see {@link https://learn.microsoft.com/en-us/rest/api/fabric/core/items/update-item-definition Update Item Definition API}
 */
export interface IItemDefinition {
    /**
     * Optional format identifier for the item definition structure.
     * This may specify versioning information or indicate the schema version
     * used for the definition format.
     */
    format?: string;

    /**
     * Array of parts that make up the complete item definition.
     * Each part represents a different file or component within the Fabric artifact,
     * such as the main content file, metadata, configuration, or related assets.
     */
    parts: IItemDefinitionPart[];
}

/**
 * Represents a single part (file or component) within a Fabric item definition.
 *
 * Each part corresponds to a specific file or data component that makes up the complete
 * Fabric artifact. For example, an item might have parts for the main file,
 * metadata files, configuration files, or embedded resources.
 *
 * The part structure allows Fabric artifacts to be decomposed into their constituent
 * files for individual download, modification, and upload operations.
 */
export interface IItemDefinitionPart {
    /**
     * The logical path or filename for this part within the item definition.
     * This path identifies where this part belongs in the artifact's file structure
     * and is used when reconstructing the complete item from its parts.
     */
    path: string;

    /**
     * The actual content data for this part.
     * The format and encoding of this content depends on the payloadType.
     * For InlineBase64 payloads, this will be a base64-encoded string representation
     * of the file content.
     */
    payload: string;

    /**
     * Specifies how the payload content is encoded and should be interpreted.
     * This determines the decoding method needed to extract the actual file content
     * from the payload string.
     */
    payloadType: PayloadType;
}

/**
 * Enumeration of supported payload encoding types for item definition parts.
 *
 * This enum defines the different ways that file content can be encoded within
 * the payload field of an IItemDefinitionPart. The payload type determines how
 * the client should decode the payload string to recover the original file content.
 *
 * Currently, only base64 encoding is supported, but this enum structure allows
 * for future expansion to support additional encoding methods such as plain text,
 * compressed content, or external references.
 */
export enum PayloadType {
    /**
     * Indicates that the payload contains base64-encoded binary data.
     * The payload string should be decoded from base64 to recover the original
     * file content. This encoding method supports both text and binary files.
     */
    // eslint-disable-next-line @typescript-eslint/naming-convention
    InlineBase64 = 'InlineBase64',
}
