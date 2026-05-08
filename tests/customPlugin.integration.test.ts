import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { describe, it, afterEach } from 'vitest'
import { createTestDir, runSecureClaude, cleanup } from './helpers.js'

let testDir: string

afterEach(async () => {
  if (testDir) await cleanup(testDir)
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

describe('custom plugin integration', () => {
  it('custom plugin tool can be invoked by Claude', async () => {
    testDir = await createTestDir({ plugins: [{ type: 'custom', path: './plugin.cjs' }] })
    await fsp.writeFile(path.join(testDir, 'plugin.cjs'), HELLO_PLUGIN_JS, 'utf8')
    await runSecureClaude(
      testDir,
      'Call the hello_world MCP tool and write its exact output to a file called result.txt in the current directory. Output "done" when finished.',
    )
    const result = fs.readFileSync(path.join(testDir, 'result.txt'), 'utf8')
    if (!result.includes('hello from plugin'))
      throw new Error(`Expected "hello from plugin" in result.txt, got: ${result}`)
  }, 120000)
})
