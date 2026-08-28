const fs = require('fs')
const path = require('path')

const src = path.join(__dirname, '../web/dist')
const dest = path.join(__dirname, '../dist/public')

if (!fs.existsSync(src)) {
  console.error('web/dist not found — run npm run build:web first')
  process.exit(1)
}

// Clear the destination first. Vite content-hashes asset filenames, so copying
// without removing stale files leaves every previous build's bundles behind —
// they are unreachable (index.html names exactly one JS/CSS) but still get
// published, bloating the tarball with dead weight.
fs.rmSync(dest, { recursive: true, force: true })
fs.cpSync(src, dest, { recursive: true })
console.log('Copied web/dist → dist/public')
