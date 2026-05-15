/* eslint-disable @typescript-eslint/no-deprecated */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, GetPromptRequestSchema, ListPromptsRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { PluginConfig } from '../../bin/config.js'
import { McpServerPluginConfig } from './config.js'

export async function createMcpProxy(config: PluginConfig): Promise<McpServer | Server> {
  const mcpConfig = getConfig(config)

  try {
    const client = new Client({ name: `${config.name}-proxy-client`, version: '1.0.0' })
    const transport = 'url' in mcpConfig
      ? new StreamableHTTPClientTransport(new URL(mcpConfig.url))
      : new StdioClientTransport({ command: mcpConfig.command, args: mcpConfig.args })
    await client.connect(transport)

    const capabilities = client.getServerCapabilities() ?? {}
    const server = new Server({ name: config.name, version: '1.0.0' }, { capabilities })

    if (capabilities.prompts) {
      server.setRequestHandler(ListPromptsRequestSchema, async () => client.listPrompts())
      server.setRequestHandler(GetPromptRequestSchema, async req => client.getPrompt(req.params))
    }

    if (capabilities.resources) {
      server.setRequestHandler(ListResourcesRequestSchema, async () => client.listResources())
      server.setRequestHandler(ListResourceTemplatesRequestSchema, async req => client.listResourceTemplates(req.params))
      server.setRequestHandler(ReadResourceRequestSchema, async req => client.readResource(req.params))
    }

    if (capabilities.tools) {
      server.setRequestHandler(ListToolsRequestSchema, async () => client.listTools())
      server.setRequestHandler(CallToolRequestSchema, async req => client.callTool(req.params))
    }

    return server
  }
  catch (err) {
    console.warn(`MCP plugin "${config.name}" unreachable at startup — its tools will be unavailable: ${String(err)}`)
    const server = new McpServer({ name: config.name, version: '1.0.0' })
    return server
  }
}

function getConfig(config: PluginConfig): McpServerPluginConfig {
  if ('command' in config && typeof config.command === 'string') {
    if (!('args' in config) || config.args === undefined) {
      return { type: 'mcp', command: config.command }
    }
    if (!Array.isArray(config.args)) {
      throw new Error('Invalid MCP plugin config: "args" field must be an array of strings if provided')
    }
    return { type: 'mcp', command: config.command, args: config.args }
  }
  if ('url' in config && typeof config.url === 'string') {
    return { type: 'mcp', url: config.url }
  }
  throw new Error('Invalid MCP plugin config: must include either a "command" or "url" field')
}
