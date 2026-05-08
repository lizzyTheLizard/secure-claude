import { z } from 'zod'

export interface McpToolResult {
  content: { type: 'text', text: string }[]
  [key: string]: unknown
}

export interface PluginTool {
  name: string
  description: string
  inputSchema?: Record<string, z.ZodType>
  outputSchema?: Record<string, z.ZodType>
  execute: (input: Record<string, unknown>) => Promise<McpToolResult>
}

export type PluginFunction = (raw: { type: string }, context: PluginContext) => PluginTool[]

export interface PluginContext {
  cwd: string
  configPath?: string
}
