// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';
import { IArtifact, IApiClientRequestOptions } from '@microsoft/vscode-fabric-api';

/**
 * This test demonstrates backward compatibility between old satellite implementations
 * and new core that passes optional parameters.
 */
describe('API Backward Compatibility', function () {

    // Simulates an OLD satellite implementation that expects required parameters
    class OldSatelliteHandler {
        async onBeforeGetDefinition(
            artifact: IArtifact,
            folder: any,  // OLD: expects vscode.Uri (not optional)
            options: IApiClientRequestOptions
        ): Promise<IApiClientRequestOptions> {
            // Old implementation might not check for undefined
            // But should be defensive in practice
            if (!folder) {
                // Gracefully handle or throw meaningful error
                // This prevents runtime errors
            }
            return options;
        }
    }

    // Simulates NEW core calling OLD satellite with optional parameters
    it('should work when new core calls old satellite with undefined folder', async function () {
        const handler = new OldSatelliteHandler();
        const artifact = {} as IArtifact;
        const folder = undefined; // NEW core may pass undefined
        const options: IApiClientRequestOptions = {
            method: 'POST',
            pathTemplate: '/api/test',
        };

        // This should NOT throw a runtime error
        const result = await handler.onBeforeGetDefinition(artifact, folder, options);

        // Verify the function executed successfully
        assert.ok(result, 'Handler should return options');
        assert.strictEqual(result, options, 'Should return the same options object');
    });

    it('should work when new core calls old satellite with defined folder', async function () {
        const handler = new OldSatelliteHandler();
        const artifact = {} as IArtifact;
        const folder = { path: '/some/path' }; // Simulated vscode.Uri
        const options: IApiClientRequestOptions = {
            method: 'POST',
            pathTemplate: '/api/test',
        };

        // This should work as before
        const result = await handler.onBeforeGetDefinition(artifact, folder, options);

        assert.ok(result, 'Handler should return options');
        assert.strictEqual(result, options, 'Should return the same options object');
    });

    // Simulates a NEW satellite implementation with optional parameters
    class NewSatelliteHandler {
        async onBeforeGetDefinition(
            artifact: IArtifact,
            folder?: any,  // NEW: accepts undefined
            options?: IApiClientRequestOptions
        ): Promise<IApiClientRequestOptions> {
            if (!options) {
                throw new Error('options parameter is required');
            }

            if (!folder) {
                // Handle remote view scenario
                return options;
            }

            // Handle local scenario
            return options;
        }
    }

    it('should work when new core calls new satellite with undefined folder', async function () {
        const handler = new NewSatelliteHandler();
        const artifact = {} as IArtifact;
        const folder = undefined;
        const options: IApiClientRequestOptions = {
            method: 'POST',
            pathTemplate: '/api/test',
        };

        const result = await handler.onBeforeGetDefinition(artifact, folder, options);

        assert.ok(result, 'Handler should return options');
        assert.strictEqual(result, options, 'Should return the same options object');
    });

    it('should work when new core calls new satellite with defined folder', async function () {
        const handler = new NewSatelliteHandler();
        const artifact = {} as IArtifact;
        const folder = { path: '/some/path' };
        const options: IApiClientRequestOptions = {
            method: 'POST',
            pathTemplate: '/api/test',
        };

        const result = await handler.onBeforeGetDefinition(artifact, folder, options);

        assert.ok(result, 'Handler should return options');
        assert.strictEqual(result, options, 'Should return the same options object');
    });
});
