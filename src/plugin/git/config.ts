export const ALL_GIT_TOOL_NAMES = [
  'git_status',
  'git_diff',
  'git_log',
  'git_add',
  'git_commit',
  'git_push',
  'git_pull',
  'git_checkout',
  'git_branch_list',
  'git_branch_delete',
  'git_merge',
  'git_stash',
  'git_stash_pop',
] as const

export type GitToolNames = (typeof ALL_GIT_TOOL_NAMES)[number]

export interface GitPluginConfig {
  type: 'git'
  tools?: {
    enabled?: GitToolNames[]
    blocked?: GitToolNames[]
  }
  branches?: {
    pattern?: string
  }
}
