//Preview Editor
import { memo } from "react"
import ReactMarkdown from "react-markdown"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

function AttachmentPreview({ attachment }) {
  if (!attachment?.data_url) return null

  return (
    <figure className="overflow-hidden rounded-2xl border border-[#54433c]/35 bg-[#201f1f]">
      {attachment.mime_type?.startsWith("image/") && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={attachment.caption || attachment.name || "Question attachment"}
          className="max-h-[320px] w-full object-contain"
          src={attachment.data_url}
        />
      )}
      {(attachment.caption || attachment.name) && (
        <figcaption className="border-t border-[#54433c]/25 px-4 py-2 text-xs text-[#a28c83]">
          {attachment.caption || attachment.name}
        </figcaption>
      )}
    </figure>
  )
}

function MarkdownBlock({ children }) {
  return (
    <div className="prose prose-invert max-w-none overflow-hidden break-words text-base leading-relaxed text-[#e5e2e1]">
      <ReactMarkdown
        components={{
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
        {children || ""}
      </ReactMarkdown>
    </div>
  )
}

function CriteriaList({ criteria = [] }) {
  const visible = criteria.filter((item) => item.text)
  if (!visible.length) return null

  return (
    <div className="rounded-2xl border border-[#54433c]/30 bg-[#201f1f] p-4">
      <p className="mb-3 text-sm font-semibold text-[#dac1b7]">Marking criteria</p>
      <div className="grid gap-2">
        {visible.map((item, index) => (
          <div
            className="grid grid-cols-[64px_1fr] gap-3 rounded-xl bg-[#242424] p-3 text-sm"
            key={`${item.mark}-${index}`}
          >
            <span className="text-[#ffb595]">Mark {item.mark}</span>
            <MarkdownBlock>{item.text}</MarkdownBlock>
          </div>
        ))}
      </div>
    </div>
  )
}

function HintsList({ hints = [] }) {
  const visible = hints.filter((hint) => hint.text)
  if (!visible.length) return null

  return (
    <div className="rounded-2xl border border-[#54433c]/30 bg-[#201f1f] p-4">
      <p className="mb-3 text-sm font-semibold text-[#dac1b7]">Hints</p>
      <div className="grid gap-2">
        {visible.map((hint, index) => (
          <div
            className="grid grid-cols-[64px_1fr] gap-3 rounded-xl bg-[#242424] p-3 text-sm"
            key={`${hint.mark}-${index}`}
          >
            <span className="text-[#ffb595]">Mark {hint.mark}</span>
            <MarkdownBlock>{hint.text}</MarkdownBlock>
          </div>
        ))}
      </div>
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
  markingCriteria = [],
  importSource = "",
  tags = [],
}) {
  const hasParts = parts.length > 0

  return (
    <Card className="min-w-0 self-start w-full overflow-hidden rounded-3xl border-[#54433c]/45 bg-[#151515] text-[#e5e2e1] shadow-2xl shadow-black/20">
      <CardHeader>
        <CardTitle className="font-serif text-2xl font-semibold">Live Preview</CardTitle>
      </CardHeader>

      <CardContent className="flex min-w-0 flex-col gap-6">
        <div className="flex justify-between gap-4 text-sm text-[#a28c83]">
          <span>{subject || "Subject"}</span>
          <span>{marks} marks</span>
        </div>

        {importSource && (
          <div className="max-w-full rounded-2xl border border-[#54433c]/30 bg-[#201f1f] px-4 py-3 text-sm text-[#dac1b7]">
            <span className="mr-2 text-[#a28c83]">Source</span>
            <span className="break-words">{importSource}</span>
          </div>
        )}

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                className="rounded-full border border-[#54433c]/40 bg-[#201f1f] px-3 py-1 text-xs text-[#dac1b7]"
                key={tag.id || tag.name}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}

        {questionText && (
          <div className={hasParts ? "text-sm text-[#dac1b7]" : ""}>
            <MarkdownBlock>{questionText}</MarkdownBlock>
          </div>
        )}

        {attachments.map((attachment) => (
          <AttachmentPreview attachment={attachment} key={attachment.id || attachment.name} />
        ))}

        {!hasParts && (
          <>
            <CriteriaList criteria={markingCriteria} />
            <HintsList hints={hints} />
          </>
        )}

        {hasParts && (
          <div className="grid gap-4">
            {parts.map((part, index) => (
              <section
                className="rounded-2xl border border-[#54433c]/30 bg-[#201f1f] p-4"
                key={part.id || part.label || index}
              >
                <div className="mb-3 flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-[#ffb595]">
                    ({part.label || String.fromCharCode(97 + index)})
                  </span>
                  <span className="text-[#a28c83]">{part.marks || 1} marks</span>
                </div>
                <MarkdownBlock>{part.text}</MarkdownBlock>
                <div className="mt-4 grid gap-3">
                  {(part.attachments || []).map((attachment) => (
                    <AttachmentPreview attachment={attachment} key={attachment.id || attachment.name} />
                  ))}
                </div>
                <div className="mt-4">
                  <CriteriaList criteria={part.marking_criteria || []} />
                </div>
                <div className="mt-4">
                  <HintsList hints={part.hints || []} />
                </div>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export const PreviewPanel = memo(PreviewPanelBase)
