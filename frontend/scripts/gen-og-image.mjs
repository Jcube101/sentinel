// Draws the link-preview image (Open Graph), public/og-image.png: 1200 × 630,
// the favicon's level squares (three in ink, the fourth in red) over the
// masthead's SENTINEL and "Situation report · India", on paper. No headline and
// no date, so the image stays true for every edition.
//
//   node scripts/gen-og-image.mjs
//
// The browser draws it, in the site's own typefaces from Google Fonts, so it
// needs the network and a Chromium: $CHROME if set, else Playwright's cached
// headless shell (~/.cache/ms-playwright), else chromium on the PATH. No npm
// dependencies: it talks to the browser over the DevTools protocol.
//
// Everything is centred in a 630 px column, so a square crop (WhatsApp's small
// preview) still shows the whole card. Re-run if the palette, the masthead's
// type or public/favicon.svg changes. The service worker leaves this file out
// of its precache (vite.config.ts) and of its page route (src/sw.ts).

import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const WIDTH = 1200
const HEIGHT = 630
/** WhatsApp drops a preview image much over 300 KB. */
const MAX_BYTES = 300 * 1024

// The paper palette (src/index.css).
const PAPER = '#F3F0E8'
const INK = '#17171B'
const RED = '#A8221B'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'og-image.png')

// The favicon's grid: two 11-unit squares and a 2-unit gap = 24 units.
const UNIT = 7
// SENTINEL at 126 px is about 575 px wide: inside the 630 px column.
const WORDMARK_PX = 126
const LINE_PX = 34

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&family=IBM+Plex+Sans+Condensed:wght@700&display=block" rel="stylesheet">
<style>
  html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; background: ${PAPER}; color: ${INK}; }
  body { display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .squares { display: grid; grid-template-columns: ${11 * UNIT}px ${11 * UNIT}px; grid-auto-rows: ${11 * UNIT}px; gap: ${2 * UNIT}px; }
  .squares i { background: ${INK}; }
  .squares i:last-child { background: ${RED}; }
  /* As the masthead (PaperShell): Plex Sans Condensed bold, tracked 0.04em;
     Plex Mono in capitals, tracked 0.08em. Each line's tracking also follows
     its last letter, so a negative right margin keeps the line centred. */
  .wordmark { margin-top: 46px; font: 700 ${WORDMARK_PX}px/1 'IBM Plex Sans Condensed'; letter-spacing: 0.04em; margin-right: -0.04em; }
  .line { margin-top: 28px; font: 500 ${LINE_PX}px/1 'IBM Plex Mono'; letter-spacing: 0.08em; margin-right: -0.08em; text-transform: uppercase; }
</style>
</head>
<body>
  <div class="squares"><i></i><i></i><i></i><i></i></div>
  <div class="wordmark">SENTINEL</div>
  <div class="line">Situation report · India</div>
</body>
</html>
`

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME
  const cache = join(homedir(), '.cache', 'ms-playwright')
  if (existsSync(cache)) {
    for (const dir of readdirSync(cache).sort().reverse()) {
      for (const bin of ['chrome-linux/headless_shell', 'chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux/chrome']) {
        if (dir.startsWith('chromium') && existsSync(join(cache, dir, bin))) return join(cache, dir, bin)
      }
    }
  }
  for (const name of ['chromium', 'chromium-browser', 'google-chrome']) {
    try {
      return execFileSync('which', [name], { encoding: 'utf8' }).trim()
    } catch {
      // not on the PATH
    }
  }
  throw new Error('No Chromium found: set CHROME to a Chromium or headless-shell binary.')
}

/** Starts the browser and resolves with its DevTools WebSocket address. */
function launch(bin, profile) {
  const child = spawn(bin, [
    '--headless',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${WIDTH},${HEIGHT}`,
    'about:blank',
  ])
  return new Promise((resolve, reject) => {
    let err = ''
    child.stderr.on('data', (d) => {
      err += d
      const m = err.match(/DevTools listening on (ws:\/\/\S+)/)
      if (m) resolve({ child, ws: m[1] })
    })
    child.on('exit', (code) => reject(new Error(`Chromium exited (${code}):\n${err}`)))
  })
}

/** A minimal DevTools-protocol client on one page target. */
async function connect(browserWs) {
  const { port } = new URL(browserWs)
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const page = targets.find((t) => t.type === 'page')
  if (!page) throw new Error('Chromium opened no page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })
  let id = 0
  const pending = new Map()
  const waiters = new Map()
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`))
      else resolve(msg.result)
    } else if (msg.method && waiters.has(msg.method)) {
      waiters.get(msg.method)(msg.params)
      waiters.delete(msg.method)
    }
  }
  return {
    send: (method, params = {}) =>
      new Promise((resolve, reject) => {
        pending.set(++id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
      }),
    once: (method) => new Promise((resolve) => waiters.set(method, resolve)),
    close: () => ws.close(),
  }
}

const profile = mkdtempSync(join(tmpdir(), 'og-image-'))
const page = join(profile, 'og.html')
writeFileSync(page, html)
const { child, ws } = await launch(findChrome(), profile)
try {
  const cdp = await connect(ws)
  await cdp.send('Page.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false })
  const loaded = cdp.once('Page.loadEventFired')
  await cdp.send('Page.navigate', { url: pathToFileURL(page).href })
  await loaded

  // Fail rather than draw the card in a fallback face.
  const { result } = await cdp.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const faces = [
        ...(await document.fonts.load("700 ${WORDMARK_PX}px 'IBM Plex Sans Condensed'", 'SENTINEL')),
        ...(await document.fonts.load("500 ${LINE_PX}px 'IBM Plex Mono'", 'SITUATION REPORT · INDIA')),
      ]
      await document.fonts.ready
      return faces.map((f) => f.family + ' ' + f.weight + ' ' + f.status)
    })()`,
  })
  const faces = result.value ?? []
  for (const family of ['IBM Plex Sans Condensed', 'IBM Plex Mono']) {
    if (!faces.some((f) => f.includes(family) && f.endsWith('loaded'))) {
      throw new Error(`${family} did not load (is the network up?): ${JSON.stringify(faces)}`)
    }
  }

  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 },
  })
  const png = Buffer.from(data, 'base64')
  const w = png.readUInt32BE(16)
  const h = png.readUInt32BE(20)
  if (w !== WIDTH || h !== HEIGHT) throw new Error(`Drew ${w} × ${h}, not ${WIDTH} × ${HEIGHT}`)
  if (png.length > MAX_BYTES) throw new Error(`${png.length} bytes: over the ${MAX_BYTES}-byte limit`)
  writeFileSync(out, png)
  console.log(`og-image.png: ${w} × ${h}, ${(png.length / 1024).toFixed(1)} KiB`)
  cdp.close()
} finally {
  // The profile is still being written to until the browser has gone.
  if (child.exitCode === null) {
    const gone = new Promise((resolve) => child.once('exit', resolve))
    child.kill()
    await gone
  }
  rmSync(profile, { recursive: true, force: true })
}
