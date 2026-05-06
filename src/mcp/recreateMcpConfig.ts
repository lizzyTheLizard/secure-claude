import * as fsp from 'node:fs/promises'
import { SecureClaudeConfig } from '../bin/config.js'
import * as path from 'node:path'

export async function writeMcpConfig(config: SecureClaudeConfig): Promise<void> {
  console.debug('Writing MCP config...')
  const mcpConfig = {
    mcpServers: {
      commands: {
        type: 'http',
        url: `http://host.docker.internal:${String(config.mcpPort)}/mcp`,
      },
    },
  }
  await fsp.writeFile(
    path.join(config.tmpFolder, 'mcp-config.json'),
    JSON.stringify(mcpConfig, null, 2),
    'utf8',
  )
}
