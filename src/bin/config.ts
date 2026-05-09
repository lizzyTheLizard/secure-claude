import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { parse } from 'yaml'

export interface VolumeMount {
  path: string
  mode: 'ro' | 'rw'
}

export interface SecureClaudeConfig {
  projectName: string
  tmpFolder: string
  configPath?: string
  allowedDomains: string[]
  blockedDomains: string[]
  defaultAllow: boolean
  dnsServers: string
  proxy: { host: string, port: number, username: string, password: string } | 'NONE'
  additionalVolumes: VolumeMount[]
  deniedPaths: string[]
  mcpPort: number
  plugins: { type: string }[]
  cwd: string
}

export const DEFAULT_CONFIG: SecureClaudeConfig = {
  projectName: path.basename(process.cwd()),
  tmpFolder: path.join(process.cwd(), '.secureclaude'),
  allowedDomains: [],
  blockedDomains: [],
  defaultAllow: false,
  dnsServers: '1.1.1.1 8.8.8.8',
  proxy: 'NONE',
  additionalVolumes: [],
  deniedPaths: [],
  mcpPort: 9418,
  plugins: [],
  cwd: process.cwd(),
}

export async function configExists(dir?: string): Promise<boolean> {
  const cwd = dir ?? process.cwd()
  const configPath = path.join(cwd, 'secure-claude.yaml')
  return await fsp.access(configPath).then(() => true).catch(() => false)
}

export async function loadConfig(dir?: string): Promise<SecureClaudeConfig> {
  const cwd = dir ?? process.cwd()
  const configPath = path.join(cwd, 'secure-claude.yaml')
  if (!await configExists(cwd)) {
    throw new Error(`No config file found at "${configPath}". Run "secure-claude init" to create one.`)
  }

  const raw = await fsp.readFile(configPath, 'utf8')
  const parsed: unknown = parse(raw)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Config file is not valid YAML: "${configPath}"`)
  }

  const parsedInput = parsed as Partial<SecureClaudeConfig>
  console.debug(`Loaded config from "${configPath}":`, parsedInput)
  return {
    ...DEFAULT_CONFIG,
    projectName: path.basename(cwd),
    ...parsedInput,
    configPath,
    cwd,
  }
}
