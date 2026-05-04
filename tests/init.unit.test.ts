import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as readline from 'node:readline'
import { describe, it, vi, beforeEach, afterEach, expect } from 'vitest'
import { parse } from 'yaml'
import type { SecureClaudeConfig } from '../src/bin/config.js'
import { runInit } from '../src/bin/init.js'

function mockRl(answers: string[]): readline.Interface {
  let i = 0
  return {
    question(_: string, callback: (a: string) => void) { callback(answers[i++] ?? '') },
    close: vi.fn(),
  } as unknown as readline.Interface
}

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secure-claude-init-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function readConfig(dir: string): SecureClaudeConfig {
  const raw = fs.readFileSync(path.join(dir, 'secure-claude.yaml'), 'utf8')
  return parse(raw) as SecureClaudeConfig
}

// In restricted mode the order is: policy, allowedDomains..., blockedDomains..., proxy, dns
// In allow mode the order is:      policy, blockedDomains..., allowedDomains..., proxy, dns

describe('init command', () => {
  it('writes default-deny config with no domains, no proxy, no custom DNS', async () => {
    const rl = mockRl(['', '', '', 'n', 'n'])
    await runInit(tmpDir, rl)
    const cfg = readConfig(tmpDir)
    expect(cfg.defaultAllow).toBe(false)
    expect(cfg.allowedDomains).toEqual([])
    expect(cfg.blockedDomains).toEqual([])
    expect(cfg.dnsServers).toBe('1.1.1.1 8.8.8.8')
    expect(cfg.proxy).toBe('NONE')
  })

  it('writes default-allow config with no domains, no proxy, no custom DNS', async () => {
    const rl = mockRl(['allow', '', '', 'n', 'n'])
    await runInit(tmpDir, rl)
    const cfg = readConfig(tmpDir)
    expect(cfg.defaultAllow).toBe(true)
    expect(cfg.allowedDomains).toEqual([])
    expect(cfg.blockedDomains).toEqual([])
  })

  it('empty policy answer defaults to restricted', async () => {
    const rl = mockRl(['', '', '', 'n', 'n'])
    await runInit(tmpDir, rl)
    const cfg = readConfig(tmpDir)
    expect(cfg.defaultAllow).toBe(false)
  })

  // restricted mode: allowedDomains first, then blockedDomains
  it('restricted: collects one allowed domain', async () => {
    const rl = mockRl(['restricted', '.example.com', '', '', 'n', 'n'])
    await runInit(tmpDir, rl)
    const cfg = readConfig(tmpDir)
    expect(cfg.allowedDomains).toEqual(['.example.com'])
    expect(cfg.blockedDomains).toEqual([])
  })

  it('restricted: collects multiple allowed domains', async () => {
    const rl = mockRl(['restricted', '.example.com', '.other.com', '', '', 'n', 'n'])
    await runInit(tmpDir, rl)
    const cfg = readConfig(tmpDir)
    expect(cfg.allowedDomains).toEqual(['.example.com', '.other.com'])
  })

  it('restricted: collects one blocked domain', async () => {
    const rl = mockRl(['restricted', '', 'bad.com', '', 'n', 'n'])
    await runInit(tmpDir, rl)
    const cfg = readConfig(tmpDir)
    expect(cfg.allowedDomains).toEqual([])
    expect(cfg.blockedDomains).toEqual(['bad.com'])
  })

  it('restricted: collects both allowed and blocked domains', async () => {
    const rl = mockRl(['restricted', '.example.com', '', 'sub.example.com', '', 'n', 'n'])
    await runInit(tmpDir, rl)
    const cfg = readConfig(tmpDir)
    expect(cfg.allowedDomains).toEqual(['.example.com'])
    expect(cfg.blockedDomains).toEqual(['sub.example.com'])
  })

  // allow mode: blockedDomains first, then allowedDomains
  it('allow: collects one blocked domain', async () => {
    const rl = mockRl(['allow', 'bad.com', '', '', 'n', 'n'])
    await runInit(tmpDir, rl)
    const cfg = readConfig(tmpDir)
    expect(cfg.blockedDomains).toEqual(['bad.com'])
    expect(cfg.allowedDomains).toEqual([])
  })

  it('allow: collects multiple blocked domains', async () => {
    const rl = mockRl(['allow', 'bad.com', 'evil.com', '', '', 'n', 'n'])
    await runInit(tmpDir, rl)
    const cfg = readConfig(tmpDir)
    expect(cfg.blockedDomains).toEqual(['bad.com', 'evil.com'])
  })

  it('allow: collects both blocked and allowed domains', async () => {
    const rl = mockRl(['allow', '.google.com', '', 'mail.google.com', '', 'n', 'n'])
    await runInit(tmpDir, rl)
    const cfg = readConfig(tmpDir)
    expect(cfg.blockedDomains).toEqual(['.google.com'])
    expect(cfg.allowedDomains).toEqual(['mail.google.com'])
  })

  it('configures proxy when answered yes', async () => {
    const rl = mockRl(['', '', '', 'y', 'proxy.internal', '3128', 'alice', 's3cr3t', 'n'])
    await runInit(tmpDir, rl)
    const cfg = readConfig(tmpDir)
    expect(cfg.proxy).toEqual({ host: 'proxy.internal', port: 3128, username: 'alice', password: 's3cr3t' })
  })

  it('does not write proxy when answered no', async () => {
    const rl = mockRl(['', '', '', 'n', 'n'])
    await runInit(tmpDir, rl)
    const cfg = readConfig(tmpDir)
    expect(cfg.proxy).toBe('NONE')
  })

  it('configures multiple custom DNS servers', async () => {
    const rl = mockRl(['', '', '', 'n', 'y', '9.9.9.9', '8.8.4.4', ''])
    await runInit(tmpDir, rl)
    const cfg = readConfig(tmpDir)
    expect(cfg.dnsServers).toBe('9.9.9.9 8.8.4.4')
  })

  it('configures single custom DNS server', async () => {
    const rl = mockRl(['', '', '', 'n', 'y', '9.9.9.9', ''])
    await runInit(tmpDir, rl)
    const cfg = readConfig(tmpDir)
    expect(cfg.dnsServers).toBe('9.9.9.9')
  })

  it('keeps default DNS when custom DNS answered no', async () => {
    const rl = mockRl(['', '', '', 'n', 'n'])
    await runInit(tmpDir, rl)
    const cfg = readConfig(tmpDir)
    expect(cfg.dnsServers).toBe('1.1.1.1 8.8.8.8')
  })

  it('aborts without writing file when overwrite declined', async () => {
    fs.writeFileSync(path.join(tmpDir, 'secure-claude.yaml'), 'defaultAllow: true\n', 'utf8')
    const rl = mockRl(['n'])
    await runInit(tmpDir, rl)
    const raw = fs.readFileSync(path.join(tmpDir, 'secure-claude.yaml'), 'utf8')
    expect(raw).toBe('defaultAllow: true\n')
  })

  it('overwrites existing file when overwrite accepted', async () => {
    fs.writeFileSync(path.join(tmpDir, 'secure-claude.yaml'), 'defaultAllow: true\n', 'utf8')
    const rl = mockRl(['y', '', '', '', 'n', 'n'])
    await runInit(tmpDir, rl)
    const cfg = readConfig(tmpDir)
    expect(cfg.defaultAllow).toBe(false)
  })
})
