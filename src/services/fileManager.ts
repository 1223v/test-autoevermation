import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Result of a file save operation
 */
export interface SaveResult {
    success: boolean;
    uri: vscode.Uri;
    created: boolean;
    error?: string;
}

/**
 * Service for file system operations
 */
export class FileManager {
    /**
     * Saves test file content to the specified URI
     * Creates directories if they don't exist
     */
    public async saveTestFile(testUri: vscode.Uri, content: string): Promise<SaveResult> {
        try {
            // Ensure parent directory exists
            const directory = vscode.Uri.file(path.dirname(testUri.fsPath));
            await this.ensureDirectoryExists(directory);

            // Check if file already exists
            const fileExists = await this.fileExists(testUri);

            // Write the file
            const encoder = new TextEncoder();
            await vscode.workspace.fs.writeFile(testUri, encoder.encode(content));

            return {
                success: true,
                uri: testUri,
                created: !fileExists
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return {
                success: false,
                uri: testUri,
                created: false,
                error: message
            };
        }
    }

    /**
     * Reads content from a file
     */
    public async readFile(uri: vscode.Uri): Promise<string> {
        const content = await vscode.workspace.fs.readFile(uri);
        const decoder = new TextDecoder();
        return decoder.decode(content);
    }

    /**
     * Checks if a file exists
     */
    public async fileExists(uri: vscode.Uri): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(uri);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Creates a directory if it doesn't exist
     */
    public async ensureDirectoryExists(uri: vscode.Uri): Promise<void> {
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            if (stat.type !== vscode.FileType.Directory) {
                throw new Error(`Path exists but is not a directory: ${uri.fsPath}`);
            }
        } catch (error) {
            if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
                // Create the directory and any parent directories
                await vscode.workspace.fs.createDirectory(uri);
            } else if (!(error instanceof vscode.FileSystemError)) {
                // For non-FileSystemError (the stat check), try to create
                await vscode.workspace.fs.createDirectory(uri);
            } else {
                throw error;
            }
        }
    }

    /**
     * Creates a backup of an existing file
     */
    public async createBackup(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
        if (!(await this.fileExists(uri))) {
            return undefined;
        }

        const parsed = path.parse(uri.fsPath);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupName = `${parsed.name}.backup-${timestamp}${parsed.ext}`;
        const backupUri = vscode.Uri.file(path.join(parsed.dir, backupName));

        const content = await vscode.workspace.fs.readFile(uri);
        await vscode.workspace.fs.writeFile(backupUri, content);

        return backupUri;
    }

    /**
     * Opens a file in the editor
     */
    public async openFile(uri: vscode.Uri, viewColumn?: vscode.ViewColumn): Promise<vscode.TextEditor> {
        const document = await vscode.workspace.openTextDocument(uri);
        return vscode.window.showTextDocument(document, viewColumn);
    }

    /**
     * Finds files that might be dependencies based on import statements
     */
    public async findDependencyFiles(
        imports: string[],
        workspaceFolder: vscode.WorkspaceFolder
    ): Promise<Map<string, vscode.Uri>> {
        const dependencies = new Map<string, vscode.Uri>();

        for (const importStatement of imports) {
            // Convert import to file path pattern
            // e.g., com.example.service.UserService -> **/com/example/service/UserService.java
            const pathPattern = importStatement.replace(/\./g, '/');
            const pattern = `**/${pathPattern}.java`;

            const files = await vscode.workspace.findFiles(
                new vscode.RelativePattern(workspaceFolder, pattern),
                '**/test/**',
                1
            );

            if (files.length > 0) {
                dependencies.set(importStatement, files[0]);
            }
        }

        return dependencies;
    }

    /**
     * Extracts import statements from Java source code
     */
    public extractImports(content: string): string[] {
        const imports: string[] = [];
        const importRegex = /^\s*import\s+(?:static\s+)?([\w.]+)(?:\.\*)?;/gm;

        let match;
        while ((match = importRegex.exec(content)) !== null) {
            const importPath = match[1];
            // Filter out standard library imports
            if (!importPath.startsWith('java.') &&
                !importPath.startsWith('javax.') &&
                !importPath.startsWith('org.junit') &&
                !importPath.startsWith('org.mockito')) {
                imports.push(importPath);
            }
        }

        return imports;
    }
}
