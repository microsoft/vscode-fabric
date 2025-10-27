# Dependency Injection (DI) Framework Overview

We are using [wessberg/di](https://github.com/wessberg/DI?tab=readme-ov-file#description), an open-source DI framework for TypeScript. This framework offers several advantages:

1. **Decoupled Types**: Injectable types are not coupled with the framework. There is no need to use `@injectable` or `inject()` on the types themselves.
2. **No Experimental Decorators**: It avoids using old "experimental" TypeScript decorators.
3. **Compact and Familiar**: The framework is lightweight and has a very C#/.NET-like feel.

From [wessberg/di](https://github.com/wessberg/DI?tab=readme-ov-file#description):
> This is a tiny library that brings Dependency-Injection to TypeScript. There are several competing libraries out there, but this one is unique in the sense that:
> 
> - It is _seriously_ small.
> - It does its work on compile-time. The only runtime dependency is the `DIContainer` itself.
> - It doesn't ask you to reflect metadata or to annotate your classes with decorators. _"It just works"_.
> - It maps interfaces to implementations. Most popular dependency injection systems for TypeScript don't do this. This allows you to truly decouple an abstraction from its implementation.
> - It supports the .NET generic reflection flavour: `registerSingleton<Interface, Implementation>()`. No need for anything else.
> 
> This library provides constructor-based dependency injection. This means that your classes will receive dependency-injected services as arguments to their constructors.

---

## Registering Services

To register services in the DI container, use methods like `registerSingleton` or `registerTransient`. Here's an example:

```typescript
// filepath: /path/to/example.ts
import { DIContainer } from '@wessberg/di';

interface ILogger {
    log(message: string): void;
}

class ConsoleLogger implements ILogger {
    log(message: string): void {
        console.log(message);
    }
}

const container = new DIContainer();

// Register a singleton service
container.registerSingleton<ILogger, ConsoleLogger>();
```

---

## Resolving Services

To resolve services, use the `get` method of the container:

```typescript
// filepath: /path/to/example.ts
// ...existing code...

const logger = container.get<ILogger>();
logger.log('Hello, Dependency Injection!');
```

---

## Using DI in Tests

In test cases, you may need to manually build the container and register mock implementations. Here's an example:

```typescript
// filepath: /path/to/test.ts
import { DIContainer } from '@wessberg/di';
import { Mock } from 'moq.ts';

const container = new DIContainer();

// Mock implementation
const mockService = new Mock<IService>();
mockService.setup(service => service.doSomething()).returns(() => console.log('Mock implementation'));

// Register the mock
container.registerSingleton<IService>(() => mockService.object());

// Resolve and use the mock
const service = container.get<IService>();
service.doSomething(); // Outputs: "Mock implementation"
```

---

## Integration with Webpack and Transformers

The framework relies on TypeScript transformers for compile-time dependency injection. In Webpack builds, use the `getCustomTransformers` option. For test cases, configure the transformer in `tsconfig.json` or use a custom transformer file.

### Webpack Example

```javascript
// filepath: /path/to/webpack.config.js
const di = require('@wessberg/di-compiler');

module.exports = {
    // ...existing config...
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'ts-loader',
                        options: {
                            getCustomTransformers: (program) => di.di({ program })
                        }
                    }
                ]
            }
        ]
    }
};
```

### Test Compilation with `tspc`

For tests, use `tspc` (a drop-in replacement for `tsc` with transformer support). Example `tsconfig.json`:

```json
// filepath: /path/to/tsconfig.json
{
    "compilerOptions": {
        "plugins": [
            { "transform": "@wessberg/di-compiler" }
        ]
    }
}
```

---

## Gotchas

1. **Manual Container Construction in Tests**  
   When using `tspc` for tests, you may need to manually construct objects instead of relying on shorthand registration.

   **Does Not Work**:
   ```typescript
   container.registerTransient<IDisposableCollection, DisposableCollection>();
   ```

   You'll see an error like: `ReferenceError: DisposableCollection is not defined` when something that has this dependency is resolved. 

   **Works**:
   ```typescript
   container.registerTransient<IDisposableCollection>(() => new DisposableCollection(container.get<ExtensionContext>()));
   ```

2. **Resolving Aliased Types**  
   When working with aliased types (e.g., `vscode.`), the non-aliased type must always be registered, even if you plan to resolve the aliased version.

   **Important**: Even to resolve the aliased type, the non-aliased registration is required.

   **Doens't work**:
   ```typescript
   // Only registering the aliased version is not sufficient
   container.registerSingleton<vscode.ExtensionContext>(() => context);
   container.get<vscode.ExtensionContext>(); // This will fail
   ```

   **Works**:
   ```typescript
   // Register both for clarity when you need both forms
   container.registerSingleton<ExtensionContext>(() => context);
   container.registerSingleton<vscode.ExtensionContext>(() => context);
   container.get<vscode.ExtensionContext>(); // works

   ```

---

## Additional Resources

- [wessberg/di GitHub Repository](https://github.com/wessberg/DI)
- [wessberg/di-compiler Documentation](https://github.com/wessberg/DI/tree/master/packages/di-compiler)

