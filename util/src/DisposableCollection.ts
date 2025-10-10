// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as vscode from 'vscode';

/**
 * Interface for managing disposable resources in a collection.
 * Provides a way to add disposables that will be automatically cleaned up.
 */
export interface IDisposableCollection {
    /**
     * Adds the disposable to the collection
     */
    add(disposable: { dispose(): any }): void;
}

export class DisposableCollection implements IDisposableCollection {
    constructor(private readonly context: vscode.ExtensionContext) {}

    /**
     * Pushes the disposable to the context's subscriptions.
     * @param disposable The disposable to add.
     */
    public add(disposable: { dispose(): any }): void {
        this.context.subscriptions.push(disposable);
    }
}
