import { Capacitor } from '@capacitor/core'

/**
 * Hands a text file to the user. In the Android app it is written to the app's
 * cache and passed to the system share sheet (save to Files, Drive, email…).
 * In a browser it is downloaded.
 */
export async function saveTextFile(name: string, text: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')
    const written = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 })
    await Share.share({ title: name, files: [written.uri] })
    return
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
