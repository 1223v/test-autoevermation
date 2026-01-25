import * as vscode from 'vscode';
import { HandlerContext, AstCacheEntry } from './types';
import { FullAnalysisResult } from '../../services/javaAstAnalyzer';

/**
 * Handles AST analysis operations
 */
export class AstHandler {
    private _lastAnalysis: FullAnalysisResult | null = null;
    private _lastAnalyzedFilePath: string | null = null;

    /**
     * Gets the last analysis result
     */
    get lastAnalysis(): FullAnalysisResult | null {
        return this._lastAnalysis;
    }

    /**
     * Gets the last analyzed file path
     */
    get lastAnalyzedFilePath(): string | null {
        return this._lastAnalyzedFilePath;
    }

    /**
     * Sets the last analysis result (for external updates)
     */
    setLastAnalysis(analysis: FullAnalysisResult | null, filePath: string | null): void {
        this._lastAnalysis = analysis;
        this._lastAnalyzedFilePath = filePath;
    }

    /**
     * Checks if AST analysis exists for the given file
     * Note: No caching - always fresh analysis
     */
    async checkAstCache(filePath: string, context: HandlerContext): Promise<void> {
        // No caching - always indicate that analysis is needed
        // But if we have a recent analysis for this file, use it
        const hasRecentAnalysis = this._lastAnalyzedFilePath === filePath && this._lastAnalysis !== null;

        context.postMessage({
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
    async analyzeAst(filePath: string, context: HandlerContext): Promise<void> {
        context.postMessage({ command: 'astAnalyzing' });

        try {
            const uri = vscode.Uri.file(filePath);
            const contentBuffer = await vscode.workspace.fs.readFile(uri);
            const content = new TextDecoder().decode(contentBuffer);

            // Analyze using local java-ast (no server required)
            const analysis = context.javaAstAnalyzer.analyze(content);
            this._lastAnalysis = analysis;
            this._lastAnalyzedFilePath = filePath;

            // Format response for backward compatibility with webview
            const astEntry: AstCacheEntry = {
                filePath: filePath,
                fileHash: '',
                analyzedAt: new Date().toISOString(),
                ast: analysis
            };

            context.postMessage({
                command: 'astAnalyzed',
                astData: astEntry
            });

            vscode.window.showInformationMessage(
                `AST analysis completed: ${analysis.methodCount} methods found`
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            context.postMessage({
                command: 'astAnalyzeError',
                error: message
            });
            vscode.window.showErrorMessage(`AST analysis failed: ${message}`);
        }
    }

    /**
     * Re-analyzes AST (same as analyzeAst since there's no caching)
     */
    async reanalyzeAst(filePath: string, context: HandlerContext): Promise<void> {
        // With no caching, reanalyze is the same as analyze
        await this.analyzeAst(filePath, context);
    }

    /**
     * Uses last analyzed AST data (confirms selection)
     */
    async useCachedAst(filePath: string, context: HandlerContext): Promise<void> {
        if (this._lastAnalysis && this._lastAnalyzedFilePath === filePath) {
            const astEntry: AstCacheEntry = {
                filePath: filePath,
                fileHash: '',
                analyzedAt: new Date().toISOString(),
                ast: this._lastAnalysis
            };

            context.postMessage({
                command: 'astSelected',
                astData: astEntry
            });
        } else {
            // Analyze on demand if no recent analysis
            await this.analyzeAst(filePath, context);
        }
    }

    /**
     * Gets the currently analyzed AST data for API requests
     */
    async getSelectedAstData(filePath: string, context: HandlerContext): Promise<{ filePath: string; ast: FullAnalysisResult } | null> {
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

            const analysis = context.javaAstAnalyzer.analyze(content);
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
}
