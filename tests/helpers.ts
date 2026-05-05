import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { stringify } from 'yaml'
import { SecureClaudeConfig } from '../src/bin/config'

const INDEX_JS = path.resolve(import.meta.dirname, '../dist/bin/index.js')

export function createTestDir(config: Partial<SecureClaudeConfig>): string {
  const dir = path.join(os.tmpdir(), `secure-claude-test-${crypto.randomBytes(4).toString('hex')}`)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'secure-claude.yaml'), stringify(config), 'utf8')
  return dir
}

export function runSecureClaude(dir: string, prompt: string): void {
  const start = Date.now()
  const result = spawnSync('node', [INDEX_JS, '-p', prompt, '--dangerously-skip-permissions'], {
    cwd: dir,
    stdio: ['ignore', 'inherit', 'inherit'],
    timeout: 570_000,
  })
  if (result.error) throw new Error(`Spawn error: ${result.error.message}`)
  console.log(`SecureClaude process exited with code ${result.status?.toString() ?? 'unknown'} after ${((Date.now() - start) / 1000).toString()}s`)
}

export function login(): void {
  if (!fs.existsSync('claudecredentials.tar.bz2') && !process.env.CLAUDE_CREDENTIALS) {
    throw new Error('No credentials provided. Please provide a claudecredentials.tar.bz2 file or set the CLAUDE_CREDENTIALS environment variable.')
  }
  if (process.env.CLAUDE_CREDENTIALS) {
    fs.writeFileSync('claudecredentials.tar.bz2', Buffer.from(process.env.CLAUDE_CREDENTIALS, 'base64'))
  }
  const USER = os.userInfo().username
  const UID = String(os.userInfo().uid)
  spawnSync('docker', ['run', '--rm', '-v', `claudeHomeDir:/home`, '-v', 'claudecredentials.tar.bz2:/claudecredentials.tar.bz2', 'node', '/bin/sh', '-c', `tar -xjf /claudecredentials.tar.bz2 -C /home/${USER} && chown -R ${UID}:${UID} /home/${USER}`])
  console.log('Login complete.')
}

export function cleanup(dir: string): void {
  const tmpFolder = path.join(dir, '.secureclaude')
  if (fs.existsSync(tmpFolder)) {
    spawnSync('docker', ['compose', 'kill', '--remove-orphans'], {
      cwd: tmpFolder,
      encoding: 'utf8',
    })
  }
  fs.rmSync(dir, { recursive: true, force: true })
}
