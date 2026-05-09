import { CommandsPluginConfig } from './config.js'
import { buildPluginTool } from './tools.js'

const commandsPlugin = (raw: { type: string }, context: { cwd: string }) => {
  const config = raw as CommandsPluginConfig
  return (config.commands ?? []).map(cmd => buildPluginTool(context.cwd, cmd))
}

export default commandsPlugin
