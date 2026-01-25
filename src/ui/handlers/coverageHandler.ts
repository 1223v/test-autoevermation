import * as vscode from 'vscode';
import { HandlerContext } from './types';
import { AstHandler } from './astHandler';
import { TestRunnerHandler } from './testRunnerHandler';
import { JacocoRunner } from '../../services/jacocoRunner';
import { PathResolver } from '../../services/pathResolver';
import { JacocoCoverageResult } from '../../api/types';

/**
 * Handles coverage analysis and improvement operations
 */
export class CoverageHandler {
    private _astHandler: AstHandler;
    private _testRunnerHandler: TestRunnerHandler;

    constructor(astHandler: AstHandler, testRunnerHandler: TestRunnerHandler) {
        this._astHandler = astHandler;
        this._testRunnerHandler = testRunnerHandler;
    }

    /**
     * Runs tests with Jacoco coverage analysis
     * If autoImprove is true, automatically improves coverage until target is met
     */
    async runTestWithCoverage(
        testClassName: string,
        sourceFilePath: string | undefined,
        testFilePath: string | undefined,
        selectedMethods: string[] | undefined,
        autoImprove: boolean,
        improvementIteration: number,
        userCoverageTarget: number | undefined,
        context: HandlerContext
    ): Promise<void> {
        const maxImprovements = 5; // Maximum improvement iterations

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            context.postMessage({
                command: 'coverageError',
                error: 'No workspace folder found'
            });
            return;
        }

        // Validate test class name
        if (!this._testRunnerHandler.validateTestClassName(testClassName)) {
            context.postMessage({
                command: 'coverageError',
                error: 'Invalid test class name'
            });
            return;
        }

        const iterationMsg = improvementIteration > 0
            ? ` (Improvement ${improvementIteration}/${maxImprovements})`
            : '';

        context.postMessage({
            command: 'coverageRunning',
            iteration: improvementIteration
        });

        try {
            const jacocoRunner = new JacocoRunner(workspaceFolder);

            // No need to check if Jacoco is configured!
            // The extension will automatically inject Jacoco via command line if needed
            console.log('[CoverageHandler] Running tests with coverage (auto-injection enabled)');

            const result = await jacocoRunner.runTestsWithCoverage(testClassName);

            if (result.success && result.coverage) {
                // Use user-defined coverage target or fallback to settings
                const targetCoverage = userCoverageTarget ?? context.settings.getCoverageTarget();
                const meetsTarget = result.coverage.overallCoverage >= targetCoverage;

                context.postMessage({
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
                        await this.improveCoverageAndRerun(
                            sourceFilePath,
                            testFilePath,
                            selectedMethods || [],
                            result.coverage,
                            targetCoverage,
                            testClassName,
                            improvementIteration + 1,
                            context
                        );
                    }
                }
            } else {
                context.postMessage({
                    command: 'coverageError',
                    error: result.error || 'Coverage analysis failed'
                });
                vscode.window.showErrorMessage(`Coverage analysis failed: ${result.error}`);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            context.postMessage({
                command: 'coverageError',
                error: message
            });
            vscode.window.showErrorMessage(`Coverage analysis failed: ${message}`);
        }
    }

    /**
     * Improves coverage and reruns coverage analysis
     */
    async improveCoverageAndRerun(
        sourceFilePath: string,
        testFilePath: string,
        selectedMethods: string[],
        currentCoverage: JacocoCoverageResult,
        targetCoverage: number,
        testClassName: string,
        iteration: number,
        context: HandlerContext
    ): Promise<void> {
        context.postMessage({
            command: 'improvingCoverage',
            iteration
        });

        try {
            // Call improve coverage API
            await this.improveCoverage(
                sourceFilePath,
                testFilePath,
                selectedMethods,
                currentCoverage,
                targetCoverage,
                context
            );

            // Wait for user to apply changes or auto-apply
            // For now, we'll assume auto-apply
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Re-run coverage
            await this.runTestWithCoverage(
                testClassName,
                sourceFilePath,
                testFilePath,
                selectedMethods,
                true, // Continue auto-improving
                iteration,
                targetCoverage,
                context
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Coverage improvement failed: ${message}`);
        }
    }

    /**
     * Checks if Jacoco is configured in the project
     */
    async checkJacocoConfig(context: HandlerContext): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            context.postMessage({
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

            context.postMessage({
                command: 'jacocoConfigResult',
                configured: isConfigured,
                buildTool
            });
        } catch (error) {
            context.postMessage({
                command: 'jacocoConfigResult',
                configured: false,
                error: 'Failed to check Jacoco configuration'
            });
        }
    }

    /**
     * Opens the HTML coverage report
     */
    async openCoverageReport(context: HandlerContext): Promise<void> {
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
    async improveCoverage(
        sourceFilePath: string,
        testFilePath: string | null,
        selectedMethods: string[],
        currentCoverage: JacocoCoverageResult,
        targetCoverage: number,
        context: HandlerContext
    ): Promise<void> {
        if (!sourceFilePath) {
            context.postMessage({
                command: 'improveCoverageError',
                error: 'Source file path is required'
            });
            return;
        }

        context.postMessage({ command: 'improveCoverageStarted' });

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
            let astData = this._astHandler.lastAnalysis;
            if (!astData || this._astHandler.lastAnalyzedFilePath !== sourceFilePath) {
                astData = context.javaAstAnalyzer.analyze(sourceContent);
                this._astHandler.setLastAnalysis(astData, sourceFilePath);
            }

            const testPackageMatch = testContent.match(/^\s*package\s+([\w.]+)\s*;/m);
            const testPackageName = testPackageMatch ? testPackageMatch[1] : '';

            // Call API to improve coverage
            const response = await context.apiClient.improveCoverage({
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
                context.postMessage({
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
                context.postMessage({
                    command: 'improveCoverageError',
                    error: 'Failed to generate coverage improvements'
                });
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            context.postMessage({
                command: 'improveCoverageError',
                error: message
            });
            vscode.window.showErrorMessage(`Coverage improvement failed: ${message}`);
        }
    }

    /**
     * Applies improved test code to the test file
     */
    async applyImprovement(testFilePath: string, testCode: string, context: HandlerContext): Promise<void> {
        if (!testFilePath || !testCode) {
            context.postMessage({
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

            context.postMessage({
                command: 'applyImprovementSuccess',
                testFilePath
            });

            vscode.window.showInformationMessage('Improved test code applied. Re-run coverage to verify.');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            context.postMessage({
                command: 'applyImprovementError',
                error: message
            });
            vscode.window.showErrorMessage(`Failed to apply improvement: ${message}`);
        }
    }
}
