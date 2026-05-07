import { All_GITHUB_TOOL_NAMES, GithubPluginConfig, GithubToolNames } from './config.js'
import { GITHUB_TOOLS } from './tools.js'
import { PluginFunction } from '../plugin.js'

const githubPlugin: PluginFunction = (raw) => {
  const config = raw as GithubPluginConfig
  const toolNames = new Set<GithubToolNames>(config.tools?.enabled ?? All_GITHUB_TOOL_NAMES)
  for (const blocked of config.tools?.blocked ?? []) {
    toolNames.delete(blocked)
  }
  return GITHUB_TOOLS
    .filter(tool => toolNames.has(tool.name))
    .map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      execute: input => tool.execute(config, input),
    }))
}

export default githubPlugin
