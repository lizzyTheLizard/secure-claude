import { z } from 'zod'
import { PluginTool } from '../plugin.js'
import { GithubPluginConfig, GithubToolNames } from './config.js'

export interface GithubTool extends Omit<PluginTool, 'execute' | 'name'> {
  name: GithubToolNames
  execute: (config: GithubPluginConfig, input: Record<string, unknown>) => Promise<{ content: { type: 'text', text: string }[] }>
}

export const GITHUB_TOOLS: GithubTool[] = [
  {
    name: 'issues.read',
    description: 'List issues or get a specific issue. Provide issue_number to fetch a single issue; omit to list issues.',
    inputSchema: {
      issue_number: z.number().optional().describe('Issue number to retrieve; omit to list issues'),
      state: z.enum(['open', 'closed', 'all']).optional().describe('Filter by state when listing'),
      labels: z.string().optional().describe('Comma-separated label names to filter by when listing'),
    },
    execute: async (config, input) => {
      const { issue_number, state, labels } = input as { issue_number?: number, state?: string, labels?: string }
      if (issue_number !== undefined) {
        return await githubFetch(repoPath(config, `/issues/${issue_number.toString()}`))
      }
      const params = new URLSearchParams({ state: state ?? 'open', per_page: '50' })
      const allowedLabels = config.filters?.labels
      if (allowedLabels && allowedLabels.length > 0) params.set('labels', allowedLabels.join(','))
      else if (labels) params.set('labels', labels)
      return await githubFetch(repoPath(config, `/issues?${params.toString()}`))
    },
  },

  {
    name: 'issues.write',
    description: 'Create or update an issue. Provide issue_number to update an existing issue; omit to create a new one. title is required when creating.',
    inputSchema: {
      issue_number: z.number().optional().describe('Issue number to update; omit to create a new issue'),
      title: z.string().optional().describe('Issue title (required when creating)'),
      body: z.string().optional().describe('Issue body (markdown)'),
      state: z.enum(['open', 'closed']).optional().describe('New state (update only)'),
      labels: z.array(z.string()).optional().describe('Labels to apply'),
    },
    execute: async (config, input) => {
      const { issue_number, title, body, state, labels } = input as {
        issue_number?: number
        title?: string
        body?: string
        state?: string
        labels?: string[]
      }
      if (issue_number !== undefined) {
        return await githubFetch(repoPath(config, `/issues/${issue_number.toString()}`), {
          method: 'PATCH',
          body: JSON.stringify({ title, body, state, labels }),
        })
      }
      const allowedLabels = config.filters?.labels
      const effectiveLabels = labels ?? (allowedLabels && allowedLabels.length > 0 ? [allowedLabels[0]] : undefined)
      return await githubFetch(repoPath(config, '/issues'), {
        method: 'POST',
        body: JSON.stringify({ title, body, labels: effectiveLabels }),
      })
    },
  },

  {
    name: 'prs.read',
    description: 'List pull requests or get a specific PR. Provide pull_number to fetch a single PR; omit to list.',
    inputSchema: {
      pull_number: z.number().optional().describe('PR number to retrieve; omit to list'),
      state: z.enum(['open', 'closed', 'all']).optional().describe('Filter by state when listing'),
      base: z.string().optional().describe('Filter by base branch when listing'),
    },
    execute: async (config, input) => {
      const { pull_number, state, base } = input as { pull_number?: number, state?: string, base?: string }
      if (pull_number !== undefined) {
        return await githubFetch(repoPath(config, `/pulls/${pull_number.toString()}`))
      }
      const params = new URLSearchParams({ state: state ?? 'open', per_page: '50' })
      const allowedBranches = config.filters?.branches
      if (allowedBranches && allowedBranches.length > 0) params.set('base', allowedBranches[0])
      else if (base) params.set('base', base)
      return await githubFetch(repoPath(config, `/pulls?${params.toString()}`))
    },
  },

  {
    name: 'prs.create',
    description: 'Create a new pull request.',
    inputSchema: {
      title: z.string().describe('PR title'),
      head: z.string().describe('The branch containing changes'),
      base: z.string().describe('The branch to merge into'),
      body: z.string().optional().describe('PR description (markdown)'),
    },
    execute: async (config, input) => {
      const { title, head, base, body } = input as { title: string, head: string, base: string, body?: string }
      const allowedBranches = config.filters?.branches
      if (allowedBranches && allowedBranches.length > 0 && !allowedBranches.includes(base))
        throw new Error(`GitHub plugin: base branch "${base}" is not in the allowed branches list`)
      return await githubFetch(repoPath(config, '/pulls'), {
        method: 'POST',
        body: JSON.stringify({ title, head, base, body }),
      })
    },
  },

  {
    name: 'prs.update',
    description: 'Update an existing pull request.',
    inputSchema: {
      pull_number: z.number().describe('Pull request number'),
      title: z.string().optional().describe('New title'),
      body: z.string().optional().describe('New body'),
      state: z.enum(['open', 'closed']).optional().describe('New state'),
      base: z.string().optional().describe('New base branch'),
    },
    execute: async (config, input) => {
      const { pull_number, title, body, state, base } = input as {
        pull_number: number
        title?: string
        body?: string
        state?: string
        base?: string
      }
      const allowedBranches = config.filters?.branches
      if (base && allowedBranches && allowedBranches.length > 0 && !allowedBranches.includes(base))
        throw new Error(`GitHub plugin: base branch "${base}" is not in the allowed branches list`)
      return await githubFetch(repoPath(config, `/pulls/${pull_number.toString()}`), {
        method: 'PATCH',
        body: JSON.stringify({ title, body, state, base }),
      })
    },
  },

  {
    name: 'actions.read',
    description: 'List GitHub Actions workflow runs.',
    inputSchema: {
      workflow_id: z.string().optional().describe('Workflow file name or ID to filter by; omit to list all runs'),
      branch: z.string().optional().describe('Branch name to filter by'),
    },
    execute: async (config, input) => {
      const { workflow_id, branch } = input as { workflow_id?: string, branch?: string }
      const params = new URLSearchParams({ per_page: '20' })
      if (branch) params.set('branch', branch)
      const path = workflow_id
        ? repoPath(config, `/actions/workflows/${workflow_id}/runs?${params.toString()}`)
        : repoPath(config, `/actions/runs?${params.toString()}`)
      return await githubFetch(path)
    },
  },

  {
    name: 'actions.trigger',
    description: 'Trigger a GitHub Actions workflow dispatch event.',
    inputSchema: {
      workflow_id: z.string().describe('Workflow file name or ID'),
      ref: z.string().describe('Branch or tag to run the workflow on'),
      inputs: z.record(z.string(), z.string()).optional().describe('Workflow input parameters'),
    },
    execute: async (config, input) => {
      const { workflow_id, ref, inputs } = input as { workflow_id: string, ref: string, inputs?: Record<string, string> }
      const allowedBranches = config.filters?.branches
      if (allowedBranches && allowedBranches.length > 0 && !allowedBranches.includes(ref))
        throw new Error(`GitHub plugin: ref "${ref}" is not in the allowed branches list`)
      await githubFetch(repoPath(config, `/actions/workflows/${workflow_id}/dispatches`), {
        method: 'POST',
        body: JSON.stringify({ ref, inputs: inputs ?? {} }),
      })
      return { content: [{ type: 'text' as const, text: 'Workflow dispatch triggered successfully' }] }
    },
  },
]

async function githubFetch(path: string, options: { method?: string, body?: string } = {}): Promise<{ content: [{ type: 'text', text: string }] }> {
  const url = `https://api.github.com${path}`
  const res = await fetch(url, {
    method: options.method,
    body: options.body,
    headers: {
      'Authorization': `Bearer ${resolveToken()}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`GitHub API error ${res.status.toString()}: ${text}`)
  return { content: [{ type: 'text' as const, text }] }
}

function resolveToken(): string {
  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error('GitHub plugin: GITHUB_TOKEN environment variable is not set')
  return token
}

function repoPath(config: GithubPluginConfig, suffix: string): string {
  const repo = config.filters?.repository
  if (!repo) throw new Error('GitHub plugin: filters.repository is required for this tool')
  return `/repos/${repo}${suffix}`
}
