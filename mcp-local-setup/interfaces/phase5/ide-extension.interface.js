// Contract: IDE Extension
// Purpose: Define the interface for IDE integrations
// Team responsible: IDE Team

class IDEExtensionInterface {
  constructor(sdk) {
    // sdk: SDKCoreInterface instance
    throw new Error('Not implemented - IDE team will implement');
  }

  // Language Server Protocol
  async startLanguageServer() {
    // returns: { port: number, pid: number }
    throw new Error('Not implemented - IDE team will implement');
  }

  async stopLanguageServer() {
    // returns: void
    throw new Error('Not implemented - IDE team will implement');
  }

  // Code completion
  async getCompletions(document, position) {
    // document: { uri: string, content: string }, position: { line: number, character: number }
    // returns: CompletionItem[]
    throw new Error('Not implemented - IDE team will implement');
  }

  // Hover information
  async getHoverInfo(document, position) {
    // document: { uri: string, content: string }, position: { line: number, character: number }
    // returns: { content: string, range: Range }
    throw new Error('Not implemented - IDE team will implement');
  }

  // Diagnostics
  async getDiagnostics(document) {
    // document: { uri: string, content: string }
    // returns: Diagnostic[]
    throw new Error('Not implemented - IDE team will implement');
  }

  // Code actions
  async getCodeActions(document, range, context) {
    // document: { uri: string, content: string }, range: Range, context: { diagnostics: Diagnostic[] }
    // returns: CodeAction[]
    throw new Error('Not implemented - IDE team will implement');
  }

  // Commands
  async executeCommand(command, args) {
    // command: string, args: any[]
    // returns: any
    throw new Error('Not implemented - IDE team will implement');
  }

  // Service management UI
  async showServicePanel() {
    // returns: void
    throw new Error('Not implemented - IDE team will implement');
  }

  async showServiceDetails(serviceId) {
    // serviceId: string
    // returns: void
    throw new Error('Not implemented - IDE team will implement');
  }

  // Debugging
  async startDebugging(config) {
    // config: { serviceId: string, breakpoints: Breakpoint[] }
    // returns: { sessionId: string }
    throw new Error('Not implemented - IDE team will implement');
  }

  async stopDebugging(sessionId) {
    // sessionId: string
    // returns: void
    throw new Error('Not implemented - IDE team will implement');
  }
}

module.exports = IDEExtensionInterface;