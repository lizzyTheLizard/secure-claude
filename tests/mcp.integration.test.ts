import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, it, afterEach } from 'vitest'
import { createTestDir, runSecureClaude, cleanup } from './helpers.js'
import { spawnHelper } from '../src/spawnHelper.js'

let testDir: string

afterEach(async () => {
  if (testDir) await cleanup(testDir)
}, 30000)

describe('MCP host command execution', () => {
  it('git_status tool returns output from the host git repository', async () => {
    testDir = await createTestDir({ enableGitCommands: true })
    await spawnHelper('git init', 'git', ['init'], testDir)
    await runSecureClaude(
      testDir,
      'Output a list of all MCP server you have access to and their status.Use the git_status MCP tool and write its output to a file called STATUS.txt in the current directory. '
      + 'Output a short success message when done.',
    )
    const status = fs.readFileSync(path.join(testDir, 'STATUS.txt'), 'utf8')
    if (!status.includes('nothing to commit') && !status.includes('Untracked files') && !status.includes('No commits yet'))
      throw new Error(`Unexpected git status output: ${status}`)
  }, 120000)
})
