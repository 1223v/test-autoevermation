import * as vscode from 'vscode';
import { ApiClient } from '../../api/client';
import { SettingsManager } from '../../config/settings';
import { JavaAstAnalyzer, FullAnalysisResult } from '../../services/javaAstAnalyzer';

/**
 * Context provided to message handlers for accessing shared resources
 */
export interface HandlerContext {
    /** The webview view instance */
    view: vscode.WebviewView | undefined;
    /** API client for backend communication */
    apiClient: ApiClient;
    /** Settings manager for extension configuration */
    settings: SettingsManager;
    /** Java AST analyzer instance */
    javaAstAnalyzer: JavaAstAnalyzer;
    /** Function to post messages to the webview */
    postMessage: (message: any) => void;
}

/**
 * Interface for message handlers
 */
export interface MessageHandler {
    /**
     * Handles a message from the webview
     * @param message The message received from the webview
     * @param context The handler context with shared resources
     */
    handle(message: any, context: HandlerContext): Promise<void>;
}

/**
 * AST cache entry for tracking analyzed files
 */
export interface AstCacheEntry {
    filePath: string;
    fileHash: string;
    analyzedAt: string;
    ast: FullAnalysisResult;
}
