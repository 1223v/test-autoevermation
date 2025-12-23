import * as vscode from 'vscode';
import { ApiClient } from './api/client';
import { SettingsManager } from './config/settings';
import { StatusBarManager } from './ui/statusBar';
import { SidebarProvider } from './ui/sidebarProvider';
import { registerCommands } from './commands';

// Extension output channel for logging
let outputChannel: vscode.OutputChannel;

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    outputChannel = vscode.window.createOutputChannel('Test-AutoEvermation');
    outputChannel.appendLine('Test-AutoEvermation extension is activating...');

    try {
        // Initialize settings manager with secure storage
        const settings = new SettingsManager(context.secrets);
        context.subscriptions.push({
            dispose: () => settings.dispose()
        });

        // Initialize API client
        const apiClient = new ApiClient(settings);

        // Initialize status bar
        const statusBar = new StatusBarManager(context);

        // Initialize sidebar
        const sidebarProvider = new SidebarProvider(
            context.extensionUri,
            apiClient,
            settings
        );
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                SidebarProvider.viewType,
                sidebarProvider
            )
        );

        // Register all commands
        registerCommands(context, apiClient, statusBar, settings);

        // Check server connection on activation (non-blocking)
        checkServerConnection(apiClient, statusBar, settings);

        // Watch for configuration changes
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('javaTestGenerator')) {
                    outputChannel.appendLine('Configuration changed, rechecking connection...');
                    checkServerConnection(apiClient, statusBar, settings);
                }
            })
        );

        outputChannel.appendLine('Test-AutoEvermation extension activated successfully');
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        outputChannel.appendLine(`Activation failed: ${message}`);
        vscode.window.showErrorMessage(`Test-AutoEvermation activation failed: ${message}`);
    }
}

/**
 * Checks server connection and updates status bar
 */
async function checkServerConnection(
    apiClient: ApiClient,
    statusBar: StatusBarManager,
    settings: SettingsManager
): Promise<void> {
    // Skip check if not configured
    if (!settings.isConfigured()) {
        outputChannel.appendLine('API not configured, skipping connection check');
        statusBar.setReady();
        return;
    }

    try {
        statusBar.setConnecting();
        const isReachable = await apiClient.isServerReachable();

        if (isReachable) {
            outputChannel.appendLine(`Connected to server at ${apiClient.getBaseUrl()}`);
            statusBar.setReady();
        } else {
            outputChannel.appendLine('Server is not reachable');
            statusBar.setDisconnected('Server is not reachable');
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        outputChannel.appendLine(`Connection check failed: ${message}`);
        statusBar.setDisconnected(message);
    }
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
    outputChannel?.appendLine('Test-AutoEvermation extension deactivated');
    outputChannel?.dispose();
}
