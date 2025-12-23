import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { ApiClient } from '../api/client';
import { SettingsManager } from '../config/settings';
import { getUserFriendlyErrorMessage } from '../api/errors';
import { extractMethods } from '../services/javaParser';

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
                    await this._generateScenarios(message.filePath, message.selectedMethods);
                    break;
                case 'useCurrentFile':
                    await this._useCurrentFile();
                    break;
                case 'extractMethods':
                    await this._extractMethods(message.filePath);
                    break;
            }
        });

        // Send initial settings
        this._sendCurrentSettings();
    }

    private async _sendCurrentSettings(): Promise<void> {
        if (this._view) {
            // Get API key asynchronously from secure storage
            const apiKey = await this._settings.getApiKeyAsync();
            // Only send masked API key to webview for security
            const maskedApiKey = apiKey ? '********' + apiKey.slice(-4) : '';
            const hasApiKey = Boolean(apiKey);

            this._view.webview.postMessage({
                command: 'settingsLoaded',
                apiUrl: this._settings.getApiUrl(),
                apiKey: maskedApiKey,
                hasApiKey: hasApiKey,
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
            const errorMessage = getUserFriendlyErrorMessage(error);
            this._view?.webview.postMessage({
                command: 'settingsSaved',
                success: false,
                error: errorMessage
            });
            vscode.window.showErrorMessage(`Failed to save settings: ${errorMessage}`);
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
            const errorMessage = getUserFriendlyErrorMessage(error);
            this._view?.webview.postMessage({
                command: 'connectionResult',
                success: false,
                error: errorMessage
            });
            vscode.window.showErrorMessage(errorMessage);
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

    private async _extractMethods(filePath: string): Promise<void> {
        try {
            const uri = vscode.Uri.file(filePath);
            const contentBuffer = await vscode.workspace.fs.readFile(uri);
            const content = new TextDecoder().decode(contentBuffer);

            const methods = extractMethods(content);

            this._view?.webview.postMessage({
                command: 'methodsLoaded',
                methods: methods
            });
        } catch (error) {
            this._view?.webview.postMessage({
                command: 'methodsLoaded',
                methods: []
            });
            vscode.window.showErrorMessage('Failed to extract methods from file');
        }
    }

    private async _generateScenarios(filePath: string, selectedMethods?: string[]): Promise<void> {
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
                    includeEdgeCases: this._settings.includeEdgeCases()
                },
                selectedMethods: selectedMethods
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

    /**
     * Validates test class name to prevent command injection
     * Only allows valid Java class name characters
     */
    private _validateTestClassName(name: string): boolean {
        // Java class names: start with letter or underscore, followed by letters, digits, underscores, or $
        // Also allow dots for fully qualified names and * for wildcards
        const validPattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z_$][a-zA-Z0-9_$]*)*\*?$/;
        return validPattern.test(name) && name.length <= 256;
    }

    private async _runTest(testClassName: string): Promise<void> {
        this._view?.webview.postMessage({ command: 'testRunning' });

        try {
            // Validate test class name to prevent command injection
            if (!this._validateTestClassName(testClassName)) {
                throw new Error('Invalid test class name. Only valid Java class names are allowed.');
            }

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('No workspace folder found');
            }

            const buildTool = await this._detectBuildTool(workspaceFolder.uri);
            let command: string;
            let args: string[];

            if (buildTool === 'gradle') {
                if (process.platform === 'win32') {
                    command = 'gradlew.bat';
                } else {
                    command = './gradlew';
                }
                args = ['test', '--tests', testClassName, '--info'];
            } else if (buildTool === 'maven') {
                command = 'mvn';
                args = ['test', `-Dtest=${testClassName}`];
            } else {
                throw new Error('No Maven or Gradle build file found');
            }

            const result = await this._executeCommand(command, args, workspaceFolder.uri.fsPath);

            const success = this._parseTestResult(result, buildTool);

            this._view?.webview.postMessage({
                command: 'testResult',
                success: success,
                details: this._formatTestOutput(result)
            });

            if (success) {
                vscode.window.showInformationMessage('All tests passed!');
            } else {
                vscode.window.showWarningMessage('Some tests failed. Check the results below.');
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this._view?.webview.postMessage({
                command: 'testError',
                error: message
            });
            vscode.window.showErrorMessage(`Test execution failed: ${message}`);
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
            let args: string[];

            if (buildTool === 'gradle') {
                if (process.platform === 'win32') {
                    command = 'gradlew.bat';
                } else {
                    command = './gradlew';
                }
                args = ['test', '--info'];
            } else if (buildTool === 'maven') {
                command = 'mvn';
                args = ['test'];
            } else {
                throw new Error('No Maven or Gradle build file found');
            }

            const result = await this._executeCommand(command, args, workspaceFolder.uri.fsPath);

            const success = this._parseTestResult(result, buildTool);

            this._view?.webview.postMessage({
                command: 'testResult',
                success: success,
                details: this._formatTestOutput(result)
            });

            if (success) {
                vscode.window.showInformationMessage('All tests passed!');
            } else {
                vscode.window.showWarningMessage('Some tests failed. Check the results below.');
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this._view?.webview.postMessage({
                command: 'testError',
                error: message
            });
            vscode.window.showErrorMessage(`Test execution failed: ${message}`);
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

    /**
     * Executes a command safely using spawn (no shell) to prevent command injection
     */
    private _executeCommand(command: string, args: string[], cwd: string): Promise<string> {
        return new Promise((resolve, reject) => {
            // Use spawn with shell: false (default) to prevent command injection
            const child = spawn(command, args, {
                cwd,
                shell: false,  // Explicitly disable shell to prevent injection
                env: { ...process.env },  // Inherit environment but don't expose sensitive vars
                windowsHide: true
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data: Buffer) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data: Buffer) => {
                stderr += data.toString();
            });

            child.on('error', (error: Error) => {
                reject(error);
            });

            child.on('close', (code: number) => {
                const output = stdout + '\n' + stderr;
                // Even with non-zero exit code, we might have useful test output
                if (code !== 0 && !stdout && !stderr) {
                    reject(new Error(`Command exited with code ${code}`));
                } else {
                    resolve(output);
                }
            });

            // Set timeout to prevent hanging processes (5 minutes)
            setTimeout(() => {
                child.kill('SIGTERM');
                reject(new Error('Command timed out after 5 minutes'));
            }, 5 * 60 * 1000);
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

        // Get URI for external CSS file
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'sidebar.css')
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https:;">
    <title>Test-AutoEvermation</title>
    <link rel="stylesheet" href="${styleUri}">
</head>
<body>
    <!-- Connection Status -->
    <div class="connection-status" id="connectionStatus">
        <span class="dot unknown" id="connectionDot"></span>
        <span id="connectionText">Not connected</span>
    </div>

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

    <div class="divider"></div>

    <!-- File Selection -->
    <div class="section">
        <div class="section-title">Select Java File</div>

        <!-- File Selection Options -->
        <div class="file-selection-options" id="fileSelectionOptions">
            <button class="btn btn-primary" id="btnBrowseFile">
                <span class="icon">&#8862;</span>
                Browse Java File
            </button>
            <button class="btn btn-secondary" id="btnUseCurrentFile">
                <span class="icon">&#9634;</span>
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

        <!-- Method Selection (shown after file is selected) -->
        <div id="methodSelectionSection" class="hidden">
            <div class="method-selection-header">
                <span class="section-title">Select Methods</span>
                <div class="method-selection-actions">
                    <span class="link-btn" id="btnSelectAll">All</span>
                    <span class="link-btn" id="btnDeselectAll">None</span>
                </div>
            </div>
            <div class="method-list" id="methodList">
                <div class="method-loading">
                    <span class="spinner"></span> Loading methods...
                </div>
            </div>
        </div>

        <!-- Step 1: Generate Scenarios -->
        <button class="btn btn-primary" id="btnGenerateScenarios" disabled>
            <span class="icon">&#8801;</span>
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

        // Method selection elements
        const methodSelectionSection = document.getElementById('methodSelectionSection');
        const methodList = document.getElementById('methodList');
        const btnSelectAll = document.getElementById('btnSelectAll');
        const btnDeselectAll = document.getElementById('btnDeselectAll');

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
        let availableMethods = [];
        let selectedMethods = [];

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
            availableMethods = [];
            selectedMethods = [];
            selectedFile.classList.add('hidden');
            fileSelectionOptions.classList.remove('hidden');
            methodSelectionSection.classList.add('hidden');
            scenarioSection.classList.add('hidden');
            btnGenerateScenarios.disabled = true;
            btnGenerateSelected.disabled = true;
        });

        // Method selection helpers
        function renderMethods(methods) {
            if (methods.length === 0) {
                methodList.innerHTML = '<div class="method-loading">No methods found</div>';
                return;
            }

            methodList.innerHTML = methods.map((method, index) =>
                '<div class="method-item">' +
                '<input type="checkbox" id="method_' + index + '" checked>' +
                '<label for="method_' + index + '">' + method.name + '()</label>' +
                '</div>'
            ).join('');

            // Add change listeners
            methods.forEach((method, index) => {
                const checkbox = document.getElementById('method_' + index);
                checkbox.addEventListener('change', () => {
                    updateSelectedMethods();
                });
            });

            updateSelectedMethods();
        }

        function updateSelectedMethods() {
            selectedMethods = [];
            availableMethods.forEach((method, index) => {
                const checkbox = document.getElementById('method_' + index);
                if (checkbox && checkbox.checked) {
                    selectedMethods.push(method.name);
                }
            });

            // Enable/disable generate scenarios based on selection
            btnGenerateScenarios.disabled = selectedMethods.length === 0;
        }

        // Select all methods
        btnSelectAll.addEventListener('click', () => {
            availableMethods.forEach((_, index) => {
                const checkbox = document.getElementById('method_' + index);
                if (checkbox) checkbox.checked = true;
            });
            updateSelectedMethods();
        });

        // Deselect all methods
        btnDeselectAll.addEventListener('click', () => {
            availableMethods.forEach((_, index) => {
                const checkbox = document.getElementById('method_' + index);
                if (checkbox) checkbox.checked = false;
            });
            updateSelectedMethods();
        });

        // Generate scenarios for selected file
        btnGenerateScenarios.addEventListener('click', () => {
            if (currentFilePath && selectedMethods.length > 0) {
                vscode.postMessage({
                    command: 'generateScenarios',
                    filePath: currentFilePath,
                    selectedMethods: selectedMethods
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

                    // Reset state
                    scenariosApproved = false;
                    currentScenarios = '';
                    availableMethods = [];
                    selectedMethods = [];
                    scenarioSection.classList.add('hidden');
                    scenarioEditor.value = '';
                    scenarioEditor.disabled = false;
                    scenarioStatus.textContent = 'Draft';
                    scenarioStatus.className = 'scenario-status draft';
                    btnApproveScenarios.disabled = false;

                    // Show method selection and request methods
                    methodSelectionSection.classList.remove('hidden');
                    methodList.innerHTML = '<div class="method-loading"><span class="spinner"></span> Loading methods...</div>';
                    btnGenerateScenarios.disabled = true;
                    btnGenerateSelected.disabled = true;

                    // Request method extraction
                    vscode.postMessage({
                        command: 'extractMethods',
                        filePath: message.filePath
                    });

                    // Auto-fill test class name
                    testClassNameInput.value = currentTestClassName;
                    break;

                case 'methodsLoaded':
                    availableMethods = message.methods || [];
                    renderMethods(availableMethods);
                    if (availableMethods.length > 0) {
                        showMessage('success', availableMethods.length + ' methods found. Select methods and generate scenarios.');
                    } else {
                        showMessage('warning', 'No public methods found in this file.');
                    }
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
                    }
                    break;

                case 'testError':
                    runTestText.textContent = 'Run Test';
                    runTestSpinner.classList.add('hidden');
                    btnRunTest.disabled = false;
                    btnRunAllTests.disabled = false;
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
