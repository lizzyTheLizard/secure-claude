import { ALL_GIT_TOOL_NAMES, GitPluginConfig, GitToolNames } from './config.js'
import { GIT_TOOLS, GitTool } from './tools.js'
import { PluginContext, PluginFunction } from '../plugin.js'

const gitPlugin: PluginFunction = (raw, context) => {
  const config = raw as GitPluginConfig
  const toolNames = new Set<GitToolNames>(config.tools?.enabled ?? [...ALL_GIT_TOOL_NAMES])
  for (const blocked of config.tools?.blocked ?? []) {
    toolNames.delete(blocked)
  }
  return GIT_TOOLS
    .filter(tool => toolNames.has(tool.name))
    .map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      execute: async (input: Record<string, unknown>) => executeTool(config, context, tool, input),
    }))
}

async function executeTool(config: GitPluginConfig, context: PluginContext, tool: GitTool, input: Record<string, unknown>) {
  if (tool.branchParam && config.branches?.pattern) {
    const branch = input[tool.branchParam] as string
    if (!new RegExp(config.branches.pattern).test(branch))
      throw new Error(`Git plugin: branch "${branch}" does not match allowed pattern "${config.branches.pattern}"`)
  }
  const result = await tool.execute(context.cwd, input)
  if (tool.filterOutputByBranch && config.branches?.pattern) {
    const pattern = new RegExp(config.branches.pattern)
    return {
      ...result,
      content: result.content.map((c) => {
        const filtered = c.text.split('\n')
          .filter((line) => {
            const branch = line.replace(/^\*?\s+/, '').trim()
            return branch === '' || pattern.test(branch)
          })
          .join('\n')
        return { ...c, text: filtered }
      }),
    }
  }
  return result
}

export default gitPlugin
