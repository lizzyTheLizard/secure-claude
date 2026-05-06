import * as fsp from 'node:fs/promises'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as crypto from 'node:crypto'
import { it, afterEach, expect } from 'vitest'
import { runSecureClaude, cleanup, createTestDir } from './helpers.js'

let testDir: string
let roDir: string
let rwDir: string

afterEach(async () => {
  if (testDir) await cleanup(testDir)
  if (roDir) await fsp.rm(roDir, { recursive: true, force: true })
  if (rwDir) await fsp.rm(rwDir, { recursive: true, force: true })
}, 30000)

it('volume mounts and denied paths all work correctly in a single container run', async () => {
  const id = crypto.randomBytes(4).toString('hex')
  testDir = path.join(os.tmpdir(), `secure-claude-test-${id}`)
  roDir = path.join(os.tmpdir(), `secure-claude-ro-${id}`)
  rwDir = path.join(os.tmpdir(), `secure-claude-rw-${id}`)

  await fsp.mkdir(testDir, { recursive: true })
  await fsp.mkdir(roDir, { recursive: true })
  await fsp.mkdir(rwDir, { recursive: true })

  // denied file: should appear empty inside container
  const envFile = path.join(testDir, '.env')
  await fsp.writeFile(envFile, 'SECRET=hunter2', 'utf8')

  // denied dir: should appear empty inside container
  const secretsDir = path.join(testDir, 'secrets')
  await fsp.mkdir(secretsDir)
  await fsp.writeFile(path.join(secretsDir, 'password.txt'), 'hunter2', 'utf8')

  // ro volume: readable but not writable
  await fsp.writeFile(path.join(roDir, 'file.txt'), 'READ_ME', 'utf8')

  // rw volume: readable and writable
  await fsp.writeFile(path.join(rwDir, 'file.txt'), 'ORIGINAL', 'utf8')

  testDir = await createTestDir({
    defaultAllow: false,
    deniedPaths: [envFile, secretsDir],
    additionalVolumes: [
      { path: roDir, mode: 'ro' },
      { path: rwDir, mode: 'rw' },
    ],
  })
  const roFile = path.join(roDir, 'file.txt')
  const rwFile = path.join(rwDir, 'file.txt')

  const prompt
    = 'Run each of the following bash commands in order and append the result line to RESULT.txt in the current directory. '
      + `1. content=$(cat ${envFile} 2>/dev/null); [ -z "$content" ] && echo RESULT_FILE_DENY:EMPTY >> ${testDir}/RESULT.txt || echo RESULT_FILE_DENY:ACCESSIBLE >> ${testDir}/RESULT.txt; `
      + `2. count=$(ls ${secretsDir} 2>/dev/null | wc -l | tr -d ' '); [ "$count" = "0" ] && echo RESULT_DIR_DENY:EMPTY >> ${testDir}/RESULT.txt || echo RESULT_DIR_DENY:NOT_EMPTY >> ${testDir}/RESULT.txt; `
      + `3. echo "RESULT_RO_READ:$(cat ${roFile})" >> ${testDir}/RESULT.txt; `
      + `4. echo overwrite > ${roFile} 2>/dev/null && echo RESULT_RO_WRITE:OK >> ${testDir}/RESULT.txt || echo RESULT_RO_WRITE:DENIED >> ${testDir}/RESULT.txt; `
      + `5. echo MODIFIED > ${rwFile} && echo RESULT_RW_WRITE:OK >> ${testDir}/RESULT.txt || echo RESULT_RW_WRITE:DENIED >> ${testDir}/RESULT.txt. `
      + 'Output a short success message when done to stdout.'

  await runSecureClaude(testDir, prompt)

  const result = fs.readFileSync(path.join(testDir, 'RESULT.txt'), 'utf8')
  expect(result).toContain('RESULT_FILE_DENY:EMPTY')
  expect(result).toContain('RESULT_DIR_DENY:EMPTY')
  expect(result).toContain('RESULT_RO_READ:READ_ME')
  expect(result).toContain('RESULT_RO_WRITE:DENIED')
  expect(result).toContain('RESULT_RW_WRITE:OK')
  expect(fs.readFileSync(rwFile, 'utf8').trim()).toBe('MODIFIED')
}, 100000)
