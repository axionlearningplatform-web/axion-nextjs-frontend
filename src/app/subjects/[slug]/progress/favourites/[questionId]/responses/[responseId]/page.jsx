"use client"

import { useParams, useRouter } from "next/navigation"
import useSWR from "swr"
import { ArrowLeft, Loader2 } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"

import HandwritingCanvasViewer from "@/components/answering/HandwritingCanvasViewer"
import fetcher from "@/lib/fetcher"
import { cn } from "@/lib/utils"
import {
  Attachment,
  DiagramSvg,
  MarkdownMath,
  MarkingCriteriaSummary,
  SampleAnswers,
} from "../../../../../practice/page"

const QUESTIONS_API_URL = "/api/questions/"

function titleCase(value = "") {
  return value
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function attemptedDate(value) {
  if (!value) return "Attempted"
  return `Attempted ${new Date(value).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`
}

function responseIsMarked(response) {
  return response?.marks_awarded !== null && response?.marks_awarded !== undefined
}

function TagWithLatex({ name, className }) {
  const prepared = String(name || "").replace(/\$([^$]+)\$/g, (_, expr) => `\\(${expr}\\)`)

  return (
    <span className={cn("inline", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ children }) => <span>{children}</span>,
        }}
      >
        {prepared}
      </ReactMarkdown>
    </span>
  )
}

function prepareMistakeLatex(value) {
  const raw = String(value || "").trim()
  if (!raw) return ""
  if (raw.includes("$") || raw.startsWith("\\(") || raw.startsWith("\\[") || raw.startsWith("\\begin")) {
    return raw
  }
  if (!looksLikeMathExcerpt(raw)) return raw
  return `\\(${raw}\\)`
}

function looksLikeMathExcerpt(value) {
  const raw = String(value || "")
  return /\\|[=^_√∫Σπ]|(?:\b(?:sin|cos|tan|cis|log|ln)\b)|(?:\d+\s*[+\-*/]\s*\d+)/i.test(raw)
}

function normaliseSillyMistake(item, index) {
  if (item?.title) {
    return {
      number: index + 1,
      label: item.title,
      description: item.detail || "",
      latex: prepareMistakeLatex(item.latex),
      latexIsMath: looksLikeMathExcerpt(item.latex),
      score: null,
      maxScore: null,
    }
  }
  return {
    number: index + 1,
    label: item?.label || item?.tag || "",
    description: item?.description || item?.reason || "",
    latex: prepareMistakeLatex(item?.latex),
    latexIsMath: looksLikeMathExcerpt(item?.latex),
    score: item?.score ?? null,
    maxScore: item?.maxScore ?? item?.max_score ?? null,
  }
}

function normaliseKnowledgeGap(item) {
  if (item?.title) {
    return {
      label: item.title,
      description: item.detail || "",
      latex: prepareMistakeLatex(item.latex),
      latexIsMath: looksLikeMathExcerpt(item.latex),
      score: null,
      maxScore: null,
    }
  }
  return {
    label: item?.label || item?.tag || "",
    description: item?.description || item?.hint || item?.reason || "",
    latex: prepareMistakeLatex(item?.latex),
    latexIsMath: looksLikeMathExcerpt(item?.latex),
    score: item?.score ?? null,
    maxScore: item?.maxScore ?? item?.max_score ?? null,
  }
}

function MarkingResultDetails({ result }) {
  if (!result || result.marks_awarded === undefined || result.marks_awarded === null) return null
  return (
    <section className="mt-6 rounded-[3px] border border-white/[0.06] bg-[#1a1714] p-5">
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3 text-[13px] text-[#b7aca1]">
          <span className="font-serif text-[22px] text-[#eee9e4]">
            {result.marks_awarded}/{result.marks_possible}
          </span>
          <span className="text-[#4f4a45]">marks</span>
        </div>
        {(result.feedback || result.next_step_advice) && (
          <div className="rounded-[4px] border border-white/[0.06] bg-[#120f0d] px-4 py-3">
            {result.feedback && (
              <MarkdownMath className="text-[13px] leading-relaxed text-[#b7aca1] [&_.katex]:text-[#e8e4dc] [&_p]:my-0">
                {result.feedback}
              </MarkdownMath>
            )}
            {result.next_step_advice && (
              <MarkdownMath className="mt-2 text-[13px] leading-relaxed text-[#dba476] [&_.katex]:text-[#f0d8ba] [&_p]:my-0">
                {result.next_step_advice}
              </MarkdownMath>
            )}
          </div>
        )}
        {(result.parts || []).map((part) => {
          const sillyMistakes = (part.silly_mistakes || []).map(normaliseSillyMistake)
          const knowledgeGaps = (part.knowledge_gaps || []).map(normaliseKnowledgeGap)
          const hasSilly = sillyMistakes.length > 0
          const hasGaps = knowledgeGaps.length > 0
          const criteriaFeedback = String(part.criteria_feedback || "").trim()
          const showPartHeader = (result.parts || []).length > 1 || part.label !== "question"
          if (!criteriaFeedback && !hasSilly && !hasGaps && !part.matched_solution && !part.matched_concept) return null
          return (
            <div
              key={part.label}
              className={showPartHeader ? "grid gap-3 rounded-[4px] border border-white/[0.06] bg-[#15120f] p-3" : "grid gap-3"}
            >
              {showPartHeader && (
                <div className="flex items-center justify-between gap-3 border-b border-white/[0.05] pb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8f8378]">
                    Part {part.label}
                  </p>
                  <p className="text-[12px] text-[#dba476]">
                    {part.marks_awarded}/{part.marks_possible}
                  </p>
                </div>
              )}
              {part.matched_solution && (
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#d49a71]">
                  Marked via: {part.matched_solution}
                </p>
              )}
              {part.matched_concept && (
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#d49a71]">
                  Concept: {part.matched_concept}
                </p>
              )}

              {criteriaFeedback ? (
                <p className="text-[13px] leading-relaxed text-[#9b8f84]">{criteriaFeedback}</p>
              ) : hasSilly && (
                <div className="rounded-[4px] border border-[#c8864a]/20 bg-[#c8864a]/[0.06]">
                  <p className="border-b border-[#c8864a]/15 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#c8864a]">
                    Silly mistakes
                  </p>
                  <ul className="grid divide-y divide-white/[0.04]">
                    {sillyMistakes.map((item) => (
                      <li key={`${item.label}-${item.number}`} className="flex items-start gap-3 px-3 py-2.5">
                        <span
                          className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[3px] text-[10px] font-bold"
                          style={{ backgroundColor: "rgba(200,134,74,0.85)", color: "#120c08" }}
                        >
                          {item.number}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-[12px]">
                            {item.score !== null ? (
                              <TagWithLatex name={item.label} className="font-semibold text-[#dba476]" />
                            ) : (
                              <span className="font-semibold text-[#dba476]">{item.label}</span>
                            )}
                            {item.score !== null && (
                              <span className="text-[#5b5048]">{item.score}/{item.maxScore}</span>
                            )}
                          </div>
                          <p className="mt-0.5 text-[12px] leading-relaxed text-[#9b8f84]">
                            {item.description}
                          </p>
                          {item.latex && (
                            item.latexIsMath ? (
                              <MarkdownMath className="mt-2 rounded-[3px] border border-[#c8864a]/15 bg-[#120f0d]/70 px-2.5 py-2 text-[13px] leading-relaxed text-[#d8c4b0] [&_.katex]:text-[#efd0b2] [&_p]:my-0">
                                {item.latex}
                              </MarkdownMath>
                            ) : (
                              <p className="mt-2 rounded-[3px] border border-[#c8864a]/15 bg-[#120f0d]/70 px-2.5 py-2 text-[13px] italic leading-relaxed text-[#d8c4b0]">
                                {item.latex}
                              </p>
                            )
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!criteriaFeedback && hasGaps && (
                <div className="rounded-[4px] border border-[#b24a4a]/20 bg-[#b24a4a]/[0.06]">
                  <p className="border-b border-[#b24a4a]/15 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#c66a6a]">
                    Knowledge gaps
                  </p>
                  <ul className="grid divide-y divide-white/[0.04]">
                    {knowledgeGaps.map((item) => (
                      <li key={item.label} className="px-3 py-2.5">
                        <div className="flex items-center gap-2 text-[12px]">
                          <span className="size-1.5 shrink-0 rounded-full bg-[#b24a4a]/70" />
                          {item.score !== null ? (
                            <TagWithLatex name={item.label} className="font-semibold text-[#c98282]" />
                          ) : (
                            <span className="font-semibold text-[#c98282]">{item.label}</span>
                          )}
                          {item.score !== null && (
                            <span className="text-[#7f5555]">{item.score}/{item.maxScore}</span>
                          )}
                        </div>
                        {item.description && (
                          <p className="mt-1 pl-4 text-[12px] leading-relaxed text-[#9b6f6f]">
                            {item.description}
                          </p>
                        )}
                        {item.latex && (
                          item.latexIsMath ? (
                            <MarkdownMath className="mt-2 rounded-[3px] border border-[#b24a4a]/15 bg-[#120f0d]/70 px-2.5 py-2 text-[13px] leading-relaxed text-[#d8b0b0] [&_.katex]:text-[#efb8b8] [&_p]:my-0">
                              {item.latex}
                            </MarkdownMath>
                          ) : (
                            <p className="mt-2 rounded-[3px] border border-[#b24a4a]/15 bg-[#120f0d]/70 px-2.5 py-2 text-[13px] italic leading-relaxed text-[#d8b0b0]">
                              {item.latex}
                            </p>
                          )
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function QuestionDisplay({ question, response }) {
  const isMcq = question.question_type === "mcq"
  const result = response?.marking_result || {}
  const correctOption = result.correct_option
  const selectedOption = result.selected_option
  const displayQuestionText = question.question_text?.trim()
    ? (/^Q\)\./i.test(question.question_text.trim()) ? question.question_text : `Q). ${question.question_text}`)
    : ""

  return (
    <section className="px-6 py-16 md:px-12">
      <article className="grid gap-8 font-serif lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0">
          <MarkdownMath className="font-serif text-[19px] leading-[1.75] md:text-[21px]">
            {displayQuestionText}
          </MarkdownMath>
          {(question.attachments || []).map((attachment) => (
            <Attachment key={attachment.id || attachment.name} attachment={attachment} />
          ))}
          <DiagramSvg svg={question.diagram_svg} />
          {(question.tikz_visuals || []).map((visual, index) => (
            <DiagramSvg svg={visual.svg} key={visual.id || index} />
          ))}
          {isMcq && (
            <div className="mt-10 grid gap-3">
              {(question.mcq_options || []).map((option, index) => {
                const letter = option.letter || option.answer_letter || String.fromCharCode(65 + index)
                const isCorrect = correctOption && String(correctOption) === String(letter)
                const isSelected = selectedOption && String(selectedOption) === String(letter)
                return (
                  <div
                    className={cn(
                      "flex min-w-0 items-center gap-4 rounded-[6px] border bg-[#211d19] px-5 py-5 text-left",
                      isCorrect ? "border-[#6f8f5f]/45 bg-[#1b2a18]" : "border-white/[0.07]",
                      isSelected && !isCorrect && "border-[#9d4d45]/45 bg-[#2a1816]"
                    )}
                    key={`${option.id || letter}-${index}`}
                  >
                    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-white/[0.08] text-sm font-semibold text-[#6f6861]">
                      {letter}
                    </span>
                    <MarkdownMath className="font-serif text-[17px] leading-relaxed text-[#d8d0c8] md:text-[18px]">
                      {option.text}
                    </MarkdownMath>
                  </div>
                )
              })}
            </div>
          )}
          {!isMcq && (
            <div className="mt-10 grid gap-7">
              {(question.parts || []).map((part, index) => (
                <section key={part.label || index} className="grid gap-4 md:grid-cols-[34px_1fr]">
                  <span className="font-serif text-[18px] text-[#8f8982]">
                    ({part.label || String.fromCharCode(97 + index)})
                  </span>
                  <div>
                    <MarkdownMath className="font-serif text-[18px] leading-[1.7] md:text-[19px]">
                      {part.text}
                    </MarkdownMath>
                    <p className="mt-2 text-[12px] tracking-[0.04em] text-[#4f4a45]">{part.marks || 1} marks</p>
                    {(part.attachments || []).map((attachment) => (
                      <Attachment key={attachment.id || attachment.name} attachment={attachment} />
                    ))}
                    {(part.tikz_visuals || []).map((visual, visualIndex) => (
                      <DiagramSvg svg={visual.svg} key={visual.id || visualIndex} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
        {question.import_source && (
          <p className="pt-1 text-right text-[15px] tracking-[0.04em] text-[#6e6259]">
            {question.import_source}
          </p>
        )}
      </article>
    </section>
  )
}

export default function FavouriteResponsePage() {
  const params = useParams()
  const router = useRouter()
  const questionId = params?.questionId
  const responseId = params?.responseId
  const backHref = `/subjects/${params.slug}/progress/favourites`
  const { data: question, isLoading: questionLoading } = useSWR(
    questionId ? `${QUESTIONS_API_URL}${questionId}/` : null,
    fetcher
  )
  const { data: response, isLoading: responseLoading } = useSWR(
    responseId ? `${QUESTIONS_API_URL}favourites/responses/${responseId}/` : null,
    fetcher
  )

  if (questionLoading || responseLoading) {
    return (
      <main className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-[#171412] text-[#8f8982]">
        <Loader2 className="size-8 animate-spin" />
      </main>
    )
  }

  if (!question || !response) {
    return (
      <main className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-[#171412] px-6">
        <p className="text-center font-serif text-3xl italic text-[#77716b]">
          This saved response could not be loaded.
        </p>
      </main>
    )
  }

  const metadata = [
    question.subject,
    question.level ? titleCase(question.level) : null,
    question.question_type === "mcq" ? "MCQ" : "SAQ",
  ].filter(Boolean)

  return (
    <main className="min-h-[calc(100vh-64px)] bg-[#171412] text-[#eee9e4]">
      <div className="border-b border-white/[0.06] px-6 py-5 md:px-12">
        <button
          type="button"
          onClick={() => router.push(backHref)}
          className="mb-6 inline-flex items-center gap-2 text-[13px] font-medium tracking-[0.04em] text-[#4f4a45] transition-colors hover:text-[#8f8982]"
        >
          <ArrowLeft className="size-[17px]" />
          Back
        </button>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap gap-2">
            {metadata.map((item) => (
              <span
                key={item}
                className="rounded-[2px] border border-[#7c573a]/70 bg-[#c8864a]/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#d99658]"
              >
                {item}
              </span>
            ))}
          </div>
          <div className="mr-8 flex flex-col items-end gap-2 text-[13px] text-[#9b8f84] lg:mr-20">
            <span>{question.marks || 0} marks</span>
            <span
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]",
                responseIsMarked(response)
                  ? "border-[#6f8f5f]/35 bg-[#6f8f5f]/10 text-[#9fbe8d]"
                  : "border-[#9d4d45]/35 bg-[#9d4d45]/10 text-[#d48a82]"
              )}
            >
              {responseIsMarked(response) ? "Marked" : "Unmarked"}
            </span>
            <span>{attemptedDate(response.created_at)}</span>
          </div>
        </div>
      </div>

      <QuestionDisplay question={question} response={response} />

      <section className="border-t border-white/[0.06] px-6 py-6 md:px-12">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8f8982]">
          Your Response
        </p>
        {response.submission_type === "draw" ? (
          <HandwritingCanvasViewer strokeData={response.stroke_data} />
        ) : (
          <div className="rounded-[3px] border border-white/[0.06] bg-[#1b1713] p-5">
            <MarkdownMath className="font-serif text-base leading-relaxed text-[#e8e4dc]">
              {response.text_response || "No text response saved."}
            </MarkdownMath>
          </div>
        )}

        <MarkingResultDetails result={response.marking_result} />

        {response.note && (
          <section className="mt-6 rounded-[3px] border border-[#7c573a]/35 bg-[#1a1511] px-5 py-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#dba476]">
              Your Note
            </p>
            <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[#c4b5a8]">{response.note}</p>
          </section>
        )}

        <SampleAnswers markingResult={response.marking_result || null} question={question} />
        <MarkingCriteriaSummary question={question} />
      </section>
    </main>
  )
}
