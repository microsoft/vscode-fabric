// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';

export class NotSignedInError extends Error {
    public readonly isNotSignedInError = true;

    constructor() {
        super(vscode.l10n.t('You are not signed in to Fabric. Please sign in.'));
    }
}

/**
 * Tests if an object is a `NotSignedInError`. This should be used instead of `instanceof`.
 *
 * @param error The object to test
 *
 * @returns True if the object is a NotSignedInError, false otherwise
 */
export function isNotSignedInError(error: unknown): error is NotSignedInError {
    return !!error && typeof error === 'object' && (error as NotSignedInError).isNotSignedInError === true;
}
