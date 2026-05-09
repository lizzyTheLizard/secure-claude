import * as http from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SecureClaudeConfig } from '../bin/config.js'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node'
import { Request, Response } from 'express'
import { PluginContext, PluginFunction, PluginTool } from '../plugin/plugin.js'

export async function startMcpServer(config: SecureClaudeConfig): Promise<() => void> {
  const mcpServer = await createMcpServer(config)
  const httpServer = createHtttpServer(config, mcpServer)

  await new Promise<void>((resolve, reject) => {
    httpServer.on('listening', () => { resolve() })
    httpServer.on('error', (err) => { reject(new Error(`Failed to start MCP server: ${err.message}`)) })
  })

  await checkServer(config.mcpPort)
  return () => { shutdownServer(httpServer, mcpServer) }
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
  let fn: PluginFunction
  if (plugin.type === 'custom') {
    const m = await import('../plugin/custom/index.js')
    fn = m.default
  }
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

function createHtttpServer(config: SecureClaudeConfig, mcpServer: McpServer): http.Server {
  const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  mcpServer.connect(transport).catch((err: unknown) => { console.error('Error connecting MCP server to transport:', err) })

  const app = createMcpExpressApp({ host: '0.0.0.0', allowedHosts: ['host.docker.internal', 'localhost'] })
  app.get('/ping', (_, res) => { res.writeHead(200).end('MCP Server is running') })
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

async function checkServer(port: number): Promise<void> {
  for (let iteration = 0; iteration <= 10; iteration += 1) {
    const statusCode = await checkStatusCode(port)
    if (statusCode === 406) {
      console.debug('MCP server is ready and takes requests!')
      return
    }
    if (iteration < 10) {
      console.debug('MCP server not ready yet, waiting 1 second before retrying...')
      await new Promise<void>((r) => {
        setTimeout(r, 1000)
      })
    }
  }
  throw new Error('MCP server not ready after 10 attempts')
}

function checkStatusCode(port: number): Promise<number | undefined> {
  return new Promise<number | undefined>((resolve) => {
    const req = http.request(`http://localhost:${port.toString()}/mcp`, { method: 'POST', timeout: 1000 }, (res) => {
      resolve(res.statusCode)
    })

    req.on('socket', function (socket) {
      socket.setTimeout(1000)
      socket.on('timeout', function () {
        req.destroy()
      })
    })

    req.on('error', function (err) {
      console.debug('MCP server not ready yet, error connecting', err)
      resolve(undefined)
    })

    req.write('something')
    req.end()
  })
}

function shutdownServer(httpServer: http.Server, mcpServer: McpServer): void {
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
