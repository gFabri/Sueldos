import express from 'express'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { createProxyMiddleware } from 'http-proxy-middleware'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const port = process.env.PORT || 8081
const distPath = path.join(__dirname, 'dist')
const dataDir = path.join(__dirname, 'data')
const gestionFile = path.join(dataDir, 'gestion.json')

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
if (!fs.existsSync(gestionFile)) fs.writeFileSync(gestionFile, '{}', 'utf8')

const readGestionDb = () => {
  try {
    return JSON.parse(fs.readFileSync(gestionFile, 'utf8') || '{}')
  } catch {
    return {}
  }
}

const writeGestionDb = (db) => {
  fs.writeFileSync(gestionFile, JSON.stringify(db, null, 2), 'utf8')
}

app.use(express.json())

app.use(
  '/api/autogestion',
  createProxyMiddleware({
    target: 'https://autogestion.tiendainglesa.net',
    changeOrigin: true,
    secure: true,
    pathRewrite: {
      '^/api/autogestion': '',
    },
  }),
)

app.get('/api/gestion/:year/:month', (req, res) => {
  const { year, month } = req.params
  const key = `${year}-${String(month).padStart(2, '0')}`
  const db = readGestionDb()
  res.json(db[key] || { income: '', items: [] })
})

app.put('/api/gestion/:year/:month', (req, res) => {
  const { year, month } = req.params
  const key = `${year}-${String(month).padStart(2, '0')}`
  const payload = req.body || {}
  const next = {
    income: payload.income ?? '',
    items: Array.isArray(payload.items) ? payload.items : [],
  }
  const db = readGestionDb()
  db[key] = next
  writeGestionDb(db)
  res.json({ ok: true })
})

app.use((req, res, next) => {
  if (req.path === '/' || req.path === '/horarios' || req.path === '/gestion' || req.path.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
  }
  next()
})

app.use('/assets', express.static(path.join(distPath, 'assets'), { maxAge: '1y', immutable: true }))
app.use(express.static(distPath))

app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(port, () => {
  console.log(`Gestion app listening on ${port}`)
})
