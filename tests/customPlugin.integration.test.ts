import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { startTestMcpServer } from './testmcpserver.js'

async function writePluginFile() {
  const file = path.join(os.tmpdir(), `plugin-${crypto.randomBytes(4).toString('hex')}.cjs`)
  await fsp.writeFile(file, `
      module.exports = function() {
        return [{
          name: 'greet',
          description: 'Returns a greeting',
          execute: async (input) => ({ content: [{ type: 'text', text: 'Hello, ' + (input.name ?? 'world') }] })
        }]
      }
    `, 'utf8')
  return file
}

describe('custom plugin via MCP server', () => {
  let client: Client
  let pluginFile: string

  beforeAll(async () => {
    pluginFile = await writePluginFile()
    client = await startTestMcpServer({ type: 'custom', path: pluginFile })
  }, 15000)

  afterAll(async () => {
    await client.close()
    await fsp.unlink(pluginFile).catch(() => undefined)
  })

  it('lists the custom tool', async () => {
    const { tools } = await client.listTools()
    expect(tools.map(t => t.name)).toContain('greet')
  })

  it('calls the custom tool and returns a greeting', async () => {
    const result = await client.callTool({ name: 'greet', arguments: {} })
    const text = (result.content as { type: string, text: string }[])[0]?.text ?? ''
    expect(text).toBe('Hello, world')
  })
})
