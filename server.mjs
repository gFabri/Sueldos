import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { createProxyMiddleware } from 'http-proxy-middleware'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const port = process.env.PORT || 8081
const distPath = path.join(__dirname, 'dist')

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

app.use((req, res, next) => {
  if (req.path === '/' || req.path === '/horarios' || req.path.endsWith('.html')) {
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

