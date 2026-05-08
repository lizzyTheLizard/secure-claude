import * as http from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SecureClaudeConfig } from '../bin/config.js'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node'
import { Request, Response } from 'express'
import { PluginContext, PluginFunction, PluginTool } from '../plugin/plugin.js'
import type { CustomPluginConfig } from '../plugin/custom/index.js'

export async function startMcpServer(config: SecureClaudeConfig): Promise<() => void> {
  const mcpServer = await createMcpServer(config)
  const httpServer = createHtttpServer(config, mcpServer)

  await new Promise<void>((resolve, reject) => {
    httpServer.on('listening', () => { resolve() })
    httpServer.on('error', (err) => { reject(new Error(`Failed to start MCP server: ${err.message}`)) })
  })

  return () => {
    console.debug('Stopping MCP server...')
    mcpServer.close().catch((err: unknown) => {
      if (err) console.error('Error closing MCP server:', err)
      else console.debug('MCP server closed')
    })
    httpServer.close((err?: Error) => {
      if (err) { console.error('Error closing HTTP server:', err) }
      else { console.debug('HTTP server closed') }
    })
  }
}

async function createMcpServer(config: SecureClaudeConfig): Promise<McpServer> {
  const mcpServer = new McpServer({ name: 'secure-claude-mcp-server', version: '1.0.0' })
  const context: PluginContext = { cwd: config.cwd, configPath: config.configPath }
  for (const plugin of config.plugins) {
    const tools = await getPluginTools(plugin, context)
    console.debug(`Registering ${tools.length.toString()} tools from plugin "${plugin.type}"`)
    tools.forEach((tool) => { registerPluginTool(mcpServer, tool) })
  }
  return mcpServer
}

async function getPluginTools(plugin: { type: string }, context: PluginContext): Promise<PluginTool[]> {
  console.debug(`Loading plugin of type "${plugin.type}"`)
  if (plugin.type === 'custom') {
    const { loadCustomPlugin } = await import('../plugin/custom/index.js')
    return loadCustomPlugin(context, plugin as CustomPluginConfig)
  }
  let fn: PluginFunction
  if (plugin.type === 'github') {
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
    console.warn(`Unknown plugin type "${plugin.type}" — skipping`)
    return []
  }
  return fn(plugin, context)
}

function registerPluginTool(mcpServer: McpServer, tool: PluginTool): void {
  console.debug(`Registering plugin tool "${tool.name}"`)
  mcpServer.registerTool(
    tool.name,
    { description: tool.description, inputSchema: tool.inputSchema ?? {} },
    tool.execute,
  )
}

function createHtttpServer(config: SecureClaudeConfig, mcpServer: McpServer): http.Server {
  const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  mcpServer.connect(transport).catch((err: unknown) => { console.error('Error connecting MCP server to transport:', err) })

  const app = createMcpExpressApp({ host: '0.0.0.0', allowedHosts: ['host.docker.internal', 'localhost'] })
  app.get('/mcp', (_, res) => { res.writeHead(405).end() })
  app.delete('/mcp', (_, res) => { res.writeHead(405).end() })
  app.post('/mcp', (req, res) => { handleMcpRequest(req, res, transport) })
  return app.listen(config.mcpPort, '0.0.0.0', (error) => {
    if (error) console.error('Failed to start server:', error)
    else console.debug(`MCP Server listening on port ${config.mcpPort.toString()}`)
  })
}

function handleMcpRequest(req: Request, res: Response, transport: NodeStreamableHTTPServerTransport) {
  transport.handleRequest(req, res, req.body).catch((err: unknown) => {
    console.error('Error handling MCP request:', err)
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32_600,
          message: 'Internal HTTP server error',
        },
        id: null,
      })
    }
  })
}
