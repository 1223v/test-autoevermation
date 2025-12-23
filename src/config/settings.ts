import * as vscode from 'vscode';

/**
 * Secure settings manager with SecretStorage for sensitive data
 */
export class SettingsManager {
    private static readonly SECTION = 'javaTestGenerator';
    private static readonly API_KEY_SECRET = 'javaTestGenerator.apiKey';
    private onChangeEmitter = new vscode.EventEmitter<void>();
    private secretStorage: vscode.SecretStorage | undefined;
    private cachedApiKey: string = '';

    public readonly onDidChange = this.onChangeEmitter.event;

    constructor(secretStorage?: vscode.SecretStorage) {
        this.secretStorage = secretStorage;

        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration(SettingsManager.SECTION)) {
                this.onChangeEmitter.fire();
            }
        });

        // Load API key from secret storage on initialization
        this.loadApiKeyFromSecretStorage();
    }

    /**
     * Initialize with extension context for secure storage
     */
    public initSecretStorage(secretStorage: vscode.SecretStorage): void {
        this.secretStorage = secretStorage;
        this.loadApiKeyFromSecretStorage();
    }

    /**
     * Load API key from secret storage asynchronously
     */
    private async loadApiKeyFromSecretStorage(): Promise<void> {
        if (this.secretStorage) {
            try {
                const storedKey = await this.secretStorage.get(SettingsManager.API_KEY_SECRET);
                if (storedKey) {
                    this.cachedApiKey = storedKey;
                }
            } catch (error) {
                console.error('Failed to load API key from secret storage:', error);
            }
        }
    }

    private getConfig(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration(SettingsManager.SECTION);
    }

    public getApiUrl(): string {
        return this.getConfig().get<string>('apiUrl', 'http://localhost:8000/api/v1');
    }

    /**
     * Gets API key from secure storage (cached for sync access)
     * Note: For initial load, use getApiKeyAsync() to ensure key is loaded
     */
    public getApiKey(): string {
        return this.cachedApiKey;
    }

    /**
     * Gets API key asynchronously from secure storage
     */
    public async getApiKeyAsync(): Promise<string> {
        if (this.secretStorage) {
            try {
                const storedKey = await this.secretStorage.get(SettingsManager.API_KEY_SECRET);
                if (storedKey) {
                    this.cachedApiKey = storedKey;
                    return storedKey;
                }
            } catch (error) {
                console.error('Failed to get API key from secret storage:', error);
            }
        }
        return this.cachedApiKey;
    }

    public getTestFramework(): 'junit4' | 'junit5' {
        return this.getConfig().get<'junit4' | 'junit5'>('testFramework', 'junit5');
    }

    public getMockingFramework(): 'mockito' | 'easymock' {
        return this.getConfig().get<'mockito' | 'easymock'>('mockingFramework', 'mockito');
    }

    public getCoverageTarget(): number {
        return this.getConfig().get<number>('coverageTarget', 80);
    }

    public includeEdgeCases(): boolean {
        return this.getConfig().get<boolean>('includeEdgeCases', true);
    }

    public shouldAutoSave(): boolean {
        return this.getConfig().get<boolean>('autoSave', true);
    }

    public shouldOpenAfterGeneration(): boolean {
        return this.getConfig().get<boolean>('openAfterGeneration', true);
    }

    public shouldIncludeDependencies(): boolean {
        return this.getConfig().get<boolean>('includeDependencies', true);
    }

    public getTimeout(): number {
        return this.getConfig().get<number>('timeout', 120000);
    }

    /**
     * Securely stores API key using VS Code's SecretStorage
     * Falls back to configuration if SecretStorage is not available
     */
    public async setApiKey(apiKey: string): Promise<void> {
        if (this.secretStorage) {
            try {
                if (apiKey) {
                    await this.secretStorage.store(SettingsManager.API_KEY_SECRET, apiKey);
                } else {
                    await this.secretStorage.delete(SettingsManager.API_KEY_SECRET);
                }
                this.cachedApiKey = apiKey;
                this.onChangeEmitter.fire();
                return;
            } catch (error) {
                console.error('Failed to store API key in secret storage:', error);
                throw new Error('Failed to securely store API key');
            }
        }
        throw new Error('Secure storage not available. Please restart the extension.');
    }

    /**
     * Deletes the stored API key
     */
    public async deleteApiKey(): Promise<void> {
        if (this.secretStorage) {
            try {
                await this.secretStorage.delete(SettingsManager.API_KEY_SECRET);
                this.cachedApiKey = '';
                this.onChangeEmitter.fire();
            } catch (error) {
                console.error('Failed to delete API key:', error);
            }
        }
    }

    /**
     * Validates and sets the API URL
     * @throws Error if URL is invalid or uses insecure protocol
     */
    public async setApiUrl(apiUrl: string): Promise<void> {
        // Validate URL format
        const validationResult = this.validateApiUrl(apiUrl);
        if (!validationResult.valid) {
            throw new Error(validationResult.error);
        }
        await this.getConfig().update('apiUrl', apiUrl, vscode.ConfigurationTarget.Global);
    }

    /**
     * Validates API URL for security
     */
    public validateApiUrl(apiUrl: string): { valid: boolean; error?: string } {
        if (!apiUrl || apiUrl.trim() === '') {
            return { valid: false, error: 'API URL cannot be empty' };
        }

        try {
            const url = new URL(apiUrl);

            // Only allow http and https protocols
            if (!['http:', 'https:'].includes(url.protocol)) {
                return { valid: false, error: 'Only HTTP and HTTPS protocols are allowed' };
            }

            // Warn about non-HTTPS in production (localhost is allowed for development)
            const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
            if (url.protocol === 'http:' && !isLocalhost) {
                return { valid: false, error: 'HTTPS is required for non-localhost URLs. Please use https:// for security.' };
            }

            // Prevent common attack vectors
            if (url.username || url.password) {
                return { valid: false, error: 'Credentials in URL are not allowed' };
            }

            // Block potentially dangerous hostnames (link-local, invalid)
            const blockedPatterns = [
                /^169\.254\./,  // Link-local
                /^0\./          // Invalid
            ];

            // Check if hostname matches any blocked pattern
            for (const pattern of blockedPatterns) {
                if (pattern.test(url.hostname)) {
                    return { valid: false, error: 'This hostname is not allowed for security reasons' };
                }
            }

            return { valid: true };
        } catch {
            return { valid: false, error: 'Invalid URL format' };
        }
    }

    public isConfigured(): boolean {
        const apiUrl = this.getApiUrl();
        return Boolean(apiUrl);
    }

    public dispose(): void {
        this.onChangeEmitter.dispose();
    }
}
