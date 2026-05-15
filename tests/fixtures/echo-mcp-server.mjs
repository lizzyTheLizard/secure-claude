// Simple MCP server used as a stdio upstream fixture in mcp.mcp.integration.test.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({ name: 'echo-server', version: '1.0.0' })
server.registerTool(
  'echo_tool',
  { description: 'Echoes the message back', inputSchema: { message: z.string() } },
  async ({ message }) => ({ content: [{ type: 'text', text: message }] }),
)

const transport = new StdioServerTransport()
await server.connect(transport)
