// VS Code Extension for MCP
// Purpose: Main extension entry point that integrates with MCP IDE Extension

import * as vscode from 'vscode';
import * as path from 'path';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';

// Import our IDE extension implementation
const IDEExtension = require('../../core/ide-extension');
const MockSDK = require('../../core/mock-sdk');

let client: LanguageClient;
let ideExtension: any;
let serviceProvider: MCPServiceProvider;
let healthProvider: MCPHealthProvider;

export async function activate(context: vscode.ExtensionContext) {
    console.log('MCP VS Code Extension is now active!');
    
    // Initialize SDK (using mock for now)
    const config = {
        apiKey: vscode.workspace.getConfiguration('mcp').get('apiKey') || 'test-key',
        endpoint: vscode.workspace.getConfiguration('mcp').get('endpoint') || 'http://localhost:8080'
    };
    
    const sdk = new MockSDK(config);
    
    // Initialize IDE Extension
    ideExtension = new IDEExtension(sdk);
    
    // Start language server
    const serverModule = context.asAbsolutePath(path.join('..', 'core', 'language-server.js'));
    const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };
    
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: debugOptions
        }
    };
    
    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { scheme: 'file', language: 'javascript' },
            { scheme: 'file', language: 'typescript' },
            { scheme: 'file', language: 'python' },
            { scheme: 'file', language: 'go' },
            { scheme: 'file', pattern: '**/mcp.config.json' },
            { scheme: 'file', pattern: '**/*.mcp.json' }
        ],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher('**/.mcp*')
        }
    };
    
    // Create and start the language client
    client = new LanguageClient(
        'mcpLanguageServer',
        'MCP Language Server',
        serverOptions,
        clientOptions
    );
    
    client.start();
    
    // Register commands
    registerCommands(context);
    
    // Register providers
    registerProviders(context);
    
    // Register views
    registerViews(context);
    
    // Register completion provider for non-LSP languages
    registerCompletionProvider(context);
    
    // Register hover provider
    registerHoverProvider(context);
    
    // Register diagnostics
    registerDiagnostics(context);
}

function registerCommands(context: vscode.ExtensionContext) {
    // Show service panel command
    context.subscriptions.push(
        vscode.commands.registerCommand('mcp.showServicePanel', async () => {
            const panel = vscode.window.createWebviewPanel(
                'mcpServicePanel',
                'MCP Services',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );
            
            const services = await ideExtension.showServicePanel();
            panel.webview.html = getServicePanelContent(services);
        })
    );
    
    // Install service command
    context.subscriptions.push(
        vscode.commands.registerCommand('mcp.installService', async (serviceId?: string) => {
            if (!serviceId) {
                serviceId = await vscode.window.showInputBox({
                    prompt: 'Enter service ID to install',
                    placeHolder: 'e.g., postgres-mcp'
                });
            }
            
            if (serviceId) {
                try {
                    const result = await ideExtension.executeCommand('mcp.installService', [serviceId, { source: 'ide' }]);
                    vscode.window.showInformationMessage(`Service installed: ${serviceId}`);
                    
                    // Refresh views
                    vscode.commands.executeCommand('mcp.refreshServices');
                } catch (error: any) {
                    vscode.window.showErrorMessage(`Failed to install service: ${error.message}`);
                }
            }
        })
    );
    
    // Refresh services command
    context.subscriptions.push(
        vscode.commands.registerCommand('mcp.refreshServices', async () => {
            serviceProvider.refresh();
            healthProvider.refresh();
        })
    );
    
    // Show service details command
    context.subscriptions.push(
        vscode.commands.registerCommand('mcp.showServiceDetails', async (service: any) => {
            const details = await ideExtension.showServiceDetails(service.id);
            
            const panel = vscode.window.createWebviewPanel(
                'mcpServiceDetails',
                `MCP Service: ${service.id}`,
                vscode.ViewColumn.Two,
                {
                    enableScripts: true
                }
            );
            
            panel.webview.html = getServiceDetailsContent(details);
        })
    );
    
    // Start debugging command
    context.subscriptions.push(
        vscode.commands.registerCommand('mcp.startDebugging', async (service: any) => {
            try {
                const session = await ideExtension.startDebugging({
                    serviceId: service.id,
                    breakpoints: []
                });
                
                // Start VS Code debug session
                vscode.debug.startDebugging(undefined, {
                    type: 'mcp',
                    name: `Debug ${service.id}`,
                    request: 'launch',
                    serviceId: service.id,
                    sessionId: session.sessionId
                });
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to start debugging: ${error.message}`);
            }
        })
    );
}

function registerProviders(context: vscode.ExtensionContext) {
    // Register tree data providers
    serviceProvider = new MCPServiceProvider(ideExtension);
    healthProvider = new MCPHealthProvider(ideExtension);
    
    vscode.window.registerTreeDataProvider('mcp.servicesView', serviceProvider);
    vscode.window.registerTreeDataProvider('mcp.healthView', healthProvider);
}

function registerViews(context: vscode.ExtensionContext) {
    // Views are registered in package.json
}

function registerCompletionProvider(context: vscode.ExtensionContext) {
    const provider = vscode.languages.registerCompletionItemProvider(
        ['javascript', 'typescript', 'python', 'go'],
        {
            async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
                const completions = await ideExtension.getCompletions(
                    { uri: document.uri.toString(), content: document.getText() },
                    { line: position.line, character: position.character }
                );
                
                return completions.map((item: any) => {
                    const completion = new vscode.CompletionItem(item.label);
                    completion.kind = getCompletionItemKind(item.kind);
                    completion.detail = item.detail;
                    completion.insertText = new vscode.SnippetString(item.insertText);
                    return completion;
                });
            }
        },
        '.', '"', "'"
    );
    
    context.subscriptions.push(provider);
}

function registerHoverProvider(context: vscode.ExtensionContext) {
    const provider = vscode.languages.registerHoverProvider(
        ['javascript', 'typescript', 'python', 'go'],
        {
            async provideHover(document: vscode.TextDocument, position: vscode.Position) {
                const hover = await ideExtension.getHoverInfo(
                    { uri: document.uri.toString(), content: document.getText() },
                    { line: position.line, character: position.character }
                );
                
                if (hover) {
                    return new vscode.Hover(
                        new vscode.MarkdownString(hover.content),
                        new vscode.Range(
                            hover.range.start.line,
                            hover.range.start.character,
                            hover.range.end.line,
                            hover.range.end.character
                        )
                    );
                }
                
                return null;
            }
        }
    );
    
    context.subscriptions.push(provider);
}

function registerDiagnostics(context: vscode.ExtensionContext) {
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('mcp');
    context.subscriptions.push(diagnosticCollection);
    
    // Update diagnostics on file change
    const updateDiagnostics = async (document: vscode.TextDocument) => {
        if (!vscode.workspace.getConfiguration('mcp').get('enableDiagnostics')) {
            return;
        }
        
        const diagnostics = await ideExtension.getDiagnostics({
            uri: document.uri.toString(),
            content: document.getText()
        });
        
        const vsDiagnostics = diagnostics.map((diag: any) => {
            const range = new vscode.Range(
                diag.range?.start?.line || 0,
                diag.range?.start?.character || 0,
                diag.range?.end?.line || 0,
                diag.range?.end?.character || 100
            );
            
            const diagnostic = new vscode.Diagnostic(
                range,
                diag.message,
                getDiagnosticSeverity(diag.severity)
            );
            
            diagnostic.source = diag.source;
            return diagnostic;
        });
        
        diagnosticCollection.set(document.uri, vsDiagnostics);
    };
    
    // Listen for document changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            updateDiagnostics(event.document);
        })
    );
    
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(document => {
            updateDiagnostics(document);
        })
    );
    
    // Update all open documents
    vscode.workspace.textDocuments.forEach(updateDiagnostics);
}

// Tree data provider for services
class MCPServiceProvider implements vscode.TreeDataProvider<MCPServiceItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<MCPServiceItem | undefined | null | void> = new vscode.EventEmitter<MCPServiceItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<MCPServiceItem | undefined | null | void> = this._onDidChangeTreeData.event;
    
    constructor(private ideExtension: any) {}
    
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
    
    getTreeItem(element: MCPServiceItem): vscode.TreeItem {
        return element;
    }
    
    async getChildren(element?: MCPServiceItem): Promise<MCPServiceItem[]> {
        if (!element) {
            const services = await this.ideExtension.sdk.listServices({});
            return services.map((service: any) => new MCPServiceItem(service));
        }
        return [];
    }
}

// Tree data provider for health monitoring
class MCPHealthProvider implements vscode.TreeDataProvider<MCPHealthItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<MCPHealthItem | undefined | null | void> = new vscode.EventEmitter<MCPHealthItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<MCPHealthItem | undefined | null | void> = this._onDidChangeTreeData.event;
    
    constructor(private ideExtension: any) {}
    
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
    
    getTreeItem(element: MCPHealthItem): vscode.TreeItem {
        return element;
    }
    
    async getChildren(element?: MCPHealthItem): Promise<MCPHealthItem[]> {
        if (!element) {
            const services = await this.ideExtension.sdk.listServices({});
            const healthItems = await Promise.all(
                services.map(async (service: any) => {
                    try {
                        const health = await this.ideExtension.sdk.getHealth(service.id);
                        return new MCPHealthItem(service, health);
                    } catch {
                        return new MCPHealthItem(service, { status: 'unknown', details: {} });
                    }
                })
            );
            return healthItems;
        }
        return [];
    }
}

// Tree item classes
class MCPServiceItem extends vscode.TreeItem {
    constructor(public readonly service: any) {
        super(service.name || service.id, vscode.TreeItemCollapsibleState.None);
        this.id = service.id;
        this.tooltip = service.description || '';
        this.contextValue = 'service';
        this.iconPath = new vscode.ThemeIcon('server');
    }
}

class MCPHealthItem extends vscode.TreeItem {
    constructor(public readonly service: any, public readonly health: any) {
        super(`${service.name || service.id}: ${health.status}`, vscode.TreeItemCollapsibleState.None);
        this.id = service.id;
        this.tooltip = JSON.stringify(health.details, null, 2);
        this.contextValue = 'health';
        
        // Set icon based on health status
        switch (health.status) {
            case 'healthy':
                this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
                break;
            case 'unhealthy':
                this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
                break;
            default:
                this.iconPath = new vscode.ThemeIcon('question');
        }
    }
}

// Helper functions
function getCompletionItemKind(kind: string): vscode.CompletionItemKind {
    switch (kind) {
        case 'Method': return vscode.CompletionItemKind.Method;
        case 'Service': return vscode.CompletionItemKind.Module;
        default: return vscode.CompletionItemKind.Text;
    }
}

function getDiagnosticSeverity(severity: string): vscode.DiagnosticSeverity {
    switch (severity) {
        case 'error': return vscode.DiagnosticSeverity.Error;
        case 'warning': return vscode.DiagnosticSeverity.Warning;
        case 'info': return vscode.DiagnosticSeverity.Information;
        default: return vscode.DiagnosticSeverity.Hint;
    }
}

function getServicePanelContent(services: any[]): string {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: var(--vscode-font-family); padding: 20px; }
                .service { border: 1px solid var(--vscode-panel-border); padding: 10px; margin: 10px 0; }
                .service-header { font-weight: bold; font-size: 16px; }
                .service-status { float: right; }
                .healthy { color: green; }
                .unhealthy { color: red; }
                .unknown { color: gray; }
            </style>
        </head>
        <body>
            <h1>MCP Services</h1>
            ${services.map(service => `
                <div class="service">
                    <div class="service-header">
                        ${service.name || service.id}
                        <span class="service-status ${service.health?.status || 'unknown'}">${service.health?.status || 'unknown'}</span>
                    </div>
                    <div>${service.description || 'No description'}</div>
                    <div>Version: ${service.version || 'unknown'}</div>
                </div>
            `).join('')}
        </body>
        </html>
    `;
}

function getServiceDetailsContent(details: any): string {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: var(--vscode-font-family); padding: 20px; }
                .section { margin: 20px 0; }
                .section-header { font-weight: bold; font-size: 18px; margin-bottom: 10px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { padding: 8px; text-align: left; border-bottom: 1px solid var(--vscode-panel-border); }
                .endpoint { font-family: monospace; }
            </style>
        </head>
        <body>
            <h1>${details.name || details.id}</h1>
            <p>${details.description || 'No description'}</p>
            
            <div class="section">
                <div class="section-header">Health Status</div>
                <table>
                    <tr><th>Status</th><td>${details.health?.status || 'unknown'}</td></tr>
                    <tr><th>Uptime</th><td>${details.health?.details?.uptime || 'N/A'} seconds</td></tr>
                    <tr><th>Memory</th><td>${details.health?.details?.memory?.used || 0}MB / ${details.health?.details?.memory?.total || 0}MB</td></tr>
                    <tr><th>CPU</th><td>${details.health?.details?.cpu || 0}%</td></tr>
                </table>
            </div>
            
            ${details.endpoints && details.endpoints.length > 0 ? `
                <div class="section">
                    <div class="section-header">Endpoints</div>
                    <table>
                        <tr><th>Path</th><th>Method</th><th>Description</th></tr>
                        ${details.endpoints.map((endpoint: any) => `
                            <tr>
                                <td class="endpoint">${endpoint.path}</td>
                                <td>${endpoint.method}</td>
                                <td>${endpoint.description || ''}</td>
                            </tr>
                        `).join('')}
                    </table>
                </div>
            ` : ''}
            
            ${details.config ? `
                <div class="section">
                    <div class="section-header">Configuration Options</div>
                    <table>
                        <tr><th>Option</th><th>Type</th><th>Description</th></tr>
                        ${Object.entries(details.config).map(([key, value]: [string, any]) => `
                            <tr>
                                <td><code>${key}</code></td>
                                <td>${value.type || 'any'}</td>
                                <td>${value.description || ''}</td>
                            </tr>
                        `).join('')}
                    </table>
                </div>
            ` : ''}
        </body>
        </html>
    `;
}

export function deactivate() {
    if (client) {
        return client.stop();
    }
}