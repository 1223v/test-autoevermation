import * as vscode from 'vscode';
import { HandlerContext } from './types';

/**
 * Handles file selection and method extraction operations
 */
export class FileHandler {
    /**
     * Opens a file dialog to select a Java file
     */
    async selectFile(context: HandlerContext): Promise<void> {
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

            context.postMessage({
                command: 'fileSelected',
                filePath: filePath,
                fileName: fileName
            });
        }
    }

    /**
     * Uses the currently active editor file
     */
    async useCurrentFile(context: HandlerContext): Promise<void> {
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

        context.postMessage({
            command: 'fileSelected',
            filePath: filePath,
            fileName: fileName
        });
    }

    /**
     * Handles a dropped file URI
     */
    async handleDroppedUri(uriString: string, context: HandlerContext): Promise<void> {
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
            context.postMessage({
                command: 'fileSelected',
                filePath: filePath,
                fileName: fileName
            });
        } catch (error) {
            vscode.window.showErrorMessage('Failed to process dropped file');
        }
    }

    /**
     * Extracts methods from a Java file using AST analysis
     */
    async extractMethods(filePath: string, context: HandlerContext): Promise<void> {
        try {
            const uri = vscode.Uri.file(filePath);
            const contentBuffer = await vscode.workspace.fs.readFile(uri);
            const content = new TextDecoder().decode(contentBuffer);

            // Use JavaAstAnalyzer to extract methods
            const analysis = context.javaAstAnalyzer.analyze(content);

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

            context.postMessage({
                command: 'methodsLoaded',
                methods: methods
            });
        } catch (error) {
            context.postMessage({
                command: 'methodsLoaded',
                methods: []
            });
            vscode.window.showErrorMessage('Failed to extract methods from file');
        }
    }
}
