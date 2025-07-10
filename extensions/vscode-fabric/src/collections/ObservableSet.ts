import * as vscode from 'vscode';
import { IObservableArray } from './definitions';

/**
 * ObservableSet is a collection that emits events when items are added or removed. It will not allow for the addition of duplicate items.
 */
export class ObservableSet<T> implements IObservableArray<T> {
    private resetEmitter = new vscode.EventEmitter<void>();
    private addItemEmitter = new vscode.EventEmitter<T>();
    private removeItemEmitter = new vscode.EventEmitter<T>();
    private _items: T[] = [];

    /**
     * Creates a new ObservableSet
     * @param initialItems The initial items to add to the set. Duplicated items will be added.
     * @param compare The function to use to compare items. If not provided, strict equality is used.
     */
    constructor(initialItems: T[] = [], private compare: (a: T, b: T) => boolean = (a, b) => a === b) {
        this._items = [...initialItems];
    }

    /**
     * The number of items in the set
     */
    public get length(): number {
        return this._items.length;
    }

    /**
     * The items in the set
     */
    public get items() {
        return this._items;
    }

    /**
     * Event that fires when the set is reset
     */
    public get onReset() {
        return this.resetEmitter.event;
    }

    /**
     * Event that fires when an item is added to the set
     */
    public get onItemAdded() {
        return this.addItemEmitter.event;
    }

    /**
     * Event that fires when an item is removed from the set
     */
    public get onItemRemoved() {
        return this.removeItemEmitter.event;
    }

    /**
     * Resets the set, removing all items
     */
    public reset(): void {
        this._items = [];
        this.resetEmitter.fire();
    }

    /**
     * Adds an item to the set. If the item is already in the set, it will not be added.
     * @param item The item to add to the set
     */
    public add(item: T) {
        if (!this._items.some(i => this.compare(i, item))) {
            this._items.push(item);
            this.addItemEmitter.fire(item);
        }
    }

    /**
     * Removes all instances of an item from the set
     * @param item The item to remove from the set. If the item is not in the set, nothing will happen.
     */
    public remove(item: T) {
        let index = this._items.findIndex(i => this.compare(i, item));
        while (index > -1) {
            let removedItem = this._items.splice(index, 1)[0];
            this.removeItemEmitter.fire(removedItem);
            index = this._items.findIndex(i => this.compare(i, item));
        }
    }
}