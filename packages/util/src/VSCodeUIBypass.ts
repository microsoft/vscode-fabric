import * as sinon from 'sinon';
import * as vscode from 'vscode';

/**
 * Utility class to bypass VS Code UI interactions in integration and E2E tests.
 * Uses Sinon fakes to replace showInputBox and showQuickPick with configurable responses.
 *
 * Example usage:
 * ```typescript
 * let uiBypass: VSCodeUIBypass;
 *
 * beforeEach(() => {
 *     uiBypass = new VSCodeUIBypass();
 *     uiBypass.install();
 * });
 *
 * afterEach(() => {
 *     uiBypass.restore();
 * });
 *
 * it('should create workspace', async () => {
 *     uiBypass.setInputBoxResponse('My Test Workspace');
 *     uiBypass.setQuickPickResponse({ label: 'Test Capacity', id: 'cap-123' });
 *
 *     await vscode.commands.executeCommand('fabric.createWorkspace');
 * });
 * ```
 */
export class VSCodeUIBypass {
    private inputBoxStub?: sinon.SinonStub;
    private quickPickStub?: sinon.SinonStub;
    private warningMessageStub?: sinon.SinonStub;
    private informationMessageStub?: sinon.SinonStub;
    private installed = false;

    /**
     * Installs the UI bypass by stubbing VS Code window APIs.
     * Call this in beforeEach or before hooks.
     */
    install(): void {
        if (this.installed) {
            throw new Error('VSCodeUIBypass is already installed. Call restore() first.');
        }

        this.inputBoxStub = sinon.stub(vscode.window, 'showInputBox');
        this.quickPickStub = sinon.stub(vscode.window, 'showQuickPick');
        this.warningMessageStub = sinon.stub(vscode.window, 'showWarningMessage');
        this.informationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');

        // Default to returning undefined (user cancellation)
        this.inputBoxStub.resolves(undefined);
        this.quickPickStub.resolves(undefined);
        this.warningMessageStub.resolves(undefined);
        this.informationMessageStub.resolves(undefined);

        this.installed = true;
    }

    /**
     * Restores the original VS Code window APIs.
     * Call this in afterEach or after hooks.
     */
    restore(): void {
        if (!this.installed) {
            return;
        }

        this.inputBoxStub?.restore();
        this.quickPickStub?.restore();
        this.warningMessageStub?.restore();
        this.informationMessageStub?.restore();

        this.inputBoxStub = undefined;
        this.quickPickStub = undefined;
        this.warningMessageStub = undefined;
        this.informationMessageStub = undefined;
        this.installed = false;
    }

    /**
     * Configures the next showInputBox call to return the specified value.
     * Call this before the code that will trigger the input box.
     *
     * @param value The value to return from showInputBox, or undefined to simulate cancellation
     */
    setInputBoxResponse(value: string | undefined): void {
        this.ensureInstalled();
        this.inputBoxStub!.onCall(this.inputBoxStub!.callCount).resolves(value);
    }

    /**
     * Configures multiple responses for showInputBox calls in sequence.
     * Useful when multiple input boxes are shown in succession.
     *
     * @param values Array of values to return for consecutive showInputBox calls
     */
    setInputBoxResponseQueue(values: (string | undefined)[]): void {
        this.ensureInstalled();
        values.forEach((value, index) => {
            this.inputBoxStub!.onCall(this.inputBoxStub!.callCount + index).resolves(value);
        });
    }

    /**
     * Gets the number of times showInputBox has been called.
     * Useful for assertions in tests.
     */
    getInputBoxCallCount(): number {
        this.ensureInstalled();
        return this.inputBoxStub!.callCount;
    }

    /**
     * Gets the arguments from a specific showInputBox call.
     * Useful for verifying the correct prompts were shown.
     *
     * @param callIndex The zero-based index of the call to retrieve arguments for
     */
    getInputBoxCallArgs(callIndex: number): any[] {
        this.ensureInstalled();
        return this.inputBoxStub!.getCall(callIndex)?.args || [];
    }

    /**
     * Configures the next showQuickPick call to return the specified selection.
     * Call this before the code that will trigger the quick pick.
     *
     * @param selection The item to select from the quick pick, or undefined to simulate cancellation
     */
    setQuickPickResponse<T extends vscode.QuickPickItem | string>(selection: T | undefined): void {
        this.ensureInstalled();
        this.quickPickStub!.onCall(this.quickPickStub!.callCount).resolves(selection);
    }

    /**
     * Configures multiple responses for showQuickPick calls in sequence.
     * Useful when multiple quick picks are shown in succession.
     *
     * @param selections Array of items to select for consecutive showQuickPick calls
     */
    setQuickPickResponseQueue<T extends vscode.QuickPickItem | string>(selections: (T | undefined)[]): void {
        this.ensureInstalled();
        selections.forEach((selection, index) => {
            this.quickPickStub!.onCall(this.quickPickStub!.callCount + index).resolves(selection);
        });
    }

    /**
     * Gets the number of times showQuickPick has been called.
     * Useful for assertions in tests.
     */
    getQuickPickCallCount(): number {
        this.ensureInstalled();
        return this.quickPickStub!.callCount;
    }

    /**
     * Gets the arguments from a specific showQuickPick call.
     * Useful for verifying the correct options were shown.
     *
     * @param callIndex The zero-based index of the call to retrieve arguments for
     */
    getQuickPickCallArgs(callIndex: number): any[] {
        this.ensureInstalled();
        return this.quickPickStub!.getCall(callIndex)?.args || [];
    }

    /**
     * Configures the next showWarningMessage call to return the specified selection.
     * Works with either string button labels or MessageItem objects.
     * Call this before the code that will trigger the warning message.
     *
     * @param selection The selected item to return, or undefined to simulate dismissal
     */
    setWarningMessageResponse<T extends string | vscode.MessageItem>(selection: T | undefined): void {
        this.ensureInstalled();
        this.warningMessageStub!.onCall(this.warningMessageStub!.callCount).resolves(selection);
    }

    /**
     * Configures multiple responses for showWarningMessage calls in sequence.
     * Useful when multiple warning messages are shown in succession.
     *
     * @param selections Array of items to select for consecutive showWarningMessage calls
     */
    setWarningMessageResponseQueue<T extends string | vscode.MessageItem>(selections: (T | undefined)[]): void {
        this.ensureInstalled();
        selections.forEach((selection, index) => {
            this.warningMessageStub!.onCall(this.warningMessageStub!.callCount + index).resolves(selection);
        });
    }

    /**
     * Gets the number of times showWarningMessage has been called.
     * Useful for assertions in tests.
     */
    getWarningMessageCallCount(): number {
        this.ensureInstalled();
        return this.warningMessageStub!.callCount;
    }

    /**
     * Gets the arguments from a specific showWarningMessage call.
     * Useful for verifying the correct message and options were shown.
     *
     * @param callIndex The zero-based index of the call to retrieve arguments for
     */
    getWarningMessageCallArgs(callIndex: number): any[] {
        this.ensureInstalled();
        return this.warningMessageStub!.getCall(callIndex)?.args || [];
    }

    /**
     * Configures the next showInformationMessage call to return the specified selection.
     * Works with either string button labels or MessageItem objects.
     * Call this before the code that will trigger the information message.
     *
     * @param selection The selected item to return, or undefined to simulate dismissal
     */
    setInformationMessageResponse<T extends string | vscode.MessageItem>(selection: T | undefined): void {
        this.ensureInstalled();
        this.informationMessageStub!.onCall(this.informationMessageStub!.callCount).resolves(selection);
    }

    /**
     * Configures multiple responses for showInformationMessage calls in sequence.
     * Useful when multiple information messages are shown in succession.
     *
     * @param selections Array of items to select for consecutive showInformationMessage calls
     */
    setInformationMessageResponseQueue<T extends string | vscode.MessageItem>(selections: (T | undefined)[]): void {
        this.ensureInstalled();
        selections.forEach((selection, index) => {
            this.informationMessageStub!.onCall(this.informationMessageStub!.callCount + index).resolves(selection);
        });
    }

    /**
     * Gets the number of times showInformationMessage has been called.
     */
    getInformationMessageCallCount(): number {
        this.ensureInstalled();
        return this.informationMessageStub!.callCount;
    }

    /**
     * Gets the arguments from a specific showInformationMessage call.
     *
     * @param callIndex The zero-based index of the call to retrieve arguments for
     */
    getInformationMessageCallArgs(callIndex: number): any[] {
        this.ensureInstalled();
        return this.informationMessageStub!.getCall(callIndex)?.args || [];
    }

    private ensureInstalled(): void {
        if (!this.installed) {
            throw new Error('VSCodeUIBypass is not installed. Call install() first.');
        }
    }
}
