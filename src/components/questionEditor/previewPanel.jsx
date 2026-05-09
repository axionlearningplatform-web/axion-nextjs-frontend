//Preview Editor
import { memo } from "react"
import ReactMarkdown from "react-markdown"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"

import {
  Card,
  CardContent,
} from "@/components/ui/card"

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
