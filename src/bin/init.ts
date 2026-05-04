import * as fs from 'node:fs'
import * as path from 'node:path'
import * as readline from 'node:readline'
import { stringify } from 'yaml'
import type { SecureClaudeConfig } from './config.js'

export async function runInit(cwd = process.cwd(), rl?: readline.Interface): Promise<void> {
  const configPath = path.join(cwd, 'secure-claude.yaml')
  const ownedRl = rl === undefined
  rl ??= readline.createInterface({ input: process.stdin, output: process.stdout })

  try {
    if (!await confirmOverwrite(rl, configPath)) return

    const defaultAllow = await askDefaultPolicy(rl)
    const { allowedDomains, blockedDomains } = defaultAllow
      ? await collectDomainsAllowFirst(rl)
      : await collectDomainsRestrictedFirst(rl)

    const config: Partial<SecureClaudeConfig> = {
      defaultAllow,
      allowedDomains,
      blockedDomains,
      proxy: await askProxy(rl),
      dnsServers: await askDnsServers(rl),
    }

    fs.writeFileSync(configPath, stringify(config), 'utf8')
    console.log(`Created ${configPath}`)
  }
  finally {
    if (ownedRl) rl.close()
  }
}

async function confirmOverwrite(rl: readline.Interface, configPath: string): Promise<boolean> {
  if (!fs.existsSync(configPath)) return true
  const answer = await ask(rl, 'secure-claude.yaml already exists. Overwrite? (y/N) ')
  if (answer.toLowerCase() !== 'y') {
    console.log('Aborted.')
    return false
  }
  return true
}

async function askDefaultPolicy(rl: readline.Interface): Promise<boolean> {
  const answer = await ask(rl, 'Should Claude Code have general internet access, or be restricted to whitelisted domains only? (allow/restricted) [restricted] ')
  return answer.toLowerCase() === 'allow'
}

async function collectDomainsRestrictedFirst(rl: readline.Interface): Promise<{ allowedDomains: string[], blockedDomains: string[] }> {
  console.log('Claude will only reach domains on the allowlist. Prefix a domain with "." to include all its subdomains (e.g. ".example.com").')
  const allowedDomains = await collectList(rl, 'Allowed domain')

  console.log('Domains listed here are blocked even if a parent domain is on the allowlist. Use this to deny access to specific subdomains. Prefix with "." for all subdomains.')
  const blockedDomains = await collectList(rl, 'Blocked domain')

  return { allowedDomains, blockedDomains }
}

async function collectDomainsAllowFirst(rl: readline.Interface): Promise<{ allowedDomains: string[], blockedDomains: string[] }> {
  console.log('Domains listed here will be blocked from Claude. Prefix a domain with "." to include all its subdomains (e.g. ".example.com").')
  const blockedDomains = await collectList(rl, 'Blocked domain')

  console.log('Domains listed here are always reachable, even if a parent domain is on the blocklist. Use this to allow specific subdomains of blocked domains. Prefix with "." for all subdomains.')
  const allowedDomains = await collectList(rl, 'Allowed domain')

  return { allowedDomains, blockedDomains }
}

async function collectList(rl: readline.Interface, label: string): Promise<string[]> {
  const items: string[] = []
  for (;;) {
    const item = await ask(rl, `${label} ${String(items.length + 1)} (empty to finish): `)
    if (!item) break
    items.push(item)
  }
  return items
}

async function askProxy(rl: readline.Interface): Promise<SecureClaudeConfig['proxy']> {
  const answer = await ask(rl, 'Should a HTTP proxy be used for outbound connections? (y/N) ')
  if (answer.toLowerCase() !== 'y') return 'NONE'
  const host = await ask(rl, 'Proxy host: ')
  const portStr = await ask(rl, 'Proxy port: ')
  const username = await ask(rl, 'Proxy username: ')
  const password = await ask(rl, 'Proxy password: ')
  return { host, port: parseInt(portStr, 10), username, password }
}

async function askDnsServers(rl: readline.Interface): Promise<string> {
  const answer = await ask(rl, 'Configure custom DNS servers? (y/N) ')
  if (answer.toLowerCase() !== 'y') return '1.1.1.1 8.8.8.8'
  const servers: string[] = []
  for (;;) {
    const server = await ask(rl, `DNS server ${String(servers.length + 1)} (empty to finish): `)
    if (!server) break
    servers.push(server)
  }
  return servers.length > 0 ? servers.join(' ') : '1.1.1.1 8.8.8.8'
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => { rl.question(question, resolve) })
}
