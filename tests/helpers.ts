import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { stringify } from 'yaml'

const INDEX_JS = path.resolve(import.meta.dirname, '../dist/bin/index.js')

export async function createTestDir(config: Record<string, unknown>): Promise<string> {
  const dir = path.join(os.tmpdir(), `secure-claude-test-${crypto.randomBytes(4).toString('hex')}`)
  await fsp.mkdir(dir, { recursive: true })
  await fsp.writeFile(path.join(dir, 'secure-claude.yaml'), stringify(config), 'utf8')
  return dir
}

export async function runSecureClaude(dir: string, prompt: string): Promise<void> {
  const start = Date.now()
  const args = [INDEX_JS, '-p', prompt, '--dangerously-skip-permissions', '--bare']
  console.log(`Running SecureClaude with args: ${args.slice(1).join(' ')} in directory ${dir}`)
  const claude = spawn('node', args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 100_000, cwd: dir })
  await new Promise<void>((resolve, reject) => {
    claude.stdout.on('data', (data: Buffer) => { console.debug('> ' + data.toString()) })
    claude.stderr.on('data', (data: Buffer) => { console.debug('! ' + data.toString()) })
    claude.on('error', (err) => { reject(new Error(`Failed to run claude: ${err.message}`)) })
    claude.on('close', (code) => {
      if (code === null || code !== 0) reject(new Error(`Claude exited with code ${code?.toString() ?? 'unknown'}`))
      else resolve()
    })
  })
  console.log(`SecureClaude process exited after ${((Date.now() - start) / 1000).toString()}s`)
}

export async function cleanup(dir: string): Promise<void> {
  const tmpFolder = path.join(dir, '.secureclaude')
  const exists = await fsp.access(tmpFolder).then(() => true).catch(() => false)
  if (exists) {
    await fsp.rm(dir, { recursive: true, force: true })
  }
  const kill = spawn('docker', ['compose', 'kill', '--remove-orphans'], { cwd: tmpFolder, stdio: 'pipe' })
  await new Promise<void>((resolve) => {
    kill.stdout.on('data', (data: Buffer) => { console.debug('> ' + data.toString()) })
    kill.stderr.on('data', (data: Buffer) => { console.debug('! ' + data.toString()) })
    kill.on('error', () => { resolve() })
    kill.on('close', () => { resolve() })
  })
}
