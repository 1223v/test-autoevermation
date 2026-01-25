import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { ApiClient } from '../api/client';
import { SettingsManager } from '../config/settings';
import { getUserFriendlyErrorMessage } from '../api/errors';
import { JavaAstAnalyzer, FullAnalysisResult, MethodAnalysis } from '../services/javaAstAnalyzer';
import { JacocoRunner } from '../services/jacocoRunner';
import { PathResolver } from '../services/pathResolver';
import { JacocoCoverageResult } from '../api/types';

/**
 * Provides the sidebar webview panel
 */
export class SidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'javaTestGenerator.sidebar';

    private _view?: vscode.WebviewView;
    private _apiClient: ApiClient;
    private _settings: SettingsManager;
    private _extensionUri: vscode.Uri;
    private _javaAstAnalyzer: JavaAstAnalyzer;
    private _lastAnalysis: FullAnalysisResult | null = null;
    private _lastAnalyzedFilePath: string | null = null;

    constructor(
        extensionUri: vscode.Uri,
        apiClient: ApiClient,
        settings: SettingsManager
    ) {
        this._extensionUri = extensionUri;
        this._apiClient = apiClient;
        this._settings = settings;
        this._javaAstAnalyzer = new JavaAstAnalyzer();
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
                    await this._generateTestForFile(
                        message.filePath, 
                        message.scenarios, 
                        message.selectedMethods,
                        message.autoRunTest || false
                    );
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
                case 'checkAstCache':
                    await this._checkAstCache(message.filePath);
                    break;
                case 'analyzeAst':
                    await this._analyzeAst(message.filePath);
                    break;
                case 'reanalyzeAst':
                    await this._reanalyzeAst(message.filePath);
                    break;
                case 'useCachedAst':
                    await this._useCachedAst(message.filePath);
                    break;
                case 'checkTestability':
                    await this._checkTestability(message.filePath, message.selectedMethods);
                    break;
                case 'runTestWithCoverage':
                    await this._runTestWithCoverage(
                        message.testClassName,
                        message.sourceFilePath,
                        message.testFilePath,
                        message.selectedMethods,
                        message.autoImprove || false,
                        0,
                        message.coverageTarget
                    );
                    break;
                case 'checkJacocoConfig':
                    await this._checkJacocoConfig();
                    break;
                case 'openCoverageReport':
                    await this._openCoverageReport();
                    break;
                case 'improveCoverage':
                    await this._improveCoverage(
                        message.sourceFilePath,
                        message.testFilePath,
                        message.selectedMethods,
                        message.currentCoverage,
                        message.targetCoverage
                    );
                    break;
                case 'regenerateTestWithError':
                    await this._regenerateTestWithError(
                        message.filePath,
                        message.testFilePath,
                        message.errorMessage,
                        message.testOutput,
                        message.scenarios,
                        message.selectedMethods,
                        message.retryCount
                    );
                    break;
                case 'applyImprovement':
                    await this._applyImprovement(message.testFilePath, message.testCode);
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
            // Server is considered connected if status is 'healthy' or 'degraded'
            const isConnected = health.status === 'healthy' || health.status === 'degraded';

            this._view?.webview.postMessage({
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

    private async _generateTestForFile(
        filePath: string, 
        scenarios?: string, 
        selectedMethods?: string[],
        autoRunTest: boolean = false
    ): Promise<void> {
        if (!filePath) {
            vscode.window.showWarningMessage('No file selected');
            return;
        }

        try {
            const uri = vscode.Uri.file(filePath);
            
            // Generate test using command
            await vscode.commands.executeCommand('javaTestGenerator.generateTest', uri, scenarios);
            
            // If autoRunTest is true, wait a bit for file to be saved, then auto-run test
            if (autoRunTest) {
                // Wait 1 second for file to be fully saved
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Extract test class name
                const fileName = filePath.split(/[/\\]/).pop() || '';
                const className = fileName.replace('.java', '');
                const testClassName = `${className}Test`;
                
                // Notify UI that we're starting auto-test
                this._view?.webview.postMessage({
                    command: 'autoTestStarting',
                    testClassName
                });
                
                // Get the generated test file path
                const pathResolver = new PathResolver();
                const sourceUri = vscode.Uri.file(filePath);
                const testUri = pathResolver.resolveTestPath(sourceUri);
                
                // Auto-run test with self-healing
                await this._runTestAndHandleErrors(
                    testUri.fsPath,
                    filePath,
                    scenarios || '',
                    selectedMethods || [],
                    0
                );
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Test generation failed: ${message}`);
        }
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

            // Use JavaAstAnalyzer to extract methods
            const analysis = this._javaAstAnalyzer.analyze(content);
            this._lastAnalysis = analysis;
            this._lastAnalyzedFilePath = filePath;

            // Convert to the format expected by the webview
            const methods = analysis.methods.map(m => {
                // Infer modifiers from analysis arrays
                const modifiers: string[] = [];
                if (analysis.publicMethods.includes(m.methodName)) modifiers.push('public');
                if (analysis.privateMethods.includes(m.methodName)) modifiers.push('private');
                if (analysis.protectedMethods.includes(m.methodName)) modifiers.push('protected');

                return {
                    name: m.methodName,
                    signature: m.methodSignature,
                    returnType: m.returnType,
                    parameters: m.parameters.map(p => `${p.type} ${p.name}`).join(', '),
                    modifiers: modifiers,
                    complexity: analysis.complexity.methodComplexities[m.methodName] || 1
                };
            });

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

    /**
     * Checks if AST analysis exists for the given file
     * Note: No caching - always fresh analysis
     */
    private async _checkAstCache(filePath: string): Promise<void> {
        // No caching - always indicate that analysis is needed
        // But if we have a recent analysis for this file, use it
        const hasRecentAnalysis = this._lastAnalyzedFilePath === filePath && this._lastAnalysis !== null;

        this._view?.webview.postMessage({
            command: 'astCacheChecked',
            hasCachedAst: hasRecentAnalysis,
            astData: hasRecentAnalysis ? {
                filePath: filePath,
                fileHash: '',
                analyzedAt: new Date().toISOString(),
                ast: this._lastAnalysis
            } : null,
            isFileModified: false
        });
    }

    /**
     * Analyzes AST using java-ast (always fresh, no caching)
     */
    private async _analyzeAst(filePath: string): Promise<void> {
        this._view?.webview.postMessage({ command: 'astAnalyzing' });

        try {
            const uri = vscode.Uri.file(filePath);
            const contentBuffer = await vscode.workspace.fs.readFile(uri);
            const content = new TextDecoder().decode(contentBuffer);

            // Analyze using local java-ast (no server required)
            const analysis = this._javaAstAnalyzer.analyze(content);
            this._lastAnalysis = analysis;
            this._lastAnalyzedFilePath = filePath;

            // Format response for backward compatibility with webview
            const astEntry = {
                filePath: filePath,
                fileHash: '',
                analyzedAt: new Date().toISOString(),
                ast: analysis
            };

            this._view?.webview.postMessage({
                command: 'astAnalyzed',
                astData: astEntry
            });

            vscode.window.showInformationMessage(
                `AST analysis completed: ${analysis.methodCount} methods found`
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this._view?.webview.postMessage({
                command: 'astAnalyzeError',
                error: message
            });
            vscode.window.showErrorMessage(`AST analysis failed: ${message}`);
        }
    }

    /**
     * Re-analyzes AST (same as _analyzeAst since there's no caching)
     */
    private async _reanalyzeAst(filePath: string): Promise<void> {
        // With no caching, reanalyze is the same as analyze
        await this._analyzeAst(filePath);
    }

    /**
     * Uses last analyzed AST data (confirms selection)
     */
    private async _useCachedAst(filePath: string): Promise<void> {
        if (this._lastAnalysis && this._lastAnalyzedFilePath === filePath) {
            const astEntry = {
                filePath: filePath,
                fileHash: '',
                analyzedAt: new Date().toISOString(),
                ast: this._lastAnalysis
            };

            this._view?.webview.postMessage({
                command: 'astSelected',
                astData: astEntry
            });
        } else {
            // Analyze on demand if no recent analysis
            await this._analyzeAst(filePath);
        }
    }

    /**
     * Gets the currently analyzed AST data for API requests
     */
    public async getSelectedAstData(filePath: string): Promise<{ filePath: string; ast: FullAnalysisResult } | null> {
        if (this._lastAnalysis && this._lastAnalyzedFilePath === filePath) {
            return {
                filePath: filePath,
                ast: this._lastAnalysis
            };
        }

        // Analyze on demand if needed
        try {
            const uri = vscode.Uri.file(filePath);
            const contentBuffer = await vscode.workspace.fs.readFile(uri);
            const content = new TextDecoder().decode(contentBuffer);

            const analysis = this._javaAstAnalyzer.analyze(content);
            this._lastAnalysis = analysis;
            this._lastAnalyzedFilePath = filePath;

            return {
                filePath: filePath,
                ast: analysis
            };
        } catch {
            return null;
        }
    }

    /**
     * Checks if the selected methods are testable
     */
    private async _checkTestability(filePath: string, selectedMethods: string[]): Promise<void> {
        if (!filePath || !selectedMethods || selectedMethods.length === 0) {
            this._view?.webview.postMessage({
                command: 'testabilityError',
                error: 'No file or methods selected'
            });
            return;
        }

        this._view?.webview.postMessage({ command: 'testabilityChecking' });

        try {
            const uri = vscode.Uri.file(filePath);
            const contentBuffer = await vscode.workspace.fs.readFile(uri);
            const content = new TextDecoder().decode(contentBuffer);
            const fileName = filePath.split(/[/\\]/).pop() || '';

            // Get or analyze AST data using java-ast
            let astData = this._lastAnalysis;
            if (!astData || this._lastAnalyzedFilePath !== filePath) {
                astData = this._javaAstAnalyzer.analyze(content);
                this._lastAnalysis = astData;
                this._lastAnalyzedFilePath = filePath;
            }

            const response = await this._apiClient.checkTestability({
                sourceFile: {
                    fileName,
                    packageName: astData.packageName,
                    content
                },
                cachedAst: {
                    className: astData.className,
                    packageName: astData.packageName,
                    methodCount: astData.methodCount,
                    publicMethods: astData.publicMethods,
                    privateMethods: astData.privateMethods,
                    protectedMethods: astData.protectedMethods,
                    dependencies: astData.dependencies,
                    imports: astData.imports,
                    annotations: astData.annotations,
                    injectedBeans: astData.injectedBeans,
                    complexity: astData.complexity
                },
                selectedMethods
            });

            this._view?.webview.postMessage({
                command: 'testabilityResult',
                testable: response.testable,
                reasons: response.reasons,
                refactoringAdvice: response.refactoringAdvice
            });

            if (response.testable) {
                vscode.window.showInformationMessage('Code is testable! You can proceed to generate scenarios.');
            } else {
                vscode.window.showWarningMessage('Code has testability issues. Please review the suggestions.');
            }
        } catch (error) {
            const message = getUserFriendlyErrorMessage(error);
            this._view?.webview.postMessage({
                command: 'testabilityError',
                error: message
            });
            vscode.window.showErrorMessage(`Testability check failed: ${message}`);
        }
    }

    /**
     * Runs tests with Jacoco coverage analysis
     * If autoImprove is true, automatically improves coverage until target is met
     */
    private async _runTestWithCoverage(
        testClassName: string, 
        sourceFilePath?: string,
        testFilePath?: string,
        selectedMethods?: string[],
        autoImprove: boolean = false,
        improvementIteration: number = 0,
        userCoverageTarget?: number
    ): Promise<void> {
        const maxImprovements = 5; // Maximum improvement iterations
        
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            this._view?.webview.postMessage({
                command: 'coverageError',
                error: 'No workspace folder found'
            });
            return;
        }

        // Validate test class name
        if (!this._validateTestClassName(testClassName)) {
            this._view?.webview.postMessage({
                command: 'coverageError',
                error: 'Invalid test class name'
            });
            return;
        }

        const iterationMsg = improvementIteration > 0 
            ? ` (Improvement ${improvementIteration}/${maxImprovements})`
            : '';
        
        this._view?.webview.postMessage({ 
            command: 'coverageRunning',
            iteration: improvementIteration
        });

        try {
            const jacocoRunner = new JacocoRunner(workspaceFolder);

            // No need to check if Jacoco is configured!
            // The extension will automatically inject Jacoco via command line if needed
            console.log('[SidebarProvider] Running tests with coverage (auto-injection enabled)');

            const result = await jacocoRunner.runTestsWithCoverage(testClassName);

            if (result.success && result.coverage) {
                // Use user-defined coverage target or fallback to settings
                const targetCoverage = userCoverageTarget ?? this._settings.getCoverageTarget();
                const meetsTarget = result.coverage.overallCoverage >= targetCoverage;

                this._view?.webview.postMessage({
                    command: 'coverageResult',
                    coverage: result.coverage,
                    meetsTarget,
                    targetCoverage,
                    reportPath: result.reportPath,
                    iteration: improvementIteration
                });

                if (meetsTarget) {
                    vscode.window.showInformationMessage(
                        `Coverage: ${result.coverage.overallCoverage.toFixed(1)}% (Target: ${targetCoverage}%) - Target met!${iterationMsg}`
                    );
                } else {
                    vscode.window.showWarningMessage(
                        `Coverage: ${result.coverage.overallCoverage.toFixed(1)}% (Target: ${targetCoverage}%) - Below target${iterationMsg}`
                    );
                    
                    // Auto-improve if enabled and not exceeded max iterations
                    if (autoImprove && improvementIteration < maxImprovements && sourceFilePath && testFilePath) {
                        vscode.window.showInformationMessage(
                            `Auto-improving coverage... (Attempt ${improvementIteration + 1}/${maxImprovements})`
                        );
                        
                        // Call improve coverage
                        await this._improveCoverageAndRerun(
                            sourceFilePath,
                            testFilePath,
                            selectedMethods || [],
                            result.coverage,
                            targetCoverage,
                            testClassName,
                            improvementIteration + 1
                        );
                    }
                }
            } else {
                this._view?.webview.postMessage({
                    command: 'coverageError',
                    error: result.error || 'Coverage analysis failed'
                });
                vscode.window.showErrorMessage(`Coverage analysis failed: ${result.error}`);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this._view?.webview.postMessage({
                command: 'coverageError',
                error: message
            });
            vscode.window.showErrorMessage(`Coverage analysis failed: ${message}`);
        }
    }

    /**
     * Improves coverage and reruns coverage analysis
     */
    private async _improveCoverageAndRerun(
        sourceFilePath: string,
        testFilePath: string,
        selectedMethods: string[],
        currentCoverage: JacocoCoverageResult,
        targetCoverage: number,
        testClassName: string,
        iteration: number
    ): Promise<void> {
        this._view?.webview.postMessage({ 
            command: 'improvingCoverage',
            iteration
        });

        try {
            // Call improve coverage API
            await this._improveCoverage(
                sourceFilePath,
                testFilePath,
                selectedMethods,
                currentCoverage,
                targetCoverage
            );

            // Wait for user to apply changes or auto-apply
            // For now, we'll assume auto-apply
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Re-run coverage
            await this._runTestWithCoverage(
                testClassName,
                sourceFilePath,
                testFilePath,
                selectedMethods,
                true, // Continue auto-improving
                iteration
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Coverage improvement failed: ${message}`);
        }
    }

    /**
     * Checks if Jacoco is configured in the project
     */
    private async _checkJacocoConfig(): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            this._view?.webview.postMessage({
                command: 'jacocoConfigResult',
                configured: false,
                error: 'No workspace folder found'
            });
            return;
        }

        try {
            const jacocoRunner = new JacocoRunner(workspaceFolder);
            const isConfigured = await jacocoRunner.isJacocoConfigured();
            const buildTool = await jacocoRunner.detectBuildTool();

            this._view?.webview.postMessage({
                command: 'jacocoConfigResult',
                configured: isConfigured,
                buildTool
            });
        } catch (error) {
            this._view?.webview.postMessage({
                command: 'jacocoConfigResult',
                configured: false,
                error: 'Failed to check Jacoco configuration'
            });
        }
    }

    /**
     * Opens the HTML coverage report
     */
    private async _openCoverageReport(): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }

        try {
            const jacocoRunner = new JacocoRunner(workspaceFolder);
            const opened = await jacocoRunner.openHtmlReport();

            if (!opened) {
                vscode.window.showWarningMessage('Coverage report not found. Run tests with coverage first.');
            }
        } catch (error) {
            vscode.window.showErrorMessage('Failed to open coverage report');
        }
    }

    /**
     * Improves test coverage by generating additional test cases
     */
    private async _improveCoverage(
        sourceFilePath: string,
        testFilePath: string | null,
        selectedMethods: string[],
        currentCoverage: JacocoCoverageResult,
        targetCoverage: number
    ): Promise<void> {
        if (!sourceFilePath) {
            this._view?.webview.postMessage({
                command: 'improveCoverageError',
                error: 'Source file path is required'
            });
            return;
        }

        this._view?.webview.postMessage({ command: 'improveCoverageStarted' });

        try {
            // Read source file
            const sourceUri = vscode.Uri.file(sourceFilePath);
            const sourceContentBuffer = await vscode.workspace.fs.readFile(sourceUri);
            const sourceContent = new TextDecoder().decode(sourceContentBuffer);

            // Derive test file path if not provided
            let resolvedTestFilePath = testFilePath;
            if (!resolvedTestFilePath) {
                const pathResolver = new PathResolver();
                const testUri = pathResolver.resolveTestPath(sourceUri);
                resolvedTestFilePath = testUri.fsPath;
            }

            // Read existing test file
            const testUri = vscode.Uri.file(resolvedTestFilePath);
            const testContentBuffer = await vscode.workspace.fs.readFile(testUri);
            const testContent = new TextDecoder().decode(testContentBuffer);

            // Extract file names and package names
            const sourceFileName = sourceFilePath.split(/[/\\]/).pop() || '';
            const testFileName = resolvedTestFilePath.split(/[/\\]/).pop() || '';
            
            // Get or analyze AST data using java-ast
            let astData = this._lastAnalysis;
            if (!astData || this._lastAnalyzedFilePath !== sourceFilePath) {
                astData = this._javaAstAnalyzer.analyze(sourceContent);
                this._lastAnalysis = astData;
                this._lastAnalyzedFilePath = sourceFilePath;
            }

            const testPackageMatch = testContent.match(/^\s*package\s+([\w.]+)\s*;/m);
            const testPackageName = testPackageMatch ? testPackageMatch[1] : '';

            // Call API to improve coverage
            const response = await this._apiClient.improveCoverage({
                sourceFile: {
                    fileName: sourceFileName,
                    packageName: astData.packageName,
                    content: sourceContent
                },
                testFile: {
                    fileName: testFileName,
                    packageName: testPackageName,
                    content: testContent
                },
                selectedMethods,
                cachedAst: astData,
                currentCoverage,
                targetCoverage
            });

            if (response.success) {
                this._view?.webview.postMessage({
                    command: 'improveCoverageResult',
                    improvedTestCode: response.improvedTestCode,
                    additions: response.additions,
                    expectedCoverageIncrease: response.expectedCoverageIncrease,
                    testFilePath: resolvedTestFilePath
                });

                vscode.window.showInformationMessage(
                    `Coverage improvement suggestions generated. Expected increase: +${response.expectedCoverageIncrease?.toFixed(1) || '?'}%`
                );
            } else {
                this._view?.webview.postMessage({
                    command: 'improveCoverageError',
                    error: 'Failed to generate coverage improvements'
                });
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this._view?.webview.postMessage({
                command: 'improveCoverageError',
                error: message
            });
            vscode.window.showErrorMessage(`Coverage improvement failed: ${message}`);
        }
    }

    /**
     * Applies improved test code to the test file
     */
    private async _applyImprovement(testFilePath: string, testCode: string): Promise<void> {
        if (!testFilePath || !testCode) {
            this._view?.webview.postMessage({
                command: 'applyImprovementError',
                error: 'No improvement to apply'
            });
            return;
        }

        try {
            const testUri = vscode.Uri.file(testFilePath);
            const encoder = new TextEncoder();
            await vscode.workspace.fs.writeFile(testUri, encoder.encode(testCode));

            // Open the file in editor
            const document = await vscode.workspace.openTextDocument(testUri);
            await vscode.window.showTextDocument(document);

            this._view?.webview.postMessage({
                command: 'applyImprovementSuccess',
                testFilePath
            });

            vscode.window.showInformationMessage('Improved test code applied. Re-run coverage to verify.');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this._view?.webview.postMessage({
                command: 'applyImprovementError',
                error: message
            });
            vscode.window.showErrorMessage(`Failed to apply improvement: ${message}`);
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

            // Get or analyze AST data using java-ast
            let astData = this._lastAnalysis;
            if (!astData || this._lastAnalyzedFilePath !== filePath) {
                astData = this._javaAstAnalyzer.analyze(content);
                this._lastAnalysis = astData;
                this._lastAnalyzedFilePath = filePath;
            }

            // Call API to generate scenarios
            const response = await this._apiClient.generateScenarios({
                sourceFile: {
                    fileName,
                    packageName: astData.packageName,
                    content
                },
                options: {
                    testFramework: this._settings.getTestFramework(),
                    mockingFramework: this._settings.getMockingFramework(),
                    coverageTarget: this._settings.getCoverageTarget(),
                    includeEdgeCases: this._settings.includeEdgeCases()
                },
                selectedMethods: selectedMethods,
                cachedAst: {
                    className: astData.className,
                    packageName: astData.packageName,
                    methodCount: astData.methodCount,
                    publicMethods: astData.publicMethods,
                    privateMethods: astData.privateMethods,
                    protectedMethods: astData.protectedMethods,
                    dependencies: astData.dependencies,
                    imports: astData.imports,
                    annotations: astData.annotations,
                    injectedBeans: astData.injectedBeans,
                    complexity: astData.complexity
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

    /**
     * Regenerates test code after test execution failure with error context
     */
    private async _regenerateTestWithError(
        sourceFilePath: string,
        testFilePath: string,
        errorMessage: string,
        testOutput: string,
        scenarios: string,
        selectedMethods: string[],
        retryCount: number
    ): Promise<void> {
        const maxRetries = 3;
        
        if (retryCount >= maxRetries) {
            this._view?.webview.postMessage({
                command: 'testRegenerationFailed',
                error: `Max retries (${maxRetries}) reached. Please review the test manually.`,
                testOutput
            });
            vscode.window.showErrorMessage(`Test generation failed after ${maxRetries} attempts. Please review manually.`);
            return;
        }

        this._view?.webview.postMessage({ 
            command: 'testRegenerating',
            retryCount: retryCount + 1,
            maxRetries
        });

        try {
            const uri = vscode.Uri.file(sourceFilePath);
            const contentBuffer = await vscode.workspace.fs.readFile(uri);
            const content = new TextDecoder().decode(contentBuffer);
            const fileName = sourceFilePath.split(/[/\\]/).pop() || '';

            // Extract package name
            const packageMatch = content.match(/^\s*package\s+([\w.]+)\s*;/m);
            const packageName = packageMatch ? packageMatch[1] : '';

            // Regenerate test with error context (included in scenarios as feedback)
            const errorFeedback = `\n\n# Previous Test Execution Error (Attempt ${retryCount + 1}):\n${errorMessage}\n\nTest Output:\n${testOutput}\n\nPlease fix the test code to resolve this error.`;
            
            const response = await this._apiClient.generateTest({
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
                scenarios: scenarios + errorFeedback,
                selectedMethods: selectedMethods
            });

            if (response.success) {
                // Apply the new test code
                const pathResolver = new PathResolver();
                const sourceUri = vscode.Uri.file(sourceFilePath);
                const testUri = testFilePath 
                    ? vscode.Uri.file(testFilePath)
                    : pathResolver.resolveTestPath(sourceUri, response.testFile.suggestedPath);

                const encoder = new TextEncoder();
                await vscode.workspace.fs.writeFile(testUri, encoder.encode(response.testFile.content));

                this._view?.webview.postMessage({
                    command: 'testRegenerated',
                    testFilePath: testUri.fsPath,
                    retryCount: retryCount + 1
                });

                // Auto-run the test again
                await this._runTestAndHandleErrors(
                    testUri.fsPath,
                    sourceFilePath,
                    scenarios,
                    selectedMethods,
                    retryCount + 1
                );
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this._view?.webview.postMessage({
                command: 'testRegenerationError',
                error: message
            });
            vscode.window.showErrorMessage(`Test regeneration failed: ${message}`);
        }
    }

    /**
     * Runs test and handles errors with auto-regeneration
     */
    private async _runTestAndHandleErrors(
        testFilePath: string,
        sourceFilePath: string,
        scenarios: string,
        selectedMethods: string[],
        retryCount: number = 0
    ): Promise<void> {
        this._view?.webview.postMessage({ command: 'testRunning' });

        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('No workspace folder found');
            }

            // Extract test class name from file path
            const testClassName = testFilePath.split(/[/\\]/).pop()?.replace('.java', '') || '';
            
            if (!this._validateTestClassName(testClassName)) {
                throw new Error('Invalid test class name');
            }

            const buildTool = await this._detectBuildTool(workspaceFolder.uri);
            let command: string;
            let args: string[];

            if (buildTool === 'gradle') {
                command = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
                args = ['test', '--tests', testClassName, '--info'];
            } else if (buildTool === 'maven') {
                command = 'mvn';
                args = ['test', `-Dtest=${testClassName}`];
            } else {
                throw new Error('No Maven or Gradle build file found');
            }

            const result = await this._executeCommand(command, args, workspaceFolder.uri.fsPath);
            const success = this._parseTestResult(result, buildTool);

            if (success) {
                this._view?.webview.postMessage({
                    command: 'testSuccess',
                    details: this._formatTestOutput(result)
                });
                vscode.window.showInformationMessage('All tests passed! Proceeding to coverage analysis...');
                
                // Auto-proceed to coverage analysis
                await this._runTestWithCoverage(testClassName);
            } else {
                // Test failed - extract error and regenerate
                const errorMessage = this._extractTestError(result);
                
                this._view?.webview.postMessage({
                    command: 'testFailed',
                    error: errorMessage,
                    details: this._formatTestOutput(result),
                    retryCount
                });

                vscode.window.showWarningMessage(
                    `Tests failed (Attempt ${retryCount + 1}). Auto-regenerating...`
                );

                // Auto-regenerate with error context
                await this._regenerateTestWithError(
                    sourceFilePath,
                    testFilePath,
                    errorMessage,
                    result,
                    scenarios,
                    selectedMethods,
                    retryCount
                );
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

    /**
     * Extracts meaningful error message from test output
     */
    private _extractTestError(output: string): string {
        const lines = output.split('\n');
        const errorLines: string[] = [];
        let inError = false;

        for (const line of lines) {
            const lowerLine = line.toLowerCase();
            
            // Start capturing at error indicators
            if (lowerLine.includes('failed') || 
                lowerLine.includes('error') || 
                lowerLine.includes('exception') ||
                lowerLine.includes('assertion')) {
                inError = true;
            }

            if (inError) {
                errorLines.push(line);
                // Stop after reasonable context
                if (errorLines.length > 20) {
                    break;
                }
            }
        }

        return errorLines.length > 0 
            ? errorLines.join('\n') 
            : 'Test failed with unknown error. Check full output.';
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

        <!-- AST Analysis Section (shown after file is selected) -->
        <div id="astSection" class="hidden">
            <div class="section-title">AST Analysis</div>

            <!-- AST Status -->
            <div class="ast-status" id="astStatus">
                <span class="ast-status-icon" id="astStatusIcon">&#9888;</span>
                <span class="ast-status-text" id="astStatusText">No cached analysis</span>
            </div>

            <!-- Cached AST Info Box -->
            <div class="ast-info-box hidden" id="astInfoBox">
                <div class="ast-info-row">
                    <span class="ast-info-label">Methods:</span>
                    <span class="ast-info-value" id="astMethodCount">-</span>
                </div>
                <div class="ast-info-row">
                    <span class="ast-info-label">Dependencies:</span>
                    <span class="ast-info-value" id="astDependencies">-</span>
                </div>
                <div class="ast-info-row">
                    <span class="ast-info-label">Annotations:</span>
                    <span class="ast-info-value" id="astAnnotations">-</span>
                </div>
                <div class="ast-info-row">
                    <span class="ast-info-label">Complexity:</span>
                    <span class="ast-info-value" id="astComplexity">-</span>
                </div>
                <div class="ast-info-row">
                    <span class="ast-info-label">Analyzed:</span>
                    <span class="ast-info-value" id="astAnalyzedAt">-</span>
                </div>
            </div>

            <!-- AST Analyze Button -->
            <button class="btn btn-primary" id="btnAnalyzeAst">
                <span class="icon">&#128269;</span>
                <span id="analyzeAstText">Analyze AST</span>
                <span class="spinner hidden" id="analyzeAstSpinner"></span>
            </button>

            <!-- AST Selected Indicator -->
            <div class="ast-selected hidden" id="astSelectedIndicator">
                <span class="ast-selected-icon">&#9989;</span>
                <span class="ast-selected-text">AST analysis ready</span>
                <button class="ast-selected-change" id="btnViewDetails">View Details</button>
                <button class="ast-selected-change" id="btnChangeAst">Re-analyze</button>
            </div>

            <!-- AST Details Panel (collapsible) -->
            <div class="ast-details-panel hidden" id="astDetailsPanel">
                <div class="ast-details-header">
                    <span class="ast-details-title">Analysis Details</span>
                    <button class="ast-details-close" id="btnCloseDetails">&times;</button>
                </div>
                <div class="ast-details-content">
                    <!-- Class Info Section -->
                    <div class="ast-detail-section">
                        <div class="ast-detail-section-header" data-section="classInfo">
                            <span class="ast-detail-toggle">&#9654;</span>
                            <span class="ast-detail-section-title">Class Information</span>
                        </div>
                        <div class="ast-detail-section-content" id="classInfoContent">
                            <div class="ast-detail-item">
                                <span class="ast-detail-label">Class Name:</span>
                                <span class="ast-detail-value" id="detailClassName">-</span>
                            </div>
                            <div class="ast-detail-item">
                                <span class="ast-detail-label">Package:</span>
                                <span class="ast-detail-value" id="detailPackageName">-</span>
                            </div>
                            <div class="ast-detail-item">
                                <span class="ast-detail-label">Annotations:</span>
                                <div class="ast-detail-tags" id="detailClassAnnotations"></div>
                            </div>
                        </div>
                    </div>

                    <!-- Methods Section -->
                    <div class="ast-detail-section">
                        <div class="ast-detail-section-header" data-section="methods">
                            <span class="ast-detail-toggle">&#9654;</span>
                            <span class="ast-detail-section-title">Methods (<span id="detailMethodCount">0</span>)</span>
                        </div>
                        <div class="ast-detail-section-content hidden" id="methodsContent">
                            <div class="ast-method-list" id="detailMethodList"></div>
                        </div>
                    </div>

                    <!-- Fields Section -->
                    <div class="ast-detail-section">
                        <div class="ast-detail-section-header" data-section="fields">
                            <span class="ast-detail-toggle">&#9654;</span>
                            <span class="ast-detail-section-title">Fields (<span id="detailFieldCount">0</span>)</span>
                        </div>
                        <div class="ast-detail-section-content hidden" id="fieldsContent">
                            <div class="ast-field-list" id="detailFieldList"></div>
                        </div>
                    </div>

                    <!-- Injected Dependencies Section -->
                    <div class="ast-detail-section">
                        <div class="ast-detail-section-header" data-section="injected">
                            <span class="ast-detail-toggle">&#9654;</span>
                            <span class="ast-detail-section-title">Injected Dependencies (<span id="detailInjectedCount">0</span>)</span>
                        </div>
                        <div class="ast-detail-section-content hidden" id="injectedContent">
                            <div class="ast-injected-list" id="detailInjectedList"></div>
                        </div>
                    </div>

                    <!-- Imports Section -->
                    <div class="ast-detail-section">
                        <div class="ast-detail-section-header" data-section="imports">
                            <span class="ast-detail-toggle">&#9654;</span>
                            <span class="ast-detail-section-title">Imports (<span id="detailImportCount">0</span>)</span>
                        </div>
                        <div class="ast-detail-section-content hidden" id="importsContent">
                            <div class="ast-import-list" id="detailImportList"></div>
                        </div>
                    </div>

                    <!-- Complexity Section -->
                    <div class="ast-detail-section">
                        <div class="ast-detail-section-header" data-section="complexity">
                            <span class="ast-detail-toggle">&#9654;</span>
                            <span class="ast-detail-section-title">Complexity Analysis</span>
                        </div>
                        <div class="ast-detail-section-content hidden" id="complexityContent">
                            <div class="ast-detail-item">
                                <span class="ast-detail-label">Total Cyclomatic:</span>
                                <span class="ast-detail-value" id="detailTotalComplexity">-</span>
                            </div>
                            <div class="ast-detail-item">
                                <span class="ast-detail-label">Lines of Code:</span>
                                <span class="ast-detail-value" id="detailLinesOfCode">-</span>
                            </div>
                            <div class="ast-complexity-list" id="detailComplexityList"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Method Selection (shown after AST is ready) -->
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

        <!-- Step 1: Check Testability -->
        <button class="btn btn-secondary" id="btnCheckTestability" disabled>
            <span class="icon">&#9989;</span>
            <span id="checkTestabilityText">Check Testability</span>
            <span class="spinner hidden" id="testabilitySpinner"></span>
        </button>

        <!-- Testability Result Section -->
        <div id="testabilitySection" class="hidden">
            <div class="testability-result" id="testabilityResult">
                <div class="testability-header" id="testabilityHeader">
                    <span class="testability-icon" id="testabilityIcon">&#10004;</span>
                    <span class="testability-text" id="testabilityText">Testable</span>
                </div>
                <!-- Refactoring Advice (shown if not testable) -->
                <div class="refactoring-section hidden" id="refactoringSection">
                    <div class="refactoring-header">Refactoring Suggestions</div>
                    <div class="refactoring-list" id="refactoringList"></div>
                </div>
            </div>
        </div>

        <!-- Step 2: Generate Scenarios -->
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

    <div class="divider"></div>

    <!-- Coverage Analysis Section -->
    <div class="section">
        <div class="section-title">Coverage Analysis</div>

        <!-- Coverage Target Setting -->
        <div class="coverage-target-container">
            <label for="coverageTarget" class="coverage-label">
                <span class="label-icon">🎯</span>
                <span>Target Coverage</span>
            </label>
            <div class="coverage-input-wrapper">
                <input 
                    type="number" 
                    id="coverageTarget" 
                    class="coverage-input"
                    min="0" 
                    max="100" 
                    value="80" 
                    step="5"
                    placeholder="80"
                >
                <span class="coverage-unit">%</span>
            </div>
            <div class="coverage-hint">
                <span class="hint-icon">💡</span>
                <span>커버리지 목표를 설정하세요 (0-100%)</span>
            </div>
        </div>

        <button class="btn btn-primary" id="btnRunWithCoverage">
            <span class="icon">&#128202;</span>
            <span id="runWithCoverageText">Run with Coverage</span>
            <span class="spinner hidden" id="coverageSpinner"></span>
        </button>

        <button class="btn btn-secondary" id="btnOpenCoverageReport">
            <span class="icon">&#128196;</span>
            Open Report
        </button>

        <!-- Coverage Result -->
        <div id="coverageResultSection" class="hidden">
            <div class="coverage-result" id="coverageResult">
                <div class="coverage-header" id="coverageHeader">
                    <span class="coverage-percentage" id="coveragePercentage">0%</span>
                    <span class="coverage-status" id="coverageStatus">Below Target</span>
                </div>
                <div class="coverage-bars">
                    <div class="coverage-bar-item">
                        <span class="coverage-bar-label">Line</span>
                        <div class="coverage-bar">
                            <div class="coverage-bar-fill" id="lineCoverageBar"></div>
                        </div>
                        <span class="coverage-bar-value" id="lineCoverageValue">0%</span>
                    </div>
                    <div class="coverage-bar-item">
                        <span class="coverage-bar-label">Branch</span>
                        <div class="coverage-bar">
                            <div class="coverage-bar-fill" id="branchCoverageBar"></div>
                        </div>
                        <span class="coverage-bar-value" id="branchCoverageValue">0%</span>
                    </div>
                </div>
                <!-- Method Coverage Details -->
                <div class="method-coverage-section hidden" id="methodCoverageSection">
                    <div class="method-coverage-header">Method Coverage</div>
                    <div class="method-coverage-list" id="methodCoverageList"></div>
                </div>
            </div>

            <!-- Improve Coverage Button (shown when below target) -->
            <button class="btn btn-warning hidden" id="btnImproveCoverage">
                <span class="icon">&#8679;</span>
                Improve Coverage
            </button>

            <!-- Coverage Improvement Result -->
            <div class="improvement-result hidden" id="improvementResultSection">
                <div class="improvement-header">
                    <span class="improvement-title">Coverage Improvement Suggested</span>
                    <span class="improvement-increase" id="improvementIncrease">+0%</span>
                </div>
                <div class="improvement-additions" id="improvementAdditions">
                    <!-- List of suggested additions -->
                </div>
                <div class="improvement-actions">
                    <button class="btn btn-primary" id="btnApplyImprovement">
                        <span class="icon">&#10004;</span>
                        Apply Changes
                    </button>
                    <button class="btn btn-secondary" id="btnRerunCoverage">
                        <span class="icon">&#8635;</span>
                        Re-run Coverage
                    </button>
                </div>
            </div>
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


        // AST Analysis elements
        const astSection = document.getElementById('astSection');
        const astStatus = document.getElementById('astStatus');
        const astStatusIcon = document.getElementById('astStatusIcon');
        const astStatusText = document.getElementById('astStatusText');
        const astInfoBox = document.getElementById('astInfoBox');
        const astMethodCount = document.getElementById('astMethodCount');
        const astDependencies = document.getElementById('astDependencies');
        const astAnnotations = document.getElementById('astAnnotations');
        const astComplexity = document.getElementById('astComplexity');
        const astAnalyzedAt = document.getElementById('astAnalyzedAt');
        const btnAnalyzeAst = document.getElementById('btnAnalyzeAst');
        const analyzeAstText = document.getElementById('analyzeAstText');
        const analyzeAstSpinner = document.getElementById('analyzeAstSpinner');
        const astSelectedIndicator = document.getElementById('astSelectedIndicator');
        const btnChangeAst = document.getElementById('btnChangeAst');
        const btnViewDetails = document.getElementById('btnViewDetails');
        const astDetailsPanel = document.getElementById('astDetailsPanel');
        const btnCloseDetails = document.getElementById('btnCloseDetails');

        // AST Details panel elements
        const detailClassName = document.getElementById('detailClassName');
        const detailPackageName = document.getElementById('detailPackageName');
        const detailClassAnnotations = document.getElementById('detailClassAnnotations');
        const detailMethodCount = document.getElementById('detailMethodCount');
        const detailMethodList = document.getElementById('detailMethodList');
        const detailFieldCount = document.getElementById('detailFieldCount');
        const detailFieldList = document.getElementById('detailFieldList');
        const detailInjectedCount = document.getElementById('detailInjectedCount');
        const detailInjectedList = document.getElementById('detailInjectedList');
        const detailImportCount = document.getElementById('detailImportCount');
        const detailImportList = document.getElementById('detailImportList');
        const detailTotalComplexity = document.getElementById('detailTotalComplexity');
        const detailLinesOfCode = document.getElementById('detailLinesOfCode');
        const detailComplexityList = document.getElementById('detailComplexityList');

        // Method selection elements
        const methodSelectionSection = document.getElementById('methodSelectionSection');
        const methodList = document.getElementById('methodList');
        const btnSelectAll = document.getElementById('btnSelectAll');
        const btnDeselectAll = document.getElementById('btnDeselectAll');

        // Testability check elements
        const btnCheckTestability = document.getElementById('btnCheckTestability');
        const checkTestabilityText = document.getElementById('checkTestabilityText');
        const testabilitySpinner = document.getElementById('testabilitySpinner');
        const testabilitySection = document.getElementById('testabilitySection');
        const testabilityResult = document.getElementById('testabilityResult');
        const testabilityHeader = document.getElementById('testabilityHeader');
        const testabilityIcon = document.getElementById('testabilityIcon');
        const testabilityText = document.getElementById('testabilityText');
        const refactoringSection = document.getElementById('refactoringSection');
        const refactoringList = document.getElementById('refactoringList');

        // Test execution elements
        const testClassNameInput = document.getElementById('testClassName');
        const btnRunTest = document.getElementById('btnRunTest');
        const btnRunAllTests = document.getElementById('btnRunAllTests');
        const runTestText = document.getElementById('runTestText');
        const runTestSpinner = document.getElementById('runTestSpinner');
        const testResultArea = document.getElementById('testResultArea');
        const testResult = document.getElementById('testResult');

        // Coverage elements
        const coverageTargetInput = document.getElementById('coverageTarget');
        const btnRunWithCoverage = document.getElementById('btnRunWithCoverage');
        const runWithCoverageText = document.getElementById('runWithCoverageText');
        const coverageSpinner = document.getElementById('coverageSpinner');
        const btnOpenCoverageReport = document.getElementById('btnOpenCoverageReport');
        const coverageResultSection = document.getElementById('coverageResultSection');
        const coverageResult = document.getElementById('coverageResult');
        const coverageHeader = document.getElementById('coverageHeader');
        const coveragePercentage = document.getElementById('coveragePercentage');
        const coverageStatus = document.getElementById('coverageStatus');
        const lineCoverageBar = document.getElementById('lineCoverageBar');
        const lineCoverageValue = document.getElementById('lineCoverageValue');
        const branchCoverageBar = document.getElementById('branchCoverageBar');
        const branchCoverageValue = document.getElementById('branchCoverageValue');
        const methodCoverageSection = document.getElementById('methodCoverageSection');
        const methodCoverageList = document.getElementById('methodCoverageList');
        const btnImproveCoverage = document.getElementById('btnImproveCoverage');
        const improvementResultSection = document.getElementById('improvementResultSection');
        const improvementIncrease = document.getElementById('improvementIncrease');
        const improvementAdditions = document.getElementById('improvementAdditions');
        const btnApplyImprovement = document.getElementById('btnApplyImprovement');
        const btnRerunCoverage = document.getElementById('btnRerunCoverage');

        // State
        let currentFilePath = null;
        let currentTestClassName = null;
        let currentTestFilePath = null;
        let scenariosApproved = false;
        let currentScenarios = '';
        let availableMethods = [];
        let selectedMethods = [];
        let cachedAstData = null;
        let selectedAstData = null;
        let isAstReady = false;
        let isTestabilityChecked = false;
        let isTestable = false;
        let currentCoverage = null;
        let targetCoverage = 80;
        let improvedTestCode = null;
        let improvedTestFilePath = null;

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
            astSection.classList.add('hidden');
            methodSelectionSection.classList.add('hidden');
            testabilitySection.classList.add('hidden');
            scenarioSection.classList.add('hidden');
            btnCheckTestability.disabled = true;
            btnGenerateScenarios.disabled = true;
            btnGenerateSelected.disabled = true;
            // Reset AST and testability state
            resetAstState();
            resetTestabilityState();
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

            // Enable/disable check testability based on selection
            btnCheckTestability.disabled = selectedMethods.length === 0;

            // Reset testability state when methods change
            if (isTestabilityChecked) {
                isTestabilityChecked = false;
                isTestable = false;
                testabilitySection.classList.add('hidden');
                btnGenerateScenarios.disabled = true;
            }
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

        // AST Analysis: Analyze button (when no cache)
        btnAnalyzeAst.addEventListener('click', () => {
            if (currentFilePath) {
                vscode.postMessage({
                    command: 'analyzeAst',
                    filePath: currentFilePath
                });
            }
        });

        // AST Analysis: Change button (go back to re-analyze)
        btnChangeAst.addEventListener('click', () => {
            isAstReady = false;
            selectedAstData = null;
            astSelectedIndicator.classList.add('hidden');
            astDetailsPanel.classList.add('hidden');
            methodSelectionSection.classList.add('hidden');
            btnGenerateScenarios.disabled = true;

            // Show Analyze button again (no caching)
            btnAnalyzeAst.classList.remove('hidden');
        });

        // AST Analysis: View Details button
        btnViewDetails.addEventListener('click', () => {
            if (selectedAstData && selectedAstData.ast) {
                renderAstDetails(selectedAstData.ast);
                astDetailsPanel.classList.remove('hidden');
            }
        });

        // AST Analysis: Close Details button
        btnCloseDetails.addEventListener('click', () => {
            astDetailsPanel.classList.add('hidden');
        });

        // AST Details: Section toggle (collapsible accordion)
        document.querySelectorAll('.ast-detail-section-header').forEach(header => {
            header.addEventListener('click', () => {
                const section = header.getAttribute('data-section');
                const content = document.getElementById(section + 'Content');
                const toggle = header.querySelector('.ast-detail-toggle');

                if (content) {
                    const isHidden = content.classList.contains('hidden');
                    content.classList.toggle('hidden');
                    header.classList.toggle('expanded', isHidden);
                }
            });
        });

        // Helper: Render AST Details
        function renderAstDetails(ast) {
            // Class Info
            detailClassName.textContent = ast.className || '-';
            detailPackageName.textContent = ast.packageName || '-';

            // Class Annotations
            detailClassAnnotations.innerHTML = '';
            if (ast.classAnnotations && ast.classAnnotations.length > 0) {
                ast.classAnnotations.forEach(ann => {
                    const tag = document.createElement('span');
                    tag.className = 'ast-detail-tag';
                    tag.textContent = ann;
                    detailClassAnnotations.appendChild(tag);
                });
            } else {
                detailClassAnnotations.innerHTML = '<span class="ast-empty-state">No annotations</span>';
            }

            // Methods
            detailMethodCount.textContent = ast.methods ? ast.methods.length : 0;
            detailMethodList.innerHTML = '';
            if (ast.methods && ast.methods.length > 0) {
                ast.methods.forEach(method => {
                    const item = document.createElement('div');
                    item.className = 'ast-method-item';

                    // Support both old (name) and new (methodName) property names
                    const methodName = method.methodName || method.name || 'unknown';
                    const methodSignature = method.methodSignature || method.signature || '';
                    const complexity = ast.complexity?.methodComplexities?.[methodName] || method.complexity || 1;
                    const complexityClass = complexity > 10 ? 'high' : (complexity > 5 ? 'medium' : '');

                    // Determine modifiers
                    let modifiers = method.modifiers || [];
                    if (modifiers.length === 0) {
                        if (ast.publicMethods?.includes(methodName)) modifiers = ['public'];
                        else if (ast.privateMethods?.includes(methodName)) modifiers = ['private'];
                        else if (ast.protectedMethods?.includes(methodName)) modifiers = ['protected'];
                    }

                    item.innerHTML = \`
                        <div class="ast-method-name">\${methodName}</div>
                        <div class="ast-method-signature">\${methodSignature}</div>
                        <div class="ast-method-meta">
                            \${modifiers.map(m => \`<span class="ast-method-meta-item \${m}">\${m}</span>\`).join('')}
                            <span class="ast-method-meta-item">\${method.returnType || 'void'}</span>
                            <span class="ast-method-meta-item complexity \${complexityClass}">CC: \${complexity}</span>
                        </div>
                    \`;
                    detailMethodList.appendChild(item);
                });
            } else {
                detailMethodList.innerHTML = '<div class="ast-empty-state">No methods found</div>';
            }

            // Fields
            detailFieldCount.textContent = ast.fields ? ast.fields.length : 0;
            detailFieldList.innerHTML = '';
            if (ast.fields && ast.fields.length > 0) {
                ast.fields.forEach(field => {
                    const item = document.createElement('div');
                    item.className = 'ast-field-item';
                    item.innerHTML = \`
                        <div class="ast-field-name">\${field.name}</div>
                        <div class="ast-field-meta">
                            <span class="ast-field-meta-item">\${field.type}</span>
                            \${field.annotations?.map(a => \`<span class="ast-detail-tag di">\${a}</span>\`).join('') || ''}
                        </div>
                    \`;
                    detailFieldList.appendChild(item);
                });
            } else {
                detailFieldList.innerHTML = '<div class="ast-empty-state">No fields found</div>';
            }

            // Injected Dependencies
            const injectedFields = ast.injectedFields || [];
            detailInjectedCount.textContent = injectedFields.length;
            detailInjectedList.innerHTML = '';
            if (injectedFields.length > 0) {
                injectedFields.forEach(field => {
                    const item = document.createElement('div');
                    item.className = 'ast-injected-item';
                    item.innerHTML = \`
                        <div class="ast-injected-name">\${field.name}</div>
                        <div class="ast-injected-type">\${field.type}</div>
                        <div class="ast-injected-annotations">
                            \${field.annotations?.map(a => \`<span class="ast-detail-tag di">\${a}</span>\`).join('') || ''}
                        </div>
                    \`;
                    detailInjectedList.appendChild(item);
                });
            } else {
                detailInjectedList.innerHTML = '<div class="ast-empty-state">No DI fields (@Autowired, @Inject, etc.)</div>';
            }

            // Imports
            const imports = ast.imports || [];
            detailImportCount.textContent = imports.length;
            detailImportList.innerHTML = '';
            if (imports.length > 0) {
                imports.forEach(imp => {
                    const item = document.createElement('div');
                    let importClass = 'ast-import-item';
                    if (imp.startsWith('java.') || imp.startsWith('javax.')) {
                        importClass += ' java';
                    } else if (imp.startsWith('org.springframework')) {
                        importClass += ' spring';
                    } else {
                        importClass += ' project';
                    }
                    item.className = importClass;
                    item.textContent = imp;
                    detailImportList.appendChild(item);
                });
            } else {
                detailImportList.innerHTML = '<div class="ast-empty-state">No imports</div>';
            }

            // Complexity
            if (ast.complexity) {
                detailTotalComplexity.textContent = ast.complexity.cyclomaticComplexity || 0;
                detailLinesOfCode.textContent = ast.complexity.linesOfCode || 0;

                detailComplexityList.innerHTML = '';
                const methodComplexities = ast.complexity.methodComplexities || {};
                const sortedMethods = Object.entries(methodComplexities)
                    .sort((a, b) => b[1] - a[1]); // Sort by complexity descending

                if (sortedMethods.length > 0) {
                    sortedMethods.forEach(([name, complexity]) => {
                        const item = document.createElement('div');
                        item.className = 'ast-complexity-item';
                        const complexityClass = complexity > 10 ? 'high' : (complexity > 5 ? 'medium' : 'low');
                        item.innerHTML = \`
                            <span class="ast-complexity-method">\${name}</span>
                            <span class="ast-complexity-value \${complexityClass}">\${complexity}</span>
                        \`;
                        detailComplexityList.appendChild(item);
                    });
                }
            }
        }

        // Helper: Show AST info in the info box
        function showAstInfo(astData) {
            if (!astData || !astData.ast) return;

            const ast = astData.ast;
            astMethodCount.textContent = ast.methodCount + ' (public: ' + ast.publicMethods.length + ')';
            astDependencies.textContent = ast.dependencies.length > 0 ? ast.dependencies.slice(0, 3).join(', ') + (ast.dependencies.length > 3 ? '...' : '') : '-';
            astAnnotations.textContent = ast.annotations.length > 0 ? ast.annotations.join(', ') : '-';
            astComplexity.textContent = 'CC: ' + ast.complexity.cyclomaticComplexity + ', LOC: ' + ast.complexity.linesOfCode;

            // Format date
            const analyzedDate = new Date(astData.analyzedAt);
            astAnalyzedAt.textContent = analyzedDate.toLocaleString();

            astInfoBox.classList.remove('hidden');
        }

        // Helper: Show AST selected state
        function showAstSelectedState() {
            astStatus.classList.add('hidden');
            astInfoBox.classList.add('hidden');
            btnAnalyzeAst.classList.add('hidden');
            astSelectedIndicator.classList.remove('hidden');
        }

        // Helper: Enable method selection section
        function enableMethodSelection() {
            methodSelectionSection.classList.remove('hidden');
            // Request method extraction
            vscode.postMessage({
                command: 'extractMethods',
                filePath: currentFilePath
            });
        }

        // Helper: Reset AST state
        function resetAstState() {
            cachedAstData = null;
            selectedAstData = null;
            isAstReady = false;
            astStatus.classList.remove('hidden');
            astStatusIcon.innerHTML = '&#9888;';
            astStatusText.textContent = 'Ready to analyze';
            astInfoBox.classList.add('hidden');
            btnAnalyzeAst.classList.remove('hidden');
            astSelectedIndicator.classList.add('hidden');
        }

        // Helper: Reset testability state
        function resetTestabilityState() {
            isTestabilityChecked = false;
            isTestable = false;
            testabilitySection.classList.add('hidden');
            btnCheckTestability.disabled = true;
            btnGenerateScenarios.disabled = true;
        }

        // Check Testability button
        btnCheckTestability.addEventListener('click', () => {
            if (currentFilePath && selectedMethods.length > 0) {
                vscode.postMessage({
                    command: 'checkTestability',
                    filePath: currentFilePath,
                    selectedMethods: selectedMethods
                });
            }
        });

        // Helper: Render refactoring advice
        function renderRefactoringAdvice(advice) {
            if (!advice || advice.length === 0) {
                refactoringSection.classList.add('hidden');
                return;
            }

            refactoringSection.classList.remove('hidden');
            refactoringList.innerHTML = advice.map(item => {
                const severityClass = item.severity === 'error' ? 'error' : (item.severity === 'warning' ? 'warning' : 'info');
                const severityIcon = item.severity === 'error' ? '&#10060;' : (item.severity === 'warning' ? '&#9888;' : '&#8505;');
                return '<div class="refactoring-item ' + severityClass + '">' +
                    '<div class="refactoring-item-header">' +
                    '<span class="refactoring-severity">' + severityIcon + '</span>' +
                    '<span class="refactoring-method">' + escapeHtml(item.method) + '</span>' +
                    '</div>' +
                    '<div class="refactoring-issue">' + escapeHtml(item.issue) + '</div>' +
                    '<div class="refactoring-suggestion">' + escapeHtml(item.suggestion) + '</div>' +
                    '</div>';
            }).join('');
        }

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
                    scenarios: scenarioEditor.value,
                    selectedMethods: selectedMethods,
                    autoRunTest: true  // 자동으로 테스트 실행
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

        // Run with coverage
        btnRunWithCoverage.addEventListener('click', () => {
            const testClassName = testClassNameInput.value.trim();
            if (!testClassName) {
                showMessage('warning', 'Please enter a test class name');
                return;
            }
            
            // Get user-defined coverage target
            const userCoverageTarget = parseInt(coverageTargetInput.value) || 80;
            targetCoverage = userCoverageTarget;
            
            vscode.postMessage({
                command: 'runTestWithCoverage',
                testClassName: testClassName,
                coverageTarget: userCoverageTarget,
                sourceFilePath: currentFilePath,
                testFilePath: currentTestFilePath,
                selectedMethods: selectedMethods,
                autoImprove: true  // 자동으로 목표 도달까지 개선
            });
        });

        // Open coverage report
        btnOpenCoverageReport.addEventListener('click', () => {
            vscode.postMessage({ command: 'openCoverageReport' });
        });

        // Improve coverage
        btnImproveCoverage.addEventListener('click', () => {
            if (currentFilePath && currentCoverage && currentTestFilePath) {
                vscode.postMessage({
                    command: 'improveCoverage',
                    sourceFilePath: currentFilePath,
                    testFilePath: currentTestFilePath,
                    selectedMethods: selectedMethods,
                    currentCoverage: currentCoverage,
                    targetCoverage: targetCoverage
                });
            } else {
                showMessage('warning', 'Please run tests with coverage first.');
            }
        });

        // Apply coverage improvement
        btnApplyImprovement.addEventListener('click', () => {
            if (improvedTestCode && improvedTestFilePath) {
                btnApplyImprovement.disabled = true;
                btnApplyImprovement.textContent = 'Applying...';
                vscode.postMessage({
                    command: 'applyImprovement',
                    testFilePath: improvedTestFilePath,
                    testCode: improvedTestCode
                });
            }
        });

        // Re-run coverage after applying improvement
        btnRerunCoverage.addEventListener('click', () => {
            improvementResultSection.classList.add('hidden');
            const testClassName = testClassNameInput.value.trim();
            if (testClassName) {
                vscode.postMessage({
                    command: 'runTestWithCoverage',
                    testClassName: testClassName
                });
            }
        });

        // Helper: Show improvement result
        function showImprovementResult(additions, expectedIncrease) {
            improvementResultSection.classList.remove('hidden');
            improvementIncrease.textContent = '+' + (expectedIncrease || 0).toFixed(1) + '%';

            // Render additions list
            if (additions && additions.length > 0) {
                improvementAdditions.innerHTML = additions.map(function(addition) {
                    return '<div class="improvement-addition-item">' +
                        '<span class="addition-method">' + escapeHtml(addition.methodName || 'Test method') + '</span>' +
                        '<span class="addition-description">' + escapeHtml(addition.description || '') + '</span>' +
                        '</div>';
                }).join('');
            } else {
                improvementAdditions.innerHTML = '<div class="improvement-addition-item">Additional test cases generated</div>';
            }
        }

        // Helper: Render coverage result
        function renderCoverageResult(coverage, meetsTarget, target) {
            coverageResultSection.classList.remove('hidden');

            // Overall percentage
            coveragePercentage.textContent = coverage.overallCoverage.toFixed(1) + '%';

            // Status
            if (meetsTarget) {
                coverageStatus.textContent = 'Target Met';
                coverageStatus.className = 'coverage-status success';
                coverageHeader.className = 'coverage-header success';
                btnImproveCoverage.classList.add('hidden');
            } else {
                coverageStatus.textContent = 'Below Target (' + target + '%)';
                coverageStatus.className = 'coverage-status failure';
                coverageHeader.className = 'coverage-header failure';
                btnImproveCoverage.classList.remove('hidden');
            }

            // Line coverage bar
            lineCoverageBar.style.width = coverage.lineCoverage + '%';
            lineCoverageBar.className = 'coverage-bar-fill ' + getCoverageClass(coverage.lineCoverage, target);
            lineCoverageValue.textContent = coverage.lineCoverage.toFixed(1) + '%';

            // Branch coverage bar
            branchCoverageBar.style.width = coverage.branchCoverage + '%';
            branchCoverageBar.className = 'coverage-bar-fill ' + getCoverageClass(coverage.branchCoverage, target);
            branchCoverageValue.textContent = coverage.branchCoverage.toFixed(1) + '%';

            // Method coverage
            if (coverage.methodCoverage && Object.keys(coverage.methodCoverage).length > 0) {
                methodCoverageSection.classList.remove('hidden');
                renderMethodCoverage(coverage.methodCoverage, target);
            } else {
                methodCoverageSection.classList.add('hidden');
            }
        }

        // Helper: Get coverage class based on percentage
        function getCoverageClass(percentage, target) {
            if (percentage >= target) return 'high';
            if (percentage >= target * 0.7) return 'medium';
            return 'low';
        }

        // Helper: Render method coverage list
        function renderMethodCoverage(methodCoverage, target) {
            const methods = Object.entries(methodCoverage);
            methodCoverageList.innerHTML = methods.map(function(entry) {
                const methodName = entry[0];
                const data = entry[1];
                const avgCoverage = (data.lineCoverage + data.branchCoverage) / 2;
                const coverageClass = getCoverageClass(avgCoverage, target);
                return '<div class="method-coverage-item ' + coverageClass + '">' +
                    '<span class="method-name">' + escapeHtml(methodName) + '</span>' +
                    '<span class="method-coverage-value">' + avgCoverage.toFixed(0) + '%</span>' +
                    '</div>';
            }).join('');
        }

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

                    // Reset AST state and show AST section
                    resetAstState();
                    astSection.classList.remove('hidden');
                    methodSelectionSection.classList.add('hidden');
                    btnGenerateScenarios.disabled = true;
                    btnGenerateSelected.disabled = true;

                    // Request AST cache check (instead of directly extracting methods)
                    vscode.postMessage({
                        command: 'checkAstCache',
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

                case 'astCacheChecked':
                    // No caching - always show Analyze button
                    cachedAstData = message.astData;
                    astStatusIcon.innerHTML = '&#128269;';
                    astStatusText.textContent = 'Click to analyze';
                    astStatus.classList.remove('hidden');
                    astInfoBox.classList.add('hidden');
                    btnAnalyzeAst.classList.remove('hidden');
                    break;

                case 'astAnalyzing':
                    analyzeAstText.textContent = 'Analyzing...';
                    analyzeAstSpinner.classList.remove('hidden');
                    btnAnalyzeAst.disabled = true;
                    break;

                case 'astAnalyzed':
                    analyzeAstText.textContent = 'Analyze AST';
                    analyzeAstSpinner.classList.add('hidden');
                    btnAnalyzeAst.disabled = false;

                    cachedAstData = message.astData;
                    selectedAstData = message.astData;
                    isAstReady = true;

                    // Show AST info and selected state
                    showAstInfo(message.astData);
                    showAstSelectedState();
                    enableMethodSelection();

                    showMessage('success', 'AST analysis completed.');
                    break;

                case 'astAnalyzeError':
                    analyzeAstText.textContent = 'Analyze AST';
                    analyzeAstSpinner.classList.add('hidden');
                    btnAnalyzeAst.disabled = false;
                    // Error is shown as VS Code notification
                    break;

                case 'astSelected':
                    selectedAstData = message.astData;
                    isAstReady = true;
                    showAstSelectedState();
                    enableMethodSelection();
                    break;

                case 'testabilityChecking':
                    checkTestabilityText.textContent = 'Checking...';
                    testabilitySpinner.classList.remove('hidden');
                    btnCheckTestability.disabled = true;
                    break;

                case 'testabilityResult':
                    checkTestabilityText.textContent = 'Check Testability';
                    testabilitySpinner.classList.add('hidden');
                    btnCheckTestability.disabled = false;

                    isTestabilityChecked = true;
                    isTestable = message.testable;

                    testabilitySection.classList.remove('hidden');

                    if (message.testable) {
                        testabilityHeader.className = 'testability-header success';
                        testabilityIcon.innerHTML = '&#10004;';
                        testabilityText.textContent = 'Code is testable';
                        refactoringSection.classList.add('hidden');
                        btnGenerateScenarios.disabled = false;
                        showMessage('success', 'Code is testable! Proceed to generate scenarios.');
                    } else {
                        testabilityHeader.className = 'testability-header failure';
                        testabilityIcon.innerHTML = '&#10060;';
                        testabilityText.textContent = 'Testability issues found';
                        renderRefactoringAdvice(message.refactoringAdvice);
                        btnGenerateScenarios.disabled = true;
                        showMessage('warning', 'Please review the refactoring suggestions.');
                    }
                    break;

                case 'testabilityError':
                    checkTestabilityText.textContent = 'Check Testability';
                    testabilitySpinner.classList.add('hidden');
                    btnCheckTestability.disabled = false;
                    // Error is shown as VS Code notification
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

                case 'coverageRunning':
                    runWithCoverageText.textContent = 'Running...';
                    coverageSpinner.classList.remove('hidden');
                    btnRunWithCoverage.disabled = true;
                    break;

                case 'coverageResult':
                    runWithCoverageText.textContent = 'Run with Coverage';
                    coverageSpinner.classList.add('hidden');
                    btnRunWithCoverage.disabled = false;

                    currentCoverage = message.coverage;
                    targetCoverage = message.targetCoverage;
                    renderCoverageResult(message.coverage, message.meetsTarget, message.targetCoverage);

                    if (message.meetsTarget) {
                        showMessage('success', 'Coverage target met! ' + message.coverage.overallCoverage.toFixed(1) + '%');
                    } else {
                        showMessage('warning', 'Coverage below target. Click "Improve Coverage" to enhance.');
                    }
                    break;

                case 'coverageError':
                    runWithCoverageText.textContent = 'Run with Coverage';
                    coverageSpinner.classList.add('hidden');
                    btnRunWithCoverage.disabled = false;
                    // Error is shown as VS Code notification
                    break;

                case 'jacocoConfigResult':
                    if (!message.configured) {
                        showMessage('warning', 'Jacoco not configured. Add Jacoco plugin to your build file.');
                    }
                    break;

                case 'improveCoverageStarted':
                    btnImproveCoverage.disabled = true;
                    btnImproveCoverage.textContent = 'Improving...';
                    break;

                case 'improveCoverageResult':
                    btnImproveCoverage.disabled = false;
                    btnImproveCoverage.textContent = 'Improve Coverage';

                    // Store the improved test code for applying
                    improvedTestCode = message.improvedTestCode;
                    improvedTestFilePath = message.testFilePath;

                    // Show the improvement result section
                    showImprovementResult(message.additions, message.expectedCoverageIncrease);
                    break;

                case 'improveCoverageError':
                    btnImproveCoverage.disabled = false;
                    btnImproveCoverage.textContent = 'Improve Coverage';
                    showMessage('error', message.error);
                    break;

                case 'applyImprovementSuccess':
                    btnApplyImprovement.disabled = false;
                    btnApplyImprovement.textContent = 'Apply Changes';
                    showMessage('success', 'Changes applied! Click "Re-run Coverage" to verify.');
                    break;

                case 'applyImprovementError':
                    btnApplyImprovement.disabled = false;
                    btnApplyImprovement.textContent = 'Apply Changes';
                    showMessage('error', message.error);
                    break;

                case 'testFileSaved':
                    // Update current test file path when test is generated
                    currentTestFilePath = message.testFilePath;
                    break;

                // Auto-Test handlers
                case 'autoTestStarting':
                    showMessage('info', 'Test generated! Auto-running tests...');
                    break;

                case 'testSuccess':
                    testResultArea.classList.remove('hidden');
                    testResult.className = 'test-result success';
                    testResult.innerHTML = '<div class="result-header">&#10004; All Tests Passed!</div>' +
                        '<pre class="result-details">' + escapeHtml(message.details) + '</pre>';
                    showMessage('success', 'All tests passed!');
                    break;

                case 'testFailed':
                    testResultArea.classList.remove('hidden');
                    testResult.className = 'test-result failure';
                    testResult.innerHTML = '<div class="result-header">&#10060; Tests Failed - Auto-Regenerating (Attempt ' + (message.retryCount + 1) + '/3)...</div>' +
                        '<div class="result-error">' + escapeHtml(message.error) + '</div>' +
                        '<pre class="result-details">' + escapeHtml(message.details) + '</pre>';
                    showMessage('warning', 'Tests failed. Auto-regenerating...');
                    break;

                case 'testRegenerating':
                    showMessage('info', 'Regenerating test code (Attempt ' + message.retryCount + '/' + message.maxRetries + ')...');
                    break;

                case 'testRegenerated':
                    showMessage('success', 'Test code regenerated. Running tests again...');
                    break;

                case 'testRegenerationFailed':
                    testResultArea.classList.remove('hidden');
                    testResult.className = 'test-result failure';
                    testResult.innerHTML = '<div class="result-header">&#10060; Max Retries Reached</div>' +
                        '<div class="result-error">' + escapeHtml(message.error) + '</div>' +
                        '<pre class="result-details">' + escapeHtml(message.testOutput || '') + '</pre>';
                    showMessage('error', 'Test generation failed after 3 attempts. Please review manually.');
                    break;

                case 'testRegenerationError':
                    showMessage('error', 'Test regeneration failed: ' + message.error);
                    break;

                // Auto Coverage Improvement handlers
                case 'improvingCoverage':
                    showMessage('info', 'Auto-improving coverage (Iteration ' + message.iteration + '/5)...');
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
