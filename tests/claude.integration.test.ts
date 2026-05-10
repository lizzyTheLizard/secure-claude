import * as fsp from 'node:fs/promises'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as crypto from 'node:crypto'
import { it, afterEach, expect } from 'vitest'
import { spawnHelper } from '../src/spawnHelper.js'
import { stringify } from 'yaml'

let testDir: string
let roDir: string
let rwDir: string

afterEach(async () => {
  const tmpFolder = path.join(testDir, '.secureclaude')
  await spawnHelper('Kill docker compose', 'docker', ['compose', 'kill', '--remove-orphans'], tmpFolder)
  await spawnHelper('Prune volumes', 'docker', ['volume', 'prune', '-f'], tmpFolder)
  if (testDir) await fsp.rm(testDir, { recursive: true, force: true })
  if (roDir) await fsp.rm(roDir, { recursive: true, force: true })
  if (rwDir) await fsp.rm(rwDir, { recursive: true, force: true })
}, 30000)

const HELLO_PLUGIN_JS = `
module.exports = function() {
  return [{
    name: 'hello_world',
    description: 'Returns a greeting message',
    execute: async () => ({ content: [{ type: 'text', text: 'hello from plugin' }] })
  }];
};
`

it('Combined Integration Test', async () => {
  const id = crypto.randomBytes(4).toString('hex')

  // ro volume: readable but not writable
  roDir = path.join(os.tmpdir(), `secure-claude-ro-${id}`)
  const roFile = path.join(roDir, 'file.txt')
  await fsp.mkdir(roDir, { recursive: true })
  await fsp.writeFile(roFile, 'READ_ME', 'utf8')

  // rw volume: readable and writable
  rwDir = path.join(os.tmpdir(), `secure-claude-rw-${id}`)
  const rwFile = path.join(rwDir, 'file.txt')
  await fsp.mkdir(rwDir, { recursive: true })
  await fsp.writeFile(rwFile, 'ORIGINAL', 'utf8')

  // Test Dir
  testDir = path.join(os.tmpdir(), `secure-claude-base-${id}`)
  await fsp.mkdir(testDir, { recursive: true })
  // denied file: should appear empty inside container
  const envFile = path.join(testDir, '.env')
  await fsp.writeFile(envFile, 'SECRET=hunter2', 'utf8')
  // denied dir: should appear empty inside container
  const secretsDir = path.join(testDir, 'secrets')
  await fsp.mkdir(secretsDir)
  await fsp.writeFile(path.join(secretsDir, 'password.txt'), 'hunter2', 'utf8')
  // Is a git repo
  await spawnHelper('git init', 'git', ['init'], testDir)
  // Custom plugin file
  await fsp.writeFile(path.join(testDir, 'plugin.cjs'), HELLO_PLUGIN_JS, 'utf8')
  // Config
  const config = {
    plugins: [
      { type: 'git' },
      {
        type: 'commands',
        commands: [{
          name: 'wget_url',
          description: 'Fetch the contents of a URL using wget',
          template: 'wget -q -O - {url}',
          params: [{ name: 'url', type: 'string', description: 'The URL to fetch' }],
        }],
      },
      { type: 'custom', path: './plugin.cjs' },
    ],
    defaultAllow: false,
    deniedPaths: [envFile, secretsDir],
    additionalVolumes: [
      { path: roDir, mode: 'ro' },
      { path: rwDir, mode: 'rw' },
    ],
  }
  await fsp.writeFile(path.join(testDir, 'secure-claude.yaml'), stringify(config), 'utf8')

  const prompt
    = 'Complete all of the following tasks in order. '
      + 'Task 1: Use the git_status MCP tool and write its output to a file called STATUS.txt in the current directory. '
      + 'Task 2: Use the wget_url MCP tool to fetch https://example.com and write its output to a file called WGET.txt in the current directory. '
      + 'Task 3: Call the hello_world MCP tool and write its exact output to a file called PLUGIN.txt in the current directory. If the tool is not present or fails, write the error message to PLUGIN.txt instead. '
      + 'Task 4: Run each of the following bash commands in order and append the result line to RESULT.txt in the current directory. '
      + `4a. content=$(cat ${envFile} 2>/dev/null); [ -z "$content" ] && echo RESULT_FILE_DENY:EMPTY >> ${testDir}/RESULT.txt || echo RESULT_FILE_DENY:ACCESSIBLE >> ${testDir}/RESULT.txt; `
      + `4b. count=$(ls ${secretsDir} 2>/dev/null | wc -l | tr -d ' '); [ "$count" = "0" ] && echo RESULT_DIR_DENY:EMPTY >> ${testDir}/RESULT.txt || echo RESULT_DIR_DENY:NOT_EMPTY >> ${testDir}/RESULT.txt; `
      + `4c. echo "RESULT_RO_READ:$(cat ${roFile})" >> ${testDir}/RESULT.txt; `
      + `4d. echo overwrite > ${roFile} 2>/dev/null && echo RESULT_RO_WRITE:OK >> ${testDir}/RESULT.txt || echo RESULT_RO_WRITE:DENIED >> ${testDir}/RESULT.txt; `
      + `4e. echo MODIFIED > ${rwFile} && echo RESULT_RW_WRITE:OK >> ${testDir}/RESULT.txt || echo RESULT_RW_WRITE:DENIED >> ${testDir}/RESULT.txt; `
      + `4f. curl --max-time 1 -s -o /dev/null -w "RESULT_NET:%{http_code}\\n" https://httpbin.org >> ${testDir}/RESULT.txt. `
      + 'Output a short success message when done to stdout.'
  await runSecureClaude(testDir, prompt)

  const status = fs.readFileSync(path.join(testDir, 'STATUS.txt'), 'utf8')
  if (!status.includes('nothing to commit') && !status.includes('Untracked files') && !status.includes('No commits yet'))
    throw new Error(`Unexpected git status output: ${status}`)

  const wget = fs.readFileSync(path.join(testDir, 'WGET.txt'), 'utf8')
  if (!wget.includes('Example Domain'))
    throw new Error(`Unexpected wget output: ${wget}`)

  const plugin = fs.readFileSync(path.join(testDir, 'PLUGIN.txt'), 'utf8')
  if (!plugin.includes('hello from plugin'))
    throw new Error(`Expected "hello from plugin" in PLUGIN.txt, got: ${plugin}`)

  const result = fs.readFileSync(path.join(testDir, 'RESULT.txt'), 'utf8')
  expect(result).toContain('RESULT_FILE_DENY:EMPTY')
  expect(result).toContain('RESULT_DIR_DENY:EMPTY')
  expect(result).toContain('RESULT_RO_READ:READ_ME')
  expect(result).toContain('RESULT_RO_WRITE:DENIED')
  expect(result).toContain('RESULT_RW_WRITE:OK')
  expect(result).toContain('RESULT_NET:000')
  expect(fs.readFileSync(rwFile, 'utf8').trim()).toBe('MODIFIED')
}, 180000)

async function runSecureClaude(dir: string, prompt: string): Promise<void> {
  const start = Date.now()
  const indexJs = path.resolve(import.meta.dirname, '../dist/bin/index.js')
  const args = [indexJs, '-p', prompt, '--dangerously-skip-permissions', '--debug']
  console.log(`Running SecureClaude with args: ${args.slice(1).join(' ')} in directory ${dir}`)
  await spawnHelper('Claude', 'node', args, dir)
  console.log(`SecureClaude process exited after ${((Date.now() - start) / 1000).toString()}s`)
}
