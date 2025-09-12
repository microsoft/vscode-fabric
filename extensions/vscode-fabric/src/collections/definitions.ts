import * as vscode from 'vscode';

/**
 * A collection that emits events when items are added or removed
 */
export interface IObservableArray<T> {
    /**
     * The items in the collection
     */
    readonly items: T[];

    /**
     * Event that fires when the collection is reset
     */
    readonly onReset: vscode.Event<void>;

    /**
     * Event that fires when an item is added to the collection
     */
    readonly onItemAdded: vscode.Event<T>;

    /**
     * Event that fires when an item is removed from the collection
     */
    readonly onItemRemoved: vscode.Event<T>;

    /**
     * The number of items in the collection
     */
    readonly length: number;

    /**
     * Resets the collection, removing all items
     */
    reset(): void

    /**
     * Adds an item to the collection
     * @param item The item to add
     */
    add(item: T): void;

    /**
     * Removes an item from the collection
     * @param item The item to remove
     */
    remove(item: T): void;
}

/**
 * A collection key-value pairs that emits events when items are added or removed
 */
export interface IObservableReadOnlyMap<K, V> {
    /**
     * The number of items in the map
     */
    readonly size: number;

    /**
     * Retrieves the value associated with the specified key
     * @param key - The key for which to retrieve the value
     * @returns The value associated with the specified key; undefined if the key is not in the map
     */
    get(key: K): V | undefined;

    /**
     * Event that fires when an item is added to the collection
     */
    readonly onItemAdded: vscode.Event<K>;

    /**
     * Event that fires when an item is removed from the collection
     */
    readonly onItemRemoved: vscode.Event<V>;
}
