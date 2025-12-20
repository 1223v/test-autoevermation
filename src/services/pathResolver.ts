import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Resolved path information for a Java source file
 */
export interface JavaPathInfo {
    packageName: string;
    className: string;
    isTestFile: boolean;
    relativePath: string;
}

/**
 * Service for resolving file paths following Maven/Gradle conventions
 */
export class PathResolver {
    /**
     * Resolves the test file path based on Maven/Gradle conventions.
     * Converts: src/main/java/com/example/Service.java
     *       to: src/test/java/com/example/ServiceTest.java
     */
    public resolveTestPath(sourceUri: vscode.Uri, suggestedPath?: string): vscode.Uri {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(sourceUri);

        if (!workspaceFolder) {
            throw new Error('No workspace folder found. Please open a folder or workspace.');
        }

        if (suggestedPath) {
            // Use the server-suggested path
            return vscode.Uri.joinPath(workspaceFolder.uri, suggestedPath);
        }

        // Convert source path to test path
        const relativePath = path.relative(workspaceFolder.uri.fsPath, sourceUri.fsPath);

        // Handle different source layouts
        let testPath = this.convertToTestPath(relativePath);

        // Add 'Test' suffix to filename if not already present
        const parsed = path.parse(testPath);
        if (!parsed.name.endsWith('Test')) {
            testPath = path.join(parsed.dir, `${parsed.name}Test${parsed.ext}`);
        }

        return vscode.Uri.joinPath(workspaceFolder.uri, testPath);
    }

    /**
     * Converts a source path to test path following conventions
     */
    private convertToTestPath(relativePath: string): string {
        // Normalize path separators
        const normalizedPath = relativePath.replace(/\\/g, '/');

        // src/main/java -> src/test/java
        if (normalizedPath.includes('src/main/java')) {
            return normalizedPath.replace('src/main/java', 'src/test/java');
        }

        // main/java -> test/java (without src prefix)
        if (normalizedPath.includes('main/java')) {
            return normalizedPath.replace('main/java', 'test/java');
        }

        // src/main/kotlin -> src/test/kotlin
        if (normalizedPath.includes('src/main/kotlin')) {
            return normalizedPath.replace('src/main/kotlin', 'src/test/kotlin');
        }

        // Default: prepend with src/test/java
        const parsed = path.parse(normalizedPath);
        return path.join('src', 'test', 'java', parsed.dir, parsed.base);
    }

    /**
     * Parses Java path information from a URI
     */
    public parseJavaPath(uri: vscode.Uri): JavaPathInfo {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        if (!workspaceFolder) {
            throw new Error('File is not part of a workspace');
        }

        const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
        const normalizedPath = relativePath.replace(/\\/g, '/');
        const parsed = path.parse(normalizedPath);

        // Extract package name from path
        let packagePath = '';
        const javaMatch = normalizedPath.match(/(?:src\/(?:main|test)\/java\/|java\/)(.+)\//);
        if (javaMatch) {
            packagePath = javaMatch[1];
        }

        const packageName = packagePath.replace(/\//g, '.');
        const className = parsed.name;
        const isTestFile = normalizedPath.includes('/test/') || className.endsWith('Test');

        return {
            packageName,
            className,
            isTestFile,
            relativePath: normalizedPath
        };
    }

    /**
     * Extracts the package name from Java source code
     */
    public extractPackageFromContent(content: string): string {
        const packageMatch = content.match(/^\s*package\s+([\w.]+)\s*;/m);
        return packageMatch ? packageMatch[1] : '';
    }

    /**
     * Extracts the class name from Java source code
     */
    public extractClassNameFromContent(content: string): string {
        const classMatch = content.match(/(?:public\s+)?(?:class|interface|enum)\s+(\w+)/);
        return classMatch ? classMatch[1] : '';
    }

}
