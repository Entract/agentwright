// Builds the web app, copies it into the Android project and assembles a debug APK.
// Capacitor 8 needs JDK 21 or newer. Set LAB_JAVA_HOME to choose one; otherwise
// JAVA_HOME is used, then the newest JDK under C:\Program Files\Java.
import { execSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function findJdk() {
  if (process.env.LAB_JAVA_HOME) return process.env.LAB_JAVA_HOME
  const base = 'C:\\Program Files\\Java'
  if (existsSync(base)) {
    const jdks = readdirSync(base)
      .map((name) => ({ name, major: Number(/^jdk-(\d+)/.exec(name)?.[1] ?? 0) }))
      .filter((j) => j.major >= 21)
      .sort((a, b) => b.major - a.major)
    if (jdks.length) return join(base, jdks[0].name)
  }
  return process.env.JAVA_HOME
}

const javaHome = findJdk()
if (!javaHome) throw new Error('No JDK 21+ found. Set LAB_JAVA_HOME to a JDK 21 or newer.')
const env = { ...process.env, JAVA_HOME: javaHome }
const run = (cmd, cwd = root) => execSync(cmd, { cwd, env, stdio: 'inherit' })

run('npm run build')
run('npx cap sync android')
const gradlew = join(root, 'android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')
run(`"${gradlew}" assembleDebug`, join(root, 'android'))
console.log(`\nAPK: ${join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')}`)
