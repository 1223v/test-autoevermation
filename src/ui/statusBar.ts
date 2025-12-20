import * as vscode from 'vscode';

/**
 * Status bar states
 */
export enum StatusBarState {
    Ready = 'ready',
    Connecting = 'connecting',
    Generating = 'generating',
    Analyzing = 'analyzing',
    Success = 'success',
    Error = 'error',
    Disconnected = 'disconnected'
}

/**
 * Manages the extension's status bar item
 */
export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;
    private currentState: StatusBarState = StatusBarState.Ready;
    private successTimeout?: NodeJS.Timeout;

    constructor(context: vscode.ExtensionContext) {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = 'javaTestGenerator.generateTest';
        this.setReady();
        this.statusBarItem.show();

        context.subscriptions.push(this.statusBarItem);
    }

    /**
     * Sets the status bar to ready state
     */
    public setReady(): void {
        this.clearTimeout();
        this.currentState = StatusBarState.Ready;
        this.statusBarItem.text = '$(beaker) Test Gen';
        this.statusBarItem.tooltip = 'Click to generate unit test for current Java file';
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.color = undefined;
    }

    /**
     * Sets the status bar to connecting state
     */
    public setConnecting(): void {
        this.clearTimeout();
        this.currentState = StatusBarState.Connecting;
        this.statusBarItem.text = '$(sync~spin) Connecting...';
        this.statusBarItem.tooltip = 'Connecting to API server...';
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.color = undefined;
    }

    /**
     * Sets the status bar to generating state
     */
    public setGenerating(): void {
        this.clearTimeout();
        this.currentState = StatusBarState.Generating;
        this.statusBarItem.text = '$(sync~spin) Generating...';
        this.statusBarItem.tooltip = 'Generating unit test...';
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.color = undefined;
    }

    /**
     * Sets the status bar to analyzing state
     */
    public setAnalyzing(): void {
        this.clearTimeout();
        this.currentState = StatusBarState.Analyzing;
        this.statusBarItem.text = '$(sync~spin) Analyzing...';
        this.statusBarItem.tooltip = 'Analyzing Java code...';
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.color = undefined;
    }

    /**
     * Sets the status bar to success state
     */
    public setSuccess(message?: string): void {
        this.clearTimeout();
        this.currentState = StatusBarState.Success;
        this.statusBarItem.text = '$(check) Test Generated';
        this.statusBarItem.tooltip = message || 'Test file generated successfully';
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.color = new vscode.ThemeColor('testing.iconPassed');

        // Return to ready state after 5 seconds
        this.successTimeout = setTimeout(() => {
            this.setReady();
        }, 5000);
    }

    /**
     * Sets the status bar to error state
     */
    public setError(message?: string): void {
        this.clearTimeout();
        this.currentState = StatusBarState.Error;
        this.statusBarItem.text = '$(error) Test Gen Error';
        this.statusBarItem.tooltip = message || 'Test generation failed. Click to retry.';
        this.statusBarItem.backgroundColor = new vscode.ThemeColor(
            'statusBarItem.errorBackground'
        );
        this.statusBarItem.color = undefined;
    }

    /**
     * Sets the status bar to disconnected state
     */
    public setDisconnected(message?: string): void {
        this.clearTimeout();
        this.currentState = StatusBarState.Disconnected;
        this.statusBarItem.text = '$(warning) Disconnected';
        this.statusBarItem.tooltip = message || 'Cannot connect to API server. Check settings.';
        this.statusBarItem.backgroundColor = new vscode.ThemeColor(
            'statusBarItem.warningBackground'
        );
        this.statusBarItem.color = undefined;
    }

    /**
     * Clears any pending timeout
     */
    private clearTimeout(): void {
        if (this.successTimeout) {
            clearTimeout(this.successTimeout);
            this.successTimeout = undefined;
        }
    }

    /**
     * Disposes of resources
     */
    public dispose(): void {
        this.clearTimeout();
        this.statusBarItem.dispose();
    }
}
