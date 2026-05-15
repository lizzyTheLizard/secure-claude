import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { startTestMcpServer } from './testmcpserver.js'

describe('commands plugin via MCP server', () => {
  let client: Client

  beforeAll(async () => client = await startTestMcpServer({
    type: 'commands',
    commands: [
      { name: 'echo_message', description: 'Echo a message', template: 'echo "Message was {msg}"', params: [{ name: 'msg', type: 'string', description: 'Message to echo' }] },
    ],
  }), 15000)

  afterAll(async () => { await client.close() })

  it('lists the configured command as a tool', async () => {
    const { tools } = await client.listTools()
    expect(tools.map(t => t.name)).toContain('echo_message')
  })

  it('calls the command tool and returns output', async () => {
    const result = await client.callTool({ name: 'echo_message', arguments: { msg: 'hello' } })
    const text = (result.content as { type: string, text: string }[])[0]?.text ?? ''
    expect(text.trim()).toBe('"Message was hello"')
  })
})
