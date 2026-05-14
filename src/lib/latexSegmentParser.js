/**
 * Split mixed prose + LaTeX into segments for KaTeX-first preview (no markdown).
 * Block: $$…$$, \begin{align*}…\end{align*}, etc.
 * Inline: legacy $…$, or \command… spans via consumeLatexAtom.
 */

import {
  consumeLatexAtom,
  preprocessBookletStructures,
  renderableMarkdown,
  splitByBalancedDoubleDollar,
} from "./questionFieldLatex"

/** Longer names first so \begin{align*} wins over \begin{align} substring issues. */
const BLOCK_ENVS = [
  "align*",
  "aligned",
  "align",
  "gather*",
  "gathered",
  "gather",
  "equation*",
  "equation",
  "eqnarray*",
  "eqnarray",
  "multline*",
  "multline",
  "cases",
  "bmatrix",
  "pmatrix",
  "vmatrix",
  "Bmatrix",
  "Vmatrix",
  "matrix",
  "smallmatrix",
  "split",
  "array",
]

function findNextBlockEnv(str, from) {
  let bestIdx = Infinity
  let best = null
  for (const env of BLOCK_ENVS) {
    const open = `\\begin{${env}}`
    const idx = str.indexOf(open, from)
    if (idx === -1 || idx > bestIdx) continue
    const close = `\\end{${env}}`
    const closeIdx = str.indexOf(close, idx + open.length)
    if (closeIdx === -1) continue
    bestIdx = idx
    best = {
      start: idx,
      end: closeIdx + close.length,
      tex: str.slice(idx, closeIdx + close.length),
    }
  }
  return best
}

function mergeAdjacentText(segments) {
  const out = []
  for (const seg of segments) {
    if (seg.type === "text" && !seg.value) continue
    if (seg.type !== "text" && !(seg.value && String(seg.value).trim())) continue
    const last = out[out.length - 1]
    if (last && last.type === "text" && seg.type === "text") {
      last.value += seg.value
    } else {
      out.push({ ...seg })
    }
  }
  return out
}

/**
 * @param {string} s
 * @returns {{ type: 'text' | 'inline', value: string }[]}
 */
function parseInlinePieces(s) {
  if (!s) return []
  let piece = s
  const segs = []
  let guard = 0
  while (piece.length && guard < 50_000) {
    guard += 1
    let i = 0
    let advanced = false
    while (i < piece.length) {
      if (piece[i] === "$" && piece[i + 1] !== "$") {
        const j = piece.indexOf("$", i + 1)
        if (j !== -1) {
          if (i > 0) segs.push({ type: "text", value: piece.slice(0, i) })
          segs.push({ type: "inline", value: piece.slice(i + 1, j) })
          piece = piece.slice(j + 1)
          advanced = true
          break
        }
      }
      if (piece[i] === "\\" && /[a-zA-Z@]/.test(piece[i + 1] || "")) {
        const end = consumeLatexAtom(piece, i)
        if (end > i + 1) {
          if (i > 0) segs.push({ type: "text", value: piece.slice(0, i) })
          segs.push({ type: "inline", value: piece.slice(i, end) })
          piece = piece.slice(end)
          advanced = true
          break
        }
      }
      i += 1
    }
    if (!advanced) {
      segs.push({ type: "text", value: piece })
      break
    }
  }
  return mergeAdjacentText(segs)
}

/**
 * @param {string} prose
 * @returns {{ type: 'text' | 'inline' | 'block', value: string }[]}
 */
function splitProseWithBlockEnvironments(prose) {
  const out = []
  let pos = 0
  let guard = 0
  while (pos < prose.length && guard < 10_000) {
    guard += 1
    const blk = findNextBlockEnv(prose, pos)
    if (!blk) {
      out.push(...parseInlinePieces(prose.slice(pos)))
      break
    }
    if (blk.start > pos) {
      out.push(...parseInlinePieces(prose.slice(pos, blk.start)))
    }
    out.push({ type: "block", value: blk.tex })
    pos = blk.end
  }
  return mergeAdjacentText(out)
}

/**
 * @param {string} source
 * @returns {{ type: 'text' | 'inline' | 'block', value: string }[]}
 */
export function parseLatexPreviewSegments(source) {
  let s = preprocessBookletStructures(String(source ?? ""))
  s = renderableMarkdown(s)
  const out = []
  const parts = splitByBalancedDoubleDollar(s)
  for (const part of parts) {
    if (!part) continue
    if (part.startsWith("$$") && part.endsWith("$$") && part.length >= 4) {
      const inner = part.slice(2, -2).trim()
      if (inner) out.push({ type: "block", value: inner })
      continue
    }
    if (part.trim()) {
      out.push(...splitProseWithBlockEnvironments(part))
    }
  }
  return mergeAdjacentText(out)
}
