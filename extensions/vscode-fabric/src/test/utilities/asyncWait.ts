export async function waitFor<T>(fn: () => Promise<T | undefined> | T | undefined, timeout = 5000, interval = 100): Promise<T> {
    const end = Date.now() + timeout;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const v = await fn();
        if (v !== undefined && v !== null) {
            return v;
        }
        if (Date.now() > end) {
            throw new Error('waitFor timeout exceeded');
        }
        await new Promise(r => setTimeout(r, interval));
    }
}

export async function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}
