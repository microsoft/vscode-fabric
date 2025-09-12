/**
 * Lazy loaded and cached value
 */
export interface Lazy<T> {
    /**
     * Get the cached value or call the loader if the value is falsy.
     * @returns the cached value if it's not falsy, or the result of the loader if it is a function; otherwise, undefined.
     */
    (createIfNotCreated?: boolean): T
}

/**
 * Create a readonly lazy instance.
 * If createIfNotCreated = false, we return either the cached instance if it exists or undefined if it does not exist.
 */
export function lazyLoad<T>(loader: () => T): Lazy<T> {
    let cache: any;

    return (createIfNotCreated = true) => {
        if (cache !== undefined) {
            return cache;
        }
        else if (createIfNotCreated) {
            return (cache = loader());
        }
        return undefined;
    };
}
