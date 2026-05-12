export interface CommandDef {
  name: string
  description: string
  // Space-separated tokens; tokens matching {paramName} are replaced by the corresponding param value.
  // Each token becomes a separate argv element — no shell interpolation, preventing injection.
  template: string
  params?: CommandParam[]
}

export interface CommandParam {
  name: string
  type: 'string' | 'number' | 'boolean'
  description: string
}

export interface CommandsPluginConfig {
  type: 'commands'
  commands?: CommandDef[]
}
