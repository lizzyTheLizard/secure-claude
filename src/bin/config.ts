import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'yaml'

const DEFAULT_TMP_FOLDER = '.secureclaude'

export interface SecureClaudeConfig {
  tmpFolder: string
  configPath?: string
  allowedDomains: string[]
  blockedDomains: string[]
  defaultAllow: boolean
  dnsServers: string
  proxy?: { host: string, port: number, username: string, password: string }
}

export function loadConfig(cwd: string): SecureClaudeConfig {
  const configPath = path.join(cwd, 'secure-claude.yaml')

  if (!fs.existsSync(configPath)) {
    return { tmpFolder: path.join(cwd, DEFAULT_TMP_FOLDER), allowedDomains: [], blockedDomains: [], defaultAllow: false, dnsServers: '1.1.1.1 8.8.8.8' }
  }

  const raw = fs.readFileSync(configPath, 'utf8')
  const parsed: unknown = parse(raw)

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Config file is not valid YAML: "${configPath}"`)
  }

  const parsedInput = parsed as Partial<SecureClaudeConfig>
  return {
    ...parsedInput,
    tmpFolder: parsedInput.tmpFolder ?? path.join(process.cwd(), DEFAULT_TMP_FOLDER),
    configPath,
    allowedDomains: parsedInput.allowedDomains ?? [],
    blockedDomains: parsedInput.blockedDomains ?? [],
    defaultAllow: parsedInput.defaultAllow ?? false,
    dnsServers: parsedInput.dnsServers ?? '1.1.1.1 8.8.8.8',
  }
}
