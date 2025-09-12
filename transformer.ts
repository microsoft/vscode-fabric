import type { Program } from 'typescript';
import { di } from '@wessberg/di-compiler';

const transformer = (program: Program) => {

    const diTransformer = di({ program });

    console.log(diTransformer);

    return {
        before: diTransformer.before,
        after: diTransformer.after,
    };
};

export default transformer;
