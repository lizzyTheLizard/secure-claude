import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import os from 'node:os'
import { randomBytes } from 'node:crypto'

describe('check-release script', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = createTmpGitRepo()
  })

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('version not change from previous main commit', () => {
    const output = executeCheckRelease()
    expect(output).toEqual({ changed: 'false', version: '1.2.3' })
  })

  it('version changed from previous main commit', () => {
    const packageJson = { name: 'tmp-release-package', version: '1.3.0', type: 'module' }
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf8')
    fs.writeFileSync(path.join(tmpDir, 'RELEASE_NOTES.md'), '# Notes\n\n## 1.3.0\n- Initial release\n', 'utf8')
    git(['add', 'package.json', 'RELEASE_NOTES.md'], tmpDir)
    git(['commit', '-m', 'bump version'], tmpDir)

    const output = executeCheckRelease()
    expect(output).toEqual({ changed: 'true', version: '1.3.0' })
  })

  it('version changed from main commit before', () => {
    const packageJson = { name: 'tmp-release-package', version: '1.3.0', type: 'module' }
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf8')
    fs.writeFileSync(path.join(tmpDir, 'RELEASE_NOTES.md'), '# Notes\n\n## 1.2.3\n- Initial release\n', 'utf8')
    git(['add', 'package.json', 'RELEASE_NOTES.md'], tmpDir)
    git(['commit', '-m', 'bump version'], tmpDir)
    fs.writeFileSync(path.join(tmpDir, 'bump.txt'), randomBytes(16).toString('hex'), 'utf8')
    git(['add', 'bump.txt'], tmpDir)
    git(['commit', '-m', 'other commit'], tmpDir)

    const output = executeCheckRelease()
    expect(output).toEqual({ changed: 'false', version: '1.3.0' })
  })

  it('version changed compared to main', () => {
    git(['checkout', '-b', 'other'], tmpDir)
    const packageJson = { name: 'tmp-release-package', version: '1.3.0', type: 'module' }
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf8')
    fs.writeFileSync(path.join(tmpDir, 'RELEASE_NOTES.md'), '# Notes\n\n## 1.3.0\n- Initial release\n', 'utf8')
    git(['add', 'package.json', 'RELEASE_NOTES.md'], tmpDir)
    git(['commit', '-m', 'bump version'], tmpDir)
    fs.writeFileSync(path.join(tmpDir, 'bump.txt'), randomBytes(16).toString('hex'), 'utf8')
    git(['add', 'bump.txt'], tmpDir)
    git(['commit', '-m', 'other commit'], tmpDir)

    const output = executeCheckRelease()
    expect(output).toEqual({ changed: 'true', version: '1.3.0' })
  })

  it('release notes not changed', () => {
    const packageJson = { name: 'tmp-release-package', version: '1.3.0', type: 'module' }
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf8')
    git(['add', 'package.json'], tmpDir)
    git(['commit', '-m', 'bump version'], tmpDir)

    expect(() => executeCheckRelease()).toThrow()
  })

  it('has been released', () => {
    const packageJson = { name: 'node', version: '16.20.2', type: 'module' }
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf8')
    fs.writeFileSync(path.join(tmpDir, 'RELEASE_NOTES.md'), '# Notes\n\n## 16.20.2\n- Initial release\n', 'utf8')
    git(['add', 'package.json', 'RELEASE_NOTES.md'], tmpDir)
    git(['commit', '-m', 'bump version'], tmpDir)

    expect(() => executeCheckRelease()).toThrow()
  })

  function createTmpGitRepo(): string {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secure-claude-check-release-' + randomBytes(8).toString('hex')))
    const packageJson = { name: 'tmp-release-package', version: '1.2.3', type: 'module' }
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf8')
    fs.writeFileSync(path.join(tmpDir, 'RELEASE_NOTES.md'), '# Notes\n\n## 1.2.3\n- Initial release\n', 'utf8')
    const checkReleaseScript = path.resolve(__dirname, '../scripts/check-release.mjs')
    fs.mkdirSync(path.join(tmpDir, 'scripts'))
    fs.copyFileSync(checkReleaseScript, path.join(tmpDir, 'scripts/check-release.mjs'))

    git(['init'], tmpDir)
    git(['config', 'user.email', 'test@example.com'], tmpDir)
    git(['config', 'user.name', 'Test User'], tmpDir)
    git(['branch', '-m', 'main'], tmpDir)
    git(['add', 'package.json', 'RELEASE_NOTES.md'], tmpDir)
    git(['commit', '-m', 'initial'], tmpDir)
    fs.writeFileSync(path.join(tmpDir, 'bump.txt'), randomBytes(16).toString('hex'), 'utf8')
    git(['add', 'bump.txt'], tmpDir)
    git(['commit', '-m', 'second commit'], tmpDir)
    return tmpDir
  }

  function git(args: string[], cwd: string): void {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
    if (result.status !== 0) {
      throw new Error(`Command failed: git ${args.join(' ')}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`)
    }
  }

  function executeCheckRelease(): { changed: string, version: string } {
    const r = spawnSync('node', ['scripts/check-release.mjs'], { cwd: tmpDir, encoding: 'utf8', stdio: 'inherit' })
    if (r.status !== 0) {
      throw new Error(`check-release script failed with exit code ${r.status?.toString() ?? 'undefined'}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`)
    }
    const output = fs.readFileSync(path.join(tmpDir, 'release-check-result.txt'), 'utf8')
    const lines = output.split('\n').filter(line => line.trim() !== '')
    const result = { changed: '', version: '' }
    for (const line of lines) {
      const [key, value] = line.split('=')
      if (key === 'changed') result.changed = value
      else if (key === 'version') result.version = value
    }
    return result
  }
})
