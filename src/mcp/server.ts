import * as http from 'node:http'
import { spawn } from 'node:child_process'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { CommandConfig, GIT_COMMANDS } from './commands.js'
import { SecureClaudeConfig } from '../bin/config.js'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node'
import { Request, Response } from 'express'
import { PluginFunction, PluginTool } from '../plugin/plugin.js'
import { CustomPluginConfig } from '../plugin/custom/index.js'

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
  const configuredCommands = (config as unknown as CommandConfig).commands
  const commands = [...(config.enableGitCommands ? GIT_COMMANDS : []), ...(configuredCommands ?? [])]
  console.debug(`Registering ${commands.length.toString()} commands with MCP server`)
  commands.forEach((cmd) => { registerCommand(mcpServer, config, cmd) })

  for (const plugin of config.plugins) {
    const tools = await getPluginTools(config, plugin)
    tools.forEach((tool) => { registerPluginTool(mcpServer, tool) })
  }
  return mcpServer
}

async function getPluginTools(config: SecureClaudeConfig, plugin: { type: string }): Promise<PluginTool[]> {
  console.debug(`Loading plugin of type "${plugin.type}"`)
  if (plugin.type === 'github') {
    const pluginModule = await import('../plugin/github/index.js')
    const fn: PluginFunction = pluginModule.default
    return fn(plugin)
  }
  if (plugin.type === 'custom') {
    const { loadCustomPlugin } = await import('../plugin/custom/index.js')
    return loadCustomPlugin(config, plugin as CustomPluginConfig)
  }
  console.warn(`Unknown plugin type "${plugin.type}" — skipping`)
  return []
}

function registerPluginTool(mcpServer: McpServer, tool: PluginTool): void {
  console.debug(`Registering plugin tool "${tool.name}"`)
  mcpServer.registerTool(
    tool.name,
    { description: tool.description, inputSchema: tool.inputSchema ?? {} },
    input => tool.execute(input),
  )
}

function registerCommand(mcpServer: McpServer, config: SecureClaudeConfig, cmd: CommandConfig) {
  console.debug(`Registering command "${cmd.name}" with template: ${cmd.template}`)
  mcpServer.registerTool(
    cmd.name,
    { description: cmd.description, inputSchema: getInputSchema(cmd) },
    i => executeCommand(config, cmd, i),
  )
}

function getInputSchema(cmd: CommandConfig): Record<string, z.ZodString | z.ZodNumber | z.ZodBoolean> {
  const inputSchema: Record<string, z.ZodString | z.ZodNumber | z.ZodBoolean> = {}
  for (const param of cmd.params) {
    if (param.type === 'string') inputSchema[param.name] = z.string().describe(param.description)
    else if (param.type === 'number') inputSchema[param.name] = z.number().describe(param.description)
    else inputSchema[param.name] = z.boolean().describe(param.description)
  }
  return inputSchema
}

function executeCommand(config: SecureClaudeConfig, cmd: CommandConfig, inputs: Record<string, string | number | boolean>): Promise<{ content: { type: 'text', text: string }[] }> {
  const tokens = cmd.template.split(' ')
  const args = tokens.map((token) => {
    const match = /^\{(\w+)\}$/.exec(token)
    if (!match) return token
    if (!Object.keys(inputs).includes(match[1]))
      throw new Error(`Missing value for parameter "${match[1]}" in command "${cmd.name}"`)
    return inputs[match[1]].toString()
  })

  return new Promise((resolve, reject) => {
    const proc = spawn(args[0], args.slice(1), { cwd: config.cwd, stdio: 'pipe' })
    const chunks: string[] = []
    proc.stdout.on('data', (d: Buffer) => { chunks.push(d.toString()) })
    proc.stderr.on('data', (d: Buffer) => { chunks.push(d.toString()) })
    proc.on('error', (err) => { reject(new Error(`Failed to run command "${cmd.name}": ${err.message}`)) })
    proc.on('close', () => { resolve({ content: [{ type: 'text' as const, text: chunks.join('') }] }) })
  })
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
