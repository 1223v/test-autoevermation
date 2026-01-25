import * as vscode from 'vscode';
import { ApiClient } from '../api/client';
import { FileManager } from '../services/fileManager';
import { PathResolver } from '../services/pathResolver';
import { StatusBarManager } from '../ui/statusBar';
import { SettingsManager } from '../config/settings';
import { SourceFile, GenerateTestRequest, CachedAstData } from '../api/types';
import { getUserFriendlyErrorMessage } from '../api/errors';
import { JavaAstAnalyzer } from '../services/javaAstAnalyzer';

// ============================================================
// Helper functions for test file merging (from javaParser.ts)
// ============================================================

/**
 * Extracts existing test methods from a test file
 */
function extractTestMethods(testCode: string): string[] {
    const testMethods: string[] = [];
    const lines = testCode.split('\n');
    let foundTestAnnotation = false;

    for (const line of lines) {
        if (line.trim().startsWith('@Test')) {
            foundTestAnnotation = true;
            continue;
        }
        if (foundTestAnnotation) {
            const methodMatch = line.match(/^\s*(?:public|private|protected)?\s*void\s+(\w+)\s*\(/);
            if (methodMatch) {
                testMethods.push(methodMatch[1]);
                foundTestAnnotation = false;
            }
        }
    }
    return testMethods;
}

/**
 * Extracts imports from Java source code
 */
function extractImports(sourceCode: string): string[] {
    const imports: string[] = [];
    const importRegex = /^\s*import\s+([\w.]+(?:\.\*)?)\s*;/gm;
    let match;
    while ((match = importRegex.exec(sourceCode)) !== null) {
        imports.push(match[1]);
    }
    return imports;
}

/**
 * Merges imports from new code into existing code
 */
function mergeImports(existingCode: string, newCode: string): string {
    const existingImports = new Set(extractImports(existingCode));
    const newImports = extractImports(newCode);
    const importsToAdd = newImports.filter(imp => !existingImports.has(imp));

    if (importsToAdd.length === 0) {
        return existingCode;
    }

    const lines = existingCode.split('\n');
    let insertIndex = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.match(/^\s*import\s+/)) {
            insertIndex = i + 1;
        } else if (line.match(/^\s*(?:public\s+)?class\s+/)) {
            break;
        }
    }

    const importLines = importsToAdd.map(imp => `import ${imp};`);
    lines.splice(insertIndex, 0, ...importLines);
    return lines.join('\n');
}

/**
 * Merges new test methods into existing test file
 */
function mergeTestMethods(existingCode: string, newTestMethods: string): string {
    const lines = existingCode.split('\n');
    let lastBraceIndex = -1;
    let braceCount = 0;
    let classStarted = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.match(/^\s*(?:public\s+)?class\s+/)) {
            classStarted = true;
        }
        if (classStarted) {
            braceCount += (line.match(/\{/g) || []).length;
            braceCount -= (line.match(/\}/g) || []).length;
            if (braceCount === 0 && line.includes('}')) {
                lastBraceIndex = i;
            }
        }
    }

    if (lastBraceIndex === -1) {
        return existingCode + '\n\n' + newTestMethods;
    }

    const newMethodsMatch = newTestMethods.match(/(@Test[\s\S]*?)(?=\s*}\s*$)/);
    const methodsToInsert = newMethodsMatch ? newMethodsMatch[1] : newTestMethods;

    const beforeBrace = lines.slice(0, lastBraceIndex);
    const afterBrace = lines.slice(lastBraceIndex);

    return [...beforeBrace, '', '    // Additional test methods', methodsToInsert, ...afterBrace].join('\n');
}

// ============================================================

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
            const javaAstAnalyzer = new JavaAstAnalyzer();

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

                        // Analyze AST using java-ast
                        progress.report({ increment: 5, message: 'Analyzing AST...' });
                        const astAnalysis = javaAstAnalyzer.analyze(content);

                        // Parse package and class names from AST analysis
                        const packageName = astAnalysis.packageName || pathResolver.extractPackageFromContent(content) || pathInfo.packageName;
                        const className = astAnalysis.className || pathResolver.extractClassNameFromContent(content) || pathInfo.className;

                        // Prepare source file info
                        const sourceFile: SourceFile = {
                            fileName: `${className}.java`,
                            packageName,
                            content
                        };

                        // Prepare cached AST data
                        const cachedAst: CachedAstData = {
                            className: astAnalysis.className,
                            packageName: astAnalysis.packageName,
                            methodCount: astAnalysis.methodCount,
                            publicMethods: astAnalysis.publicMethods,
                            privateMethods: astAnalysis.privateMethods,
                            protectedMethods: astAnalysis.protectedMethods,
                            dependencies: astAnalysis.dependencies,
                            imports: astAnalysis.imports,
                            annotations: astAnalysis.annotations,
                            injectedBeans: astAnalysis.injectedBeans,
                            complexity: astAnalysis.complexity
                        };

                        // Collect dependencies if enabled
                        progress.report({ increment: 5, message: 'Analyzing dependencies...' });

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
                            cachedAst,
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
                        let finalContent = response.testFile.content;

                        if (await fileManager.fileExists(testPath)) {
                            const existingContent = await fileManager.readFile(testPath);
                            const existingTestMethods = extractTestMethods(existingContent);
                            const newTestMethods = extractTestMethods(response.testFile.content);

                            // Check if there are overlapping test methods
                            const overlapping = newTestMethods.filter(m => existingTestMethods.includes(m));
                            const newMethods = newTestMethods.filter(m => !existingTestMethods.includes(m));

                            let dialogMessage = `Test file already exists: ${response.testFile.fileName}`;
                            if (newMethods.length > 0) {
                                dialogMessage += `\n\nNew test methods: ${newMethods.length}`;
                            }
                            if (overlapping.length > 0) {
                                dialogMessage += `\nOverlapping methods: ${overlapping.length}`;
                            }

                            const action = await vscode.window.showWarningMessage(
                                dialogMessage,
                                { modal: true },
                                'Merge (Add New)',
                                'Overwrite',
                                'Create Backup',
                                'Cancel'
                            );

                            if (action === 'Cancel' || !action) {
                                statusBar.setReady();
                                return;
                            }

                            if (action === 'Create Backup') {
                                await fileManager.createBackup(testPath);
                            } else if (action === 'Merge (Add New)') {
                                // Merge imports first
                                let mergedContent = mergeImports(existingContent, response.testFile.content);
                                // Then merge test methods
                                mergedContent = mergeTestMethods(mergedContent, response.testFile.content);
                                finalContent = mergedContent;

                                vscode.window.showInformationMessage(
                                    `Merged ${newMethods.length} new test methods into existing file`
                                );
                            }
                        }

                        // Save test file
                        const saveResult = await fileManager.saveTestFile(
                            testPath,
                            finalContent
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
                const features = health.features.join(', ') || 'N/A';

                if (health.status === 'healthy') {
                    statusBar.setReady();
                    vscode.window.showInformationMessage(
                        `Connected to server v${health.version}. Features: ${features}`
                    );
                } else if (health.status === 'degraded') {
                    statusBar.setReady();
                    const redisStatus = health.redis_connected ? 'connected' : 'disconnected';
                    vscode.window.showWarningMessage(
                        `Server is degraded (Redis: ${redisStatus}). Some features may be limited.`
                    );
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
