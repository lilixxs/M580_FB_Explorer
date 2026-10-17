// Test-only static host: mount the production folder under a real subpath.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'

const root = resolve('dist')
const prefix = '/explorer/'
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.md': 'text/plain; charset=utf-8', '.png': 'image/png' }
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    if (!pathname.startsWith(prefix)) { response.writeHead(404).end(); return }
    const file = resolve(root, pathname.slice(prefix.length) || 'index.html')
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return }
    const body = await readFile(file)
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' })
    response.end(body)
  } catch {
    response.writeHead(404).end()
  }
}).listen(5191, '127.0.0.1', () => console.log('Production test: http://127.0.0.1:5191/explorer/'))
