export const All_GITHUB_TOOL_NAMES = [
  'issues.read',
  'issues.write',
  'prs.read',
  'prs.create',
  'prs.update',
  'actions.read',
  'actions.trigger',
]
export type GithubToolNames = (typeof All_GITHUB_TOOL_NAMES)[number]

export interface GithubPluginConfig {
  type: 'github'
  filters?: {
    repository?: string
    branches?: string[]
    labels?: string[]
  }
  tools?: {
    enabled?: GithubToolNames[]
    blocked?: GithubToolNames[]
  }
}
