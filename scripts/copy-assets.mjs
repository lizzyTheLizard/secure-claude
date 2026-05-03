import { cpSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

mkdirSync(join(root, 'dist', 'bin'), { recursive: true })
mkdirSync(join(root, 'dist', 'httpproxy'), { recursive: true })

cpSync(
  join(root, 'src', 'bin', 'docker-compose.yaml.template'),
  join(root, 'dist', 'bin', 'docker-compose.yaml.template'),
)

cpSync(
  join(root, 'src', 'httpproxy'),
  join(root, 'dist', 'httpproxy'),
  { recursive: true },
)
