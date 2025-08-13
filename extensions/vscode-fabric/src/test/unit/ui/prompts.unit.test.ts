import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';

import { showSignInPrompt, showSelectWorkspacePrompt } from '../../../ui/prompts';
import { commandNames } from '../../../constants';

describe('prompts', () => {
    let showInformationMessageStub: sinon.SinonStub;
    let executeCommandStub: sinon.SinonStub;

    beforeEach(() => {
        showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
        executeCommandStub = sinon.stub(vscode.commands, 'executeCommand');
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('showSignInPrompt', () => {
        it('executes sign in command when user selects Sign in', async () => {
            // Arrange
            showInformationMessageStub.resolves(vscode.l10n.t('Sign in'));

            // Act
            await showSignInPrompt();

            // Assert
            assert.ok(showInformationMessageStub.calledOnce, 'showInformationMessage should be called');
            assert.ok(
                executeCommandStub.calledWith(commandNames.signIn),
                'executeCommand should be called with signIn'
            );
        });

        it('does not execute sign in command when user dismisses dialog', async () => {
            // Arrange
            showInformationMessageStub.resolves(undefined);

            // Act
            await showSignInPrompt();

            // Assert
            assert.ok(showInformationMessageStub.calledOnce, 'showInformationMessage should be called');
            assert.ok(
                executeCommandStub.notCalled,
                'executeCommand should not be called if user cancels'
            );
        });
    });

    describe('showSelectWorkspacePrompt', () => {
        it('executes openWorkspace command when user selects Select workspace', async () => {
            // Arrange
            showInformationMessageStub.resolves(vscode.l10n.t('Select workspace'));

            // Act
            await showSelectWorkspacePrompt();

            // Assert
            assert.ok(showInformationMessageStub.calledOnce, 'showInformationMessage should be called');
            assert.ok(
                executeCommandStub.calledWith(commandNames.openWorkspace),
                'executeCommand should be called with openWorkspace'
            );
        });

        it('does not execute openWorkspace command when user dismisses dialog', async () => {
            // Arrange
            showInformationMessageStub.resolves(undefined);

            // Act
            await showSelectWorkspacePrompt();

            // Assert
            assert.ok(showInformationMessageStub.calledOnce, 'showInformationMessage should be called');
            assert.ok(
                executeCommandStub.notCalled,
                'executeCommand should not be called if user cancels'
            );
        });
    });
});