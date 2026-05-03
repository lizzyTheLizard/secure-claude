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

export function runSecureClaude(dir: string, prompt: string): string {
  const result = spawnSync('node', [INDEX_JS, '-p', prompt, '--dangerously-skip-permissions'], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 570_000,
    env: { ...process.env },
  })
  const output = result.stdout + result.stderr
  if (result.error) throw new Error(`Spawn error: ${result.error.message}`)
  return output
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
