import { describe, it, beforeAll, afterEach, expect } from 'vitest'
import { createTestDir, runSecureClaude, cleanup } from './helpers.ts'

let testDir: string

beforeAll(() => {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY must be set to run integration tests')
  }
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
    const output = runSecureClaude(testDir, MULTI_CURL_PROMPT)
    const r = extractResults(output)
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
    const output = runSecureClaude(testDir, MULTI_CURL_PROMPT)
    const r = extractResults(output)
    expect(r.WWW).toBe('200') // www.google.com whitelisted → overrides blacklist
    expect(r.MAIL).toBe('000') // .google.com blacklisted → blocked
    expect(r.HTTPBIN).toBe('200') // not blacklisted → allowed by default
  })
})

const MULTI_CURL_PROMPT
  = 'Run these three bash commands and output exactly three lines with no other text. '
    + 'Commands: '
    + 'curl --max-time 30 -s -o /dev/null -w "RESULT_WWW:%{http_code}" https://www.google.com; '
    + 'curl --max-time 30 -s -o /dev/null -w "RESULT_MAIL:%{http_code}" https://mail.google.com; '
    + 'curl --max-time 30 -s -o /dev/null -w "RESULT_HTTPBIN:%{http_code}" https://httpbin.org. '
    + 'Required output (three lines, nothing else): '
    + 'RESULT_WWW:<status_code> RESULT_MAIL:<status_code> RESULT_HTTPBIN:<status_code>'

function extractResults(output: string): Record<'WWW' | 'MAIL' | 'HTTPBIN', string> {
  function extract(key: string): string {
    const match = new RegExp(`RESULT_${key}:(\\d+)`).exec(output)
    if (!match) throw new Error(`Could not find RESULT_${key}:<code> in output:\n${output}`)
    return match[1]
  }
  return { WWW: extract('WWW'), MAIL: extract('MAIL'), HTTPBIN: extract('HTTPBIN') }
}
