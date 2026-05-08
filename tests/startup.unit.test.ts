import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { configExists, loadConfig } from '../src/bin/config.js'
import { stringify } from 'yaml'

// configPath in config.ts is module-level: path.join(process.cwd(), 'secure-claude.yaml')
// vitest runs from the project root, which has no secure-claude.yaml, so "no config" tests
// work naturally. For "config present" tests we create and clean up the file.
const CONFIG_PATH = path.join(process.cwd(), 'secure-claude.yaml')

async function createProjectConfig(data: Record<string, unknown>): Promise<void> {
  await fsp.writeFile(CONFIG_PATH, stringify(data), 'utf8')
}

async function removeProjectConfig(): Promise<void> {
  await fsp.rm(CONFIG_PATH, { force: true })
}

describe('configExists', () => {
  it('returns false when no config file exists', async () => {
    expect(await configExists()).toBe(false)
  })

  describe('when config file is present', () => {
    beforeEach(async () => { await createProjectConfig({ defaultAllow: false }) })
    afterEach(async () => { await removeProjectConfig() })

    it('returns true', async () => {
      expect(await configExists()).toBe(true)
    })
  })
})

describe('loadConfig', () => {
  it('throws when no config file exists', async () => {
    await expect(loadConfig()).rejects.toThrow('No config file found')
  })

  describe('when config file is present', () => {
    beforeEach(async () => { await createProjectConfig({ defaultAllow: true }) })
    afterEach(async () => { await removeProjectConfig() })

    it('loads the config from disk', async () => {
      const config = await loadConfig()
      expect(config.defaultAllow).toBe(true)
    })
  })
})
