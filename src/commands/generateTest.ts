import * as vscode from 'vscode';
import { ApiClient } from '../api/client';
import { FileManager } from '../services/fileManager';
import { PathResolver } from '../services/pathResolver';
import { StatusBarManager } from '../ui/statusBar';
import { SettingsManager } from '../config/settings';
import { SourceFile, GenerateTestRequest } from '../api/types';
import { getUserFriendlyErrorMessage } from '../api/errors';

/**
 * Creates the generate test command
 */
export function createGenerateTestCommand(
    apiClient: ApiClient,
    statusBar: StatusBarManager,
    settings: SettingsManager
): vscode.Disposable {
    return vscode.commands.registerCommand(
        'javaTestGenerator.generateTest',
        async (uri?: vscode.Uri, scenarios?: string) => {
            // Get the target file URI
            const targetUri = uri || vscode.window.activeTextEditor?.document.uri;

            if (!targetUri) {
                vscode.window.showWarningMessage('No Java file selected');
                return;
            }

            // Verify it's a Java file
            if (!targetUri.fsPath.endsWith('.java')) {
                vscode.window.showWarningMessage('Please select a Java file');
                return;
            }

            // Check if API is configured
            if (!settings.isConfigured()) {
                const configure = await vscode.window.showWarningMessage(
                    'API URL and API Key are not configured.',
                    'Open Settings'
                );
                if (configure === 'Open Settings') {
                    vscode.commands.executeCommand(
                        'workbench.action.openSettings',
                        'javaTestGenerator'
                    );
                }
                return;
            }

            const fileManager = new FileManager();
            const pathResolver = new PathResolver();

            try {
                statusBar.setGenerating();

                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: 'Generating Unit Test',
                        cancellable: true
                    },
                    async (progress, token) => {
                        // Read source file content
                        progress.report({ increment: 10, message: 'Reading source file...' });

                        const content = await fileManager.readFile(targetUri);
                        const pathInfo = pathResolver.parseJavaPath(targetUri);

                        if (token.isCancellationRequested) {
                            statusBar.setReady();
                            return;
                        }

                        // Parse package and class names
                        const packageName = pathResolver.extractPackageFromContent(content) || pathInfo.packageName;
                        const className = pathResolver.extractClassNameFromContent(content) || pathInfo.className;

                        // Prepare source file info
                        const sourceFile: SourceFile = {
                            fileName: `${className}.java`,
                            packageName,
                            content
                        };

                        // Collect dependencies if enabled
                        progress.report({ increment: 10, message: 'Analyzing dependencies...' });

                        let dependencies: SourceFile[] = [];
                        if (settings.shouldIncludeDependencies()) {
                            dependencies = await collectDependencies(
                                content,
                                targetUri,
                                fileManager,
                                pathResolver
                            );
                        }

                        if (token.isCancellationRequested) {
                            statusBar.setReady();
                            return;
                        }

                        // Prepare request
                        const request: GenerateTestRequest = {
                            sourceFile,
                            dependencies,
                            options: {
                                testFramework: settings.getTestFramework(),
                                mockingFramework: settings.getMockingFramework(),
                                coverageTarget: settings.getCoverageTarget(),
                                includeEdgeCases: settings.includeEdgeCases()
                            },
                            ...(scenarios && { scenarios })
                        };

                        // Call API
                        progress.report({ increment: 20, message: 'Sending to server...' });

                        const response = await apiClient.generateTest(request);

                        if (token.isCancellationRequested) {
                            statusBar.setReady();
                            return;
                        }

                        if (!response.success) {
                            throw new Error('Test generation failed');
                        }

                        // Determine save path
                        progress.report({ increment: 30, message: 'Saving test file...' });

                        const testPath = pathResolver.resolveTestPath(
                            targetUri,
                            response.testFile.suggestedPath
                        );

                        // Check if file exists and ask for confirmation
                        if (await fileManager.fileExists(testPath)) {
                            const overwrite = await vscode.window.showWarningMessage(
                                `Test file already exists: ${response.testFile.fileName}`,
                                'Overwrite',
                                'Create Backup',
                                'Cancel'
                            );

                            if (overwrite === 'Cancel' || !overwrite) {
                                statusBar.setReady();
                                return;
                            }

                            if (overwrite === 'Create Backup') {
                                await fileManager.createBackup(testPath);
                            }
                        }

                        // Save test file
                        const saveResult = await fileManager.saveTestFile(
                            testPath,
                            response.testFile.content
                        );

                        if (!saveResult.success) {
                            throw new Error(`Failed to save test file: ${saveResult.error}`);
                        }

                        progress.report({ increment: 100, message: 'Done!' });

                        // Open generated test file if enabled
                        if (settings.shouldOpenAfterGeneration()) {
                            await fileManager.openFile(testPath, vscode.ViewColumn.Beside);
                        }

                        // Show success message
                        statusBar.setSuccess(`Generated: ${response.testFile.fileName}`);

                        const message = `Test file generated: ${response.testFile.fileName}`;
                        const action = await vscode.window.showInformationMessage(
                            message,
                            'Open File',
                            'Show Analysis'
                        );

                        if (action === 'Open File') {
                            await fileManager.openFile(testPath);
                        } else if (action === 'Show Analysis' && response.analysis) {
                            showAnalysisSummary(response.analysis);
                        }
                    }
                );
            } catch (error) {
                statusBar.setError(getUserFriendlyErrorMessage(error));
                vscode.window.showErrorMessage(
                    `Failed to generate test: ${getUserFriendlyErrorMessage(error)}`
                );
            }
        }
    );
}

/**
 * Collects dependency files based on imports
 */
async function collectDependencies(
    content: string,
    sourceUri: vscode.Uri,
    fileManager: FileManager,
    pathResolver: PathResolver
): Promise<SourceFile[]> {
    const dependencies: SourceFile[] = [];
    const imports = fileManager.extractImports(content);

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(sourceUri);
    if (!workspaceFolder) {
        return dependencies;
    }

    const dependencyFiles = await fileManager.findDependencyFiles(imports, workspaceFolder);

    for (const [importPath, uri] of dependencyFiles) {
        try {
            const depContent = await fileManager.readFile(uri);
            const packageName = pathResolver.extractPackageFromContent(depContent);
            const className = pathResolver.extractClassNameFromContent(depContent);

            dependencies.push({
                fileName: `${className}.java`,
                packageName: packageName || importPath.substring(0, importPath.lastIndexOf('.')),
                content: depContent
            });
        } catch (error) {
            console.warn(`Failed to read dependency: ${importPath}`, error);
        }
    }

    return dependencies;
}

/**
 * Shows analysis summary in an information message
 */
function showAnalysisSummary(analysis: import('../api/types').AnalysisResult): void {
    const parts: string[] = [];

    if (analysis.astSummary) {
        parts.push(`Methods: ${analysis.astSummary.methodCount}`);
        if (analysis.astSummary.dependencies.length > 0) {
            parts.push(`Dependencies: ${analysis.astSummary.dependencies.join(', ')}`);
        }
    }

    if (analysis.mockingSuggestions && analysis.mockingSuggestions.length > 0) {
        const mocks = analysis.mockingSuggestions
            .map(s => s.interface)
            .join(', ');
        parts.push(`Mocked: ${mocks}`);
    }

    if (parts.length > 0) {
        vscode.window.showInformationMessage(`Analysis: ${parts.join(' | ')}`);
    }
}

/**
 * Creates the analyze code command
 */
export function createAnalyzeCodeCommand(
    apiClient: ApiClient,
    statusBar: StatusBarManager
): vscode.Disposable {
    return vscode.commands.registerCommand(
        'javaTestGenerator.analyzeCode',
        async (uri?: vscode.Uri) => {
            const targetUri = uri || vscode.window.activeTextEditor?.document.uri;

            if (!targetUri) {
                vscode.window.showWarningMessage('No Java file selected');
                return;
            }

            if (!targetUri.fsPath.endsWith('.java')) {
                vscode.window.showWarningMessage('Please select a Java file');
                return;
            }

            const fileManager = new FileManager();
            const pathResolver = new PathResolver();

            try {
                statusBar.setAnalyzing();

                const content = await fileManager.readFile(targetUri);
                const packageName = pathResolver.extractPackageFromContent(content);
                const className = pathResolver.extractClassNameFromContent(content);

                const response = await apiClient.analyze({
                    sourceFile: {
                        fileName: `${className}.java`,
                        packageName,
                        content
                    },
                    analysisTypes: ['ast', 'dependencies', 'complexity']
                });

                statusBar.setReady();

                if (response.success && response.analysis) {
                    showDetailedAnalysis(response.analysis, className);
                } else {
                    vscode.window.showWarningMessage('Analysis returned no results');
                }
            } catch (error) {
                statusBar.setError(getUserFriendlyErrorMessage(error));
                vscode.window.showErrorMessage(
                    `Failed to analyze: ${getUserFriendlyErrorMessage(error)}`
                );
            }
        }
    );
}

/**
 * Shows detailed analysis in an output channel
 */
function showDetailedAnalysis(
    analysis: import('../api/types').AnalyzeResponse['analysis'],
    className: string
): void {
    const outputChannel = vscode.window.createOutputChannel('Test-AutoEvermation');
    outputChannel.clear();
    outputChannel.appendLine(`=== Analysis: ${className} ===\n`);

    if (analysis.ast) {
        outputChannel.appendLine('--- AST Summary ---');
        outputChannel.appendLine(`Method Count: ${analysis.ast.methodCount}`);
        if (analysis.ast.publicMethods.length > 0) {
            outputChannel.appendLine(`Public Methods: ${analysis.ast.publicMethods.join(', ')}`);
        }
        if (analysis.ast.dependencies.length > 0) {
            outputChannel.appendLine(`Dependencies: ${analysis.ast.dependencies.join(', ')}`);
        }
        outputChannel.appendLine('');
    }

    if (analysis.dependencies) {
        outputChannel.appendLine('--- Dependencies ---');
        outputChannel.appendLine(`Imports: ${analysis.dependencies.imports.length}`);
        if (analysis.dependencies.injectedBeans.length > 0) {
            outputChannel.appendLine(`Injected Beans: ${analysis.dependencies.injectedBeans.join(', ')}`);
        }
        outputChannel.appendLine('');
    }

    if (analysis.complexity) {
        outputChannel.appendLine('--- Complexity ---');
        outputChannel.appendLine(`Cyclomatic Complexity: ${analysis.complexity.cyclomaticComplexity}`);
        outputChannel.appendLine(`Lines of Code: ${analysis.complexity.linesOfCode}`);
        outputChannel.appendLine('');
    }

    outputChannel.show();
}

/**
 * Creates the check connection command
 */
export function createCheckConnectionCommand(
    apiClient: ApiClient,
    statusBar: StatusBarManager
): vscode.Disposable {
    return vscode.commands.registerCommand(
        'javaTestGenerator.checkConnection',
        async () => {
            statusBar.setConnecting();

            try {
                const health = await apiClient.healthCheck();

                if (health.status === 'healthy') {
                    statusBar.setReady();
                    const features = health.features?.join(', ') || 'N/A';
                    vscode.window.showInformationMessage(
                        `Connected to server v${health.version}. Features: ${features}`
                    );
                } else {
                    statusBar.setDisconnected('Server is unhealthy');
                    vscode.window.showWarningMessage('Server is not healthy');
                }
            } catch (error) {
                statusBar.setDisconnected(getUserFriendlyErrorMessage(error));
                vscode.window.showErrorMessage(
                    `Connection failed: ${getUserFriendlyErrorMessage(error)}`
                );
            }
        }
    );
}
