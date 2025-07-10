import * as assert from 'assert';
import * as Mocha from 'mocha';
import { TaskHelperWithTimeout } from '../TaskHelperWithTimeout';
import { sleep } from '../fabricUtilities';

describe('Test Await with Timout', () => {
    let delaymult = 0.01; // make this longer (like 1 or 10) if debugging
    it('await TaskHelperWithTimeout', async () => {
        let didtimeout = false;
        let expectedResult = 'result!';
        // create a function that returns a result after a delay
        let fakeApi = (delay: number) => new Promise<string>(resolve => {
            setTimeout(() => {
                resolve(expectedResult);
            }, delay);
        });
        const myTimeout = new TaskHelperWithTimeout();
        let res = await myTimeout.wrap(fakeApi(300 * delaymult), 1000 * delaymult, 'timedout');
        assert(res === expectedResult, 'should be expected result because didn\'t timeout');

        res = undefined;
        try {
            res = await myTimeout.wrap(fakeApi(3000 * delaymult), 1000 * delaymult, 'timedout');
        }
        catch (error) {
            didtimeout = true;
        }
        await sleep(1000);
        assert(didtimeout, 'should have timed out');
    });

    it('await Should Not Timeout', async () => {
        const aTimeOut = (delay: number, reason: any | undefined) =>
            new Promise<void>((resolve, reject) => {
                setTimeout(() =>
                    (reason === undefined ? resolve() : reject(reason)),
                delay);
            });

        const wpromise = (promise: any, delay: number, reason: any) =>
            Promise.race([promise, aTimeOut(delay, reason)]);
        let success = false;
        let didtimeout = false;
        await wpromise(sleep(1000 * delaymult), 2000 * delaymult, { reason: 'timeout' })
            .then(data => {
                success = true;
            }).catch(data => {
                didtimeout = true;
            });

        await sleep(1000);
        assert(success, 'expected no timeout to occuer');
    });

    it('await Should Timeout', async () => {
        const aTimeOut = (delay: number, reason: any | undefined) =>
            new Promise<void>((resolve, reject) => {
                setTimeout(() =>
                    (reason === undefined ? resolve() : reject(reason)),
                delay);
            });

        const wpromise = (promise: any, delay: number, reason: any) =>
            Promise.race([promise, aTimeOut(delay, reason)]);
        let success = false;
        let didtimeout = false;
        await wpromise(sleep(3000 * delaymult), 2000 * delaymult, { reason: 'timeout' })
            .then(data => {
                success = true;
            }).catch(data => {
                didtimeout = true;
            });

        await sleep(1000);
        assert(didtimeout, 'expected didtimeout to occur');
    });
    
    it('await another way', async () => {
        let expectedResult = 'result!';

        let fakeApi = (delay: number) => new Promise<string>(resolve => {
            setTimeout(() => {
                resolve(expectedResult);
            }, delay);
        });

        let resp = await Promise.race(
            [
                fakeApi(300 * delaymult),
                sleep(1000 * delaymult)
            ]
        );
        assert(expectedResult === resp, 'Promise.race response');
        let success = false;
        let didtimeout = false;

        try {
            let resp2 = await Promise.race(
                [
                    fakeApi(3000 * delaymult),
                    sleep(1000 * delaymult)
                ]
            );
            if (!resp2) { // returns undef on timeout: let's throw
                throw new Error('timeout');
            }
            success = true;
        }
        catch (error) {
            didtimeout = true;
        }
        if (!success) {
            didtimeout = true;
        }

        await sleep(1000);
        assert(didtimeout, 'expected timeout to occuer');
    });
});
