import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { stringify } from 'yaml'
import { SecureClaudeConfig } from '../src/bin/config'

const INDEX_JS = path.resolve(import.meta.dirname, '../dist/bin/index.js')

export async function createTestDir(config: Partial<SecureClaudeConfig>): Promise<string> {
  const dir = path.join(os.tmpdir(), `secure-claude-test-${crypto.randomBytes(4).toString('hex')}`)
  await fsp.mkdir(dir, { recursive: true })
  await fsp.writeFile(path.join(dir, 'secure-claude.yaml'), stringify(config), 'utf8')
  return dir
}

export async function runSecureClaude(dir: string, prompt: string): Promise<void> {
  const start = Date.now()
  const args = [INDEX_JS, '-p', prompt, '--dangerously-skip-permissions']
  console.log(`Running SecureClaude with args: ${args.slice(1).join(' ')} in directory ${dir}`)
  const claude = spawn('node', args, { stdio: ['ignore', 'inherit', 'inherit'], timeout: 100_000, cwd: dir })
  await new Promise<void>((resolve, reject) => {
    claude.on('error', (err) => { reject(new Error(`Failed to run claude: ${err.message}`)) })
    claude.on('close', (code) => {
      if (code === null || code !== 0) reject(new Error(`Claude exited with code ${code?.toString() ?? 'unknown'}`))
      else resolve()
    })
  })
  console.log(`SecureClaude process exited after ${((Date.now() - start) / 1000).toString()}s`)
}

export async function login(): Promise<void> {
  if (process.env.CLAUDE_CREDENTIALS) {
    console.log('Decoding credentials from environment variable...')
    const credPath = '/tmp/claudecredentials.tar.bz2'
    await fsp.writeFile(credPath, Buffer.from(process.env.CLAUDE_CREDENTIALS, 'base64'))
    await loginWIthCredentials(credPath)
    await fsp.rm(credPath)
  }
  else {
    const credPath = path.resolve('claudecredentials.tar.bz2')
    await fsp.access(credPath).catch(() => {
      throw new Error('No credentials provided. Please provide a claudecredentials.tar.bz2 file or set the CLAUDE_CREDENTIALS environment variable.')
    })
    await loginWIthCredentials(credPath)
  }
  console.log('Login complete.')
}

async function loginWIthCredentials(credPath: string): Promise<void> {
  const USER = os.userInfo().username
  const UID = String(os.userInfo().uid)
  const args = ['run', '--rm', '-v', 'claudeHomeDir:/home', '-v', `${credPath}:/claudecredentials.tar.bz2`, 'node', '/bin/sh', '-c', `mkdir -p /home/${USER} && tar -xjf /claudecredentials.tar.bz2 -C /home/${USER} && chown -R ${UID}:${UID} /home/${USER}`]
  const login = spawn('docker', args, { stdio: 'inherit' })
  await new Promise<void>((resolve, reject) => {
    login.on('error', (err) => { reject(new Error(`Failed to login: ${err.message}`)) })
    login.on('close', (code) => {
      if (code === null || code !== 0) reject(new Error(`Login exited with code ${code?.toString() ?? 'unknown'}`))
      else resolve()
    })
  })
}

export async function cleanup(dir: string): Promise<void> {
  const tmpFolder = path.join(dir, '.secureclaude')
  const exists = await fsp.access(tmpFolder).then(() => true).catch(() => false)
  if (exists) {
    await fsp.rm(dir, { recursive: true, force: true })
  }
  const kill = spawn('docker', ['compose', 'kill', '--remove-orphans'], { cwd: tmpFolder, stdio: 'inherit' })
  await new Promise<void>((resolve) => {
    kill.on('error', () => { resolve() })
    kill.on('close', () => { resolve() })
  })
}
