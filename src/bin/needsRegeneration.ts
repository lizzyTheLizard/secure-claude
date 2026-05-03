import * as fs from 'node:fs'
import * as path from 'node:path'

export interface Manifest {
  generatedAt: string
  configFileLastChange?: string
}

export function needsRegeneration(tmpFolder: string, configPath: string | undefined): boolean {
  try {
    if (process.argv[2] === 'recreate') {
      console.info(`Regeneration requested via command line argument, regenerating files...`)
      process.argv.splice(2, 1) // Remove 'recreate' from arguments before passing to claude
      return true
    }

    if (!fs.existsSync(tmpFolder)) {
      console.info(`Secure folder "${tmpFolder}" not found, generating files...`)
      return true
    }

    const entries = fs.readdirSync(tmpFolder)
    if (entries.length === 0) {
      console.info(`Secure folder "${tmpFolder}" is empty, generating files...`)
      return true
    }

    const manifestPath = path.join(tmpFolder, '.manifest.json')
    if (!fs.existsSync(manifestPath)) {
      console.info('Manifest not found, generating files...')
      return true
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest

    if (!configPath && manifest.configFileLastChange) {
      console.info('Config file was removed, regenerating files...')
      return true
    }
    else if (configPath && !manifest.configFileLastChange) {
      console.info('Config file was added, regenerating files...')
      return true
    }
    else if (configPath && manifest.configFileLastChange) {
      const configFileChanged = fs.statSync(configPath).mtimeMs
      const configFileLastChanged = new Date(manifest.configFileLastChange).getTime()
      if (configFileChanged !== configFileLastChanged) {
        console.info('Config file changed, regenerating files...')
        return true
      }
    }
    return false
  }
  catch (err: unknown) {
    console.error('Error reading secure folder, regenerating files...', err)
    return true
  }
}
