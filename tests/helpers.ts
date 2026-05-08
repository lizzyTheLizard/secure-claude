import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { stringify } from 'yaml'
import { spawnHelper } from '../src/spawnHelper.js'

const INDEX_JS = path.resolve(import.meta.dirname, '../dist/bin/index.js')

export async function createTestDir(config: Record<string, unknown>): Promise<string> {
  const dir = path.join(os.tmpdir(), `secure-claude-test-${crypto.randomBytes(4).toString('hex')}`)
  await fsp.mkdir(dir, { recursive: true })
  await fsp.writeFile(path.join(dir, 'secure-claude.yaml'), stringify(config), 'utf8')
  return dir
}

export async function runSecureClaude(dir: string, prompt: string): Promise<void> {
  const start = Date.now()
  const args = [INDEX_JS, '-p', prompt, '--dangerously-skip-permissions', '--debug']
  console.log(`Running SecureClaude with args: ${args.slice(1).join(' ')} in directory ${dir}`)
  await spawnHelper('Claude', 'node', args, dir)
  console.log(`SecureClaude process exited after ${((Date.now() - start) / 1000).toString()}s`)
}

export async function cleanup(dir: string): Promise<void> {
  const tmpFolder = path.join(dir, '.secureclaude')
  await spawnHelper('Kill docker compose', 'docker', ['compose', 'kill', '--remove-orphans'], tmpFolder)
  const exists = await fsp.access(tmpFolder).then(() => true).catch(() => false)
  if (exists) {
    await fsp.rm(dir, { recursive: true, force: true })
  }
}
