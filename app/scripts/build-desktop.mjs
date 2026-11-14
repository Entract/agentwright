// Builds the desktop Python Scratchpad: the scratchpad page (Vite) plus a small
// WebView2 window (.NET), with the guided course files beside it.
//
// Everything is built into ../desktop/build first. Installing copies that build
// into a new folder, ../desktop/app/<timestamp>/, and points the Desktop shortcut
// at it. A scratchpad that is still open keeps running from its old folder, so an
// update never needs the window to be closed: the next launch from the shortcut is
// the new version. Older folders are removed once nothing is using them.
// Pass --no-install to stop after building (for testing the new build).
import { execFileSync, execSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const desktop = join(root, '..', 'desktop')
const staging = join(desktop, 'build')
const releases = join(desktop, 'app')
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' })

run('npm run copy-pyodide')
run('npx tsc --noEmit')
run('npx vite build --config vite.desktop.config.ts')

rmSync(staging, { recursive: true, force: true })
run(`dotnet publish PythonScratchpad.csproj -c Release -r win-x64 --self-contained false -o "${staging}" --nologo -v quiet`, desktop)
cpSync(join(root, 'dist-desktop'), join(staging, 'web'), { recursive: true })
// The guided course: manifest, executable tests and answer key (not its self-test or caches).
cpSync(join(desktop, 'curriculum'), join(staging, 'curriculum'), {
  recursive: true,
  filter: (source) => !source.includes('__pycache__') && !/test_[a-z_]+\.py$/.test(source),
})
if (!existsSync(join(staging, 'PythonScratchpad.exe'))) throw new Error('Build finished but PythonScratchpad.exe was not produced.')
console.log(`\nBuilt ${join(staging, 'PythonScratchpad.exe')}`)

if (process.argv.includes('--no-install')) process.exit(0)

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
const target = join(releases, stamp)
mkdirSync(releases, { recursive: true })
cpSync(staging, target, { recursive: true })
const exe = join(target, 'PythonScratchpad.exe')

// Point the Desktop shortcut at the new folder (creating it if it is missing).
const quoted = (text) => `'${text.replace(/'/g, "''")}'`
const shortcut = [
  "$desk = [Environment]::GetFolderPath('Desktop')",
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desk 'Python Scratchpad.lnk'))",
  `$s.TargetPath = ${quoted(exe)}`,
  `$s.WorkingDirectory = ${quoted(target)}`,
  `$s.IconLocation = ${quoted(exe + ',0')}`,
  "$s.Description = 'Type Python, press Run, see the output. Includes the guided course.'",
  '$s.Save()',
].join('; ')
execFileSync('powershell', ['-NoProfile', '-Command', shortcut], { stdio: 'inherit' })

// Remove older installs that are no longer running. A folder in use cannot be deleted and is left for next time.
const old = [...readdirSync(releases).filter((name) => name !== stamp).map((name) => join(releases, name)), join(desktop, 'publish')]
for (const folder of old) {
  if (!existsSync(folder)) continue
  // Renaming the program file fails while it is running, which is a safe way to ask "is this in use?".
  const program = join(folder, 'PythonScratchpad.exe')
  try {
    if (existsSync(program)) rmSync(program)
    rmSync(folder, { recursive: true, force: true })
  } catch {
    console.log(`Still in use, left in place: ${folder}`)
  }
}
console.log(`Installed ${exe}\nThe Desktop shortcut "Python Scratchpad" now opens this version.`)
