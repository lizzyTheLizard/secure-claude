import { spawn } from 'node:child_process'

export async function spawnHelper(name: string, command: string, args: string[], cwd?: string): Promise<void> {
  cwd = cwd ?? process.cwd()
  console.debug(`${name} started: ${command} [${args.map(arg => `'${arg}'`).join(', ')}] in ${cwd}`)
  const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
  await new Promise<void>((resolve, reject) => {
    child.stdout.on('data', (data: Buffer) => {
      data.toString().split('\n').forEach((line) => { console.debug('> ' + line) })
    })
    child.stderr.on('data', (data: Buffer) => {
      data.toString().split('\n').forEach((line) => { console.debug('! ' + line) })
    })
    child.on('error', (err) => { reject(new Error(`${name} failed: ${err.message}`)) })
    child.on('close', (code) => {
      if (code === null || code !== 0) reject(new Error(`${name} exited with code ${code?.toString() ?? 'unknown'}`))
      else resolve()
    })
  })
}
