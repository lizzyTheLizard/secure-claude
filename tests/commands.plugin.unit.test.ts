import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CommandsPluginConfig, CommandDef } from '../src/plugin/commands/config.js'
import { buildPluginTool, executeCommand } from '../src/plugin/commands/tools.js'
import commandsPlugin from '../src/plugin/commands/index.js'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

import { spawn } from 'node:child_process'

const CONTEXT = { cwd: '/tmp/test-repo' }

const ECHO_CMD: CommandDef = {
  name: 'echo_hello',
  description: 'Echo a message',
  template: 'echo {message}',
  params: [{ name: 'message', type: 'string', description: 'Message to echo' }],
}

const PING_CMD: CommandDef = {
  name: 'ping',
  description: 'Ping localhost',
  template: 'ping localhost',
}

function makeFakeProcess() {
  return {
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn((event: string, cb: () => void) => { if (event === 'close') cb() }),
  } as never
}

// ---------------------------------------------------------------------------
// commandsPlugin — tool list
// ---------------------------------------------------------------------------

describe('commandsPlugin', () => {
  it('returns empty list when no commands configured', () => {
    const config: CommandsPluginConfig = { type: 'commands' }
    expect(commandsPlugin(config, CONTEXT)).toEqual([])
  })

  it('returns one tool per CommandDef', () => {
    const config: CommandsPluginConfig = { type: 'commands', commands: [ECHO_CMD] }
    const tools = commandsPlugin(config, CONTEXT)
    expect(tools).toHaveLength(1)
    expect(tools[0].name).toBe('echo_hello')
    expect(tools[0].description).toBe('Echo a message')
  })

  it('builds inputSchema from params', () => {
    const config: CommandsPluginConfig = { type: 'commands', commands: [ECHO_CMD] }
    const tools = commandsPlugin(config, CONTEXT)
    expect(tools[0].inputSchema?.message).toBeDefined()
  })

  it('no params', () => {
    const config: CommandsPluginConfig = { type: 'commands', commands: [PING_CMD] }
    const tools = commandsPlugin(config, CONTEXT)
    expect(tools).toHaveLength(1)
    expect(tools[0].name).toBe('ping')
    expect(tools[0].description).toBe('Ping localhost')
    expect(tools[0].inputSchema).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// buildPluginTool — schema building
// ---------------------------------------------------------------------------

describe('buildPluginTool', () => {
  it('builds string param schema', () => {
    const tool = buildPluginTool('/tmp', ECHO_CMD)
    expect(tool.inputSchema?.message).toBeDefined()
  })

  it('builds number param schema', () => {
    const cmd: CommandDef = {
      name: 'count',
      description: 'Count',
      template: 'count {n}',
      params: [{ name: 'n', type: 'number', description: 'Number' }],
    }
    const tool = buildPluginTool('/tmp', cmd)
    expect(tool.inputSchema?.n).toBeDefined()
  })

  it('builds boolean param schema', () => {
    const cmd: CommandDef = {
      name: 'toggle',
      description: 'Toggle',
      template: 'toggle {flag}',
      params: [{ name: 'flag', type: 'boolean', description: 'Flag' }],
    }
    const tool = buildPluginTool('/tmp', cmd)
    expect(tool.inputSchema?.flag).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// executeCommand — parameter substitution and injection safety
// ---------------------------------------------------------------------------

describe('executeCommand', () => {
  beforeEach(() => { vi.mocked(spawn).mockReturnValue(makeFakeProcess()) })

  it('substitutes params injection-safely into separate argv elements', async () => {
    await executeCommand('/tmp', ECHO_CMD, { message: 'hello world' })
    expect(spawn).toHaveBeenCalledWith('echo', ['hello world'], expect.anything())
  })

  it('keeps non-param tokens as literal argv elements', async () => {
    const cmd: CommandDef = {
      name: 'git_commit',
      description: '',
      template: 'git commit -m {message}',
      params: [{ name: 'message', type: 'string', description: '' }],
    }
    await executeCommand('/tmp', cmd, { message: 'my commit' })
    expect(spawn).toHaveBeenCalledWith('git', ['commit', '-m', 'my commit'], expect.anything())
  })

  it('throws on missing required parameter', () => {
    expect(() => executeCommand('/tmp', ECHO_CMD, {}))
      .toThrow('Missing value for parameter "message"')
  })
})
