/**
 * LaTeX-first authoring helpers for question fields (question text, solutions,
 * marking criteria). Produces markdown+remark-math compatible source by
 * injecting $ / $$ only at render time — stored content stays delimiter-free
 * when users author that way. Legacy $...$, $$...$$, \\[...\\], \\(...\\) still work.
 *
 * Booklet / HSC-style pastes: unwraps common non–KaTeX structural tags (\begin{question},
 * \qpart, etc.), fixes environment matching for nested align, and enables richer KaTeX.
 */

export const KATEX_RENDER_OPTIONS = {
  throwOnError: false,
  strict: "ignore",
  trust: true,
  errorColor: "#7d7068",
  macros: {
    "\\say": "\\text{#1}",
    "\\qsubpart": "\\text{[subpart]}",
    "\\qpart": "\\text{[part]}",
  },
}

export function renderableMarkdown(value = "") {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\\\[((?:.|\n)*?)\\\]/g, (_, expression) => `$$\n${expression.trim()}\n$$`)
    .replace(/\\\((.+?)\\\)/g, (_, expression) => `$${expression.trim()}$`)
}

function skipBrace(str, openIdx) {
  if (str[openIdx] !== "{") return openIdx + 1
  let depth = 1
  let i = openIdx + 1
  for (; i < str.length && depth > 0; i += 1) {
    const c = str[i]
    if (c === "{") depth += 1
    else if (c === "}") depth -= 1
    else if (c === "\\" && str[i + 1] === "{") {
      i += 1
    }
  }
  return i
}

function skipBracket(str, openIdx) {
  if (str[openIdx] !== "[") return openIdx + 1
  let depth = 1
  let i = openIdx + 1
  for (; i < str.length && depth > 0; i += 1) {
    const c = str[i]
    if (c === "[") depth += 1
    else if (c === "]") depth -= 1
  }
  return i
}

function skipParen(str, openIdx) {
  if (str[openIdx] !== "(") return openIdx + 1
  let depth = 1
  let i = openIdx + 1
  for (; i < str.length && depth > 0; i += 1) {
    const c = str[i]
    if (c === "(") depth += 1
    else if (c === ")") depth -= 1
  }
  return i
}

/**
 * From index at backslash, consume one LaTeX control sequence plus common suffixes
 * (braces, brackets, parens, ^, _) so `\sin(x)`, `\frac{a}{b}` become one atom.
 */
export function consumeLatexAtom(str, start) {
  if (start >= str.length || str[start] !== "\\") return start + 1
  let i = start + 1
  if (i >= str.length) return start + 1
  const c0 = str[i]
  if (!/[a-zA-Z@]/.test(c0)) {
    return i + 1
  }
  while (i < str.length && /[a-zA-Z@]/.test(str[i])) i += 1
  if (str[i] === "*") i += 1

  while (i < str.length) {
    const c = str[i]
    if (c === "{") {
      i = skipBrace(str, i)
      continue
    }
    if (c === "[") {
      i = skipBracket(str, i)
      continue
    }
    if (c === "(") {
      i = skipParen(str, i)
      continue
    }
    if (c === "^") {
      i += 1
      if (str[i] === "{") i = skipBrace(str, i)
      else if (/[0-9]/.test(str[i] || "")) {
        while (i < str.length && /[0-9]/.test(str[i])) i += 1
      } else if (str[i]) i += 1
      continue
    }
    if (c === "_") {
      i += 1
      if (str[i] === "{") i = skipBrace(str, i)
      else if (/[0-9]/.test(str[i] || "")) {
        while (i < str.length && /[0-9]/.test(str[i])) i += 1
      } else if (str[i]) i += 1
      continue
    }
    break
  }
  return i
}

const INLINE_ATOM_MAX = 2400

function wrapInlineLatexAtoms(segment) {
  if (!segment || segment.includes("$")) return segment
  let out = ""
  let i = 0
  while (i < segment.length) {
    if (segment[i] === "\\" && /[a-zA-Z@]/.test(segment[i + 1] || "")) {
      const end = consumeLatexAtom(segment, i)
      if (end > i + 1) {
        const atom = segment.slice(i, end)
        if (atom.length > INLINE_ATOM_MAX) {
          out += segment[i]
          i += 1
          continue
        }
        out += `$${atom}$`
        i = end
        continue
      }
    }
    out += segment[i]
    i += 1
  }
  return out
}

/**
 * Split on paired $$ … $$ so nested user display math does not break on first inner $$.
 */
export function splitByBalancedDoubleDollar(src) {
  const out = []
  let i = 0
  const n = src.length
  while (i < n) {
    const a = src.indexOf("$$", i)
    if (a === -1) {
      out.push(src.slice(i))
      break
    }
    if (a > i) out.push(src.slice(i, a))
    const b = src.indexOf("$$", a + 2)
    if (b === -1) {
      out.push(src.slice(a))
      break
    }
    out.push(src.slice(a, b + 2))
    i = b + 2
  }
  return out
}

/**
 * Wrap \begin{NAME}…\end{NAME} in $$ using matching name (handles nested \begin{cases} inside align*).
 */
function wrapBeginEndBalanced(segment) {
  if (!segment) return segment
  return segment.replace(
    /(^|\n)(\s*)(\\begin\{([^}]+)\}[\s\S]*?\\end\{\3\})/gm,
    (_, lead, sp, full) => `${lead}${sp}$$\n${full.trim()}\n$$`
  )
}

/**
 * Repeatedly wrap environments in segments that are not yet display blocks, so
 * multiple align blocks in one prose region all get delimiters.
 */
function wrapAllDisplayEnvironmentsIterated(src) {
  let cur = src
  let guard = 0
  let prev = null
  while (prev !== cur && guard < 16) {
    prev = cur
    guard += 1
    const parts = splitByBalancedDoubleDollar(cur)
    cur = parts
      .map((chunk) => {
        if (chunk.startsWith("$$") && chunk.endsWith("$$") && chunk.length >= 4) {
          return chunk
        }
        return wrapBeginEndBalanced(chunk)
      })
      .join("")
  }
  return cur
}

/**
 * Strip \qsubpart / \qpart bracket args and unwrap the main braced body (booklet markup).
 */
function stripQCommand(text, cmd) {
  const needle = `\\${cmd}`
  let out = ""
  let i = 0
  while (i < text.length) {
    const j = text.indexOf(needle, i)
    if (j < 0) {
      out += text.slice(i)
      break
    }
    out += text.slice(i, j)
    let k = j + needle.length
    if (/\w/.test(text[k] || "")) {
      out += needle
      i = j + needle.length
      continue
    }
    while (k < text.length && /\s/.test(text[k])) k += 1
    while (k < text.length && text[k] === "[") {
      const nk = skipBracket(text, k)
      if (nk <= k) break
      k = nk
      while (k < text.length && /\s/.test(text[k])) k += 1
    }
    if (k < text.length && text[k] === "{") {
      const end = skipBrace(text, k)
      const inner = text.slice(k + 1, end - 1).trim()
      out += `\n\n${inner}\n\n`
      i = end
    } else {
      out += text.slice(j, k)
      i = k
    }
  }
  return out
}

/**
 * Light cleanup for pasted exam booklets (custom envs / macros KaTeX does not know).
 */
export function preprocessBookletStructures(s) {
  let t = String(s).replace(/\r\n?/g, "\n")
  t = t.replace(/\\newpage\b/g, "\n\n---\n\n")
  t = t.replace(/\\begin\{question\}\s*/g, "")
  t = t.replace(/\\end\{question\}\s*/g, "\n\n")
  t = t.replace(/\\begin\{subparts\}\s*/g, "")
  t = t.replace(/\\end\{subparts\}\s*/g, "\n\n")
  t = stripQCommand(t, "qsubpart")
  t = stripQCommand(t, "qpart")
  t = t.replace(/\\setfontsize\{[^}]*\}/g, "")
  t = t.replace(/\\textwidth\b/g, "\\linewidth")
  return t
}

/**
 * Full pipeline for ReactMarkdown + remark-math + rehype-katex.
 */
export function toRemarkMathSource(raw) {
  let t = preprocessBookletStructures(raw)
  t = renderableMarkdown(t)
  if (!t.trim()) return t
  t = wrapAllDisplayEnvironmentsIterated(t)
  const parts = splitByBalancedDoubleDollar(t)
  return parts
    .map((chunk) => {
      if (chunk.startsWith("$$") && chunk.endsWith("$$") && chunk.length >= 4) {
        return chunk
      }
      return wrapInlineLatexAtoms(chunk)
    })
    .join("")
}
