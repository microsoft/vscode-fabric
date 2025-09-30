# Testing
There are three kinds of tests in this project, each with a different environment. For example, unit & integration tests have access to the VS Code API, but UI tests don't. Integration & UI tests activate the extensions, but unit tests don't. It's important to keep this matrix in mind when determining which kind of test you need. 

| Test type | VS Code API | Extension Activated |
| --- | --- | --- |
| Unit | Yes | No |
| Integration | Yes | Yes |
| UI test | No | Yes |

Generally speaking, your code should have mostly unit tests, fewer integration tests, and least UI tests. UI tests do not contribute to code coverage. 
