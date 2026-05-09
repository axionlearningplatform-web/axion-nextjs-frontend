//Preview Editor
import { memo, useEffect, useMemo, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"

import {
  Card,
  CardContent,
} from "@/components/ui/card"

const TIKZ_PREVIEW_URL = `/api/questions/tikz/preview/`

function AttachmentPreview({ attachment }) {
  if (!attachment?.data_url) return null

  return (
    <figure className="mx-auto my-5 max-w-full overflow-hidden rounded-[6px] border border-[#3c2c24] bg-[#14110e]">
      {attachment.mime_type?.startsWith("image/") && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={attachment.caption || attachment.name || "Question attachment"}
          className="mx-auto max-h-[260px] w-full object-contain"
          src={attachment.data_url}
        />
      )}
      {(attachment.caption || attachment.name) && (
        <figcaption className="border-t border-[#3c2c24] px-4 py-2 text-[11px] text-[#6f6258]">
          {attachment.caption || attachment.name}
        </figcaption>
      )}
    </figure>
  )
}

function DiagramSvg({ svg }) {
  if (!svg) return null

  return (
    <figure className="mx-auto my-6 max-w-full overflow-hidden">
      <div
        className="mx-auto flex max-w-full justify-center overflow-x-auto [&_svg]:h-auto [&_svg]:max-h-[320px] [&_svg]:max-w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </figure>
  )
}

function useDebouncedValue(value, delay = 650) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timeout)
  }, [value, delay])

  return debounced
}

function tikzSource(code) {
  const source = String(code || "").trim()
  if (!source) return ""
  if (source.includes("\\documentclass") || source.includes("\\begin{tikzpicture}")) {
    return source
  }
  if (source.includes("\\begin{axis}")) {
    return `\\begin{tikzpicture}\n${source}\n\\end{tikzpicture}`
  }
  return `\\begin{tikzpicture}\n${source}\n\\end{tikzpicture}`
}

function TikzInlinePreview({ code }) {
  const debouncedCode = useDebouncedValue(code, 650)
  const browserCode = useMemo(() => tikzSource(debouncedCode), [debouncedCode])
  const [renderStatus, setRenderStatus] = useState({ code: "", failed: false })
  const [backendPreview, setBackendPreview] = useState({
    code: "",
    status: "idle",
    svg: "",
    error: "",
    generatedTex: "",
    compilerOutput: "",
  })
  const renderFailed = renderStatus.code === browserCode && renderStatus.failed

  const srcDoc = useMemo(() => {
    const escapedCode = browserCode.replace(/<\/script/gi, "<\\/script")
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="https://tikzjax.com/v1/fonts.css" />
    <script src="https://tikzjax.com/v1/tikzjax.js"></script>
    <style>
      html, body { margin: 0; background: #12100e; color: #eee9e4; }
      body { min-height: 100%; display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box; }
      svg { max-width: 100%; height: auto; }
    </style>
  </head>
  <body>
    <script type="text/tikz">${escapedCode}</script>
    <script>
      window.setTimeout(function () {
        window.parent.postMessage({
          type: "axion-tikz-render",
          code: ${JSON.stringify(browserCode)},
          ok: Boolean(document.querySelector("svg"))
        }, "*");
      }, 1600);
    </script>
  </body>
</html>`
  }, [browserCode])

  useEffect(() => {
    function onMessage(event) {
      if (event.data?.type !== "axion-tikz-render") return
      setRenderStatus({ code: event.data.code || "", failed: !event.data.ok })
    }

    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  useEffect(() => {
    if (!renderFailed || !debouncedCode?.trim()) return
    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      setBackendPreview({
        code: browserCode,
        status: "loading",
        svg: "",
        error: "",
        generatedTex: "",
        compilerOutput: "",
      })

      fetch(TIKZ_PREVIEW_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tikz_code: debouncedCode }),
        signal: controller.signal,
      })
        .then(async (response) => {
          const data = await response.json().catch(() => ({}))
          if (!response.ok) {
            const error = new Error(data.latex_error || data.detail || "TikZ backend preview failed.")
            error.generatedTex = data.generated_tex || ""
            error.compilerOutput = data.compiler_output || ""
            throw error
          }
          setBackendPreview({
            code: browserCode,
            status: "success",
            svg: data.svg || "",
            error: "",
            generatedTex: "",
            compilerOutput: "",
          })
        })
        .catch((error) => {
          if (error.name === "AbortError") return
          setBackendPreview({
            code: browserCode,
            status: "error",
            svg: "",
            error: error.message || "TikZ could not render.",
            generatedTex: error.generatedTex || "",
            compilerOutput: error.compilerOutput || "",
          })
        })
    }, 0)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [browserCode, debouncedCode, renderFailed])

  if (!browserCode) return null

  if (backendPreview.code === browserCode && backendPreview.status === "success" && backendPreview.svg) {
    return <DiagramSvg svg={backendPreview.svg} />
  }

  if (renderFailed && backendPreview.code === browserCode) {
    if (backendPreview.status === "loading") {
      return (
        <div className="my-6 rounded-[8px] border border-[#3c2c24] bg-[#12100e] px-4 py-5 text-center text-sm text-[#9d806c]">
          Compiling TikZ preview with Tectonic...
        </div>
      )
    }

    if (backendPreview.status === "error") {
      return (
        <div className="my-6 rounded-[8px] border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          <p className="font-semibold">TikZ could not render.</p>
          <p className="mt-1 text-amber-100/75">
            Browser preview failed, and backend compilation returned an error.
          </p>
          <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-black/20 p-3 text-[11px] text-amber-50/80">
            {backendPreview.error}
          </pre>
          {backendPreview.compilerOutput && (
            <details className="mt-3 rounded-md border border-amber-200/15 bg-black/10 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-amber-50/85">
                Compiler output
              </summary>
              <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap text-[11px] text-amber-50/75">
                {backendPreview.compilerOutput}
              </pre>
            </details>
          )}
          {backendPreview.generatedTex && (
            <details className="mt-3 rounded-md border border-amber-200/15 bg-black/10 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-amber-50/85">
                Generated TeX
              </summary>
              <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap text-[11px] text-amber-50/75">
                {backendPreview.generatedTex}
              </pre>
            </details>
          )}
        </div>
      )
    }
  }

  return (
    <figure className="mx-auto my-6 max-w-full overflow-hidden">
      <iframe
        className="h-[300px] w-full bg-[#12100e]"
        sandbox="allow-scripts"
        srcDoc={srcDoc}
        title="TikZ inline preview"
      />
    </figure>
  )
}

function prepareMarkdown(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\\\[((?:.|\n)*?)\\\]/g, (_, expression) => `$$\n${expression.trim()}\n$$`)
    .replace(/\\\((.+?)\\\)/g, (_, expression) => `$${expression.trim()}$`)
    .split("\n")
    .map((line) => {
      const trimmedRight = line.replace(/\s+$/g, "")
      return trimmedRight.replace(
        /^(\s*)\*\*(\d+)\.\s+(.+?)\*\*$/,
        "$1$2. **$3**"
      )
    })
    .join("\n")
    .replace(/(?<!\n)\n(?!\n)/g, "  \n")
}

function MarkdownBlock({ children }) {
  const markdown = prepareMarkdown(children)

  return (
    <div className="prose prose-invert max-w-none overflow-hidden break-words font-serif text-[17px] leading-[1.7] text-[#eee9e4]">
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="my-4 first:mt-0 last:mb-0">{children}</p>,
          ol: ({ children }) => (
            <ol className="my-5 list-outside list-decimal space-y-1.5 pl-6">
              {children}
            </ol>
          ),
          ul: ({ children }) => (
            <ul className="my-5 list-outside list-disc space-y-1.5 pl-6">
              {children}
            </ul>
          ),
          li: ({ children }) => (
            <li className="pl-1 marker:text-[#8f8982]">{children}</li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-[#f3ede6]">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-[#efe4da]">{children}</em>
          ),
          code: ({ children }) => (
            <code className="whitespace-pre-wrap break-words">{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words">
              {children}
            </pre>
          ),
        }}
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}

function PreviewPanelBase({
  subject,
  marks,
  questionText,
  hints = [],
  parts = [],
  attachments = [],
  importSource = "",
  tags = [],
  headerAction = null,
  diagramSvg = "",
  tikzCode = "",
}) {
  const hasParts = parts.length > 0
  const hasHint = hints.some((hint) => hint.text) ||
    parts.some((part) => (part.hints || []).some((hint) => hint.text))

  return (
    <Card className="min-w-0 self-start w-full overflow-hidden rounded-[12px] border-[#4c3427]/60 bg-[#0d0d0b] text-[#e8e4dc] shadow-2xl shadow-black/25">
      <CardContent className="min-w-0 p-0">
        <div className="relative border-b border-[#3b2a22]/55 px-5 py-5">
          {headerAction && (
            <div className="absolute left-4 top-4 z-10">
              {headerAction}
            </div>
          )}
          <p className="text-center font-serif text-[23px] font-medium leading-none tracking-[0.01em] text-[#cfc4b9]">
            Live Preview
          </p>
          <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-[2px] border border-[#3c2c24] bg-[#120f0d] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7f746b]">
                {subject || "Subject"}
              </span>
              {tags.map((tag) => (
                <span
                  className="rounded-[2px] border border-[#8b5e42]/55 bg-[#d49a71]/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#dba476]"
                  key={tag.id || tag.name}
                >
                  {tag.name}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-4 text-[12px] tracking-[0.04em] text-[#8f8378]">
              <span>{marks || 0} marks</span>
              <span className="text-[#51483f]">·</span>
              <span className="inline-flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-[#c8864a]" />
                0:00
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-6 px-5 py-7 lg:grid-cols-[minmax(0,1fr)_120px]">
          <div className="min-w-0">
            {questionText ? (
              <div className="flex items-start gap-3">
                <MarkdownBlock>{questionText}</MarkdownBlock>
                {hasHint && (
                  <span className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#3c322b] bg-[#17110e] px-2.5 py-1 text-[10px] font-medium tracking-[0.04em] text-[#6f6258]">
                    hint
                  </span>
                )}
              </div>
            ) : (
              <p className="font-serif text-[17px] italic text-[#5f554d]">
                Your question will appear here.
              </p>
            )}

            {attachments.map((attachment) => (
              <AttachmentPreview attachment={attachment} key={attachment.id || attachment.name} />
            ))}

            <DiagramSvg svg={diagramSvg} />
            {!diagramSvg && <TikzInlinePreview code={tikzCode} />}

            {hasParts && (
              <div className="mt-8 grid gap-6">
                {parts.map((part, index) => (
                  <section
                    className="grid gap-3 md:grid-cols-[30px_1fr]"
                    key={part.id || part.label || index}
                  >
                    <span className="font-serif text-[16px] text-[#8f8982]">
                      ({part.label || String.fromCharCode(97 + index)})
                    </span>
                    <div>
                      <MarkdownBlock>{part.text}</MarkdownBlock>
                      <p className="mt-1.5 text-[13px] tracking-[0.04em] text-[#5f554d]">
                        {part.marks || 1} marks
                      </p>
                      {(part.attachments || []).map((attachment) => (
                        <AttachmentPreview
                          attachment={attachment}
                          key={attachment.id || attachment.name}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>

          <div className="text-right text-[13px] tracking-[0.04em] text-[#6e6259]">
            {importSource && <p className="mt-1.5 break-words">{importSource}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export const PreviewPanel = memo(PreviewPanelBase)
