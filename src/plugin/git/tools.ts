import { spawn } from 'node:child_process'
import { z } from 'zod'
import { McpToolResult, PluginTool } from '../plugin.js'
import { GitToolNames } from './config.js'

export interface GitTool extends Omit<PluginTool, 'execute' | 'name'> {
  name: GitToolNames
  branchParam?: string
  filterOutputByBranch?: boolean
  execute: (cwd: string, input: Record<string, unknown>) => Promise<McpToolResult>
}

export const GIT_TOOLS: GitTool[] = [
  {
    name: 'git_status',
    description: 'Show the working tree status',
    execute: cwd => spawnGit(cwd, ['git', 'status']),
  },
  {
    name: 'git_diff',
    description: 'Show changes between commits, commit and working tree, etc.',
    execute: cwd => spawnGit(cwd, ['git', 'diff']),
  },
  {
    name: 'git_log',
    description: 'Show recent commit log',
    execute: cwd => spawnGit(cwd, ['git', 'log', '--oneline', '-20']),
  },
  {
    name: 'git_add',
    description: 'Stage a file or path',
    inputSchema: { path: z.string().describe('File or directory path to stage') },
    execute: (cwd, input) => {
      const { path } = input as { path: string }
      return spawnGit(cwd, ['git', 'add', path])
    },
  },
  {
    name: 'git_commit',
    description: 'Commit staged changes',
    inputSchema: { message: z.string().describe('Commit message') },
    execute: (cwd, input) => {
      const { message } = input as { message: string }
      return spawnGit(cwd, ['git', 'commit', '-m', message])
    },
  },
  {
    name: 'git_push',
    description: 'Push commits to the remote',
    execute: cwd => spawnGit(cwd, ['git', 'push']),
  },
  {
    name: 'git_pull',
    description: 'Fetch and merge from the remote',
    execute: cwd => spawnGit(cwd, ['git', 'pull']),
  },
  {
    name: 'git_checkout',
    description: 'Switch branches or restore files',
    inputSchema: { target: z.string().describe('Branch name or file path') },
    branchParam: 'target',
    execute: (cwd, input) => {
      const { target } = input as { target: string }
      return spawnGit(cwd, ['git', 'checkout', target])
    },
  },
  {
    name: 'git_branch_list',
    description: 'List local branches',
    filterOutputByBranch: true,
    execute: cwd => spawnGit(cwd, ['git', 'branch']),
  },
  {
    name: 'git_branch_delete',
    description: 'Delete a local branch',
    inputSchema: { branch: z.string().describe('Branch name to delete') },
    branchParam: 'branch',
    execute: (cwd, input) => {
      const { branch } = input as { branch: string }
      return spawnGit(cwd, ['git', 'branch', '-d', branch])
    },
  },
  {
    name: 'git_merge',
    description: 'Merge a branch into the current branch',
    inputSchema: { branch: z.string().describe('Branch name to merge') },
    branchParam: 'branch',
    execute: (cwd, input) => {
      const { branch } = input as { branch: string }
      return spawnGit(cwd, ['git', 'merge', branch])
    },
  },
  {
    name: 'git_stash',
    description: 'Stash current changes',
    execute: cwd => spawnGit(cwd, ['git', 'stash']),
  },
  {
    name: 'git_stash_pop',
    description: 'Apply the most recent stash',
    execute: cwd => spawnGit(cwd, ['git', 'stash', 'pop']),
  },
]

function spawnGit(cwd: string, args: string[]): Promise<McpToolResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(args[0], args.slice(1), { cwd, stdio: 'pipe' })
    const chunks: string[] = []
    proc.stdout.on('data', (d: Buffer) => { chunks.push(d.toString()) })
    proc.stderr.on('data', (d: Buffer) => { chunks.push(d.toString()) })
    proc.on('error', (err) => { reject(new Error(`Git command failed: ${err.message}`)) })
    proc.on('close', () => { resolve({ content: [{ type: 'text' as const, text: chunks.join('') }] }) })
  })
}
