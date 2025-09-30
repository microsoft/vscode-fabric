// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';

import { FunctionalityStatus } from '../../src/fabricExtension';

describe('Test Suite', () => {

    it('Sample test', () => {
        assert.equal(FunctionalityStatus.none, 0);
        assert.equal(FunctionalityStatus.preview, 1);
        assert.equal(FunctionalityStatus.comingSoon, 2);
    });
});
