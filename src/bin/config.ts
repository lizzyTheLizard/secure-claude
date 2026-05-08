import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { parse } from 'yaml'

const DEFAULT_TMP_FOLDER = '.secureclaude'
const DEFAULT_MCP_PORT = 9418

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

const cwd = process.cwd()
const configPath = path.join(cwd, 'secure-claude.yaml')

export async function configExists(): Promise<boolean> {
  return await fsp.access(configPath).then(() => true).catch(() => false)
}

export async function loadConfig(): Promise<SecureClaudeConfig> {
  if (!await configExists()) {
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
    ...parsedInput,
    tmpFolder: parsedInput.tmpFolder ?? path.join(process.cwd(), DEFAULT_TMP_FOLDER),
    configPath,
    allowedDomains: parsedInput.allowedDomains ?? [],
    blockedDomains: parsedInput.blockedDomains ?? [],
    defaultAllow: parsedInput.defaultAllow ?? false,
    dnsServers: parsedInput.dnsServers ?? '1.1.1.1 8.8.8.8',
    proxy: parsedInput.proxy ?? 'NONE',
    additionalVolumes: parsedInput.additionalVolumes ?? [],
    deniedPaths: parsedInput.deniedPaths ?? [],
    mcpPort: parsedInput.mcpPort ?? DEFAULT_MCP_PORT,
    plugins: parsedInput.plugins ?? [],
    cwd,
    projectName: path.basename(cwd),
  }
}
