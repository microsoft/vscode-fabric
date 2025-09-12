import * as vscode from 'vscode';
import { IObservableReadOnlyMap } from './definitions';

/**
 * Wraps a Map object and emits events when items are added or removed
 */
export class ObservableMap<K, V> implements IObservableReadOnlyMap<K, V> {
    private addItemEmitter = new vscode.EventEmitter<K>();
    private removeItemEmitter = new vscode.EventEmitter<V>();
    private items: Map<K, V> = new Map<K, V>();

    public get size(): number {
        return this.items.size;
    }

    public set(key: K, value: V) {
        this.items.set(key, value);
        this.addItemEmitter.fire(key);
    }

    public delete(key: K): boolean {
        if (this.items.has(key)) {
            const value = this.items.get(key);
            this.items.delete(key);
            this.removeItemEmitter.fire(value!);
            return true;
        }

        return false;
    }

    public get(key: K): V | undefined {
        return this.items.get(key);
    }

    public get onItemAdded() {
        return this.addItemEmitter.event;
    }

    public get onItemRemoved() {
        return this.removeItemEmitter.event;
    }
}
