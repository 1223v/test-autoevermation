import * as vscode from 'vscode';
import { HandlerContext } from './types';
import { AstHandler } from './astHandler';
import { getUserFriendlyErrorMessage } from '../../api/errors';

/**
 * Handles testability checking operations
 */
export class TestabilityHandler {
    private _astHandler: AstHandler;

    constructor(astHandler: AstHandler) {
        this._astHandler = astHandler;
    }

    /**
     * Checks if the selected methods are testable
     */
    async checkTestability(
        filePath: string,
        selectedMethods: string[],
        context: HandlerContext
    ): Promise<void> {
        if (!filePath || !selectedMethods || selectedMethods.length === 0) {
            context.postMessage({
                command: 'testabilityError',
                error: 'No file or methods selected'
            });
            return;
        }

        context.postMessage({ command: 'testabilityChecking' });

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

            const response = await context.apiClient.checkTestability({
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

            context.postMessage({
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
            context.postMessage({
                command: 'testabilityError',
                error: message
            });
            vscode.window.showErrorMessage(`Testability check failed: ${message}`);
        }
    }
}
