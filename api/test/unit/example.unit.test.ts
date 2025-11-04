// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';

import { PayloadType } from '../../src/FabricApiClient';

describe('Test Suite', () => {

    it('Sample test', () => {
        assert.equal(PayloadType.InlineBase64, 'InlineBase64');
    });
});
