export interface CommandConfig {
  commands?: CommandConfig[]
}

export interface CommandParam {
  name: string
  type: 'string' | 'number' | 'boolean'
  description: string
}

export interface CommandConfig {
  name: string
  description: string
  // Space-separated tokens; tokens matching {paramName} are replaced by the corresponding param value.
  // Each token becomes a separate argv element — no shell interpolation, preventing injection.
  template: string
  params: CommandParam[]
}

export const GIT_COMMANDS: CommandConfig[] = [
  {
    name: 'git_status',
    description: 'Show the working tree status',
    template: 'git status',
    params: [],
  },
  {
    name: 'git_diff',
    description: 'Show changes between commits, commit and working tree, etc.',
    template: 'git diff',
    params: [],
  },
  {
    name: 'git_log',
    description: 'Show recent commit log',
    template: 'git log --oneline -20',
    params: [],
  },
  {
    name: 'git_add',
    description: 'Stage a file or path',
    template: 'git add {path}',
    params: [{ name: 'path', type: 'string', description: 'File or directory path to stage' }],
  },
  {
    name: 'git_commit',
    description: 'Commit staged changes',
    template: 'git commit -m {message}',
    params: [{ name: 'message', type: 'string', description: 'Commit message' }],
  },
  {
    name: 'git_push',
    description: 'Push commits to the remote',
    template: 'git push',
    params: [],
  },
  {
    name: 'git_pull',
    description: 'Fetch and merge from the remote',
    template: 'git pull',
    params: [],
  },
  {
    name: 'git_checkout',
    description: 'Switch branches or restore files',
    template: 'git checkout {target}',
    params: [{ name: 'target', type: 'string', description: 'Branch name or file path' }],
  },
  {
    name: 'git_branch_list',
    description: 'List local branches',
    template: 'git branch',
    params: [],
  },
  {
    name: 'git_branch_delete',
    description: 'Delete a local branch',
    template: 'git branch -d {branch}',
    params: [{ name: 'branch', type: 'string', description: 'Branch name to delete' }],
  },
  {
    name: 'git_merge',
    description: 'Merge a branch into the current branch',
    template: 'git merge {branch}',
    params: [{ name: 'branch', type: 'string', description: 'Branch name to merge' }],
  },
  {
    name: 'git_stash',
    description: 'Stash current changes',
    template: 'git stash',
    params: [],
  },
  {
    name: 'git_stash_pop',
    description: 'Apply the most recent stash',
    template: 'git stash pop',
    params: [],
  },
]
