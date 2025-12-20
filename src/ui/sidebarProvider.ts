import * as vscode from 'vscode';
import { ApiClient } from '../api/client';
import { SettingsManager } from '../config/settings';
import { getUserFriendlyErrorMessage } from '../api/errors';

/**
 * Provides the sidebar webview panel
 */
export class SidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'javaTestGenerator.sidebar';

    private _view?: vscode.WebviewView;
    private _apiClient: ApiClient;
    private _settings: SettingsManager;
    private _extensionUri: vscode.Uri;

    constructor(
        extensionUri: vscode.Uri,
        apiClient: ApiClient,
        settings: SettingsManager
    ) {
        this._extensionUri = extensionUri;
        this._apiClient = apiClient;
        this._settings = settings;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlContent(webviewView.webview);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'saveSettings':
                    await this._saveSettings(message.apiUrl, message.apiKey);
                    break;
                case 'testConnection':
                    await this._testConnection();
                    break;
                case 'generateTest':
                    await vscode.commands.executeCommand('javaTestGenerator.generateTest');
                    break;
                case 'getSettings':
                    this._sendCurrentSettings();
                    break;
                case 'openSettings':
                    vscode.commands.executeCommand('workbench.action.openSettings', 'javaTestGenerator');
                    break;
                case 'selectFile':
                    await this._selectFile();
                    break;
                case 'generateTestForFile':
                    await this._generateTestForFile(message.filePath, message.scenarios);
                    break;
                case 'handleDroppedUri':
                    await this._handleDroppedUri(message.uri);
                    break;
                case 'runTest':
                    await this._runTest(message.testClassName);
                    break;
                case 'runAllTests':
                    await this._runAllTests();
                    break;
                case 'generateScenarios':
                    await this._generateScenarios(message.filePath);
                    break;
                case 'useCurrentFile':
                    await this._useCurrentFile();
                    break;
            }
        });

        // Send initial settings
        this._sendCurrentSettings();
    }

    private _sendCurrentSettings(): void {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'settingsLoaded',
                apiUrl: this._settings.getApiUrl(),
                apiKey: this._settings.getApiKey(),
                testFramework: this._settings.getTestFramework(),
                mockingFramework: this._settings.getMockingFramework(),
                isConfigured: this._settings.isConfigured()
            });
        }
    }

    private async _saveSettings(apiUrl: string, apiKey: string): Promise<void> {
        try {
            await this._settings.setApiUrl(apiUrl);
            await this._settings.setApiKey(apiKey);

            this._view?.webview.postMessage({
                command: 'settingsSaved',
                success: true
            });

            vscode.window.showInformationMessage('Settings saved successfully');
        } catch (error) {
            this._view?.webview.postMessage({
                command: 'settingsSaved',
                success: false,
                error: getUserFriendlyErrorMessage(error)
            });
        }
    }

    private async _testConnection(): Promise<void> {
        this._view?.webview.postMessage({ command: 'connectionTesting' });

        try {
            const health = await this._apiClient.healthCheck();

            this._view?.webview.postMessage({
                command: 'connectionResult',
                success: health.status === 'healthy',
                version: health.version,
                features: health.features
            });
        } catch (error) {
            this._view?.webview.postMessage({
                command: 'connectionResult',
                success: false,
                error: getUserFriendlyErrorMessage(error)
            });
        }
    }

    private async _selectFile(): Promise<void> {
        const files = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: {
                'Java Files': ['java']
            },
            title: 'Select Java File for Test Generation'
        });

        if (files && files.length > 0) {
            const filePath = files[0].fsPath;
            const fileName = filePath.split(/[/\\]/).pop() || '';

            this._view?.webview.postMessage({
                command: 'fileSelected',
                filePath: filePath,
                fileName: fileName
            });
        }
    }

    private async _useCurrentFile(): Promise<void> {
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            vscode.window.showWarningMessage('No file is currently open in the editor');
            return;
        }

        const filePath = editor.document.uri.fsPath;

        if (!filePath.endsWith('.java')) {
            vscode.window.showWarningMessage('Current file is not a Java file');
            return;
        }

        const fileName = filePath.split(/[/\\]/).pop() || '';

        this._view?.webview.postMessage({
            command: 'fileSelected',
            filePath: filePath,
            fileName: fileName
        });
    }

    private async _generateTestForFile(filePath: string, scenarios?: string): Promise<void> {
        if (!filePath) {
            vscode.window.showWarningMessage('No file selected');
            return;
        }

        const uri = vscode.Uri.file(filePath);
        await vscode.commands.executeCommand('javaTestGenerator.generateTest', uri, scenarios);
    }

    private async _handleDroppedUri(uriString: string): Promise<void> {
        try {
            // Parse the URI (could be file:// URI or plain path)
            let filePath: string;

            if (uriString.startsWith('file://')) {
                // Convert file:// URI to path
                const uri = vscode.Uri.parse(uriString);
                filePath = uri.fsPath;
            } else if (uriString.startsWith('/') || uriString.match(/^[a-zA-Z]:\\/)) {
                // Already a file path
                filePath = uriString;
            } else {
                vscode.window.showWarningMessage('Invalid file path');
                return;
            }

            // Check if it's a Java file
            if (!filePath.endsWith('.java')) {
                vscode.window.showWarningMessage('Please drop a Java file (.java)');
                return;
            }

            // Extract file name
            const fileName = filePath.split(/[/\\]/).pop() || '';

            // Send file selected message to webview
            this._view?.webview.postMessage({
                command: 'fileSelected',
                filePath: filePath,
                fileName: fileName
            });
        } catch (error) {
            vscode.window.showErrorMessage('Failed to process dropped file');
        }
    }

    private async _generateScenarios(filePath: string): Promise<void> {
        if (!filePath) {
            this._view?.webview.postMessage({
                command: 'scenarioError',
                error: 'No file selected'
            });
            return;
        }

        this._view?.webview.postMessage({ command: 'scenarioGenerating' });

        try {
            const uri = vscode.Uri.file(filePath);
            const contentBuffer = await vscode.workspace.fs.readFile(uri);
            const content = new TextDecoder().decode(contentBuffer);
            const fileName = filePath.split(/[/\\]/).pop() || '';

            // Extract package name from source
            const packageMatch = content.match(/^\s*package\s+([\w.]+)\s*;/m);
            const packageName = packageMatch ? packageMatch[1] : '';

            // Call API to generate scenarios
            const response = await this._apiClient.generateScenarios({
                sourceFile: {
                    fileName,
                    packageName,
                    content
                },
                options: {
                    testFramework: this._settings.getTestFramework(),
                    mockingFramework: this._settings.getMockingFramework(),
                    coverageTarget: this._settings.getCoverageTarget(),
                    includeEdgeCases: this._settings.getIncludeEdgeCases()
                }
            });

            this._view?.webview.postMessage({
                command: 'scenarioGenerated',
                scenarios: response.scenarios
            });
        } catch (error) {
            const message = getUserFriendlyErrorMessage(error);
            // Reset button state
            this._view?.webview.postMessage({
                command: 'scenarioError'
            });
            // Show VS Code notification
            vscode.window.showErrorMessage(`Scenario generation failed: ${message}`);
        }
    }

    private async _runTest(testClassName: string): Promise<void> {
        this._view?.webview.postMessage({ command: 'testRunning' });

        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('No workspace folder found');
            }

            const buildTool = await this._detectBuildTool(workspaceFolder.uri);
            let command: string;

            if (buildTool === 'gradle') {
                command = `./gradlew test --tests "${testClassName}" --info`;
                if (process.platform === 'win32') {
                    command = `gradlew.bat test --tests "${testClassName}" --info`;
                }
            } else if (buildTool === 'maven') {
                command = `mvn test -Dtest=${testClassName}`;
            } else {
                throw new Error('No Maven or Gradle build file found');
            }

            const result = await this._executeCommand(command, workspaceFolder.uri.fsPath);

            const success = this._parseTestResult(result, buildTool);

            this._view?.webview.postMessage({
                command: 'testResult',
                success: success,
                details: this._formatTestOutput(result)
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this._view?.webview.postMessage({
                command: 'testError',
                error: message
            });
        }
    }

    private async _runAllTests(): Promise<void> {
        this._view?.webview.postMessage({ command: 'testRunning' });

        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('No workspace folder found');
            }

            const buildTool = await this._detectBuildTool(workspaceFolder.uri);
            let command: string;

            if (buildTool === 'gradle') {
                command = './gradlew test --info';
                if (process.platform === 'win32') {
                    command = 'gradlew.bat test --info';
                }
            } else if (buildTool === 'maven') {
                command = 'mvn test';
            } else {
                throw new Error('No Maven or Gradle build file found');
            }

            const result = await this._executeCommand(command, workspaceFolder.uri.fsPath);

            const success = this._parseTestResult(result, buildTool);

            this._view?.webview.postMessage({
                command: 'testResult',
                success: success,
                details: this._formatTestOutput(result)
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this._view?.webview.postMessage({
                command: 'testError',
                error: message
            });
        }
    }

    private async _detectBuildTool(workspaceUri: vscode.Uri): Promise<'maven' | 'gradle' | null> {
        const gradleFiles = await vscode.workspace.findFiles(
            new vscode.RelativePattern(workspaceUri, '{build.gradle,build.gradle.kts}'),
            null,
            1
        );
        if (gradleFiles.length > 0) {
            return 'gradle';
        }

        const mavenFiles = await vscode.workspace.findFiles(
            new vscode.RelativePattern(workspaceUri, 'pom.xml'),
            null,
            1
        );
        if (mavenFiles.length > 0) {
            return 'maven';
        }

        return null;
    }

    private _executeCommand(command: string, cwd: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const { exec } = require('child_process');

            exec(command, { cwd, maxBuffer: 1024 * 1024 * 10 }, (error: Error | null, stdout: string, stderr: string) => {
                if (error) {
                    // Even with errors, we might have test output
                    if (stdout || stderr) {
                        resolve(stdout + '\n' + stderr);
                    } else {
                        reject(error);
                    }
                } else {
                    resolve(stdout + '\n' + stderr);
                }
            });
        });
    }

    private _parseTestResult(output: string, buildTool: 'maven' | 'gradle' | null): boolean {
        const lowerOutput = output.toLowerCase();

        if (buildTool === 'gradle') {
            // Gradle success indicators
            if (lowerOutput.includes('build successful') ||
                (lowerOutput.includes('test') && !lowerOutput.includes('failed') && !lowerOutput.includes('failure'))) {
                return true;
            }
            return !lowerOutput.includes('build failed') &&
                   !lowerOutput.includes('test failed') &&
                   !lowerOutput.includes('failures:');
        } else if (buildTool === 'maven') {
            // Maven success indicators
            if (lowerOutput.includes('build success')) {
                return true;
            }
            return !lowerOutput.includes('build failure') &&
                   !lowerOutput.includes('tests run:') &&
                   !lowerOutput.includes('failures:');
        }

        return !lowerOutput.includes('fail') && !lowerOutput.includes('error');
    }

    private _formatTestOutput(output: string): string {
        // Extract relevant lines from test output
        const lines = output.split('\n');
        const relevantLines: string[] = [];

        for (const line of lines) {
            const lowerLine = line.toLowerCase();
            // Include test-related lines
            if (lowerLine.includes('test') ||
                lowerLine.includes('passed') ||
                lowerLine.includes('failed') ||
                lowerLine.includes('success') ||
                lowerLine.includes('failure') ||
                lowerLine.includes('error') ||
                lowerLine.includes('build') ||
                lowerLine.includes('running') ||
                line.trim().startsWith('>')) {
                relevantLines.push(line);
            }
        }

        // Limit output length
        const maxLines = 30;
        if (relevantLines.length > maxLines) {
            return relevantLines.slice(0, maxLines).join('\n') + '\n... (truncated)';
        }

        return relevantLines.join('\n') || output.substring(0, 1000);
    }

    public refresh(): void {
        if (this._view) {
            this._view.webview.html = this._getHtmlContent(this._view.webview);
            this._sendCurrentSettings();
        }
    }

    private _getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    private _getHtmlContent(webview: vscode.Webview): string {
        const nonce = this._getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Test-AutoEvermation</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            padding: 12px;
        }
        .section {
            margin-bottom: 20px;
        }
        .section-title {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            color: var(--vscode-sideBarSectionHeader-foreground);
            margin-bottom: 10px;
            letter-spacing: 0.5px;
        }
        .input-group {
            margin-bottom: 12px;
        }
        .input-group label {
            display: block;
            margin-bottom: 4px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        input[type="text"],
        input[type="password"],
        select {
            width: 100%;
            padding: 6px 8px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 2px;
            font-size: 13px;
        }
        input[type="text"]:focus,
        input[type="password"]:focus,
        select:focus {
            outline: 1px solid var(--vscode-focusBorder);
            border-color: var(--vscode-focusBorder);
        }
        .btn {
            width: 100%;
            padding: 8px 12px;
            border: none;
            border-radius: 2px;
            font-size: 13px;
            cursor: pointer;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }
        .btn-primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn-primary:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .btn-secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .btn-secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .status {
            padding: 8px 10px;
            border-radius: 3px;
            font-size: 12px;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .status.success {
            background-color: var(--vscode-testing-iconPassed);
            color: white;
        }
        .status.error {
            background-color: var(--vscode-testing-iconFailed);
            color: white;
        }
        .status.warning {
            background-color: var(--vscode-editorWarning-foreground);
            color: white;
        }
        .status.info {
            background-color: var(--vscode-textLink-foreground);
            color: white;
        }
        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: currentColor;
        }
        .connection-status {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px;
            background-color: var(--vscode-editor-background);
            border-radius: 3px;
            margin-bottom: 12px;
            font-size: 12px;
        }
        .connection-status .dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
        }
        .connection-status .dot.connected {
            background-color: #4caf50;
        }
        .connection-status .dot.disconnected {
            background-color: #f44336;
        }
        .connection-status .dot.unknown {
            background-color: #ff9800;
        }
        .divider {
            height: 1px;
            background-color: var(--vscode-sideBarSectionHeader-border);
            margin: 16px 0;
        }
        .info-text {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }
        .icon {
            font-size: 16px;
        }
        .spinner {
            width: 14px;
            height: 14px;
            border: 2px solid transparent;
            border-top-color: currentColor;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .hidden {
            display: none !important;
        }
        .feature-list {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }
        .selected-file {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 10px;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .selected-file-icon {
            font-size: 20px;
        }
        .selected-file-info {
            flex: 1;
            overflow: hidden;
        }
        .selected-file-name {
            font-size: 13px;
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .selected-file-path {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .selected-file-remove {
            background: none;
            border: none;
            color: var(--vscode-descriptionForeground);
            cursor: pointer;
            font-size: 16px;
            padding: 4px;
        }
        .selected-file-remove:hover {
            color: var(--vscode-errorForeground);
        }
        .test-result {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 10px;
            margin-top: 10px;
            font-size: 12px;
            max-height: 200px;
            overflow-y: auto;
        }
        .test-result.success {
            border-color: #4caf50;
        }
        .test-result.failure {
            border-color: #f44336;
        }
        .test-result-header {
            font-weight: 600;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .test-result-header.success {
            color: #4caf50;
        }
        .test-result-header.failure {
            color: #f44336;
        }
        .test-result-details {
            font-family: monospace;
            font-size: 11px;
            white-space: pre-wrap;
            color: var(--vscode-descriptionForeground);
        }
        .btn-success {
            background-color: #4caf50;
            color: white;
        }
        .btn-success:hover {
            background-color: #45a049;
        }
        .btn-success:disabled {
            background-color: #81c784;
            opacity: 0.6;
        }
        .scenario-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            margin-top: 12px;
        }
        .scenario-status {
            font-size: 10px;
            padding: 2px 8px;
            border-radius: 10px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }
        .scenario-status.approved {
            background-color: #4caf50;
            color: white;
        }
        .scenario-status.draft {
            background-color: #ff9800;
            color: white;
        }
        .scenario-editor {
            width: 100%;
            min-height: 150px;
            max-height: 300px;
            padding: 10px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
            font-family: monospace;
            font-size: 12px;
            resize: vertical;
            line-height: 1.5;
        }
        .scenario-editor:focus {
            outline: 1px solid var(--vscode-focusBorder);
            border-color: var(--vscode-focusBorder);
        }
        .scenario-actions {
            display: flex;
            gap: 8px;
            margin-top: 8px;
        }
        .scenario-actions .btn {
            flex: 1;
        }
        .workflow-step {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .workflow-step .step-number {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            font-weight: 600;
        }
        .workflow-step .step-number.active {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .workflow-step .step-number.completed {
            background-color: #4caf50;
            color: white;
        }
        .file-selection-options {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-bottom: 12px;
        }
    </style>
</head>
<body>
    <!-- Connection Status -->
    <div class="connection-status" id="connectionStatus">
        <span class="dot unknown" id="connectionDot"></span>
        <span id="connectionText">Not connected</span>
    </div>

    <!-- File Selection -->
    <div class="section">
        <div class="section-title">Select Java File</div>

        <!-- File Selection Options -->
        <div class="file-selection-options" id="fileSelectionOptions">
            <button class="btn btn-primary" id="btnBrowseFile">
                <span class="icon">&#128193;</span>
                Browse Java File
            </button>
            <button class="btn btn-secondary" id="btnUseCurrentFile">
                <span class="icon">&#128196;</span>
                Use Current Editor
            </button>
        </div>

        <!-- Selected File Display -->
        <div class="selected-file hidden" id="selectedFile">
            <span class="selected-file-icon">&#9776;</span>
            <div class="selected-file-info">
                <div class="selected-file-name" id="selectedFileName"></div>
                <div class="selected-file-path" id="selectedFilePath"></div>
            </div>
            <button class="selected-file-remove" id="btnRemoveFile" title="Remove">&#10005;</button>
        </div>

        <!-- Step 1: Generate Scenarios -->
        <button class="btn btn-primary" id="btnGenerateScenarios" disabled>
            <span class="icon">&#128221;</span>
            <span id="generateScenariosText">Generate Scenarios</span>
            <span class="spinner hidden" id="scenarioSpinner"></span>
        </button>

        <!-- Scenario Editor (hidden until scenarios are generated) -->
        <div id="scenarioSection" class="hidden">
            <div class="scenario-header">
                <span class="section-title">Test Scenarios</span>
                <span class="scenario-status" id="scenarioStatus">Draft</span>
            </div>
            <textarea id="scenarioEditor" class="scenario-editor" placeholder="Test scenarios will appear here..."></textarea>
            <div class="scenario-actions">
                <button class="btn btn-primary" id="btnApproveScenarios">
                    <span class="icon">&#10004;</span>
                    Approve
                </button>
                <button class="btn btn-secondary" id="btnRegenerateScenarios">
                    <span class="icon">&#8635;</span>
                    Regenerate
                </button>
            </div>
        </div>

        <!-- Step 2: Generate Test (enabled after approval) -->
        <button class="btn btn-success" id="btnGenerateSelected" disabled>
            <span class="icon">&#9881;</span>
            Generate Test
        </button>
    </div>

    <div class="divider"></div>

    <!-- Run Test Section -->
    <div class="section">
        <div class="section-title">Run Test</div>

        <!-- Test File Input -->
        <div class="input-group">
            <label for="testClassName">Test Class Name</label>
            <input type="text" id="testClassName" placeholder="e.g., UserServiceTest">
        </div>

        <button class="btn btn-primary" id="btnRunTest">
            <span class="icon">&#9654;</span>
            <span id="runTestText">Run Test</span>
            <span class="spinner hidden" id="runTestSpinner"></span>
        </button>

        <button class="btn btn-secondary" id="btnRunAllTests">
            <span class="icon">&#9654;</span>
            Run All Tests
        </button>

        <!-- Test Result Area -->
        <div id="testResultArea" class="hidden">
            <div class="test-result" id="testResult"></div>
        </div>
    </div>

    <div class="divider"></div>

    <!-- Server Settings -->
    <div class="section">
        <div class="section-title">Server Settings</div>

        <div class="input-group">
            <label for="apiUrl">API Server URL</label>
            <input type="text" id="apiUrl" placeholder="http://localhost:8000/api/v1">
        </div>

        <div class="input-group">
            <label for="apiKey">API Key</label>
            <input type="password" id="apiKey" placeholder="Enter your API key">
        </div>

        <button class="btn btn-primary" id="btnSave">
            Save Settings
        </button>

        <button class="btn btn-secondary" id="btnTestConnection">
            <span id="testConnectionText">Test Connection</span>
            <span class="spinner hidden" id="testConnectionSpinner"></span>
        </button>
    </div>

    <div class="divider"></div>

    <!-- Generation Options -->
    <div class="section">
        <div class="section-title">Generation Options</div>

        <div class="input-group">
            <label for="testFramework">Test Framework</label>
            <select id="testFramework">
                <option value="junit5">JUnit 5</option>
                <option value="junit4">JUnit 4</option>
            </select>
        </div>

        <div class="input-group">
            <label for="mockingFramework">Mocking Framework</label>
            <select id="mockingFramework">
                <option value="mockito">Mockito</option>
                <option value="easymock">EasyMock</option>
            </select>
        </div>

        <button class="btn btn-secondary" id="btnOpenSettings">
            Open Full Settings
        </button>
    </div>

    <!-- Message Area -->
    <div id="messageArea" class="hidden"></div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        // Elements
        const apiUrlInput = document.getElementById('apiUrl');
        const apiKeyInput = document.getElementById('apiKey');
        const testFrameworkSelect = document.getElementById('testFramework');
        const mockingFrameworkSelect = document.getElementById('mockingFramework');
        const btnSave = document.getElementById('btnSave');
        const btnTestConnection = document.getElementById('btnTestConnection');
        const btnOpenSettings = document.getElementById('btnOpenSettings');
        const connectionDot = document.getElementById('connectionDot');
        const connectionText = document.getElementById('connectionText');
        const testConnectionText = document.getElementById('testConnectionText');
        const testConnectionSpinner = document.getElementById('testConnectionSpinner');
        const messageArea = document.getElementById('messageArea');

        // File selection elements
        const fileSelectionOptions = document.getElementById('fileSelectionOptions');
        const btnBrowseFile = document.getElementById('btnBrowseFile');
        const btnUseCurrentFile = document.getElementById('btnUseCurrentFile');
        const selectedFile = document.getElementById('selectedFile');
        const selectedFileName = document.getElementById('selectedFileName');
        const selectedFilePath = document.getElementById('selectedFilePath');
        const btnRemoveFile = document.getElementById('btnRemoveFile');
        const btnGenerateScenarios = document.getElementById('btnGenerateScenarios');
        const generateScenariosText = document.getElementById('generateScenariosText');
        const scenarioSpinner = document.getElementById('scenarioSpinner');
        const scenarioSection = document.getElementById('scenarioSection');
        const scenarioEditor = document.getElementById('scenarioEditor');
        const scenarioStatus = document.getElementById('scenarioStatus');
        const btnApproveScenarios = document.getElementById('btnApproveScenarios');
        const btnRegenerateScenarios = document.getElementById('btnRegenerateScenarios');
        const btnGenerateSelected = document.getElementById('btnGenerateSelected');

        // Test execution elements
        const testClassNameInput = document.getElementById('testClassName');
        const btnRunTest = document.getElementById('btnRunTest');
        const btnRunAllTests = document.getElementById('btnRunAllTests');
        const runTestText = document.getElementById('runTestText');
        const runTestSpinner = document.getElementById('runTestSpinner');
        const testResultArea = document.getElementById('testResultArea');
        const testResult = document.getElementById('testResult');

        // State
        let currentFilePath = null;
        let currentTestClassName = null;
        let scenariosApproved = false;
        let currentScenarios = '';

        // Request initial settings
        vscode.postMessage({ command: 'getSettings' });

        // Event Listeners
        btnSave.addEventListener('click', () => {
            vscode.postMessage({
                command: 'saveSettings',
                apiUrl: apiUrlInput.value,
                apiKey: apiKeyInput.value
            });
        });

        btnTestConnection.addEventListener('click', () => {
            vscode.postMessage({ command: 'testConnection' });
        });

        btnUseCurrentFile.addEventListener('click', () => {
            vscode.postMessage({ command: 'useCurrentFile' });
        });

        btnOpenSettings.addEventListener('click', () => {
            vscode.postMessage({ command: 'openSettings' });
        });

        // File selection - browse button
        btnBrowseFile.addEventListener('click', () => {
            vscode.postMessage({ command: 'selectFile' });
        });

        // Remove selected file
        btnRemoveFile.addEventListener('click', () => {
            currentFilePath = null;
            currentScenarios = '';
            scenariosApproved = false;
            selectedFile.classList.add('hidden');
            fileSelectionOptions.classList.remove('hidden');
            scenarioSection.classList.add('hidden');
            btnGenerateScenarios.disabled = true;
            btnGenerateSelected.disabled = true;
        });

        // Generate scenarios for selected file
        btnGenerateScenarios.addEventListener('click', () => {
            if (currentFilePath) {
                vscode.postMessage({
                    command: 'generateScenarios',
                    filePath: currentFilePath
                });
            }
        });

        // Approve scenarios
        btnApproveScenarios.addEventListener('click', () => {
            scenariosApproved = true;
            currentScenarios = scenarioEditor.value;
            scenarioStatus.textContent = 'Approved';
            scenarioStatus.className = 'scenario-status approved';
            scenarioEditor.disabled = true;
            btnApproveScenarios.disabled = true;
            btnGenerateSelected.disabled = false;
            showMessage('success', 'Scenarios approved! You can now generate the test.');
        });

        // Regenerate scenarios
        btnRegenerateScenarios.addEventListener('click', () => {
            if (currentFilePath) {
                scenariosApproved = false;
                scenarioStatus.textContent = 'Draft';
                scenarioStatus.className = 'scenario-status draft';
                scenarioEditor.disabled = false;
                btnApproveScenarios.disabled = false;
                btnGenerateSelected.disabled = true;
                vscode.postMessage({
                    command: 'generateScenarios',
                    filePath: currentFilePath
                });
            }
        });

        // Scenario editor change - mark as draft if edited after generation
        scenarioEditor.addEventListener('input', () => {
            if (scenariosApproved) {
                scenariosApproved = false;
                scenarioStatus.textContent = 'Draft (Edited)';
                scenarioStatus.className = 'scenario-status draft';
                btnApproveScenarios.disabled = false;
                btnGenerateSelected.disabled = true;
            }
        });

        // Generate test for selected file (with approved scenarios)
        btnGenerateSelected.addEventListener('click', () => {
            if (currentFilePath && scenariosApproved) {
                vscode.postMessage({
                    command: 'generateTestForFile',
                    filePath: currentFilePath,
                    scenarios: scenarioEditor.value
                });
            }
        });

        // Run specific test
        btnRunTest.addEventListener('click', () => {
            const testClassName = testClassNameInput.value.trim();
            if (!testClassName) {
                showMessage('warning', 'Please enter a test class name');
                return;
            }
            vscode.postMessage({
                command: 'runTest',
                testClassName: testClassName
            });
        });

        // Run all tests
        btnRunAllTests.addEventListener('click', () => {
            vscode.postMessage({
                command: 'runAllTests'
            });
        });

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;

            switch (message.command) {
                case 'settingsLoaded':
                    apiUrlInput.value = message.apiUrl || '';
                    apiKeyInput.value = message.apiKey || '';
                    testFrameworkSelect.value = message.testFramework || 'junit5';
                    mockingFrameworkSelect.value = message.mockingFramework || 'mockito';

                    // Update connection status based on configuration
                    const isConfigured = message.isConfigured;
                    if (!isConfigured) {
                        updateConnectionStatus('unknown', 'Not configured');
                    }
                    break;

                case 'settingsSaved':
                    if (message.success) {
                        showMessage('success', 'Settings saved!');
                    } else {
                        showMessage('error', message.error || 'Failed to save settings');
                    }
                    break;

                case 'connectionTesting':
                    testConnectionText.textContent = 'Testing...';
                    testConnectionSpinner.classList.remove('hidden');
                    btnTestConnection.disabled = true;
                    break;

                case 'connectionResult':
                    testConnectionText.textContent = 'Test Connection';
                    testConnectionSpinner.classList.add('hidden');
                    btnTestConnection.disabled = false;

                    if (message.success) {
                        updateConnectionStatus('connected', 'Connected (v' + message.version + ')');
                        if (message.features && message.features.length > 0) {
                            showMessage('success', 'Features: ' + message.features.join(', '));
                        }
                    } else {
                        updateConnectionStatus('disconnected', message.error || 'Connection failed');
                        showMessage('error', message.error || 'Connection failed');
                    }
                    break;

                case 'fileSelected':
                    currentFilePath = message.filePath;
                    currentTestClassName = message.fileName.replace('.java', 'Test');
                    selectedFileName.textContent = message.fileName;
                    selectedFilePath.textContent = message.filePath;
                    selectedFilePath.title = message.filePath;

                    fileSelectionOptions.classList.add('hidden');
                    selectedFile.classList.remove('hidden');

                    // Reset scenario state
                    scenariosApproved = false;
                    currentScenarios = '';
                    scenarioSection.classList.add('hidden');
                    scenarioEditor.value = '';
                    scenarioEditor.disabled = false;
                    scenarioStatus.textContent = 'Draft';
                    scenarioStatus.className = 'scenario-status draft';
                    btnApproveScenarios.disabled = false;

                    // Enable Generate Scenarios, disable Generate Test
                    btnGenerateScenarios.disabled = false;
                    btnGenerateSelected.disabled = true;

                    // Auto-fill test class name
                    testClassNameInput.value = currentTestClassName;

                    showMessage('success', 'File selected. Generate scenarios first!');
                    break;

                case 'scenarioGenerating':
                    generateScenariosText.textContent = 'Generating...';
                    scenarioSpinner.classList.remove('hidden');
                    btnGenerateScenarios.disabled = true;
                    btnRegenerateScenarios.disabled = true;
                    break;

                case 'scenarioGenerated':
                    generateScenariosText.textContent = 'Generate Scenarios';
                    scenarioSpinner.classList.add('hidden');
                    btnGenerateScenarios.disabled = false;
                    btnRegenerateScenarios.disabled = false;

                    scenarioSection.classList.remove('hidden');
                    scenarioEditor.value = message.scenarios;
                    scenarioEditor.disabled = false;
                    scenarioStatus.textContent = 'Draft';
                    scenarioStatus.className = 'scenario-status draft';
                    btnApproveScenarios.disabled = false;
                    btnGenerateSelected.disabled = true;
                    scenariosApproved = false;

                    showMessage('success', 'Scenarios generated! Review and approve to continue.');
                    break;

                case 'scenarioError':
                    generateScenariosText.textContent = 'Generate Scenarios';
                    scenarioSpinner.classList.add('hidden');
                    btnGenerateScenarios.disabled = false;
                    btnRegenerateScenarios.disabled = false;
                    // Error is shown as VS Code notification, just reset button state
                    break;

                case 'testRunning':
                    runTestText.textContent = 'Running...';
                    runTestSpinner.classList.remove('hidden');
                    btnRunTest.disabled = true;
                    btnRunAllTests.disabled = true;
                    testResultArea.classList.add('hidden');
                    break;

                case 'testResult':
                    runTestText.textContent = 'Run Test';
                    runTestSpinner.classList.add('hidden');
                    btnRunTest.disabled = false;
                    btnRunAllTests.disabled = false;

                    testResultArea.classList.remove('hidden');
                    const isSuccess = message.success;
                    testResult.className = 'test-result ' + (isSuccess ? 'success' : 'failure');
                    testResult.innerHTML =
                        '<div class="test-result-header ' + (isSuccess ? 'success' : 'failure') + '">' +
                        (isSuccess ? '&#10004; ' : '&#10008; ') +
                        (isSuccess ? 'Tests Passed' : 'Tests Failed') +
                        '</div>' +
                        '<div class="test-result-details">' + escapeHtml(message.details || '') + '</div>';

                    if (isSuccess) {
                        showMessage('success', 'All tests passed!');
                    } else {
                        showMessage('error', 'Some tests failed');
                    }
                    break;

                case 'testError':
                    runTestText.textContent = 'Run Test';
                    runTestSpinner.classList.add('hidden');
                    btnRunTest.disabled = false;
                    btnRunAllTests.disabled = false;
                    showMessage('error', message.error || 'Failed to run tests');
                    break;
            }
        });

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function updateConnectionStatus(status, text) {
            connectionDot.className = 'dot ' + status;
            connectionText.textContent = text;
        }

        function showMessage(type, text) {
            messageArea.className = 'status ' + type;
            messageArea.textContent = text;
            messageArea.classList.remove('hidden');

            setTimeout(() => {
                messageArea.classList.add('hidden');
            }, 5000);
        }
    </script>
</body>
</html>`;
    }
}
