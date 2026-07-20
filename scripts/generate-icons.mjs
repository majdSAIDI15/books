// Génère les icônes PNG de la PWA depuis public/favicon.svg.
//
// Android et iOS exigent du PNG : le SVG n'est pas accepté de façon fiable pour
// l'installation (et pas du tout pour l'icône d'écran d'accueil iOS).
//
// Lancer avec : npm run icons

import sharp from 'sharp'
import fs from 'node:fs/promises'
import path from 'node:path'

const SOURCE = 'public/favicon.svg'
const OUT_DIR = 'public/icons'

// Couleur de fond des icônes opaques. Le logo est violet sur fond transparent :
// sur l'écran d'accueil iOS, qui n'applique aucun fond, il faut le fournir.
const BACKGROUND = '#FFFFFF'

const TARGETS = [
  { file: 'icon-192.png', size: 192, padding: 0.12, background: BACKGROUND },
  { file: 'icon-512.png', size: 512, padding: 0.12, background: BACKGROUND },
  // Maskable : Android recadre l'icône selon la forme du lanceur (cercle,
  // goutte, carré arrondi). Il faut donc une marge large — la « safe zone » est
  // le cercle central de 80 % — sinon le logo est rogné.
  { file: 'icon-maskable-512.png', size: 512, padding: 0.22, background: '#534AB7' },
  { file: 'apple-touch-icon.png', size: 180, padding: 0.12, background: BACKGROUND }
]

const svg = await fs.readFile(SOURCE)
await fs.mkdir(OUT_DIR, { recursive: true })

for (const { file, size, padding, background } of TARGETS) {
  const inner = Math.round(size * (1 - padding * 2))
  const margin = Math.round((size - inner) / 2)

  const logo = await sharp(svg, { density: 512 })
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background
    }
  })
    .composite([{ input: logo, top: margin, left: margin }])
    .png()
    .toFile(path.join(OUT_DIR, file))

  console.log(`✓ ${OUT_DIR}/${file} (${size}×${size})`)
}
