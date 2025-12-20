/**
 * Simple Java method parser for extracting method signatures
 */

export interface JavaMethod {
    name: string;
    signature: string;
    returnType: string;
    parameters: string;
    modifiers: string[];
    startLine: number;
    endLine: number;
}

export interface JavaClass {
    name: string;
    packageName: string;
    methods: JavaMethod[];
}

/**
 * Extracts methods from Java source code
 */
export function extractMethods(sourceCode: string): JavaMethod[] {
    const methods: JavaMethod[] = [];
    const lines = sourceCode.split('\n');

    // Regex to match method declarations
    // Matches: modifiers returnType methodName(parameters) { or throws
    const methodRegex = /^\s*((?:public|private|protected|static|final|abstract|synchronized|native|strictfp)\s+)*(\w+(?:<[^>]+>)?(?:\[\])?)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w\s,]+)?\s*\{?/;

    // Skip constructors and class declarations
    const skipPatterns = [
        /^\s*(?:public|private|protected)?\s*class\s+/,
        /^\s*(?:public|private|protected)?\s*interface\s+/,
        /^\s*(?:public|private|protected)?\s*enum\s+/,
        /^\s*@/,  // Annotations
    ];

    let braceCount = 0;
    let inMethod = false;
    let currentMethod: JavaMethod | null = null;
    let classStarted = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // Skip empty lines and comments
        if (line.trim() === '' || line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('/*')) {
            continue;
        }

        // Check if we're inside a class
        if (line.match(/^\s*(?:public|private|protected)?\s*(?:abstract\s+)?class\s+/)) {
            classStarted = true;
            continue;
        }

        // Skip patterns
        if (skipPatterns.some(pattern => pattern.test(line))) {
            continue;
        }

        // If we're tracking a method, count braces
        if (inMethod && currentMethod) {
            braceCount += (line.match(/\{/g) || []).length;
            braceCount -= (line.match(/\}/g) || []).length;

            if (braceCount <= 0) {
                currentMethod.endLine = lineNum;
                methods.push(currentMethod);
                currentMethod = null;
                inMethod = false;
                braceCount = 0;
            }
            continue;
        }

        // Try to match a method declaration
        if (classStarted) {
            const match = line.match(methodRegex);
            if (match) {
                const modifiersStr = match[1] || '';
                const modifiers = modifiersStr.trim().split(/\s+/).filter(m => m);
                const returnType = match[2];
                const methodName = match[3];
                const parameters = match[4].trim();

                // Skip if it's a constructor (return type matches class name pattern)
                // Constructors don't have a return type, so returnType would be the class name
                // We detect this by checking if returnType equals methodName
                if (returnType === methodName) {
                    continue;
                }

                // Build signature
                const signature = `${modifiers.join(' ')} ${returnType} ${methodName}(${parameters})`.trim();

                currentMethod = {
                    name: methodName,
                    signature: signature,
                    returnType: returnType,
                    parameters: parameters,
                    modifiers: modifiers,
                    startLine: lineNum,
                    endLine: lineNum
                };

                // Check if method body starts on this line
                if (line.includes('{')) {
                    braceCount = (line.match(/\{/g) || []).length;
                    braceCount -= (line.match(/\}/g) || []).length;

                    if (braceCount > 0) {
                        inMethod = true;
                    } else {
                        // Single line method
                        currentMethod.endLine = lineNum;
                        methods.push(currentMethod);
                        currentMethod = null;
                    }
                } else {
                    inMethod = true;
                    braceCount = 0;
                }
            }
        }
    }

    return methods;
}

/**
 * Extracts class information from Java source code
 */
export function extractClassInfo(sourceCode: string): JavaClass | null {
    // Extract package name
    const packageMatch = sourceCode.match(/^\s*package\s+([\w.]+)\s*;/m);
    const packageName = packageMatch ? packageMatch[1] : '';

    // Extract class name
    const classMatch = sourceCode.match(/^\s*(?:public\s+)?(?:abstract\s+)?class\s+(\w+)/m);
    if (!classMatch) {
        return null;
    }

    const className = classMatch[1];
    const methods = extractMethods(sourceCode);

    return {
        name: className,
        packageName: packageName,
        methods: methods
    };
}

/**
 * Extracts existing test methods from a test file
 */
export function extractTestMethods(testCode: string): string[] {
    const testMethods: string[] = [];
    const lines = testCode.split('\n');

    let foundTestAnnotation = false;

    for (const line of lines) {
        // Check for @Test annotation
        if (line.trim().startsWith('@Test')) {
            foundTestAnnotation = true;
            continue;
        }

        // If we found @Test, the next method declaration is a test method
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
 * Merges new test methods into existing test file
 * Returns the merged content
 */
export function mergeTestMethods(existingCode: string, newTestMethods: string): string {
    // Find the last closing brace of the class
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
        // Couldn't find class end, just append
        return existingCode + '\n\n' + newTestMethods;
    }

    // Extract new test methods (just the method bodies, not the class wrapper)
    const newMethodsMatch = newTestMethods.match(/(@Test[\s\S]*?)(?=\s*}\s*$)/);
    const methodsToInsert = newMethodsMatch ? newMethodsMatch[1] : newTestMethods;

    // Insert before the last closing brace
    const beforeBrace = lines.slice(0, lastBraceIndex);
    const afterBrace = lines.slice(lastBraceIndex);

    return [...beforeBrace, '', '    // Additional test methods', methodsToInsert, ...afterBrace].join('\n');
}

/**
 * Extracts imports from Java source code
 */
export function extractImports(sourceCode: string): string[] {
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
export function mergeImports(existingCode: string, newCode: string): string {
    const existingImports = new Set(extractImports(existingCode));
    const newImports = extractImports(newCode);

    // Find imports to add
    const importsToAdd = newImports.filter(imp => !existingImports.has(imp));

    if (importsToAdd.length === 0) {
        return existingCode;
    }

    // Find where to insert imports (after package declaration, before class)
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

    // Insert new imports
    const importLines = importsToAdd.map(imp => `import ${imp};`);
    lines.splice(insertIndex, 0, ...importLines);

    return lines.join('\n');
}
