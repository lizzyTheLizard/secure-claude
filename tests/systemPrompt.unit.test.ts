import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { SecureClaudeConfig } from '../src/bin/config.js'
import { recreate } from '../src/bin/recreate.js'

let tmpDir: string

function baseConfig(overrides: Partial<SecureClaudeConfig> = {}): SecureClaudeConfig {
  return {
    projectName: 'test',
    allowedDomains: [],
    blockedDomains: [],
    defaultAllow: false,
    dnsServers: '1.1.1.1 8.8.8.8',
    proxy: 'NONE',
    additionalVolumes: [],
    deniedPaths: [],
    mcpPort: 9418,
    plugins: [],
    cwd: tmpDir,
    tmpFolder: path.join(tmpDir, '.secureclaude'),
    ...overrides,
  }
}

describe('buildSystemPrompt', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secure-claude-prompt-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('mentions deny-all policy when defaultAllow is false', async () => {
    await recreate(baseConfig({ defaultAllow: false }))
    const result = await fs.promises.readFile(path.join(tmpDir, '.secureclaude', 'system-prompt.txt'), 'utf8')
    expect(result).toContain('Network policy: DENY BY DEFAULT')
  })

  it('mentions allow-all policy when defaultAllow is true', async () => {
    await recreate(baseConfig({ defaultAllow: true }))
    const result = await fs.promises.readFile(path.join(tmpDir, '.secureclaude', 'system-prompt.txt'), 'utf8')
    expect(result).toContain('Network policy: ALLOW BY DEFAULT')
  })

  it('lists allowed domains when present', async () => {
    await recreate(baseConfig({ allowedDomains: ['example.com', 'api.github.com'] }))
    const result = await fs.promises.readFile(path.join(tmpDir, '.secureclaude', 'system-prompt.txt'), 'utf8')
    expect(result).toContain('Whitelisted domains: example.com, api.github.com')
  })

  it('says none for allowed domains when empty', async () => {
    await recreate(baseConfig({ allowedDomains: [] }))
    const result = await fs.promises.readFile(path.join(tmpDir, '.secureclaude', 'system-prompt.txt'), 'utf8')
    expect(result).toContain('Whitelisted domains: none')
  })

  it('lists blocked domains when present', async () => {
    await recreate(baseConfig({ blockedDomains: ['evil.com', 'ads.tracker.io'] }))
    const result = await fs.promises.readFile(path.join(tmpDir, '.secureclaude', 'system-prompt.txt'), 'utf8')
    expect(result).toContain('Blacklisted domains: evil.com, ads.tracker.io')
  })

  it('says none for blocked domains when empty', async () => {
    await recreate(baseConfig({ blockedDomains: [] }))
    const result = await fs.promises.readFile(path.join(tmpDir, '.secureclaude', 'system-prompt.txt'), 'utf8')
    expect(result).toContain('Blacklisted domains: none')
  })
})
