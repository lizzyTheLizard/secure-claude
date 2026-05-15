import * as fsp from 'node:fs/promises'
import { SecureClaudeConfig } from '../bin/config.js'
import * as path from 'node:path'

export async function writeMcpConfig(config: SecureClaudeConfig): Promise<void> {
  console.debug('Writing MCP config...')
  const mcpServers: Record<string, { type: string, url: string }> = {}
  for (const plugin of config.plugins) {
    mcpServers[plugin.name] = {
      type: 'http',
      url: `http://host.docker.internal:${String(config.mcpPort)}/mcp/${plugin.name}`,
    }
  }
  await fsp.writeFile(
    path.join(config.tmpFolder, 'mcp-config.json'),
    JSON.stringify({ mcpServers }, null, 2),
    'utf8',
  )
}
