import { CommandsPluginConfig } from './config.js'
import { buildPluginTool } from './tools.js'
import { PluginFunction } from '../plugin.js'

const commandsPlugin: PluginFunction = (raw, context) => {
  const config = raw as CommandsPluginConfig
  return (config.commands ?? []).map(cmd => buildPluginTool(context.cwd, cmd))
}

export default commandsPlugin
