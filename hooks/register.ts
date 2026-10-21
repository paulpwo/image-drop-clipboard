import type { ProcessRunResult, Register } from 'claude-code'

const EXT = '(?:png|jpe?g|gif|webp|tiff?|heic|bmp)'
// Terminals deliver a drop as a path: quoted, shell-escaped or a file:// URL.
// Only ASCII whitespace ends a path: macOS screenshot names hold U+202F.
const QUOTED_PATH = new RegExp(`(['"])((?:file://)?/[^'"\\n]+?\\.${EXT})\\1`, 'gi')
const ESCAPED_PATH = new RegExp(`(?:file://)?/(?:\\\\.|[^ \\t\\n\\\\'"])+?\\.${EXT}(?=[ \\t\\n]|$)`, 'gi')

type Found = { path: string; index: number; length: number }

function decodePath(raw: string): string | undefined {
  if (!raw.startsWith('file://')) return raw
  try {
    return decodeURIComponent(raw.slice('file://'.length))
  } catch {
    return undefined
  }
}

// A drop may arrive in several chunks, so look for a path in the whole box
// that the edit just completed (one that overlaps the inserted text).
function findDroppedPath(text: string, insertStart: number, insertEnd: number): Found | undefined {
  const overlaps = (m: RegExpExecArray) => m.index < insertEnd && m.index + m[0].length > insertStart
  for (const m of text.matchAll(QUOTED_PATH)) {
    const path = overlaps(m) ? decodePath(m[2]) : undefined
    if (path) return { path, index: m.index, length: m[0].length }
  }
  for (const m of text.matchAll(ESCAPED_PATH)) {
    const path = overlaps(m) ? decodePath(m[0].replace(/\\(.)/g, '$1')) : undefined
    if (path) return { path, index: m.index, length: m[0].length }
  }
  return undefined
}

type Run = (argv: readonly string[]) => Promise<ProcessRunResult>

async function copyImageMac(run: Run, path: string, tmpDir: string): Promise<boolean> {
  let png = path
  if (!/\.png$/i.test(path)) {
    png = `${tmpDir}/image-drop-clipboard.png`
    const converted = await run(['sips', '-s', 'format', 'png', path, '--out', png])
    if (converted.exitCode !== 0) return false
  }
  const result = await run([
    'osascript',
    '-e', 'on run argv',
    '-e', 'set the clipboard to (read (POSIX file (item 1 of argv)) as «class PNGf»)',
    '-e', 'end run',
    png,
  ])
  return result.exitCode === 0
}

async function copyImageLinux(run: Run, path: string): Promise<boolean> {
  const mime = /\.png$/i.test(path) ? 'image/png' : 'image/jpeg'
  const attempts: string[][] = [
    ['sh', '-c', 'wl-copy --type "$1" < "$2"', 'sh', mime, path],
    ['xclip', '-selection', 'clipboard', '-t', mime, '-i', path],
  ]
  for (const argv of attempts) {
    const exitCode = await run(argv).then(r => r.exitCode, () => 1)
    if (exitCode === 0) return true
  }
  return false
}

export const register: Register = on => {
  let platform: string | undefined

  on('prompt.edit', async ($, e, next) => {
    // A paste or drop carries no single key.
    if (e.key || !e.inputText) return next(e)
    const text = e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end)
    const found = findDroppedPath(text, e.start, e.start + e.inputText.length)
    if (!found || !(await $.fs.exists(found.path))) return next(e)

    const run: Run = argv => $.process.run(argv, { timeoutMs: 10_000 })
    platform ??= (await run(['uname', '-s'])).stdout.trim()

    let isCopied = false
    if (platform === 'Darwin') {
      const tmp = (await run(['sh', '-c', 'printf %s "${TMPDIR:-/tmp}"'])).stdout.replace(/\/$/, '')
      isCopied = await copyImageMac(run, found.path, tmp)
    } else if (platform === 'Linux') {
      isCopied = await copyImageLinux(run, found.path)
    }

    if (!isCopied) return next(e)

    $.ui.toast('Image copied to clipboard — press Ctrl+V to attach it')
    const before = text.slice(0, found.index)
    const after = text.slice(found.index + found.length).replace(/^[ \t]/, '')
    return { text: before + after, cursor: before.length }
  })
}
