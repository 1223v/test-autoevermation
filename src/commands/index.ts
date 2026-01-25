import * as vscode from 'vscode';
import { ApiClient } from '../api/client';
import { StatusBarManager } from '../ui/statusBar';
import { SettingsManager } from '../config/settings';
import {
    createGenerateTestCommand,
    createCheckConnectionCommand
} from './generateTest';

/**
 * Registers all extension commands
 */
export function registerCommands(
    context: vscode.ExtensionContext,
    apiClient: ApiClient,
    statusBar: StatusBarManager,
    settings: SettingsManager
): void {
    // Register generate test command
    context.subscriptions.push(
        createGenerateTestCommand(apiClient, statusBar, settings)
    );

    // Register check connection command
    context.subscriptions.push(
        createCheckConnectionCommand(apiClient, statusBar)
    );
}
