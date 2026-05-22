"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import useSWR from "swr"
import { ArrowLeft, Keyboard, Loader2, Pencil, RotateCcw, Sigma } from "lucide-react"

import HandwritingCanvas from "@/components/answering/HandwritingCanvas"
import SaveQuestionModal from "@/components/favourites/SaveQuestionModal"
import fetcher from "@/lib/fetcher"
import { cn } from "@/lib/utils"
import {
  Attachment,
  DiagramSvg,
  MarkdownMath,
  MarkingCriteriaSummary,
  SampleAnswers,
} from "../../../practice/page"

const QUESTIONS_API_URL = "/api/questions/"

function titleCase(value = "") {
  return value
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function levelLabel(value = "") {
  return titleCase(value || "exam_practice")
}

function PracticeAnswerArea({ favouriteStatus, onEditNote, question, questionId }) {
  const [activeTab, setActiveTab] = useState("type")
  const [typedAnswer, setTypedAnswer] = useState("")
  const [revealed, setRevealed] = useState(false)
  const [canvasKey, setCanvasKey] = useState(0)
  const handwritingRef = useRef(null)

  function handleAction() {
    if (!revealed) {
      setRevealed(true)
      return
    }
    setTypedAnswer("")
    setRevealed(false)
    setCanvasKey((value) => value + 1)
  }

  return (
    <section className="border-t border-white/[0.06] px-6 py-6 md:px-12">
      <div className="mb-5 flex gap-8 border-b border-white/[0.06]">
        {["type", "draw"].map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              "h-9 border-b text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors",
              activeTab === tab
                ? "border-[#e8e4dc] text-[#e8e4dc]"
                : "border-transparent text-[#4f4a45] hover:text-[#8f8982]"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className={activeTab === "type" ? "block" : "hidden"}>
        <div className="rounded-[3px] border border-white/[0.06] bg-[#1b1713] p-5">
          <textarea
            value={typedAnswer}
            onChange={(event) => setTypedAnswer(event.target.value)}
            className="min-h-36 w-full resize-y bg-transparent font-serif text-base leading-relaxed text-[#e8e4dc] outline-none placeholder:italic placeholder:text-[#4f4a45]"
            placeholder="Begin your working here..."
          />
          <div className="mt-4 flex flex-col gap-3 border-t border-white/[0.06] pt-4 sm:flex-row sm:items-center">
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-[2px] border border-[#7c573a]/70 px-3 text-[11px] font-semibold tracking-[0.04em] text-[#d99658]"
            >
              <Sigma className="size-3.5" />
              Math
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-[2px] border border-white/[0.06] px-3 text-[11px] font-semibold tracking-[0.04em] text-[#5f5953]"
            >
              <Keyboard className="size-3.5" />
              Keyboard
            </button>
            <span className="ml-auto rounded-[2px] border border-white/[0.06] px-3 py-2 text-[11px] tracking-[0.04em] text-[#4f4a45]">
              Tab to insert math
            </span>
          </div>
        </div>
      </div>

      <div className={activeTab === "draw" ? "block" : "hidden"}>
        <HandwritingCanvas
          key={canvasKey}
          ref={handwritingRef}
          isVisible={activeTab === "draw"}
          questionId={questionId}
        />
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={handleAction}
          className="inline-flex h-11 items-center justify-center gap-3 rounded-[2px] border border-[#9b673d]/42 bg-[#c8864a]/12 px-7 text-[12px] font-medium tracking-[0.06em] text-[#dba476] transition-colors hover:border-[#c8864a]/62 hover:bg-[#c8864a]/18 hover:text-[#efbd94]"
        >
          {revealed ? "Retry" : "See Answer"}
          {revealed && <RotateCcw className="size-[18px]" />}
        </button>
      </div>

      {revealed && (
        <>
          {favouriteStatus?.favourited && (
            <section className="mt-5 rounded-[3px] border border-[#7c573a]/35 bg-[#1a1511] px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#dba476]">
                  Your Note
                </p>
                <button
                  type="button"
                  onClick={onEditNote}
                  className="inline-flex h-8 items-center gap-2 rounded-[2px] border border-[#7c573a]/45 px-3 text-[11px] font-semibold tracking-[0.04em] text-[#dba476] transition-colors hover:border-[#c8864a]/70 hover:bg-[#c8864a]/10"
                >
                  <Pencil className="size-3.5" />
                  Edit
                </button>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-[#c4b5a8]">
                {String(favouriteStatus.note || "").trim() || "No note saved."}
              </p>
            </section>
          )}
          <SampleAnswers question={question} />
          <MarkingCriteriaSummary question={question} />
        </>
      )}
    </section>
  )
}

export default function FavouriteQuestionPage() {
  const params = useParams()
  const router = useRouter()
  const questionId = params?.questionId
  const backHref = `/subjects/${params.slug}/progress/favourites`
  const [editingNote, setEditingNote] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const { data: question, isLoading: questionLoading } = useSWR(
    questionId ? `${QUESTIONS_API_URL}${questionId}/` : null,
    fetcher
  )
  const {
    data: favouriteStatus,
    mutate: mutateFavouriteStatus,
  } = useSWR(
    questionId ? `${QUESTIONS_API_URL}favourites/${questionId}/exists/` : null,
    fetcher
  )

  async function saveNote(note) {
    if (!questionId) return
    setSavingNote(true)
    try {
      const response = await fetch(`${QUESTIONS_API_URL}favourites/`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          question_id: Number(questionId),
          note,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.detail || `Could not update this note (HTTP ${response.status}).`)
      }
      mutateFavouriteStatus({
        favourited: true,
        note: data.note || note || "",
      }, false)
      setEditingNote(false)
    } finally {
      setSavingNote(false)
    }
  }

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [questionId])

  if (questionLoading) {
    return (
      <main className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-[#171412] text-[#8f8982]">
        <Loader2 className="size-8 animate-spin" />
      </main>
    )
  }

  if (!question) {
    return (
      <main className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-[#171412] px-6">
        <button
          type="button"
          onClick={() => router.push(backHref)}
          className="absolute left-8 top-24 inline-flex items-center gap-2 text-[15px] font-semibold text-[#4f4a45] hover:text-[#8f8982]"
        >
          <ArrowLeft className="size-[18px]" />
          Back
        </button>
        <p className="text-center font-serif text-3xl italic text-[#77716b]">
          This saved question could not be loaded.
        </p>
      </main>
    )
  }

  const isMcq = question.question_type === "mcq"
  const metadata = [
    question.subject,
    question.level ? levelLabel(question.level) : null,
    isMcq ? "MCQ" : "SAQ",
  ].filter(Boolean)
  const displayQuestionText = question.question_text?.trim()
    ? (/^Q\)\./i.test(question.question_text.trim()) ? question.question_text : `Q). ${question.question_text}`)
    : ""

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
          </div>
        </div>
      </div>

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
                  const letter = option.letter || String.fromCharCode(65 + index)
                  return (
                    <div
                      className="flex min-w-0 items-center gap-4 rounded-[6px] border border-white/[0.07] bg-[#211d19] px-5 py-5 text-left"
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
                  <section
                    key={part.label || index}
                    className="grid gap-4 md:grid-cols-[34px_1fr]"
                  >
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

      <PracticeAnswerArea
        favouriteStatus={favouriteStatus}
        onEditNote={() => setEditingNote(true)}
        question={question}
        questionId={question.id}
      />
      {editingNote && (
        <SaveQuestionModal
          existingNote={favouriteStatus?.note || ""}
          favourited
          loading={savingNote}
          onClose={() => setEditingNote(false)}
          onSave={saveNote}
        />
      )}
    </main>
  )
}
