import { Client } from '@modelcontextprotocol/sdk/client'
import { DEFAULT_CONFIG, PluginConfig, SecureClaudeConfig } from '../src/bin/config.js'
import { startMcpServer } from '../src/mcp/server.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp'

export async function startTestMcpServer(pluginConfig: Partial<PluginConfig>, cwd?: string): Promise<Client> {
  const PORT = 19420
  const PLUGIN_NAME = 'commands_commands'
  const MCP_URL = `http://localhost:${PORT.toString()}/mcp/${PLUGIN_NAME}`
  const config: SecureClaudeConfig = { ...DEFAULT_CONFIG, cwd: cwd ?? process.cwd(), mcpPort: PORT, plugins: [{ ...pluginConfig, type: pluginConfig.type ?? 'unknown', name: PLUGIN_NAME }] }
  const stopServer = await startMcpServer(config)
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL)))
  client.onclose = () => { stopServer() }
  return client
}
