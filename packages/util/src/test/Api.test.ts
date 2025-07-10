/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable security/detect-non-literal-fs-filename */
import * as azApi from '@azure/core-rest-pipeline';
import * as assert from 'assert';
import { IApiClientRequestOptions, IApiClientResponse } from '@fabric/vscode-fabric-api';
import * as fs from 'fs-extra';

import dns = require('dns'); // https://stackoverflow.com/questions/57691836/econnrefused-on-running-localhost-server-from-nodejs
import { Logger } from '../logger/Logger';
import { createTestZipFile } from '../zipUtilities';
import { MockApiClient } from '../fabric/MockAPIClient';
import { sleep } from '../fabricUtilities';

dns.setDefaultResultOrder('ipv4first');

const zipSourceRelativePath = '../../../extensions/vscode-fabric/src';
const urlToUseForTest = 'https://vscodefabrictest2.azurewebsites.net/api/UploadBinary'; // used by test mocks

describe('APITests that require VSCode', async () => {
    const urlCloud = urlToUseForTest;
    const urlToUse = urlCloud;
    const logger = new Logger('FabricTest');

    it('use FabricApiClient send json', async () => {
        const fclient = new MockApiClient(logger);
        fclient.callback = async (req: IApiClientRequestOptions) => {
            console.log('MockApiClient callback called');
            const responseJson = {
                ResponseVersion: 1,
                Message: 'UploadBinary called',
                JSonBody: JSON.stringify(req.body),
                TimeStamp: new Date().toISOString(),
                strParams: '',
                NumZipEntries: 0
            };
            let response: IApiClientResponse = {
                requestOptions: req,
                bodyAsText: JSON.stringify(responseJson),
                parsedBody: responseJson,
                status: 200,
            };
            return response;
        };
        const req: IApiClientRequestOptions = {
            //                url: extensionConstants.FABRIC_BASE_URI + '/metadata/workspaces/',// "https://wabi-daily-us-east2-redirect.analysis.windows.net/"; // daily,
            url: urlToUse,
            method: 'POST',
            headers: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'Content-Type': 'application/json; charset=utf-8',
            },
            body: {
                displayName: 'dispname',
                description: 'Description: testing',
                artifactType: 'strArtifactType',
                payloadContentType: 'InLineJson',
                workloadPayload: JSON.stringify('test payload')
            }
        };
        const response = await fclient!.sendRequest(req);
        console.dir(response, { depth: 4 });
        await sleep(1000); // give time for the log to show
        console.log(`response.JSonBody: ${JSON.stringify(response.parsedBody.JSonBody)}`);

        assert.strictEqual(response.parsedBody.JSonBody, '{"displayName":"dispname","description":"Description: testing","artifactType":"strArtifactType","payloadContentType":"InLineJson","workloadPayload":"\\"test payload\\""}');
    });


    async function testZipHelper(destZipFile: string, urlTest: string): Promise<void> {
        let response: IApiClientResponse | undefined;
        let task = new Promise<string>(async (resolve, reject) => {

            // if (mocks.coreApi.workspaceManager === null) {
            //     throw new Error('mocks.coreApi.workspaceManager is null');
            // }

            // TODO not sure why but seem to get nulls in MockApiClient
            // if a new one is not used for each test. Something to do with azure-core-rest-pipeline?
            const client = new MockApiClient(logger);

            // const strmZip = fs.createReadStream(destZipFile);
            // let doneWithStream = false;
            try {
                // strmZip.on('end', () => {
                //     doneWithStream = true;
                // });
                // strmZip.on('error', async (err) => {
                //     reject(err);
                // });
                const formData: azApi.FormDataMap = {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    'somename': azApi.createFileFromStream(() => fs.createReadStream(destZipFile), 'MyZipFile.zip')
                };

                const req: IApiClientRequestOptions = {
                    url: urlTest,
                    method: 'POST',
                    headers: {
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        'Content-Type': 'multipart/form-data',
                    },
                    formData: formData
                };
                response = await client!.sendRequest(req);
                const partheader = response.request!.headers.get('Content-Type');
                console.log(partheader); // the boundary header is written by the pipeline
                assert.strictEqual(true, partheader?.startsWith('multipart/form-data; boundary=----AzSDKFormBoundary'));
                console.dir(response);

                console.log(response.bodyAsText);

                await sleep(1000); // give time for the log to show
                assert(response.bodyAsText!.includes('Received Binary'));
                assert(fs.existsSync(destZipFile), 'File Exists ' + destZipFile);
                resolve('done');
                // if (doneWithStream) {
                //     resolve('done');
                // }
                // else {
                //     reject('error!!');
                // }
            }
            catch (error) {
                reject(error);
            }
            finally {
                // strmZip.destroy(); // if we don't destroy, it leaks and subsequent attempts to delete the file result in error
            }
        });
        let resultTask = await task;
    }

    it('Call api thru FabricApiClient with zip', async () => {
        const testZip = await createTestZipFile(zipSourceRelativePath, 'FabricApiClientWithZip');
        let destZipFile = testZip.destZipFile;
        await testZipHelper(destZipFile, urlCloud);
        await fs.unlink(destZipFile);
        assert(!fs.existsSync(destZipFile), 'File should be deleted ' + destZipFile);
    });

    it('Call api thru FabricApiClient with zip: bad url', async () => {
        const testZip = await createTestZipFile(zipSourceRelativePath, 'FabricApiClientBadUrl');
        let destZipFile = testZip.destZipFile;
        let errmsg = '';
        try {
            await testZipHelper(destZipFile, 'bad' + urlCloud); // call with bad url to cause error
        }
        catch (error: any) {
            errmsg = error.message;
            //            console.log(error);
        }
        assert(errmsg.includes('Cannot connect to '));
        await fs.unlink(destZipFile);
        assert(!fs.existsSync(destZipFile), 'File should be deleted ' + destZipFile);
    });

});


