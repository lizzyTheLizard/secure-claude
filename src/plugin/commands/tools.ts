import { spawn } from 'node:child_process'
import { z } from 'zod'
import { McpToolResult, PluginTool } from '../plugin.js'
import { CommandDef, CommandParam } from './config.js'

export function buildPluginTool(cwd: string, cmd: CommandDef): PluginTool {
  return {
    name: cmd.name,
    description: cmd.description,
    inputSchema: cmd.params ? buildInputSchema(cmd.params) : {},
    execute: input => executeCommand(cwd, cmd, input as Record<string, string | number | boolean>),
  }
}

function buildInputSchema(params: CommandParam[]): Record<string, z.ZodType> {
  const schema: Record<string, z.ZodType> = {}
  for (const param of params) {
    if (param.type === 'string') schema[param.name] = z.string().describe(param.description)
    else if (param.type === 'number') schema[param.name] = z.number().describe(param.description)
    else schema[param.name] = z.boolean().describe(param.description)
  }
  return schema
}

export function executeCommand(cwd: string, cmd: CommandDef, inputs: Record<string, string | number | boolean>): Promise<McpToolResult> {
  const filledTemplate = cmd.template.replace(/\{(\w+)\}/g, (_, paramName: string) => {
    if (!(paramName in inputs))
      throw new Error(`Missing value for parameter "${paramName}" in command "${cmd.name}"`)
    return inputs[paramName].toString()
  })
  const args = filledTemplate.split(' ').filter(s => s.length > 0)
  console.log(`Running command:`, args, `in directory:`, cwd)
  return new Promise((resolve, reject) => {
    const proc = spawn(args[0], args.slice(1), { cwd, stdio: 'pipe' })
    const chunks: string[] = []
    proc.stdout.on('data', (d: Buffer) => { chunks.push(d.toString()) })
    proc.stderr.on('data', (d: Buffer) => { chunks.push(d.toString()) })
    proc.on('error', (err) => { reject(new Error(`Failed to run command "${cmd.name}": ${err.message}`)) })
    proc.on('close', () => { resolve({ content: [{ type: 'text' as const, text: chunks.join('') }] }) })
  })
}
