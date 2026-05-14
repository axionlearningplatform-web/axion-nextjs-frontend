/**
 * LaTeX-first authoring helpers for question fields (question text, solutions,
 * marking criteria). Produces markdown+remark-math compatible source by
 * injecting $ / $$ only at render time — stored content stays delimiter-free
 * when users author that way. Legacy $...$, $$...$$, \\[...\\], \\(...\\) still work.
 */

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
      // rare \{
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
    // `\\`, `\,`, `\%`, etc.
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
      else if (str[i]) i += 1
      continue
    }
    if (c === "_") {
      i += 1
      if (str[i] === "{") i = skipBrace(str, i)
      else if (str[i]) i += 1
      continue
    }
    break
  }
  return i
}

function wrapInlineLatexAtoms(segment) {
  if (!segment || segment.includes("$")) return segment
  let out = ""
  let i = 0
  while (i < segment.length) {
    if (segment[i] === "\\" && /[a-zA-Z@]/.test(segment[i + 1] || "")) {
      const end = consumeLatexAtom(segment, i)
      if (end > i + 1) {
        const atom = segment.slice(i, end)
        if (atom.length > 400) {
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

function wrapDisplayEnvironmentsInSegment(segment) {
  if (!segment || segment.includes("$")) return segment
  return segment.replace(
    /(^|\n)(\s*)(\\begin\{[^}]+\}[\s\S]*?\\end\{[^}]+\})/gm,
    (_, lead, sp, block) => `${lead}${sp}$$\n${block.trim()}\n$$`
  )
}

/**
 * Split by existing display math $$...$$ and process plain segments only.
 */
function processOutsideDisplayMath(src) {
  const parts = src.split(/(\$\$[\s\S]*?\$\$)/g)
  return parts
    .map((chunk) => {
      if (chunk.startsWith("$$") && chunk.endsWith("$$") && chunk.length > 4) {
        return chunk
      }
      let s = wrapDisplayEnvironmentsInSegment(chunk)
      s = wrapInlineLatexAtoms(s)
      return s
    })
    .join("")
}

/**
 * Full pipeline for ReactMarkdown + remark-math + rehype-katex.
 */
export function toRemarkMathSource(raw) {
  const base = renderableMarkdown(raw)
  if (!base.trim()) return base
  return processOutsideDisplayMath(base)
}
