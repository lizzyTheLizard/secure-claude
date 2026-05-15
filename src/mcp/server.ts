import { SecureClaudeConfig } from '../bin/config.js'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'
import { waitForServerToBecomeReady } from './waitForServerToBecomeReady.js'
import { buildPluginServer } from './buildPluginServer.js'

export async function startMcpServer(config: SecureClaudeConfig): Promise<() => void> {
  const app = createMcpExpressApp({ host: '0.0.0.0', allowedHosts: ['host.docker.internal', 'localhost'] })
  const pluginServers = await Promise.all(config.plugins.map(pluginConfig => buildPluginServer(pluginConfig, config)))

  app.get('/ping', (_, res) => res.writeHead(200).end('MCP Server is running'))
  pluginServers.forEach(pluginServer => app.post(`/mcp/${pluginServer.name}`, async (req, res) => { await pluginServer.onRequest(req, res, req.body) }))

  const httpServer = app.listen(config.mcpPort, '0.0.0.0', (error) => {
    if (error) console.error('Failed to start server:', error)
    else console.debug(`MCP Server listening on port ${config.mcpPort.toString()}`)
  })

  httpServer.on('close', () => {
    for (const plugin of pluginServers) {
      plugin.onClose().catch((err: unknown) => { console.error(`Error closing plugin "${plugin.name}":`, err) })
    }
  })

  await new Promise<void>((resolve, reject) => {
    httpServer.on('listening', () => { resolve() })
    httpServer.on('error', (err) => { reject(new Error(`Failed to start MCP server: ${err.message}`)) })
  })

  await waitForServerToBecomeReady(config.mcpPort)
  return () => {
    console.debug('Stopping MCP server...')
    httpServer.close((err?: Error) => {
      if (err) { console.error('Error closing HTTP server:', err) }
      else { console.debug('HTTP server closed') }
    })
  }
}
