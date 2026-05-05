import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { stringify } from 'yaml'
import { SecureClaudeConfig } from '../src/bin/config'

const INDEX_JS = path.resolve(import.meta.dirname, '../dist/bin/index.js')

function spawnAsync(cmd: string, args: string[], options: Parameters<typeof spawn>[2] = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, options)
    child.on('error', (err) => { reject(new Error(`Spawn error: ${err.message}`)) })
    child.on('close', () => { resolve() })
  })
}

export async function createTestDir(config: Partial<SecureClaudeConfig>): Promise<string> {
  const dir = path.join(os.tmpdir(), `secure-claude-test-${crypto.randomBytes(4).toString('hex')}`)
  await fsp.mkdir(dir, { recursive: true })
  await fsp.writeFile(path.join(dir, 'secure-claude.yaml'), stringify(config), 'utf8')
  return dir
}

export async function runSecureClaude(dir: string, prompt: string): Promise<void> {
  const start = Date.now()
  await spawnAsync('node', [INDEX_JS, '-p', prompt, '--dangerously-skip-permissions'], {
    cwd: dir,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env },
    timeout: 570_000,
  })
  console.log(`SecureClaude process exited after ${((Date.now() - start) / 1000).toString()}s`)
}

export async function login(): Promise<void> {
  const USER = os.userInfo().username
  const UID = String(os.userInfo().uid)
  const dockerCmd = (credPath: string) => spawnAsync('docker', [
    'run', '--rm',
    '-v', 'claudeHomeDir:/home',
    '-v', `${credPath}:/claudecredentials.tar.bz2`,
    'node', '/bin/sh', '-c',
    `mkdir -p /home/${USER} && tar -xjf /claudecredentials.tar.bz2 -C /home/${USER} && chown -R ${UID}:${UID} /home/${USER}`,
  ], { stdio: 'inherit' })

  if (process.env.CLAUDE_CREDENTIALS) {
    console.log('Decoding credentials from environment variable...')
    const credPath = '/tmp/claudecredentials.tar.bz2'
    await fsp.writeFile(credPath, Buffer.from(process.env.CLAUDE_CREDENTIALS, 'base64'))
    await dockerCmd(credPath)
    await fsp.rm(credPath)
  }
  else {
    const credPath = path.resolve('claudecredentials.tar.bz2')
    await fsp.access(credPath).catch(() => {
      throw new Error('No credentials provided. Please provide a claudecredentials.tar.bz2 file or set the CLAUDE_CREDENTIALS environment variable.')
    })
    await dockerCmd(credPath)
  }
  console.log('Login complete.')
}

export async function cleanup(dir: string): Promise<void> {
  const tmpFolder = path.join(dir, '.secureclaude')
  const exists = await fsp.access(tmpFolder).then(() => true).catch(() => false)
  if (exists) {
    await spawnAsync('docker', ['compose', 'kill', '--remove-orphans'], { cwd: tmpFolder })
  }
  await fsp.rm(dir, { recursive: true, force: true })
}
