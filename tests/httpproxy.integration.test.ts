import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, it, beforeAll, afterEach, expect } from 'vitest'
import { createTestDir, runSecureClaude, cleanup, login } from './helpers.ts'

let testDir: string

beforeAll(() => {
  login()
})

afterEach(() => {
  if (testDir) cleanup(testDir)
})

describe('network policy enforcement', () => {
  it('deny-all default: whitelist allows, blacklist blocks, unlisted blocks', () => {
    testDir = createTestDir({
      defaultAllow: false,
      allowedDomains: ['.google.com'],
      blockedDomains: ['mail.google.com'],
    })
    runSecureClaude(testDir, MULTI_CURL_PROMPT)
    const r = extractResults(testDir)
    expect(r.WWW).toBe('200') // .google.com whitelisted → allowed
    expect(r.MAIL).toBe('000') // mail.google.com blacklisted → blocked
    expect(r.HTTPBIN).toBe('000') // not in whitelist → blocked by default
  })

  it('allow-all default: whitelist overrides blacklist, blacklist blocks, unlisted allows', () => {
    testDir = createTestDir({
      defaultAllow: true,
      blockedDomains: ['.google.com'],
      allowedDomains: ['www.google.com'],
    })
    runSecureClaude(testDir, MULTI_CURL_PROMPT)
    const r = extractResults(testDir)
    expect(r.WWW).toBe('200') // www.google.com whitelisted → overrides blacklist
    expect(r.MAIL).toBe('000') // .google.com blacklisted → blocked
    expect(r.HTTPBIN).toBe('200') // not blacklisted → allowed by default
  })
})

const MULTI_CURL_PROMPT
  = 'Run the following three bash commands to append results to a file called RESULT.txt in the current directory. '
    + 'curl --max-time 30 -s -o /dev/null -w "RESULT_WWW:%{http_code}\\n" https://www.google.com >> RESULT.txt; '
    + 'curl --max-time 30 -s -o /dev/null -w "RESULT_MAIL:%{http_code}\\n" https://mail.google.com >> RESULT.txt; '
    + 'curl --max-time 30 -s -o /dev/null -w "RESULT_HTTPBIN:%{http_code}\\n" https://httpbin.org >> RESULT.txt'
    + ' Output a short success message when done to stdout.'

function extractResults(dir: string): Record<'WWW' | 'MAIL' | 'HTTPBIN', string> {
  const content = fs.readFileSync(path.join(dir, 'RESULT.txt'), 'utf8')
  function extract(key: string): string {
    const match = new RegExp(`RESULT_${key}:(\\d+)`).exec(content)
    if (!match) throw new Error(`Could not find RESULT_${key}:<code> in RESULT.txt:\n${content}`)
    return match[1]
  }
  return { WWW: extract('WWW'), MAIL: extract('MAIL'), HTTPBIN: extract('HTTPBIN') }
}
