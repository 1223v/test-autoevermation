import * as vscode from 'vscode';

export class SettingsManager {
    private static readonly SECTION = 'javaTestGenerator';
    private onChangeEmitter = new vscode.EventEmitter<void>();

    public readonly onDidChange = this.onChangeEmitter.event;

    constructor() {
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration(SettingsManager.SECTION)) {
                this.onChangeEmitter.fire();
            }
        });
    }

    private getConfig(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration(SettingsManager.SECTION);
    }

    public getApiUrl(): string {
        return this.getConfig().get<string>('apiUrl', 'http://localhost:8000/api/v1');
    }

    public getApiKey(): string {
        return this.getConfig().get<string>('apiKey', '');
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

    public async setApiKey(apiKey: string): Promise<void> {
        await this.getConfig().update('apiKey', apiKey, vscode.ConfigurationTarget.Global);
    }

    public async setApiUrl(apiUrl: string): Promise<void> {
        await this.getConfig().update('apiUrl', apiUrl, vscode.ConfigurationTarget.Global);
    }

    public isConfigured(): boolean {
        const apiUrl = this.getApiUrl();
        return Boolean(apiUrl);
    }

    public dispose(): void {
        this.onChangeEmitter.dispose();
    }
}
