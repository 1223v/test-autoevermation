import * as vscode from 'vscode';
import { HandlerContext } from './types';
import { getUserFriendlyErrorMessage } from '../../api/errors';

/**
 * Handles settings-related operations
 */
export class SettingsHandler {
    /**
     * Sends current settings to the webview
     */
    async sendCurrentSettings(context: HandlerContext): Promise<void> {
        if (context.view) {
            // Get API key asynchronously from secure storage
            const apiKey = await context.settings.getApiKeyAsync();
            // Only send masked API key to webview for security
            const maskedApiKey = apiKey ? '********' + apiKey.slice(-4) : '';
            const hasApiKey = Boolean(apiKey);

            context.postMessage({
                command: 'settingsLoaded',
                apiUrl: context.settings.getApiUrl(),
                apiKey: maskedApiKey,
                hasApiKey: hasApiKey,
                testFramework: context.settings.getTestFramework(),
                mockingFramework: context.settings.getMockingFramework(),
                isConfigured: context.settings.isConfigured()
            });
        }
    }

    /**
     * Saves settings to configuration
     */
    async saveSettings(apiUrl: string, apiKey: string, context: HandlerContext): Promise<void> {
        try {
            await context.settings.setApiUrl(apiUrl);
            await context.settings.setApiKey(apiKey);

            context.postMessage({
                command: 'settingsSaved',
                success: true
            });

            vscode.window.showInformationMessage('Settings saved successfully');
        } catch (error) {
            const errorMessage = getUserFriendlyErrorMessage(error);
            context.postMessage({
                command: 'settingsSaved',
                success: false,
                error: errorMessage
            });
            vscode.window.showErrorMessage(`Failed to save settings: ${errorMessage}`);
        }
    }

    /**
     * Tests the API connection
     */
    async testConnection(context: HandlerContext): Promise<void> {
        context.postMessage({ command: 'connectionTesting' });

        try {
            const health = await context.apiClient.healthCheck();
            // Server is considered connected if status is 'healthy' or 'degraded'
            const isConnected = health.status === 'healthy' || health.status === 'degraded';

            context.postMessage({
                command: 'connectionResult',
                success: isConnected,
                status: health.status,
                version: health.version,
                features: health.features,
                timestamp: health.timestamp,
                redisConnected: health.redis_connected
            });

            // Show warning if server is in degraded state
            if (health.status === 'degraded') {
                vscode.window.showWarningMessage(
                    `Server is in degraded state. Redis: ${health.redis_connected ? 'connected' : 'disconnected'}`
                );
            }
        } catch (error) {
            const errorMessage = getUserFriendlyErrorMessage(error);
            context.postMessage({
                command: 'connectionResult',
                success: false,
                error: errorMessage
            });
            vscode.window.showErrorMessage(errorMessage);
        }
    }
}
