import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ALL_GIT_TOOL_NAMES, GitPluginConfig } from '../src/plugin/git/config.js'
import { GIT_TOOLS } from '../src/plugin/git/tools.js'
import gitPlugin from '../src/plugin/git/index.js'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

import { spawn } from 'node:child_process'

const BASE_CONFIG: GitPluginConfig = { type: 'git' }
const CONTEXT = { cwd: '/tmp/test-repo' }

function makeFakeProcess(stdout = '', stderr = '') {
  const fakeProc = {
    stdout: { on: vi.fn((event: string, cb: (d: Buffer) => void) => { if (event === 'data') cb(Buffer.from(stdout)) }) },
    stderr: { on: vi.fn((event: string, cb: (d: Buffer) => void) => { if (event === 'data') cb(Buffer.from(stderr)) }) },
    on: vi.fn((event: string, cb: () => void) => { if (event === 'close') cb() }),
  }
  return fakeProc as never
}

function rawTool(name: string) {
  const t = GIT_TOOLS.find(t => t.name === name)
  if (!t) throw new Error(`Tool "${name}" not found in GIT_TOOLS`)
  return t
}

// ---------------------------------------------------------------------------
// Tool filtering
// ---------------------------------------------------------------------------

describe('gitPlugin tool filtering', () => {
  it('returns all tools when no config', () => {
    const names = gitPlugin(BASE_CONFIG, CONTEXT).map(t => t.name)
    expect(names).toEqual([...ALL_GIT_TOOL_NAMES])
  })

  it('returns only the enabled subset', () => {
    const config: GitPluginConfig = { ...BASE_CONFIG, tools: { enabled: ['git_status', 'git_diff'] } }
    const names = gitPlugin(config, CONTEXT).map(t => t.name)
    expect(names).toEqual(['git_status', 'git_diff'])
  })

  it('removes blocked tools from the full set', () => {
    const config: GitPluginConfig = { ...BASE_CONFIG, tools: { blocked: ['git_push'] } }
    const tools = gitPlugin(config, CONTEXT)
    expect(tools.map(t => t.name)).not.toContain('git_push')
    expect(tools).toHaveLength(ALL_GIT_TOOL_NAMES.length - 1)
  })

  it('blocked tools override enabled ones', () => {
    const config: GitPluginConfig = {
      ...BASE_CONFIG,
      tools: { enabled: ['git_status', 'git_push'], blocked: ['git_push'] },
    }
    const names = gitPlugin(config, CONTEXT).map(t => t.name)
    expect(names).toEqual(['git_status'])
  })
})

// ---------------------------------------------------------------------------
// GIT_TOOLS array structure
// ---------------------------------------------------------------------------

describe('GIT_TOOLS', () => {
  it('has one tool per name in ALL_GIT_TOOL_NAMES', () => {
    const names = GIT_TOOLS.map(t => t.name)
    expect(new Set(names)).toEqual(new Set(ALL_GIT_TOOL_NAMES))
    expect(names).toHaveLength(ALL_GIT_TOOL_NAMES.length)
  })
})

// ---------------------------------------------------------------------------
// Branch filtering (via gitPlugin execute wrapper)
// ---------------------------------------------------------------------------

describe('branch filtering', () => {
  it('throws when branch does not match pattern (git_checkout)', async () => {
    const config: GitPluginConfig = { ...BASE_CONFIG, filters: { branches: ['^main$'] } }
    const tools = gitPlugin(config, CONTEXT)
    const t = tools.find(t => t.name === 'git_checkout')
    if (!t) throw new Error('git_checkout not found')
    await expect(t.execute({ target: 'feature/my-branch' }))
      .rejects.toThrow('does not match allowed pattern')
  })

  it('throws for git_branch_delete when branch does not match', async () => {
    const config: GitPluginConfig = { ...BASE_CONFIG, filters: { branches: ['^main$', '^develop$'] } }
    const tools = gitPlugin(config, CONTEXT)
    const t = tools.find(t => t.name === 'git_branch_delete')
    if (!t) throw new Error('git_branch_delete not found')
    await expect(t.execute({ branch: 'feature/bad' }))
      .rejects.toThrow('does not match allowed pattern')
  })

  it('throws for git_merge when branch does not match', async () => {
    const config: GitPluginConfig = { ...BASE_CONFIG, filters: { branches: ['^main$'] } }
    const tools = gitPlugin(config, CONTEXT)
    const t = tools.find(t => t.name === 'git_merge')
    if (!t) throw new Error('git_merge not found')
    await expect(t.execute({ branch: 'develop' }))
      .rejects.toThrow('does not match allowed pattern')
  })

  it('allows branch when it matches the pattern', async () => {
    vi.mocked(spawn).mockReturnValue(makeFakeProcess())
    const config: GitPluginConfig = { ...BASE_CONFIG, filters: { branches: ['^main$'] } }
    const tools = gitPlugin(config, CONTEXT)
    const t = tools.find(t => t.name === 'git_checkout')
    if (!t) throw new Error('git_checkout not found')
    await t.execute({ target: 'main' })
    expect(spawn).toHaveBeenCalledWith('git', ['checkout', 'main'], expect.anything())
  })

  it('allows any branch when no pattern is set', async () => {
    vi.mocked(spawn).mockReturnValue(makeFakeProcess())
    const tools = gitPlugin(BASE_CONFIG, CONTEXT)
    const t = tools.find(t => t.name === 'git_checkout')
    if (!t) throw new Error('git_checkout not found')
    await t.execute({ target: 'any-branch' })
    expect(spawn).toHaveBeenCalledWith('git', ['checkout', 'any-branch'], expect.anything())
  })

  it('does not filter branches for non-branch tools', async () => {
    vi.mocked(spawn).mockReturnValue(makeFakeProcess())
    const config: GitPluginConfig = { ...BASE_CONFIG, filters: { branches: ['^main$'] } }
    const tools = gitPlugin(config, CONTEXT)
    const t = tools.find(t => t.name === 'git_status')
    if (!t) throw new Error('git_status not found')
    await t.execute({})
    expect(spawn).toHaveBeenCalledWith('git', ['status'], expect.anything())
  })
})

// ---------------------------------------------------------------------------
// git_branch_list output filtering
// ---------------------------------------------------------------------------

describe('git_branch_list output filtering', () => {
  it('returns all branches when no pattern is set', async () => {
    const branchOutput = '  main\n* develop\n  feature/foo\n'
    vi.mocked(spawn).mockReturnValue(makeFakeProcess(branchOutput))
    const tools = gitPlugin(BASE_CONFIG, CONTEXT)
    const t = tools.find(t => t.name === 'git_branch_list')
    if (!t) throw new Error('git_branch_list not found')
    const result = await t.execute({})
    expect(result.content[0].text).toBe(branchOutput)
  })

  it('filters output to only matching branches', async () => {
    const branchOutput = '  main\n* develop\n  feature/foo\n'
    vi.mocked(spawn).mockReturnValue(makeFakeProcess(branchOutput))
    const config: GitPluginConfig = { ...BASE_CONFIG, filters: { branches: ['^main$', '^develop$'] } }
    const tools = gitPlugin(config, CONTEXT)
    const t = tools.find(t => t.name === 'git_branch_list')
    if (!t) throw new Error('git_branch_list not found')
    const result = await t.execute({})
    expect(result.content[0].text).toContain('main')
    expect(result.content[0].text).toContain('develop')
    expect(result.content[0].text).not.toContain('feature/foo')
  })

  it('preserves the current branch marker (*) for matching branches', async () => {
    const branchOutput = '* main\n  develop\n  feature/foo\n'
    vi.mocked(spawn).mockReturnValue(makeFakeProcess(branchOutput))
    const config: GitPluginConfig = { ...BASE_CONFIG, filters: { branches: ['^main$'] } }
    const tools = gitPlugin(config, CONTEXT)
    const t = tools.find(t => t.name === 'git_branch_list')
    if (!t) throw new Error('git_branch_list not found')
    const result = await t.execute({})
    expect(result.content[0].text).toContain('* main')
    expect(result.content[0].text).not.toContain('develop')
  })
})

// ---------------------------------------------------------------------------
// Direct tool execute — injection safety
// ---------------------------------------------------------------------------

describe('GIT_TOOLS direct execute', () => {
  beforeEach(() => { vi.mocked(spawn).mockReturnValue(makeFakeProcess()) })

  it('git_add passes path as separate argv element', async () => {
    await rawTool('git_add').execute('/tmp', { path: 'src/file.ts' })
    expect(spawn).toHaveBeenCalledWith('git', ['add', 'src/file.ts'], expect.anything())
  })

  it('git_commit passes message as separate argv element (injection-safe)', async () => {
    await rawTool('git_commit').execute('/tmp', { message: 'my commit; rm -rf /' })
    expect(spawn).toHaveBeenCalledWith('git', ['commit', '-m', 'my commit; rm -rf /'], expect.anything())
  })
})
