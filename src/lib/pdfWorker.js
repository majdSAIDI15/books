import { pdfjs } from 'react-pdf'
// `?url` : Vite copie le fichier dans les assets et renvoie son chemin. Le
// worker est ainsi servi par notre propre domaine.
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// Le worker était auparavant chargé depuis unpkg, avec un fallback de version
// `|| '3.11.174'`. Deux défauts : le lecteur cassait entièrement si le CDN était
// indisponible, et la version de repli ne correspond pas à celle embarquée par
// react-pdf (pdfjs-dist 5.x) — un worker majeur incompatible aurait été chargé.
// Ici la version est nécessairement celle du paquet installé.
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

export { pdfjs }
