import { spawn } from 'node:child_process'

class OutputBuffer {
  private buffer: string[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null

  append(prefix: string, data: Buffer): void {
    data.toString()
      .split('\n')
      .slice(0, -1)
      .forEach((line) => { this.buffer.push(prefix + line) })
    this.scheduleFlush()
  }

  flush(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    if (this.buffer.length > 0) {
      console.debug(this.buffer.join('\n'))
      this.buffer.length = 0
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) clearTimeout(this.flushTimer)
    this.flushTimer = setTimeout(() => { this.flush() }, 2000)
  }
}

export async function spawnHelper(name: string, command: string, args: string[], cwd?: string): Promise<void> {
  cwd = cwd ?? process.cwd()
  console.debug(`${name} started: ${command} [${args.map(arg => `'${arg}'`).join(', ')}] in ${cwd}`)
  const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
  const output = new OutputBuffer()

  await new Promise<void>((resolve, reject) => {
    child.stdout.on('data', (data: Buffer) => { output.append('> ', data) })
    child.stderr.on('data', (data: Buffer) => { output.append('! ', data) })
    child.on('error', (err) => {
      output.flush()
      reject(new Error(`${name} failed: ${err.message}`))
    })
    child.on('close', (code) => {
      output.flush()
      if (code === 0) resolve()
      else reject(new Error(`${name} exited with code ${code?.toString() ?? 'unknown'}`))
    })
  })
}
