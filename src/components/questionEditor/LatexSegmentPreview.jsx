"use client"

import { useMemo } from "react"
import katex from "katex"

import { cn } from "@/lib/utils"
import { KATEX_RENDER_OPTIONS } from "@/lib/questionFieldLatex"
import { parseLatexPreviewSegments } from "@/lib/latexSegmentParser"

function escapeTextHtml(t) {
  return String(t ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br />")
}

function KaTeXBlock({ tex }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, {
        ...KATEX_RENDER_OPTIONS,
        displayMode: true,
        errorColor: "#7d7068",
      })
    } catch {
      return `<span class="axion-katex-fallback">${escapeTextHtml(tex)}</span>`
    }
  }, [tex])
  return (
    <div
      className="my-4 overflow-x-auto text-center [&_.katex]:text-[1.05em]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function KaTeXInline({ tex }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, {
        ...KATEX_RENDER_OPTIONS,
        displayMode: false,
        errorColor: "#7d7068",
      })
    } catch {
      return `<span class="axion-katex-fallback">${escapeTextHtml(tex)}</span>`
    }
  }, [tex])
  return (
    <span
      className="inline-block align-middle [&_.katex]:text-[1em]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/**
 * KaTeX-first preview: segments prose / inline / display without markdown.
 */
export function LatexSegmentPreview({ value, className, emptyMessage }) {
  const segments = useMemo(() => parseLatexPreviewSegments(value), [value])

  if (!segments.length) {
    return (
      <p className="font-serif text-sm italic text-[#6f6258]">
        {emptyMessage || "Preview will appear here."}
      </p>
    )
  }

  return (
    <div
      className={cn(
        "axion-question-math max-w-none break-words font-serif text-[17px] leading-[1.7] text-[#eee9e4]",
        className
      )}
    >
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          return (
            <span
              key={i}
              className="whitespace-normal"
              dangerouslySetInnerHTML={{ __html: escapeTextHtml(seg.value) }}
            />
          )
        }
        if (seg.type === "block") {
          return <KaTeXBlock key={i} tex={seg.value} />
        }
        return <KaTeXInline key={i} tex={seg.value} />
      })}
    </div>
  )
}
