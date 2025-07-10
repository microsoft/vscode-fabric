import * as vscode from 'vscode';
import { IObservableArray, IObservableReadOnlyMap } from './collections/definitions';

/**
 * A converter that sets a context key based on a specified predicate.
 * Typically used to set context values when an item is added or removed from the observable collection based on the number of items in the collection.
 */
abstract class VisibilityConverter implements vscode.Disposable {
    private contextKey: string;
    private predicate: () => boolean;
    private previousState: boolean | undefined;
    private disposables: vscode.Disposable[] = [];

    constructor(
        contextKey: string,
        predicate: () => boolean,
        onItemAdded: (callback: (artifact: any) => void) => vscode.Disposable,
        onItemRemoved: (callback: (artifact: any) => void) => vscode.Disposable
    ) {
        this.contextKey = contextKey;
        this.predicate = predicate;
        this.previousState = undefined;

        this.disposables.push(onItemAdded(async (artifact) => {
            await this.updateContext();
        }));

        this.disposables.push(onItemRemoved(async (artifact) => {
            await this.updateContext();
        }));
    }

    private async updateContext() {
        const isVisible = this.predicate();
        if (this.previousState !== isVisible) {
            this.previousState = isVisible;
            await vscode.commands.executeCommand('setContext', this.contextKey, isVisible);
        }
    }

    dispose() {
        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables = [];
    }
}

/**
 * A converter that sets a context key based on the size of an observable map.
 */
export class ObservableMapVisibilityConverter extends VisibilityConverter {
    constructor(observableMap: IObservableReadOnlyMap<any, any>, contextKey: string) {
        super(
            contextKey, 
            () => observableMap.size > 0, 
            observableMap.onItemAdded, 
            observableMap.onItemRemoved);
    }
}

/**
 * A converter that sets a context key based on the size of an observable array.
 */
export class ObservableArrayVisibilityConverter extends VisibilityConverter {
    constructor(observableArray: IObservableArray<any>, contextKey: string) {
        super(
            contextKey, 
            () => observableArray.length > 0, 
            observableArray.onItemAdded, 
            observableArray.onItemRemoved);
    }
}
