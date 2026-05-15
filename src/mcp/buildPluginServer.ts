import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { PluginConfig, SecureClaudeConfig } from '../bin/config.js'
import { createMcpProxy } from '../plugin/mcp/index.js'
import { PluginContext, PluginFunction, PluginTool } from '../plugin/plugin.js'
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node'
import { IncomingMessage, ServerResponse } from 'node:http'

export interface ServerPlugin {
  name: string
  onClose: () => Promise<void>
  onRequest: (req: IncomingMessage, res: ServerResponse, parsedBody: unknown) => Promise<void>
}

export async function buildPluginServer(plugin: PluginConfig, config: SecureClaudeConfig): Promise<ServerPlugin> {
  const context: PluginContext = { cwd: config.cwd, configPath: config.configPath }
  const mcpServer = plugin.type === 'mcp'
    ? await createMcpProxy(plugin)
    : await createMcpPlugin(plugin, context)
  const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  await mcpServer.connect(transport)
  return {
    name: plugin.name,
    onClose: async () => { await mcpServer.close() },
    onRequest: async (req, res, body) => { await handleMcpRequest(req, res, body, transport) },
  }
}

async function createMcpPlugin(plugin: PluginConfig, context: PluginContext): Promise<McpServer> {
  console.debug(`Registering plugin "${plugin.name}"`)
  const tools = await getPluginTools(plugin, context)
  console.debug(`Registering ${tools.length.toString()} tools from plugin "${plugin.name}"`)
  const mcpServer = new McpServer({ name: plugin.name, version: '1.0.0' })
  tools.forEach((tool) => { registerPluginTool(mcpServer, tool) })
  return mcpServer
}

async function getPluginTools(plugin: { type: string }, context: PluginContext): Promise<PluginTool[]> {
  console.debug(`Loading plugin of type "${plugin.type}"`)
  let fn: PluginFunction
  if (plugin.type === 'custom') {
    const m = await import('../plugin/custom/index.js')
    fn = m.default
  }
  else if (plugin.type === 'github') {
    const m = await import('../plugin/github/index.js')
    fn = m.default
  }
  else if (plugin.type === 'git') {
    const m = await import('../plugin/git/index.js')
    fn = m.default
  }
  else if (plugin.type === 'commands') {
    const m = await import('../plugin/commands/index.js')
    fn = m.default
  }
  else {
    console.warn(`Unknown plugin type "${plugin.type}" — keep it empty`)
    return []
  }
  const tools = await fn(plugin, context)
  console.debug(`Loaded ${tools.length.toString()} tools from plugin "${plugin.type}"`)
  return tools
}

function registerPluginTool(mcpServer: McpServer, tool: PluginTool): void {
  console.debug(`Registering plugin tool "${tool.name}"`)
  mcpServer.registerTool(
    tool.name,
    { description: tool.description, inputSchema: tool.inputSchema ?? {} },
    tool.execute,
  )
}

async function handleMcpRequest(req: IncomingMessage, res: ServerResponse, parsedBody: unknown, transport: NodeStreamableHTTPServerTransport): Promise<void> {
  await transport.handleRequest(req, res, parsedBody).catch((err: unknown) => {
    console.error('Error handling MCP request:', err)
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.write(JSON.stringify(getError(err)))
      res.end()
    }
  })
}

function getError(err: unknown): { jsonrpc: string, error: { code: number, message: string } } {
  if (err instanceof Error)
    return { jsonrpc: '2.0', error: { code: -32_600, message: err.message } }
  else if (typeof err === 'string')
    return { jsonrpc: '2.0', error: { code: -32_600, message: err } }
  else
    return { jsonrpc: '2.0', error: { code: -32_600, message: 'Unknown error' } }
}
