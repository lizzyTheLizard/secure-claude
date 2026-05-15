import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { ALL_GIT_TOOL_NAMES } from '../src/plugin/git/config.js'
import { startTestMcpServer } from './testmcpserver.js'
import { spawnSync } from 'node:child_process'

async function createTempDir() {
  const dir = path.join(os.tmpdir(), `plugin-${crypto.randomBytes(4).toString('hex')}`)
  await fsp.mkdir(dir, { recursive: true })
  spawnSync('git', ['init'], { cwd: dir })
  return dir
}

describe('git plugin — all default tools', () => {
  let client: Client
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = await createTempDir()
    client = await startTestMcpServer({ type: 'git' }, tmpDir)
  }, 15000)

  afterAll(async () => {
    await fsp.rm(tmpDir, { force: true, recursive: true }).catch(() => undefined)
    await client.close()
  })

  it('lists all default git tools', async () => {
    const { tools } = await client.listTools()
    const toolNames = tools.map(t => t.name)
    for (const name of ALL_GIT_TOOL_NAMES) {
      expect(toolNames).toContain(name)
    }
  })

  it('calls git_status and returns output', async () => {
    const result = await client.callTool({ name: 'git_status', arguments: {} })
    const text = (result.content as { type: string, text: string }[])[0]?.text ?? ''
    expect(text).toBe('On branch master\n\nNo commits yet\n\nnothing to commit (create/copy files and use "git add" to track)\n')
  })
})

describe('git plugin — with blocked tools', () => {
  let client: Client
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = await createTempDir()
    client = await startTestMcpServer({ type: 'git', tools: { blocked: ['git_push', 'git_commit'] } }, tmpDir)
  }, 15000)

  afterAll(async () => {
    await fsp.rm(tmpDir, { force: true, recursive: true }).catch(() => undefined)
    await client.close()
  })

  it('omits blocked tools from the list', async () => {
    const { tools } = await client.listTools()
    const toolNames = tools.map(t => t.name)
    expect(toolNames).not.toContain('git_push')
    expect(toolNames).not.toContain('git_commit')
    expect(toolNames).toContain('git_status')
  })
})
