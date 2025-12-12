// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';
import { ObservableSet } from '../../../src/collections/ObservableSet';
import { IObservableArray } from '../../../src/collections/definitions';

export class ObservableArrayEventValidator<T> {
    private added: T[] = [];
    private removed: T[] = [];
    private resetCount: number = 0;

    constructor(private array: IObservableArray<T>) {
        this.array.onItemAdded((item) => {
            this.added.push(item);
        });
        this.array.onItemRemoved((item) => {
            this.removed.push(item);
        });
        this.array.onReset(() => {
            this.resetCount++;
        });
    }

    public assertStrictEquals(expectedAdded: T[] = [], expectedRemoved: T[] = [], expectedResetCount: number = 0) {
        assert.deepStrictEqual(this.added, expectedAdded, 'Added');
        assert.deepStrictEqual(this.removed, expectedRemoved, 'Removed');
        assert.equal(this.resetCount, expectedResetCount, 'Reset');
    }

    public assertEventCounts(expectedAdded: number = 0, expectedRemoved: number = 0, expectedResetCount: number = 0) {
        assert.equal(this.added.length, expectedAdded, 'Added');
        assert.equal(this.removed.length, expectedRemoved, 'Removed');
        assert.equal(this.resetCount, expectedResetCount, 'Reset');
    }
}

describe('ObservableSet unit tests', () => {
    it('default constructor gives empty array', async () => {
        const array = new ObservableSet<number>();
        assert.equal(array.length, 0, 'Expected empty array');
    });

    it('constructor with initial elements', async () => {
        const array = new ObservableSet<number>([1, 2, 2, 3]);

        // Current design is to allow duplicates through the constructor
        assert.equal(array.length, 4, 'array length');
    });

    it('add items', async () => {
        const array = new ObservableSet<number>();
        const events = new ObservableArrayEventValidator(array);

        array.add(1);
        array.add(2);

        assert.equal(array.length, 2, 'array length');
        assert.deepStrictEqual(array.items, [1, 2], 'items');
        events.assertStrictEquals([1, 2], [], 0);
    });

    it('remove items', async () => {
        const array = new ObservableSet<number>([1, 2, 3]);
        const events = new ObservableArrayEventValidator(array);

        array.remove(2);
        array.remove(1);
        array.remove(2);

        assert.equal(array.length, 1, 'array length');
        assert.deepStrictEqual(array.items, [3], 'items');
        events.assertStrictEquals([], [2, 1], 0);
    });

    it('reset', async () => {
        const array = new ObservableSet<number>([1, 2, 3]);
        const events = new ObservableArrayEventValidator(array);

        array.reset();

        assert.equal(array.length, 0, 'array length');
        events.assertStrictEquals([], [], 1);
    });

    it('compare function', async () => {
        // In this test the compare function always returns false, so the remove operation should not remove any items
        const array = new ObservableSet<number>([1, 2, 3], (a, b) => false);
        const events = new ObservableArrayEventValidator(array);

        array.remove(2);

        assert.equal(array.length, 3, 'array length');
        assert.deepEqual(array.items, [1, 2, 3], 'items');
        events.assertStrictEquals([], [], 0);
    });

    it('Adding duplicates', async () => {
        const initialItems = [new TestObject(1), new TestObject(2), new TestObject(3)];
        const array = new ObservableSet<TestObject>(initialItems, (a, b) => a.value === b.value);
        const events = new ObservableArrayEventValidator(array);

        array.add(new TestObject(2));
        array.add(new TestObject(3));

        assert.equal(array.length, 3, 'array length');
        assert.deepEqual(array.items, initialItems, 'items');
        events.assertStrictEquals([], [], 0);
    });

    it('Removing duplicates', async () => {
        const initialItems = [new TestObject(1), new TestObject(2), new TestObject(2), new TestObject(3)];
        const array = new ObservableSet<TestObject>(initialItems, (a, b) => a.value === b.value);
        const events = new ObservableArrayEventValidator(array);

        array.remove(new TestObject(2));

        const expectedItems = [initialItems[0], initialItems[3]];
        assert.equal(array.length, 2, 'array length');
        assert.deepEqual(array.items, expectedItems, 'items');
        events.assertStrictEquals([], [initialItems[1], initialItems[2]], 0);
    });

});

class TestObject {
    constructor(public value: number) {
    }
}
