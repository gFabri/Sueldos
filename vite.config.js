import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

const packageJson = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const buildVersion =
  process.env.APP_VERSION ||
  `${packageJson.version}-${new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')
    .replace('T', '.')}`

function buildVersionPlugin() {
  return {
    name: 'build-version',
    transformIndexHtml(html) {
      return html
        .replace('__APP_VERSION__', buildVersion)
        .replaceAll('/favicon.svg', `/favicon.svg?v=${buildVersion}`)
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: buildVersion, builtAt: new Date().toISOString() }, null, 2),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), buildVersionPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion),
  },
  server: {
    proxy: {
      '/api/autogestion': {
        target: 'https://autogestion.tiendainglesa.net',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/autogestion/, ''),
      },
    },
  },
})
