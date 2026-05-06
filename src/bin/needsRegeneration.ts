import * as fsp from 'node:fs/promises'
import * as path from 'node:path'

export interface Manifest {
  generatedAt: string
  configFileLastChange?: string
}

export async function needsRegeneration(tmpFolder: string, configPath: string | undefined): Promise<boolean> {
  try {
    if (process.argv[2] === 'recreate') {
      console.info(`Regeneration requested via command line argument, regenerating files...`)
      process.argv.splice(2, 1) // Remove 'recreate' from arguments before passing to claude
      return true
    }

    const tmpFolderExists = await fsp.access(tmpFolder).then(() => true).catch(() => false)
    if (!tmpFolderExists) {
      console.info(`Folder "${tmpFolder}" not found, generating files...`)
      return true
    }

    const entries = await fsp.readdir(tmpFolder)
    if (entries.length === 0) {
      console.info(`Folder "${tmpFolder}" is empty, generating files...`)
      return true
    }

    const manifestPath = path.join(tmpFolder, '.manifest.json')
    const manifestExists = await fsp.access(manifestPath).then(() => true).catch(() => false)
    if (!manifestExists) {
      console.info('Manifest not found, generating files...')
      return true
    }

    const manifestRaw = await fsp.readFile(manifestPath, 'utf8')
    const manifest = JSON.parse(manifestRaw) as Manifest
    console.debug('Loaded manifest:', manifest)

    if (!configPath) {
      console.debug('No config file provided')
      if (manifest.configFileLastChange) {
        console.info('Config file was removed, regenerating files...')
        return true
      }
      console.debug('No config file before or now, no need to regenerate')
      return false
    }

    if (!manifest.configFileLastChange) {
      console.info('Config file was added, regenerating files...')
      return true
    }

    const configFileStats = await fsp.stat(configPath)
    const configFileLastChanged = new Date(manifest.configFileLastChange)
    if (configFileStats.mtimeMs - configFileLastChanged.getTime() > 100) {
      console.info('Config file changed, regenerating files...')
      return true
    }
    console.debug('Config file has not changed since last generation, no need to regenerate')
    return false
  }
  catch (err: unknown) {
    console.error(`Error reading folder "${tmpFolder}", regenerating files...`, err)
    return true
  }
}
