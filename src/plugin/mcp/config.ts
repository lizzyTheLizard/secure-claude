export type McpServerPluginConfig = | McpServerStdioPluginConfig | McpServerHttpPluginConfig

export interface McpServerStdioPluginConfig {
  type: 'mcp'
  command: string
  args?: string[]
}

export interface McpServerHttpPluginConfig {
  type: 'mcp'
  url: string
}
