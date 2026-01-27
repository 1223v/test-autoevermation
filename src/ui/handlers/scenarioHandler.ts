import * as vscode from 'vscode';
import { HandlerContext } from './types';
import { AstHandler } from './astHandler';
import { getUserFriendlyErrorMessage } from '../../api/errors';

/**
 * Handles test scenario generation operations
 */
export class ScenarioHandler {
    private _astHandler: AstHandler;

    constructor(astHandler: AstHandler) {
        this._astHandler = astHandler;
    }

    /**
     * Generates test scenarios for the selected methods
     */
    async generateScenarios(
        filePath: string,
        selectedMethods: string[] | undefined,
        context: HandlerContext
    ): Promise<void> {
        if (!filePath) {
            context.postMessage({
                command: 'scenarioError',
                error: 'No file selected'
            });
            return;
        }

        context.postMessage({ command: 'scenarioGenerating' });

        try {
            const uri = vscode.Uri.file(filePath);
            const contentBuffer = await vscode.workspace.fs.readFile(uri);
            const content = new TextDecoder().decode(contentBuffer);
            const fileName = filePath.split(/[/\\]/).pop() || '';

            // Get or analyze AST data using java-ast
            let astData = this._astHandler.lastAnalysis;
            if (!astData || this._astHandler.lastAnalyzedFilePath !== filePath) {
                astData = context.javaAstAnalyzer.analyze(content);
                this._astHandler.setLastAnalysis(astData, filePath);
            }

            // Call API to generate scenarios
            const response = await context.apiClient.generateScenarios({
                sourceFile: {
                    fileName,
                    packageName: astData.packageName,
                    content
                },
                options: {
                    testFramework: context.settings.getTestFramework(),
                    mockingFramework: context.settings.getMockingFramework(),
                    coverageTarget: context.settings.getCoverageTarget(),
                    includeEdgeCases: context.settings.includeEdgeCases()
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

            context.postMessage({
                command: 'scenarioGenerated',
                scenarios: response.scenarios
            });
        } catch (error) {
            const message = getUserFriendlyErrorMessage(error);
            // Reset button state
            context.postMessage({
                command: 'scenarioError'
            });
            // Show VS Code notification
            vscode.window.showErrorMessage(`Scenario generation failed: ${message}`);
        }
    }

    /**
     * Regenerates test scenarios with user feedback (Self-Refine pattern)
     */
    async regenerateScenarios(
        filePath: string,
        selectedMethods: string[] | undefined,
        previousScenarios: string,
        feedback: string,
        context: HandlerContext
    ): Promise<void> {
        if (!filePath) {
            context.postMessage({
                command: 'scenarioError',
                error: 'No file selected'
            });
            return;
        }

        context.postMessage({ command: 'scenarioGenerating' });

        try {
            const uri = vscode.Uri.file(filePath);
            const contentBuffer = await vscode.workspace.fs.readFile(uri);
            const content = new TextDecoder().decode(contentBuffer);
            const fileName = filePath.split(/[/\\]/).pop() || '';

            // Get or analyze AST data using java-ast
            let astData = this._astHandler.lastAnalysis;
            if (!astData || this._astHandler.lastAnalyzedFilePath !== filePath) {
                astData = context.javaAstAnalyzer.analyze(content);
                this._astHandler.setLastAnalysis(astData, filePath);
            }

            // Call API to generate scenarios with feedback
            const response = await context.apiClient.generateScenarios({
                sourceFile: {
                    fileName,
                    packageName: astData.packageName,
                    content
                },
                options: {
                    testFramework: context.settings.getTestFramework(),
                    mockingFramework: context.settings.getMockingFramework(),
                    coverageTarget: context.settings.getCoverageTarget(),
                    includeEdgeCases: context.settings.includeEdgeCases()
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
                },
                previousScenarios,
                feedback
            });

            context.postMessage({
                command: 'scenarioGenerated',
                scenarios: response.scenarios
            });
        } catch (error) {
            const message = getUserFriendlyErrorMessage(error);
            // Reset button state
            context.postMessage({
                command: 'scenarioError'
            });
            // Show VS Code notification
            vscode.window.showErrorMessage(`Scenario regeneration failed: ${message}`);
        }
    }
}
