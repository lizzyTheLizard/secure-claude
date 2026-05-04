import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SecureClaudeConfig } from '../bin/config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function recreateHttpProxy(config: SecureClaudeConfig): Promise<void> {
  await createSquidConf(config)
  await createWhitelist(config)
  await createBlacklist(config)
}

async function createSquidConf(config: SecureClaudeConfig): Promise<void> {
  const templatePath = path.join(__dirname, 'squid.conf.template')
  let content = await fsp.readFile(templatePath, 'utf8')
  const vars: Record<string, string> = {
    ACCESS_RULES: getAccessRules(config),
    DNS_SERVERS: config.dnsServers,
    PROXY_RULES: getProxyConfig(config),
  }
  for (const [key, value] of Object.entries(vars)) {
    content = content.replaceAll(`\${${key}}`, value)
  }
  await fsp.writeFile(path.join(config.tmpFolder, 'squid.conf'), content, 'utf8')
}

function getAccessRules(config: SecureClaudeConfig): string {
  if (config.defaultAllow) {
    return `
# Antropic must be reachable otherwise claude code won't run at all, so always allow it
acl anthropic dstdomain .anthropic.com
http_access allow anthropic

# Whitelist override: explicitly allow these domains first
http_access allow whitelist

# Then block blacklisted domains
http_access deny blacklist

# Default behavior: allow all
http_access allow all
    `
  }
  else {
    return `
# Antropic must be reachable otherwise claude code won't run at all, so always allow it
acl anthropic dstdomain .anthropic.com
http_access allow anthropic

# First block blacklisted domains
http_access deny blacklist

# Explicitly allow whitelisted domains
http_access allow whitelist

# Default behavior: deny all
http_access deny all
    `
  }
}

function getProxyConfig(config: SecureClaudeConfig): string {
  if (config.proxy === 'NONE') return ''
  const { host, port, username, password } = config.proxy
  return `cache_peer ${host} parent ${port.toString()} 0 no-query default login=${username}:${password}`
}

async function createWhitelist(config: SecureClaudeConfig): Promise<void> {
  const content = config.allowedDomains.join('\n')
  await fsp.writeFile(path.join(config.tmpFolder, 'whitelist.txt'), content, 'utf8')
}

async function createBlacklist(config: SecureClaudeConfig): Promise<void> {
  const content = config.blockedDomains.join('\n')
  await fsp.writeFile(path.join(config.tmpFolder, 'blacklist.txt'), content, 'utf8')
}
