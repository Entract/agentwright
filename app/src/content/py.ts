/** Tag for Python source in content files: keeps backslashes as written and drops the leading newline. */
export function py(strings: TemplateStringsArray): string {
  return String.raw(strings).replace(/^\n/, '')
}
