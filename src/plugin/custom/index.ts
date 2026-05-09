import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { z } from 'zod'
import { PluginContext, PluginFunction, PluginTool } from '../plugin.js'
import { CustomPluginConfig } from './config.js'

const customPluginToolSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  inputSchema: z.record(z.string(), z.any()).optional(),
  execute: z.function(),
})

const loadCustomPlugin: PluginFunction = async (raw, context: PluginContext) => {
  const config = raw as CustomPluginConfig
  const resolvedPath = resolvePath(context, config.path)
  try {
    const fn = await importPluginFunction(resolvedPath)
    const tools = callAndValidate(fn, config, resolvedPath)
    return tools.map(tool => validateToolDefinition(tool, resolvedPath))
  }
  catch (err) {
    if (err instanceof Error) throw err
    throw new Error(`Failed to load custom plugin "${resolvedPath}": ${String(err)}`)
  }
}

function resolvePath(context: PluginContext, pluginPath: string): string {
  const baseDir = context.configPath ? path.dirname(context.configPath) : context.cwd
  return path.resolve(baseDir, pluginPath)
}

async function importPluginFunction(resolvedPath: string): Promise<(config: CustomPluginConfig) => unknown> {
  const exists = await fsp.access(resolvedPath).then(() => true).catch(() => false)
  if (!exists)
    throw new Error(`Custom plugin file not found: "${resolvedPath}"`)
  const m = await import(resolvedPath) as { default?: unknown }
  if (typeof m.default !== 'function')
    throw new Error(`Custom plugin at "${resolvedPath}" must export a function, got: ${typeof m.default}`)
  return m.default as (config: CustomPluginConfig) => unknown
}

function callAndValidate(fn: (config: CustomPluginConfig) => unknown, raw: CustomPluginConfig, resolvedPath: string): unknown[] {
  const result = fn(raw)
  if (!result || !Array.isArray(result))
    throw new Error(`Custom plugin at "${resolvedPath}" must return an array of tools`)
  return result as unknown[]
}

function validateToolDefinition(tool: unknown, resolvedPath: string): PluginTool {
  const parsed = customPluginToolSchema.safeParse(tool)
  if (!parsed.success) {
    const fields = parsed.error.issues.map(i => `"${i.path.join('.')}"`).join(', ')
    throw new Error(`Invalid tool definition for plugin at "${resolvedPath}": invalid or missing fields: ${fields}`)
  }
  const { name, description, inputSchema, execute } = parsed.data
  return {
    name,
    description,
    inputSchema: inputSchema as Record<string, z.ZodType>,
    execute: execute as PluginTool['execute'],
  }
}

export default loadCustomPlugin
