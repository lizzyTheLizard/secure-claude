import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { describe, it, afterEach, expect } from 'vitest'
import loadCustomPlugin from '../src/plugin/custom/index.js'
import { CustomPluginConfig } from '../src/plugin/custom/config.js'

const tmpFiles: string[] = []

async function writeTmpPlugin(content: string): Promise<string> {
  const filePath = path.join(os.tmpdir(), `test-plugin-${crypto.randomBytes(4).toString('hex')}.cjs`)
  await fsp.writeFile(filePath, content, 'utf8')
  tmpFiles.push(filePath)
  return filePath
}

afterEach(async () => {
  for (const f of tmpFiles.splice(0)) {
    await fsp.unlink(f).catch(() => undefined)
  }
})

const VALID_PLUGIN = `
module.exports = function() {
  return [
    {
      name: 'hello',
      description: 'Says hello',
      execute: async () => ({ content: [{ type: 'text', text: 'hello' }] })
    }
  ];
};
`

const ZOD_PATH = JSON.stringify(require.resolve('zod'))

describe('loadCustomPlugin', () => {
  it('throws a clear error for a missing file', async () => {
    const config: CustomPluginConfig = { type: 'custom', path: './nonexistent-plugin.cjs' }
    await expect(loadCustomPlugin(config, { cwd: os.tmpdir() }))
      .rejects.toThrow('not found')
  })

  it('throws a clear error when the export is not a function', async () => {
    const filePath = await writeTmpPlugin('module.exports = { notAFunction: true };')
    const config: CustomPluginConfig = { type: 'custom', path: filePath }
    await expect(loadCustomPlugin(config, { cwd: os.tmpdir() }))
      .rejects.toThrow('must export a function')
  })

  it('throws a clear error when the return value is not an array', async () => {
    const filePath = await writeTmpPlugin('module.exports = function() { return {}; };')
    const config: CustomPluginConfig = { type: 'custom', path: filePath }
    await expect(loadCustomPlugin(config, { cwd: os.tmpdir() }))
      .rejects.toThrow('array')
  })

  it('throws a clear error when a tool is missing name', async () => {
    const filePath = await writeTmpPlugin(`
      module.exports = function() {
        return [{ description: 'x', execute: async () => ({}) }];
      };
    `)
    const config: CustomPluginConfig = { type: 'custom', path: filePath }
    await expect(loadCustomPlugin(config, { cwd: os.tmpdir() }))
      .rejects.toThrow('"name"')
  })

  it('throws a clear error when a tool is missing execute', async () => {
    const filePath = await writeTmpPlugin(`
      module.exports = function() {
        return [{ name: 'x', description: 'y' }];
      };
    `)
    const config: CustomPluginConfig = { type: 'custom', path: filePath }
    await expect(loadCustomPlugin(config, { cwd: os.tmpdir() }))
      .rejects.toThrow('"execute"')
  })

  it('returns a PluginTool with the correct name and callable execute', async () => {
    const filePath = await writeTmpPlugin(VALID_PLUGIN)
    const config: CustomPluginConfig = { type: 'custom', path: filePath }
    const tools = await loadCustomPlugin(config, { cwd: os.tmpdir() })
    expect(tools).toHaveLength(1)
    expect(tools[0].name).toBe('hello')
    const result = await tools[0].execute({})
    expect(result.content[0].text).toBe('hello')
  })

  it('returns all tools when a plugin defines multiple tools', async () => {
    const filePath = await writeTmpPlugin(`
      module.exports = function() {
        return [
          { name: 'tool_a', description: 'a', execute: async () => ({ content: [{ type: 'text', text: 'a' }] }) },
          { name: 'tool_b', description: 'b', execute: async () => ({ content: [{ type: 'text', text: 'b' }] }) },
        ];
      };
    `)
    const config: CustomPluginConfig = { type: 'custom', path: filePath }
    const tools = await loadCustomPlugin(config, { cwd: os.tmpdir() })
    expect(tools).toHaveLength(2)
    expect(tools.map(t => t.name)).toEqual(['tool_a', 'tool_b'])
  })

  it('resolves a relative plugin path against configPath directory', async () => {
    const dir = path.join(os.tmpdir(), `test-dir-${crypto.randomBytes(4).toString('hex')}`)
    await fsp.mkdir(dir)
    const pluginPath = path.join(dir, 'plugin.cjs')
    await fsp.writeFile(pluginPath, VALID_PLUGIN, 'utf8')
    tmpFiles.push(pluginPath)
    const config: CustomPluginConfig = { type: 'custom', path: './plugin.cjs' }
    const tools = await loadCustomPlugin(config, { cwd: dir })
    expect(tools).toHaveLength(1)

    await fsp.rm(dir, { recursive: true, force: true })
  })

  it('passes a Zod inputSchema through to the PluginTool', async () => {
    const filePath = await writeTmpPlugin(`
      const { z } = require(${ZOD_PATH});
      module.exports = function() {
        return [{
          name: 'typed_tool',
          description: 'has typed params',
          inputSchema: { msg: z.string(), count: z.number() },
          execute: async (input) => ({ content: [{ type: 'text', text: String(input.msg) }] })
        }];
      };
    `)
    const config: CustomPluginConfig = { type: 'custom', path: filePath }
    const tools = await loadCustomPlugin(config, { cwd: os.tmpdir() })
    expect(tools).toHaveLength(1)
    const schema = tools[0].inputSchema as Record<string, { safeParse: (v: unknown) => { success: boolean } }>
    expect(schema.msg.safeParse('hello').success).toBe(true)
    expect(schema.msg.safeParse(42).success).toBe(false)
    expect(schema.count.safeParse(42).success).toBe(true)
  })
})
