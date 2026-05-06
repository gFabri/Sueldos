import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { createProxyMiddleware } from 'http-proxy-middleware'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const port = process.env.PORT || 8080
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

app.use(express.static(distPath))

app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(port, () => {
  console.log(`Gestion app listening on ${port}`)
})

