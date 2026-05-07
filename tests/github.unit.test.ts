import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { All_GITHUB_TOOL_NAMES, GithubPluginConfig } from '../src/plugin/github/config.js'
import { GITHUB_TOOLS } from '../src/plugin/github/tools.js'
import githubPlugin from '../src/plugin/github/index.js'

const BASE_CONFIG: GithubPluginConfig = { type: 'github' }

function tool(name: string) {
  const t = GITHUB_TOOLS.find(t => t.name === name)
  if (!t) throw new Error(`Tool "${name}" not found in GITHUB_TOOLS`)
  return t
}

// ---------------------------------------------------------------------------
// getEnabledGithubTools filtering
// ---------------------------------------------------------------------------

describe('getEnabledGithubTools', () => {
  it('returns all tools when none are configured', () => {
    const names = githubPlugin(BASE_CONFIG).map(t => t.name)
    expect(names).toEqual(All_GITHUB_TOOL_NAMES)
  })

  it('returns only the enabled subset', () => {
    const config: GithubPluginConfig = { ...BASE_CONFIG, tools: { enabled: ['issues.read', 'prs.read'] } }
    const names = githubPlugin(config).map(t => t.name)
    expect(names).toEqual(['issues.read', 'prs.read'])
  })

  it('removes blocked tools from the enabled set', () => {
    const config: GithubPluginConfig = {
      ...BASE_CONFIG,
      tools: { enabled: ['issues.read', 'issues.write', 'prs.read'], blocked: ['issues.write'] },
    }
    const names = githubPlugin(config).map(t => t.name)
    expect(names).toEqual(['issues.read', 'prs.read'])
  })

  it('blocked tools override enabled ones', () => {
    const config: GithubPluginConfig = { ...BASE_CONFIG, tools: { blocked: ['actions.trigger'] } }
    const tools = githubPlugin(config)
    expect(tools.map(t => t.name)).not.toContain('actions.trigger')
    expect(tools).toHaveLength(All_GITHUB_TOOL_NAMES.length - 1)
  })
})

// ---------------------------------------------------------------------------
// GITHUB_TOOLS array structure
// ---------------------------------------------------------------------------

describe('GITHUB_TOOLS', () => {
  it('has one tool per endpoint', () => {
    const names = GITHUB_TOOLS.map(t => t.name)
    expect(new Set(names)).toEqual(new Set(All_GITHUB_TOOL_NAMES))
  })
})

// ---------------------------------------------------------------------------
// GITHUB_TOKEN environment variable
// ---------------------------------------------------------------------------

describe('GITHUB_TOKEN environment variable', () => {
  beforeEach(() => { vi.restoreAllMocks() })
  afterEach(() => { delete process.env.GITHUB_TOKEN })

  it('throws a clear error when GITHUB_TOKEN is not set', async () => {
    delete process.env.GITHUB_TOKEN
    await expect(tool('issues.read').execute({ type: 'github', filters: { repository: 'owner/repo' } }, {}))
      .rejects.toThrow('GITHUB_TOKEN environment variable is not set')
  })

  it('uses GITHUB_TOKEN from the environment when making API calls', async () => {
    process.env.GITHUB_TOKEN = 'test-token'
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('[]'),
    } as unknown as Response)

    await tool('issues.read').execute({ type: 'github', filters: { repository: 'owner/repo' } }, {})

    expect(JSON.stringify(fetchSpy.mock.calls[0])).toContain('Bearer test-token')
  })
})

// ---------------------------------------------------------------------------
// label filtering
// ---------------------------------------------------------------------------

describe('issues.read label filtering', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.GITHUB_TOKEN = 'test-token'
  })
  afterEach(() => { delete process.env.GITHUB_TOKEN })

  it('enforces allowedLabels when configured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('[]'),
    } as unknown as Response)

    await tool('issues.read').execute({ type: 'github', filters: { repository: 'owner/repo', labels: ['bug'] } }, {})

    expect(fetchSpy.mock.calls[0][0] as string).toContain('labels=bug')
  })

  it('passes caller-supplied labels when no allowedLabels are configured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('[]'),
    } as unknown as Response)

    await tool('issues.read').execute({ type: 'github', filters: { repository: 'owner/repo' } }, { labels: 'enhancement' })

    expect(fetchSpy.mock.calls[0][0] as string).toContain('labels=enhancement')
  })
})

// ---------------------------------------------------------------------------
// branch filtering
// ---------------------------------------------------------------------------

describe('branch filtering', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.GITHUB_TOKEN = 'test-token'
  })
  afterEach(() => { delete process.env.GITHUB_TOKEN })

  it('rejects prs.create when base branch is not in allowedBranches', async () => {
    await expect(
      tool('prs.create').execute(
        { type: 'github', filters: { repository: 'owner/repo', branches: ['main'] } },
        { title: 'PR', head: 'feature', base: 'develop' },
      ),
    ).rejects.toThrow('not in the allowed branches list')
  })

  it('allows prs.create when base branch is in allowedBranches', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ number: 1 })),
    } as unknown as Response)

    const result = await tool('prs.create').execute(
      { type: 'github', filters: { repository: 'owner/repo', branches: ['main'] } },
      { title: 'PR', head: 'feature', base: 'main' },
    )
    expect(result.content[0].text).toContain('"number":1')
  })

  it('rejects actions.trigger when ref is not in allowedBranches', async () => {
    await expect(
      tool('actions.trigger').execute(
        { type: 'github', filters: { repository: 'owner/repo', branches: ['main'] } },
        { workflow_id: 'ci.yml', ref: 'develop' },
      ),
    ).rejects.toThrow('not in the allowed branches list')
  })

  it('enforces allowedBranches in prs.read list query', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('[]'),
    } as unknown as Response)

    await tool('prs.read').execute(
      { type: 'github', filters: { repository: 'owner/repo', branches: ['main'] } },
      {},
    )

    expect(fetchSpy.mock.calls[0][0] as string).toContain('base=main')
  })
})

// ---------------------------------------------------------------------------
// missing repository guard
// ---------------------------------------------------------------------------

describe('repository guard', () => {
  beforeEach(() => { process.env.GITHUB_TOKEN = 'test-token' })
  afterEach(() => { delete process.env.GITHUB_TOKEN })

  it('throws when filters.repository is not set', async () => {
    await expect(tool('issues.read').execute(BASE_CONFIG, {}))
      .rejects.toThrow('filters.repository is required')
  })
})
