import { fileURLToPath } from 'node:url'
import * as path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { DEFAULT_CONFIG, SecureClaudeConfig } from '../src/bin/config.js'
import { startMcpServer } from '../src/mcp/server.js'
import { startTestMcpServer } from './testmcpserver.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'echo-mcp-server.mjs')
const HTTP_UPSTREAM_PORT = 19421

describe('mcp plugin — stdio upstream', () => {
  let client: Client

  beforeAll(async () => client = await startTestMcpServer({ type: 'mcp', command: process.execPath, args: [FIXTURE_PATH] }), 15000)

  afterAll(async () => { await client.close() })

  it('lists the upstream tool via the proxy', async () => {
    const { tools } = await client.listTools()
    expect(tools.map(t => t.name)).toContain('echo_tool')
  })

  it('forwards tool calls to the upstream and returns the response', async () => {
    const result = await client.callTool({ name: 'echo_tool', arguments: { message: 'proxy works' } })
    const text = (result.content as { type: string, text: string }[])[0]?.text ?? ''
    expect(text).toBe('proxy works')
  })
})

describe('mcp plugin — HTTP upstream', () => {
  let upStreamClient: Client
  let client: Client

  beforeAll(async () => {
    upStreamClient = await startUpstreamMcpServer()
    client = await startTestMcpServer({ type: 'mcp', url: `http://localhost:${HTTP_UPSTREAM_PORT.toString()}/mcp/commands_commands` })
  }, 15000)

  afterAll(async () => {
    await client.close()
    await upStreamClient.close()
  })

  it('lists upstream tools via the HTTP proxy', async () => {
    const { tools } = await client.listTools()
    expect(tools.map(t => t.name)).toContain('say_hello')
  })

  it('forwards HTTP tool calls to the upstream and returns the response', async () => {
    const result = await client.callTool({ name: 'say_hello', arguments: {} })
    const text = (result.content as { type: string, text: string }[])[0]?.text ?? ''
    expect(text.trim()).toBe('hello')
  })
})

describe('mcp plugin — unreachable upstream', () => {
  let client: Client

  beforeAll(async () => {
    client = await startTestMcpServer({ type: 'mcp', url: `http://localhost:${HTTP_UPSTREAM_PORT.toString()}/mcp/commands_commands` })
  }, 15000)

  afterAll(async () => {
    await client.close()
  })

  it('starts the MCP server without throwing', () => {
    expect(client).toBeDefined()
  })

  it('registers the route but tools/list returns method-not-found (no tools registered)', async () => {
    await expect(client.listTools()).rejects.toThrow()
  })
})

export async function startUpstreamMcpServer(): Promise<Client> {
  const PLUGIN_NAME = 'commands_commands'
  const MCP_URL = `http://localhost:${HTTP_UPSTREAM_PORT.toString()}/mcp/${PLUGIN_NAME}`
  const config: SecureClaudeConfig = { ...DEFAULT_CONFIG, mcpPort: HTTP_UPSTREAM_PORT, plugins: [{ type: 'commands', commands: [{ name: 'say_hello', description: 'Print hello', template: 'echo hello' }], name: PLUGIN_NAME }] }
  const stopServer = await startMcpServer(config)
  const client = new Client({ name: 'test-client', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL)))
  client.onclose = () => { stopServer() }
  return client
}
