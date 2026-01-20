import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { extractMethods, extractClassInfo, extractImports, JavaMethod } from './javaParser';

/**
 * Cached AST entry structure
 */
export interface CachedAstEntry {
    filePath: string;
    fileHash: string;
    analyzedAt: string;
    ast: AstAnalysisData;
}

/**
 * AST analysis data structure
 */
export interface AstAnalysisData {
    className: string;
    packageName: string;
    methodCount: number;
    publicMethods: string[];
    privateMethods: string[];
    protectedMethods: string[];
    methods: JavaMethod[];
    dependencies: string[];
    imports: string[];
    annotations: string[];
    injectedBeans: string[];
    complexity: {
        cyclomaticComplexity: number;
        linesOfCode: number;
        methodComplexities: Record<string, number>;
    };
}

/**
 * Cache check result
 */
export interface CacheCheckResult {
    hasCachedAst: boolean;
    astData: CachedAstEntry | null;
    isFileModified: boolean;
}

/**
 * Manages AST analysis caching using VS Code workspaceState
 */
export class AstCacheManager {
    private static readonly CACHE_KEY = 'astCache';
    private workspaceState: vscode.Memento;

    constructor(workspaceState: vscode.Memento) {
        this.workspaceState = workspaceState;
    }

    /**
     * Generates MD5 hash of file content for change detection
     */
    private generateFileHash(content: string): string {
        return crypto.createHash('md5').update(content).digest('hex');
    }

    /**
     * Gets the relative path from workspace root
     */
    private getRelativePath(filePath: string): string {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            const workspacePath = workspaceFolder.uri.fsPath;
            if (filePath.startsWith(workspacePath)) {
                return filePath.substring(workspacePath.length + 1);
            }
        }
        return filePath;
    }

    /**
     * Checks if cached AST exists and whether file has been modified
     */
    async checkCache(filePath: string, currentContent: string): Promise<CacheCheckResult> {
        const relativePath = this.getRelativePath(filePath);
        const cache = this.workspaceState.get<Record<string, CachedAstEntry>>(AstCacheManager.CACHE_KEY, {});
        const cachedEntry = cache[relativePath];

        if (!cachedEntry) {
            return {
                hasCachedAst: false,
                astData: null,
                isFileModified: false
            };
        }

        const currentHash = this.generateFileHash(currentContent);
        const isFileModified = cachedEntry.fileHash !== currentHash;

        return {
            hasCachedAst: true,
            astData: cachedEntry,
            isFileModified
        };
    }

    /**
     * Analyzes Java source code and extracts AST data
     */
    private analyzeAst(filePath: string, content: string): AstAnalysisData {
        const classInfo = extractClassInfo(content);
        const methods = extractMethods(content);
        const imports = extractImports(content);

        // Categorize methods by visibility
        const publicMethods = methods.filter(m => m.modifiers.includes('public')).map(m => m.name);
        const privateMethods = methods.filter(m => m.modifiers.includes('private')).map(m => m.name);
        const protectedMethods = methods.filter(m => m.modifiers.includes('protected')).map(m => m.name);

        // Extract annotations
        const annotations = this.extractAnnotations(content);

        // Extract injected beans (fields with @Autowired, @Inject, etc.)
        const injectedBeans = this.extractInjectedBeans(content);

        // Extract dependencies from imports
        const dependencies = this.extractDependencies(imports);

        // Calculate complexity
        const complexity = this.calculateComplexity(content, methods);

        return {
            className: classInfo?.name || '',
            packageName: classInfo?.packageName || '',
            methodCount: methods.length,
            publicMethods,
            privateMethods,
            protectedMethods,
            methods,
            dependencies,
            imports,
            annotations,
            injectedBeans,
            complexity
        };
    }

    /**
     * Extracts class-level annotations
     */
    private extractAnnotations(content: string): string[] {
        const annotations: string[] = [];
        const annotationRegex = /@(\w+)(?:\([^)]*\))?/g;
        const classMatch = content.match(/(?:@\w+(?:\([^)]*\))?\s*)*(?:public\s+)?(?:abstract\s+)?class\s+\w+/);

        if (classMatch) {
            const classDeclaration = classMatch[0];
            let match;
            while ((match = annotationRegex.exec(classDeclaration)) !== null) {
                annotations.push('@' + match[1]);
            }
        }

        return annotations;
    }

    /**
     * Extracts injected beans (fields with DI annotations)
     */
    private extractInjectedBeans(content: string): string[] {
        const beans: string[] = [];
        const diAnnotations = ['@Autowired', '@Inject', '@Resource', '@Value'];
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Check if line contains DI annotation
            if (diAnnotations.some(ann => line.includes(ann))) {
                // Look for field declaration on next line or same line
                const fieldLine = line.includes(';') ? line : (lines[i + 1] || '').trim();
                const fieldMatch = fieldLine.match(/(?:private|protected|public)?\s*(\w+(?:<[^>]+>)?)\s+(\w+)\s*[;=]/);

                if (fieldMatch) {
                    beans.push(fieldMatch[1]); // Add the type name
                }
            }
        }

        return [...new Set(beans)]; // Remove duplicates
    }

    /**
     * Extracts project dependencies from imports
     */
    private extractDependencies(imports: string[]): string[] {
        const dependencies: string[] = [];
        const projectImports = imports.filter(imp =>
            !imp.startsWith('java.') &&
            !imp.startsWith('javax.') &&
            !imp.startsWith('org.junit') &&
            !imp.startsWith('org.mockito') &&
            !imp.startsWith('org.springframework.test')
        );

        for (const imp of projectImports) {
            // Extract class name from import
            const parts = imp.split('.');
            const className = parts[parts.length - 1];
            if (className !== '*') {
                dependencies.push(className);
            }
        }

        return [...new Set(dependencies)];
    }

    /**
     * Calculates code complexity metrics
     */
    private calculateComplexity(content: string, methods: JavaMethod[]): AstAnalysisData['complexity'] {
        const lines = content.split('\n');
        const linesOfCode = lines.filter(line =>
            line.trim() !== '' &&
            !line.trim().startsWith('//') &&
            !line.trim().startsWith('/*') &&
            !line.trim().startsWith('*')
        ).length;

        // Calculate cyclomatic complexity
        const methodComplexities: Record<string, number> = {};
        let totalComplexity = 0;

        for (const method of methods) {
            const methodLines = lines.slice(method.startLine - 1, method.endLine);
            const methodContent = methodLines.join('\n');

            // Count decision points: if, else if, while, for, case, catch, &&, ||, ?:
            const decisionPoints = [
                (methodContent.match(/\bif\s*\(/g) || []).length,
                (methodContent.match(/\belse\s+if\s*\(/g) || []).length,
                (methodContent.match(/\bwhile\s*\(/g) || []).length,
                (methodContent.match(/\bfor\s*\(/g) || []).length,
                (methodContent.match(/\bcase\s+/g) || []).length,
                (methodContent.match(/\bcatch\s*\(/g) || []).length,
                (methodContent.match(/&&/g) || []).length,
                (methodContent.match(/\|\|/g) || []).length,
                (methodContent.match(/\?[^:]*:/g) || []).length
            ].reduce((a, b) => a + b, 0);

            const complexity = 1 + decisionPoints; // Base complexity is 1
            methodComplexities[method.name] = complexity;
            totalComplexity += complexity;
        }

        return {
            cyclomaticComplexity: totalComplexity,
            linesOfCode,
            methodComplexities
        };
    }

    /**
     * Analyzes AST and saves to cache
     */
    async analyzeAndSave(filePath: string, content: string): Promise<CachedAstEntry> {
        const relativePath = this.getRelativePath(filePath);
        const fileHash = this.generateFileHash(content);
        const ast = this.analyzeAst(filePath, content);

        const entry: CachedAstEntry = {
            filePath: relativePath,
            fileHash,
            analyzedAt: new Date().toISOString(),
            ast
        };

        // Get existing cache and update
        const cache = this.workspaceState.get<Record<string, CachedAstEntry>>(AstCacheManager.CACHE_KEY, {});
        cache[relativePath] = entry;
        await this.workspaceState.update(AstCacheManager.CACHE_KEY, cache);

        return entry;
    }

    /**
     * Clears cache and re-analyzes
     */
    async reanalyze(filePath: string, content: string): Promise<CachedAstEntry> {
        await this.clearCache(filePath);
        return this.analyzeAndSave(filePath, content);
    }

    /**
     * Clears cache for specific file or all files
     */
    async clearCache(filePath?: string): Promise<void> {
        if (filePath) {
            const relativePath = this.getRelativePath(filePath);
            const cache = this.workspaceState.get<Record<string, CachedAstEntry>>(AstCacheManager.CACHE_KEY, {});
            delete cache[relativePath];
            await this.workspaceState.update(AstCacheManager.CACHE_KEY, cache);
        } else {
            await this.workspaceState.update(AstCacheManager.CACHE_KEY, {});
        }
    }

    /**
     * Gets cached AST without checking file modification
     */
    async getCachedAst(filePath: string): Promise<CachedAstEntry | null> {
        const relativePath = this.getRelativePath(filePath);
        const cache = this.workspaceState.get<Record<string, CachedAstEntry>>(AstCacheManager.CACHE_KEY, {});
        return cache[relativePath] || null;
    }

    /**
     * Gets all cached file paths
     */
    getAllCachedFiles(): string[] {
        const cache = this.workspaceState.get<Record<string, CachedAstEntry>>(AstCacheManager.CACHE_KEY, {});
        return Object.keys(cache);
    }

    /**
     * Gets cache statistics
     */
    getCacheStats(): { totalFiles: number; totalMethods: number } {
        const cache = this.workspaceState.get<Record<string, CachedAstEntry>>(AstCacheManager.CACHE_KEY, {});
        const entries = Object.values(cache);

        return {
            totalFiles: entries.length,
            totalMethods: entries.reduce((sum, entry) => sum + entry.ast.methodCount, 0)
        };
    }
}
