import { describe, it, afterEach, expect } from 'vitest'
import { recreateTmpDir } from '../src/bin/recreate.js'
import { spawnHelper } from '../src/spawnHelper.js'
import { DEFAULT_CONFIG, SecureClaudeConfig } from '../src/bin/config.js'
import { spawn } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import * as os from 'node:os'
import { Buffer } from 'node:buffer'

let config: SecureClaudeConfig

afterEach(async () => {
  await spawnHelper('Kill docker compose', 'docker', ['compose', 'kill', '--remove-orphans'], config.tmpFolder)
  await spawnHelper('Kill docker compose', 'docker', ['network', 'prune', '--force'], config.tmpFolder)
  await fsp.rm(config.tmpFolder, { recursive: true, force: true })
}, 30000)

describe('network policy enforcement', () => {
  it('deny-all default: whitelist allows, blacklist blocks, unlisted blocks', async () => {
    config = await setupProxy({ defaultAllow: false, allowedDomains: ['.google.com'], blockedDomains: ['mail.google.com'] })
    await waitToBecomeHealthy('https://www.google.com')
    expect(await curlThroughProxy('https://www.google.com')).toBe('200') // .google.com whitelisted → allowed
    expect(await curlThroughProxy('https://mail.google.com')).toBe('000') // mail.google.com blacklisted → blocked
    expect(await curlThroughProxy('https://httpbin.org')).toBe('000') // not in whitelist → blocked by default
  }, 60000)

  it('allow-all default: whitelist overrides blacklist, blacklist blocks, unlisted allows', async () => {
    config = await setupProxy({ defaultAllow: true, blockedDomains: ['.google.com'], allowedDomains: ['www.google.com'] })
    await waitToBecomeHealthy('https://www.google.com')
    expect(await curlThroughProxy('https://www.google.com')).toBe('200') // www.google.com whitelisted → overrides blacklist
    expect(await curlThroughProxy('https://mail.google.com')).toBe('000') // .google.com blacklisted → blocked
    expect(await curlThroughProxy('https://httpbin.org')).toBe('200') // not blacklisted → allowed by default
  }, 60000)
})

async function setupProxy(partialConfig: Partial<SecureClaudeConfig>): Promise<SecureClaudeConfig> {
  const id = crypto.randomBytes(4).toString('hex')
  const tmpDir = os.tmpdir()
  const dir = path.join(tmpDir, `secure-claude-test-${id}`)
  const config = { ...DEFAULT_CONFIG, cwd: tmpDir, tmpFolder: dir, projectName: id, ...partialConfig }
  await recreateTmpDir(config)
  await spawnHelper('Start httpproxy', 'docker', ['compose', 'run', '--rm', '-p', '9128:3128', '-d', 'httpproxy'], config.tmpFolder)
  return config
}

async function waitToBecomeHealthy(url: string): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const result = await curlThroughProxy(url)
    if (i === 9) {
      expect(result).toBe('200') // fail test if proxy is not healthy after 10 attempts
    }
    if (result === '200') break
    console.log('Waiting for proxy to be healthy...')
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  // wait for proxy to be healthy
  await new Promise(resolve => setTimeout(resolve, 1000))
}

async function curlThroughProxy(url: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    console.log(`Testing URL through proxy: ${url}`)
    const child = spawn('curl', ['--proxy', 'http://localhost:9128', '-s', '-o', '/dev/null', '-w', '%{http_code}', url])
    let stdout = ''
    child.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    child.on('error', (err) => { reject(err) })
    child.on('close', () => {
      console.log(`Received response code: ${stdout.trim()}`)
      resolve(stdout.trim())
    })
  })
}
