/**
 * Java AST Analyzer using java-ast npm package (ANTLR4 based)
 * TypeScript version of ast_analyze.py - complete implementation
 *
 * Features:
 * - Constructor-based dependency extraction
 * - Method code extraction
 * - Dependency class analysis (finds and analyzes injected classes)
 * - Used dependency methods extraction
 * - Selected methods analysis support
 */

import { parse, createVisitor, ParseTree } from 'java-ast';
import {
    ClassDeclarationContext,
    MethodDeclarationContext,
    ConstructorDeclarationContext,
    FieldDeclarationContext,
    ImportDeclarationContext,
    PackageDeclarationContext,
    ClassBodyDeclarationContext
} from 'java-ast/dist/parser/JavaParser';
import * as vscode from 'vscode';
import * as path from 'path';

// ============================================================
// Interfaces
// ============================================================

export interface MethodParameter {
    name: string;
    type: string;
}

export interface InjectedField {
    name: string;
    type: string;
}

export interface DependencyMethod {
    name: string;
    signature: string;
    returnType: string;
    parameters: MethodParameter[];
}

export interface UsedDependencyMethod {
    fieldName: string;
    classType: string;
    methodName: string;
    signature: string;
    returnType: string;
    parameters: MethodParameter[];
}

export interface ComplexityHints {
    conditionalBranchesCount: number;
    exceptionHandlersCount: number;
}

export interface MethodAnalysis {
    methodName: string;
    methodSignature: string;
    parameters: MethodParameter[];
    returnType: string;
    targetMethodCode: string;
    complexityHints: ComplexityHints;
    usedDependencyMethods?: UsedDependencyMethod[];
}

export interface FullAnalysisResult {
    className: string;
    packageName: string;
    classAnnotations: string[];
    injectedFields: InjectedField[];
    imports: string[];
    fullClassCode: string;
    methods: MethodAnalysis[];
    // Extended fields for UI compatibility
    methodCount: number;
    publicMethods: string[];
    privateMethods: string[];
    protectedMethods: string[];
    dependencies: string[];
    annotations: string[];
    injectedBeans: string[];
    complexity: {
        cyclomaticComplexity: number;
        linesOfCode: number;
        methodComplexities: Record<string, number>;
    };
    // All fields for View Details
    fields: Array<{ name: string; type: string; annotations: string[] }>;
}

// ============================================================
// File System Interface (for testability and VS Code integration)
// ============================================================

export interface FileSystem {
    readFile(filePath: string): Promise<string>;
    exists(filePath: string): Promise<boolean>;
    findFiles(pattern: string, baseDir: string): Promise<string[]>;
}

/**
 * VS Code File System implementation
 */
export class VSCodeFileSystem implements FileSystem {
    async readFile(filePath: string): Promise<string> {
        const uri = vscode.Uri.file(filePath);
        const content = await vscode.workspace.fs.readFile(uri);
        return new TextDecoder().decode(content);
    }

    async exists(filePath: string): Promise<boolean> {
        try {
            const uri = vscode.Uri.file(filePath);
            await vscode.workspace.fs.stat(uri);
            return true;
        } catch {
            return false;
        }
    }

    async findFiles(pattern: string, baseDir: string): Promise<string[]> {
        const relativePattern = new vscode.RelativePattern(baseDir, pattern);
        const files = await vscode.workspace.findFiles(relativePattern);
        return files.map(f => f.fsPath);
    }
}

// ============================================================
// Main Analyzer Class
// ============================================================

/**
 * Java AST Analyzer - TypeScript version of ast_analyze.py
 * Analyzes Java source code for test generation
 */
export class JavaAstAnalyzer {
    private projectRoot: string | null = null;
    private currentImports: string[] = [];
    private fileSystem: FileSystem;

    constructor(fileSystem?: FileSystem) {
        this.fileSystem = fileSystem || new VSCodeFileSystem();
    }

    /**
     * Analyze Java source code for test generation
     *
     * @param filePath Path to the Java file
     * @param sourceCode Source code content
     * @param methodNames Optional: specific method names to analyze (null = all methods)
     * @returns Full analysis result
     */
    async analyzeForTest(
        filePath: string,
        sourceCode: string,
        methodNames?: string[] | string | null
    ): Promise<FullAnalysisResult> {
        // Set project root for dependency analysis
        this.setProjectRoot(filePath);

        // Parse AST
        const ast = parse(sourceCode);

        // Extract basic info
        const className = this.extractClassName(ast);
        const packageName = this.extractPackageName(ast);
        const classAnnotations = this.extractClassAnnotations(ast, sourceCode);
        const imports = this.extractImports(ast);
        this.currentImports = imports;

        // Extract dependencies (from constructor or @Autowired fields)
        const injectedFields = this.extractConstructorDependencies(sourceCode, ast);

        // If no constructor dependencies, fall back to @Autowired fields
        const finalInjectedFields = injectedFields.length > 0
            ? injectedFields
            : this.extractAnnotatedFields(ast);

        // Analyze dependency class methods
        const dependencyMethods = await this.analyzeDependencyMethods(finalInjectedFields);

        // Extract all methods info
        const allMethodsInfo = this.extractAllMethods(ast, sourceCode);

        // Determine which methods to analyze
        let methodsToAnalyze: MethodAnalysis[] = [];

        if (methodNames === null || methodNames === undefined) {
            // Analyze all methods
            for (const methodInfo of allMethodsInfo) {
                try {
                    const methodCode = this.extractMethodCode(sourceCode, methodInfo.name);
                    const complexityHints = this.calculateComplexityHints(methodCode);
                    const usedMethods = this.extractUsedDependencyMethods(
                        methodCode, finalInjectedFields, dependencyMethods
                    );

                    methodsToAnalyze.push({
                        methodName: methodInfo.name,
                        methodSignature: methodInfo.signature,
                        parameters: methodInfo.parameters,
                        returnType: methodInfo.returnType,
                        targetMethodCode: methodCode,
                        complexityHints,
                        usedDependencyMethods: usedMethods.length > 0 ? usedMethods : undefined
                    });
                } catch (e) {
                    console.warn(`Warning: Failed to analyze method ${methodInfo.name}:`, e);
                }
            }
        } else {
            // Analyze selected methods
            const names = Array.isArray(methodNames) ? methodNames : [methodNames];
            for (const methodInfo of allMethodsInfo) {
                if (names.includes(methodInfo.name)) {
                    try {
                        const methodCode = this.extractMethodCode(sourceCode, methodInfo.name);
                        const complexityHints = this.calculateComplexityHints(methodCode);
                        const usedMethods = this.extractUsedDependencyMethods(
                            methodCode, finalInjectedFields, dependencyMethods
                        );

                        methodsToAnalyze.push({
                            methodName: methodInfo.name,
                            methodSignature: methodInfo.signature,
                            parameters: methodInfo.parameters,
                            returnType: methodInfo.returnType,
                            targetMethodCode: methodCode,
                            complexityHints,
                            usedDependencyMethods: usedMethods.length > 0 ? usedMethods : undefined
                        });
                    } catch (e) {
                        console.warn(`Warning: Failed to analyze method ${methodInfo.name}:`, e);
                    }
                }
            }
        }

        // Calculate overall complexity
        const complexity = this.calculateOverallComplexity(sourceCode, allMethodsInfo);

        // Extract all fields for View Details
        const allFields = this.extractAllFields(ast);

        return {
            className,
            packageName,
            classAnnotations,
            injectedFields: finalInjectedFields,
            imports,
            fullClassCode: sourceCode,
            methods: methodsToAnalyze,
            // Extended fields for UI
            methodCount: allMethodsInfo.length,
            publicMethods: allMethodsInfo.filter(m => m.modifiers.includes('public')).map(m => m.name),
            privateMethods: allMethodsInfo.filter(m => m.modifiers.includes('private')).map(m => m.name),
            protectedMethods: allMethodsInfo.filter(m => m.modifiers.includes('protected')).map(m => m.name),
            dependencies: this.extractDependencyClassNames(imports),
            annotations: classAnnotations,
            injectedBeans: finalInjectedFields.map(f => f.type),
            complexity,
            fields: allFields
        };
    }

    /**
     * Simple analyze for UI display (without dependency analysis)
     */
    analyze(sourceCode: string): FullAnalysisResult {
        const ast = parse(sourceCode);

        const className = this.extractClassName(ast);
        const packageName = this.extractPackageName(ast);
        const classAnnotations = this.extractClassAnnotations(ast, sourceCode);
        const imports = this.extractImports(ast);

        const injectedFields = this.extractConstructorDependencies(sourceCode, ast);
        const finalInjectedFields = injectedFields.length > 0
            ? injectedFields
            : this.extractAnnotatedFields(ast);

        const allMethodsInfo = this.extractAllMethods(ast, sourceCode);
        const complexity = this.calculateOverallComplexity(sourceCode, allMethodsInfo);
        const allFields = this.extractAllFields(ast);

        // Build simple method analysis without dependency analysis
        const methods: MethodAnalysis[] = allMethodsInfo.map(m => {
            const methodCode = this.extractMethodCode(sourceCode, m.name);
            return {
                methodName: m.name,
                methodSignature: m.signature,
                parameters: m.parameters,
                returnType: m.returnType,
                targetMethodCode: methodCode,
                complexityHints: this.calculateComplexityHints(methodCode)
            };
        });

        return {
            className,
            packageName,
            classAnnotations,
            injectedFields: finalInjectedFields,
            imports,
            fullClassCode: sourceCode,
            methods,
            methodCount: allMethodsInfo.length,
            publicMethods: allMethodsInfo.filter(m => m.modifiers.includes('public')).map(m => m.name),
            privateMethods: allMethodsInfo.filter(m => m.modifiers.includes('private')).map(m => m.name),
            protectedMethods: allMethodsInfo.filter(m => m.modifiers.includes('protected')).map(m => m.name),
            dependencies: this.extractDependencyClassNames(imports),
            annotations: classAnnotations,
            injectedBeans: finalInjectedFields.map(f => f.type),
            complexity,
            fields: allFields
        };
    }

    // ============================================================
    // Project Root Detection
    // ============================================================

    /**
     * Set project root based on file path
     * Looks for src/main/java or src/test/java
     */
    private setProjectRoot(filePath: string): void {
        const parts = filePath.split(path.sep);

        // Find src/main/java or src/test/java
        for (let i = parts.length - 1; i >= 0; i--) {
            if (parts[i] === 'java' && i >= 2) {
                if ((parts[i-1] === 'main' || parts[i-1] === 'test') && parts[i-2] === 'src') {
                    this.projectRoot = parts.slice(0, i - 2).join(path.sep);
                    return;
                }
            }
        }

        // Fallback: parent of file directory
        this.projectRoot = path.dirname(path.dirname(filePath));
    }

    // ============================================================
    // Class Information Extraction
    // ============================================================

    private extractClassName(ast: ParseTree): string {
        let className = '';
        createVisitor({
            visitClassDeclaration: (ctx: ClassDeclarationContext) => {
                if (!className) {
                    className = ctx.IDENTIFIER().text;
                }
            }
        }).visit(ast);
        return className;
    }

    private extractPackageName(ast: ParseTree): string {
        let packageName = '';
        createVisitor({
            visitPackageDeclaration: (ctx: PackageDeclarationContext) => {
                packageName = ctx.qualifiedName().text;
            }
        }).visit(ast);
        return packageName;
    }

    private extractClassAnnotations(ast: ParseTree, sourceCode: string): string[] {
        const annotations: string[] = [];
        const lines = sourceCode.split('\n');

        let classStartLine = -1;
        createVisitor({
            visitClassDeclaration: (ctx: ClassDeclarationContext) => {
                if (classStartLine === -1) {
                    classStartLine = ctx.start?.line ?? -1;
                }
            }
        }).visit(ast);

        if (classStartLine > 0) {
            for (let i = 0; i < classStartLine - 1 && i < lines.length; i++) {
                const line = lines[i].trim();
                const matches = line.match(/@(\w+)(?:\([^)]*\))?/g);
                if (matches) {
                    annotations.push(...matches.map(a => a.split('(')[0]));
                }
            }
        }

        return [...new Set(annotations)];
    }

    private extractImports(ast: ParseTree): string[] {
        const imports: string[] = [];
        createVisitor({
            visitImportDeclaration: (ctx: ImportDeclarationContext) => {
                const qualifiedName = ctx.qualifiedName();
                if (qualifiedName) {
                    let importPath = qualifiedName.text;
                    if (ctx.MUL?.()) {
                        importPath += '.*';
                    }
                    imports.push(importPath);
                }
            }
        }).visit(ast);
        return imports;
    }

    // ============================================================
    // Constructor Dependency Extraction
    // ============================================================

    /**
     * Extract dependencies from constructor parameters
     * Only includes parameters that are assigned to fields (this.field = param)
     */
    private extractConstructorDependencies(sourceCode: string, ast: ParseTree): InjectedField[] {
        const dependencies: InjectedField[] = [];

        // Find constructor body
        const constructorBody = this.extractConstructorBody(sourceCode);
        if (!constructorBody) {
            return dependencies;
        }

        // Find constructor parameters
        createVisitor({
            visitConstructorDeclaration: (ctx: ConstructorDeclarationContext) => {
                const params = ctx.formalParameters()?.formalParameterList?.()?.formalParameter?.() || [];

                for (const param of params) {
                    const paramName = param.variableDeclaratorId().IDENTIFIER().text;
                    const paramType = param.typeType().text;

                    // Check if parameter is assigned to a field
                    if (this.isAssignedToField(constructorBody, paramName)) {
                        const fieldName = this.extractFieldName(constructorBody, paramName);
                        dependencies.push({
                            name: fieldName,
                            type: paramType
                        });
                    }
                }
            }
        }).visit(ast);

        return dependencies;
    }

    /**
     * Extract constructor body from source code
     */
    private extractConstructorBody(sourceCode: string): string {
        // Pattern: public ClassName(...) { ... }
        const pattern = /public\s+\w+\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\}/g;
        let match;

        while ((match = pattern.exec(sourceCode)) !== null) {
            const body = match[1];
            // If contains this.xxx = it's likely a constructor
            if (body.includes('this.')) {
                return body;
            }
        }

        return '';
    }

    /**
     * Check if parameter is assigned to a field
     */
    private isAssignedToField(constructorBody: string, paramName: string): boolean {
        const pattern = new RegExp(`this\\.\\w+\\s*=\\s*${paramName}\\s*;`);
        return pattern.test(constructorBody);
    }

    /**
     * Extract field name from this.field = param assignment
     */
    private extractFieldName(constructorBody: string, paramName: string): string {
        const pattern = new RegExp(`this\\.(\\w+)\\s*=\\s*${paramName}\\s*;`);
        const match = constructorBody.match(pattern);
        return match ? match[1] : paramName;
    }

    // ============================================================
    // @Autowired Field Extraction (fallback)
    // ============================================================

    private extractAnnotatedFields(ast: ParseTree): InjectedField[] {
        const diAnnotations = ['Autowired', 'Inject', 'Resource', 'Value'];
        const fields: InjectedField[] = [];

        createVisitor({
            visitClassBodyDeclaration: (ctx: ClassBodyDeclarationContext) => {
                const memberDecl = ctx.memberDeclaration?.();
                if (!memberDecl) return;

                const fieldDecl = memberDecl.fieldDeclaration?.();
                if (!fieldDecl) return;

                // Check for DI annotations
                const modifiers = ctx.modifier?.() || [];
                let hasDiAnnotation = false;

                for (const mod of modifiers) {
                    const classOrInterfaceMod = mod.classOrInterfaceModifier?.();
                    if (classOrInterfaceMod) {
                        const annotation = classOrInterfaceMod.annotation?.();
                        if (annotation) {
                            const annName = annotation.qualifiedName?.()?.text || '';
                            if (diAnnotations.includes(annName)) {
                                hasDiAnnotation = true;
                                break;
                            }
                        }
                    }
                }

                if (hasDiAnnotation) {
                    const type = fieldDecl.typeType().text;
                    const declarators = fieldDecl.variableDeclarators().variableDeclarator();
                    for (const decl of declarators) {
                        const name = decl.variableDeclaratorId().IDENTIFIER().text;
                        fields.push({ name, type });
                    }
                }
            }
        }).visit(ast);

        return fields;
    }

    // ============================================================
    // Method Extraction
    // ============================================================

    private extractAllMethods(ast: ParseTree, sourceCode: string): Array<{
        name: string;
        signature: string;
        returnType: string;
        parameters: MethodParameter[];
        modifiers: string[];
        startLine: number;
        endLine: number;
    }> {
        const methods: Array<{
            name: string;
            signature: string;
            returnType: string;
            parameters: MethodParameter[];
            modifiers: string[];
            startLine: number;
            endLine: number;
        }> = [];

        createVisitor({
            visitClassBodyDeclaration: (ctx: ClassBodyDeclarationContext) => {
                const memberDecl = ctx.memberDeclaration?.();
                if (!memberDecl) return;

                const methodDecl = memberDecl.methodDeclaration?.();
                if (!methodDecl) return;

                const name = methodDecl.IDENTIFIER().text;
                const returnType = this.extractReturnType(methodDecl);
                const parameters = this.extractParameters(methodDecl);
                const modifiers = this.extractModifiers(ctx);
                const startLine = methodDecl.start?.line ?? 0;
                const endLine = methodDecl.stop?.line ?? startLine;

                const signature = this.buildMethodSignature(modifiers, returnType, name, parameters);

                methods.push({
                    name,
                    signature,
                    returnType,
                    parameters,
                    modifiers,
                    startLine,
                    endLine
                });
            }
        }).visit(ast);

        return methods;
    }

    private extractReturnType(methodDecl: MethodDeclarationContext): string {
        const typeOrVoid = methodDecl.typeTypeOrVoid();
        if (!typeOrVoid) return 'void';

        const typeType = typeOrVoid.typeType?.();
        if (typeType) {
            return typeType.text || 'Object';
        }

        return typeOrVoid.VOID?.() ? 'void' : 'Object';
    }

    private extractParameters(methodDecl: MethodDeclarationContext): MethodParameter[] {
        const parameters: MethodParameter[] = [];
        const paramList = methodDecl.formalParameters()?.formalParameterList?.();

        if (paramList) {
            const params = paramList.formalParameter?.() || [];
            for (const param of params) {
                const name = param.variableDeclaratorId().IDENTIFIER().text;
                const type = param.typeType().text;
                parameters.push({ name, type });
            }

            const lastParam = paramList.lastFormalParameter?.();
            if (lastParam) {
                const name = lastParam.variableDeclaratorId().IDENTIFIER().text;
                const type = lastParam.typeType().text + '...';
                parameters.push({ name, type });
            }
        }

        return parameters;
    }

    private extractModifiers(ctx: ClassBodyDeclarationContext): string[] {
        const modifiers: string[] = [];
        const modifierList = ctx.modifier?.() || [];

        for (const mod of modifierList) {
            const classOrInterfaceMod = mod.classOrInterfaceModifier?.();
            if (classOrInterfaceMod) {
                if (classOrInterfaceMod.PUBLIC()) modifiers.push('public');
                if (classOrInterfaceMod.PRIVATE()) modifiers.push('private');
                if (classOrInterfaceMod.PROTECTED()) modifiers.push('protected');
                if (classOrInterfaceMod.STATIC()) modifiers.push('static');
                if (classOrInterfaceMod.FINAL()) modifiers.push('final');
                if (classOrInterfaceMod.ABSTRACT()) modifiers.push('abstract');
            }
        }

        return modifiers;
    }

    private buildMethodSignature(
        modifiers: string[],
        returnType: string,
        name: string,
        parameters: MethodParameter[]
    ): string {
        const modStr = modifiers.length > 0 ? modifiers.join(' ') + ' ' : 'public ';
        const paramStr = parameters.map(p => `${p.type} ${p.name}`).join(', ');
        return `${modStr}${returnType} ${name}(${paramStr})`.trim();
    }

    // ============================================================
    // Method Code Extraction
    // ============================================================

    /**
     * Extract method body from source code
     * Distinguishes between method definitions and method calls
     */
    private extractMethodCode(sourceCode: string, methodName: string): string {
        const lines = sourceCode.split('\n');
        const methodLines: string[] = [];
        let inMethod = false;
        let braceCount = 0;

        for (const line of lines) {
            if (!inMethod) {
                // Look for method definition (not a call)
                // Pattern: (modifier) + (return type) + methodName + (
                const defPattern = new RegExp(
                    `(public|private|protected|static|final|synchronized|\\w+)\\s+.*\\b${methodName}\\s*\\(`
                );

                if (defPattern.test(line)) {
                    // Make sure it's not a method call (no = or . before it)
                    const callPattern = new RegExp(`[=.].*\\b${methodName}\\s*\\(`);
                    const returnCallPattern = new RegExp(`^\\s*return\\s+.*\\b${methodName}\\s*\\(`);

                    if (!callPattern.test(line) && !returnCallPattern.test(line)) {
                        inMethod = true;
                    }
                }
            }

            if (inMethod) {
                methodLines.push(line);
                braceCount += (line.match(/\{/g) || []).length;
                braceCount -= (line.match(/\}/g) || []).length;

                // Method ends when braces are balanced
                if (braceCount === 0 && methodLines.join('').includes('{')) {
                    break;
                }
            }
        }

        return methodLines.join('\n');
    }

    // ============================================================
    // Dependency Analysis
    // ============================================================

    /**
     * Find and analyze dependency class files
     */
    private async analyzeDependencyMethods(
        injectedFields: InjectedField[]
    ): Promise<Record<string, DependencyMethod[]>> {
        const dependencyMethods: Record<string, DependencyMethod[]> = {};

        for (const field of injectedFields) {
            // Remove generics (e.g., List<String> -> List)
            const baseType = field.type.split('<')[0].trim();

            try {
                // Find dependency class file
                const classFile = await this.findDependencyClassFile(baseType);
                if (!classFile) continue;

                // Read and parse dependency class
                const depSourceCode = await this.fileSystem.readFile(classFile);
                const depAst = parse(depSourceCode);

                // Extract public methods
                const methods: DependencyMethod[] = [];
                createVisitor({
                    visitClassBodyDeclaration: (ctx: ClassBodyDeclarationContext) => {
                        const memberDecl = ctx.memberDeclaration?.();
                        if (!memberDecl) return;

                        const methodDecl = memberDecl.methodDeclaration?.();
                        if (!methodDecl) return;

                        // Check if public
                        const modifiers = this.extractModifiers(ctx);
                        if (!modifiers.includes('public')) return;

                        const name = methodDecl.IDENTIFIER().text;
                        const returnType = this.extractReturnType(methodDecl);
                        const parameters = this.extractParameters(methodDecl);
                        const signature = this.buildMethodSignature(modifiers, returnType, name, parameters);

                        methods.push({
                            name,
                            signature,
                            returnType,
                            parameters
                        });
                    }
                }).visit(depAst);

                if (methods.length > 0) {
                    dependencyMethods[baseType] = methods;
                }
            } catch (e) {
                console.warn(`Warning: Failed to analyze dependency class ${baseType}:`, e);
            }
        }

        return dependencyMethods;
    }

    /**
     * Find dependency class file based on imports
     */
    private async findDependencyClassFile(className: string): Promise<string | null> {
        if (!this.projectRoot) return null;

        // Find matching import
        let targetImport: string | null = null;
        for (const imp of this.currentImports) {
            if (imp.endsWith(`.${className}`)) {
                targetImport = imp;
                break;
            }
        }

        if (!targetImport) return null;

        // Convert package path to file path
        const packagePath = targetImport.replace(/\./g, path.sep) + '.java';

        // Try src/main/java and src/test/java
        const possiblePaths = [
            path.join(this.projectRoot, 'src', 'main', 'java', packagePath),
            path.join(this.projectRoot, 'src', 'test', 'java', packagePath)
        ];

        for (const filePath of possiblePaths) {
            if (await this.fileSystem.exists(filePath)) {
                return filePath;
            }
        }

        return null;
    }

    /**
     * Extract dependency methods actually used in method code
     */
    private extractUsedDependencyMethods(
        methodCode: string,
        injectedFields: InjectedField[],
        dependencyMethods: Record<string, DependencyMethod[]>
    ): UsedDependencyMethod[] {
        const usedMethods: UsedDependencyMethod[] = [];

        for (const field of injectedFields) {
            const fieldName = field.name;
            const classType = field.type.split('<')[0].trim();

            if (!dependencyMethods[classType]) continue;

            for (const method of dependencyMethods[classType]) {
                // Pattern: fieldName.methodName(
                const pattern = new RegExp(`\\b${fieldName}\\.${method.name}\\s*\\(`);

                if (pattern.test(methodCode)) {
                    usedMethods.push({
                        fieldName,
                        classType,
                        methodName: method.name,
                        signature: method.signature,
                        returnType: method.returnType,
                        parameters: method.parameters
                    });
                }
            }
        }

        return usedMethods;
    }

    // ============================================================
    // Complexity Calculation
    // ============================================================

    private calculateComplexityHints(methodCode: string): ComplexityHints {
        const conditionalCount = (methodCode.match(/\bif\s*\(/g) || []).length;
        const exceptionCount = (methodCode.match(/\btry\s*\{/g) || []).length;

        return {
            conditionalBranchesCount: conditionalCount,
            exceptionHandlersCount: exceptionCount
        };
    }

    private calculateOverallComplexity(
        sourceCode: string,
        methods: Array<{ name: string; startLine: number; endLine: number }>
    ): { cyclomaticComplexity: number; linesOfCode: number; methodComplexities: Record<string, number> } {
        const lines = sourceCode.split('\n');

        // Count non-empty, non-comment lines
        const linesOfCode = lines.filter(line => {
            const trimmed = line.trim();
            return trimmed !== '' &&
                !trimmed.startsWith('//') &&
                !trimmed.startsWith('/*') &&
                !trimmed.startsWith('*');
        }).length;

        const methodComplexities: Record<string, number> = {};
        let totalComplexity = 0;

        for (const method of methods) {
            const methodLines = lines.slice(method.startLine - 1, method.endLine);
            const methodContent = methodLines.join('\n');

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

            const complexity = 1 + decisionPoints;
            methodComplexities[method.name] = complexity;
            totalComplexity += complexity;
        }

        return {
            cyclomaticComplexity: totalComplexity,
            linesOfCode,
            methodComplexities
        };
    }

    // ============================================================
    // Helper Methods
    // ============================================================

    private extractDependencyClassNames(imports: string[]): string[] {
        const excludePrefixes = [
            'java.', 'javax.', 'org.junit', 'org.mockito', 'org.springframework.test'
        ];

        const dependencies: string[] = [];
        for (const imp of imports) {
            if (!excludePrefixes.some(prefix => imp.startsWith(prefix))) {
                const parts = imp.split('.');
                const className = parts[parts.length - 1];
                if (className !== '*') {
                    dependencies.push(className);
                }
            }
        }

        return [...new Set(dependencies)];
    }

    private extractAllFields(ast: ParseTree): Array<{ name: string; type: string; annotations: string[] }> {
        const fields: Array<{ name: string; type: string; annotations: string[] }> = [];

        createVisitor({
            visitClassBodyDeclaration: (ctx: ClassBodyDeclarationContext) => {
                const memberDecl = ctx.memberDeclaration?.();
                if (!memberDecl) return;

                const fieldDecl = memberDecl.fieldDeclaration?.();
                if (!fieldDecl) return;

                const type = fieldDecl.typeType().text;
                const annotations = this.extractFieldAnnotations(ctx);
                const declarators = fieldDecl.variableDeclarators().variableDeclarator();

                for (const decl of declarators) {
                    const name = decl.variableDeclaratorId().IDENTIFIER().text;
                    fields.push({ name, type, annotations });
                }
            }
        }).visit(ast);

        return fields;
    }

    private extractFieldAnnotations(ctx: ClassBodyDeclarationContext): string[] {
        const annotations: string[] = [];
        const modifierList = ctx.modifier?.() || [];

        for (const mod of modifierList) {
            const classOrInterfaceMod = mod.classOrInterfaceModifier?.();
            if (classOrInterfaceMod) {
                const annotation = classOrInterfaceMod.annotation?.();
                if (annotation) {
                    const qualifiedName = annotation.qualifiedName?.();
                    if (qualifiedName) {
                        annotations.push('@' + qualifiedName.text);
                    }
                }
            }
        }

        return annotations;
    }
}
