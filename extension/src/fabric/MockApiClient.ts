// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/* eslint-disable security/detect-non-literal-fs-filename */
/* eslint-disable security/detect-object-injection */
/* eslint-disable @typescript-eslint/naming-convention */
import { IApiClientRequestOptions, IApiClientResponse, IFabricApiClient } from '@microsoft/vscode-fabric-api';
import * as azApi from '@azure/core-rest-pipeline';
import * as fs from 'fs-extra';
import * as path from 'path';
import { ILogger } from '@microsoft/vscode-fabric-util';

export class MockApiClient implements IFabricApiClient {
    callback: (options: IApiClientRequestOptions) => Promise<IApiClientResponse>;
    constructor(public logger: ILogger, callback?: (options: IApiClientRequestOptions) => Promise<IApiClientResponse>) {
        if (callback) {
            this.callback = callback;
        }
        else {
            this.callback = this.normalCallback;
        }
    }
    public normalCallback = async (options: IApiClientRequestOptions) => {
        this.logger.log(`MockApiClient.sendRequest CallBack: ${options.method} ${options.url ?? options.pathTemplate}`);
        let baseUrl = options.url ?? '';
        let theUrl = baseUrl;
        let ndxQMark = theUrl!.indexOf('?');
        if (ndxQMark > 0) {
            baseUrl = theUrl!.slice(0, ndxQMark + 1);
        }
        this.logger.log(`MockApiClient.sendRequest CallBack baseUrl: ${baseUrl}`);
        let msg = 'UploadBinary called';
        const params = new URLSearchParams(options.url);
        if (params) {
            this.logger.log(`MockApiClient.sendRequest CallBack params: ${params}`);
        }
        let strParams = '';
        let metadataJson = '';
        let fileparts: any[] = [];
        params.forEach((value, key) => {
            let keyName = key.replace(baseUrl, '');
            this.logger.log(`MockApiClient.sendRequest kvp: ${keyName} = ${value}`);
            strParams += encodeURI(`${keyName}=${value}&`);
        });
        if (strParams.length > 0) {
            strParams = '?' + strParams.slice(0, -1);
        }
        const delaymsStr = params.get('delayms') || '0';
        const delayms = parseInt(delaymsStr);
        if (delayms > 0) {
            this.logger.log(`MockApiClient.sendRequest CallBack: delayms ${delayms}`);
            await new Promise(resolve => setTimeout(resolve, parseInt(delaymsStr)));
        }
        let curHeaders: azApi.RawHttpHeadersInput = {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'Authorization': 'some mock token',
        };
        if (options.headers) { // add any additional headers
            curHeaders = { ...curHeaders, ...options.headers };
        }
        if (options.formData) {
            curHeaders['Content-Type'] = 'multipart/form-data; boundary=----AzSDKFormBoundary';
            msg = 'Received Binary';
            for (const key in options.formData) {
                metadataJson += ` ${key}=${options.formData[key]}`;
                if (Object.prototype.hasOwnProperty.call(options.formData, key)) {
                    const element = options.formData[key];
                    if (typeof element === 'string' && element.startsWith('File:')) {
                        let nZipEntries = 0;
                        const filePath = element.substring(5);
                        // get the length of the file
                        const len = fs.statSync(filePath).size;
                        const baseFilename = path.basename(filePath);
                        const strm = fs.createReadStream(filePath);
                        options.formData[key] = azApi.createFileFromStream(() => strm, baseFilename);
                        fileparts.push({ PartName: key, FileName: baseFilename, Len: len, NZipEntries: nZipEntries });
                        strm.destroy(); // next test comes along and tries to delete the file, but it's still open, so we close it here
                    }
                }
            }
        }
        const headers = azApi.createHttpHeaders(curHeaders);
        const apiOptions: azApi.PipelineRequestOptions = {
            url: theUrl,
            method: options.method ?? 'GET',
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
            headers: headers,
            streamResponseStatusCodes: options?.streamResponseStatusCodes,
            formData: options.formData,
        };
        const reqPipeline = azApi.createPipelineRequest(apiOptions);
        if (theUrl.startsWith('bad')) {
            throw new Error('Cannot connect to ' + theUrl);
        }

        // now that we've created a request, we can create a mocked response

        let responseJson: any = {
            ResponseVersion: 1,
            Message: msg,
            JSonBody: JSON.stringify(options.body),
            TimeStamp: new Date().toISOString(),
            strParams: strParams,
            metadataJson: metadataJson,
            FileData: fileparts,
        };
        if (options.pathTemplate?.endsWith('metadata')) {
            responseJson = {
                runtime: 'DOTNET',
            };
        }
        let azApiresponse: IApiClientResponse = {
            response: { headers: headers, status: 200, request: reqPipeline },
            request: reqPipeline,
            requestOptions: options,
            bodyAsText: JSON.stringify(responseJson),
            parsedBody: responseJson,
            status: 200,
        };
        return azApiresponse;
    };

    public setCallBack(callback: (request: IApiClientRequestOptions) => Promise<IApiClientResponse>) {
        this.callback = callback;
    }
    public async sendRequest(reqOptions: IApiClientRequestOptions): Promise<IApiClientResponse> {
        const response = await this.callback(reqOptions);
        return response;
    }
}
