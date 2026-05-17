"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FilePenLine,
  Maximize2,
  Minimize2,
  Search,
  Trash2,
  X,
} from "lucide-react"
import useSWR from "swr"

import { PreviewPanel } from "@/components/questionEditor/previewPanel"
import { QuestionEditor } from "@/components/question-editor"
import { useAuth } from "@/components/authProvider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import fetcher from "@/lib/fetcher"
import { cn } from "@/lib/utils"

const QUESTIONS_API_URL = "/api/questions/"
const SUBJECTS_API_URL = "/api/subjects/"

const STATUS_LABEL = {
  submitted: "Submitted",
  under_review: "In review",
  needs_revision: "Needs changes",
  published: "Accepted",
  rejected: "Rejected",
}

const STATUS_STYLES = {
  submitted: "border-sky-400/30 bg-sky-500/10 text-sky-100",
  under_review: "border-sky-400/25 bg-sky-500/8 text-sky-100/90",
  needs_revision: "border-orange-400/35 bg-orange-500/15 text-orange-100",
  published: "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
  rejected: "border-red-400/25 bg-red-400/10 text-red-100",
}

const STATUS_DOTS = {
  submitted: "bg-sky-400",
  under_review: "bg-sky-300",
  needs_revision: "bg-orange-400",
  published: "bg-emerald-300",
  rejected: "bg-red-300",
}

const ACTIONABLE_MODERATION = new Set(["submitted", "under_review", "needs_revision"])

function flattenSaveErrors(data) {
  if (!data || typeof data !== "object") return "Could not save."
  if (data.detail) return String(data.detail)
  return "Could not save — check required fields and taxonomy tags."
}

const MODERATION_QUEUE_SEARCH_DEBOUNCE_MS = 260

export default function SubjectModerationPage() {
  const params = useParams()
  const auth = useAuth()
  const { data: subjects = [], isLoading: subjectsLoading } = useSWR(SUBJECTS_API_URL, fetcher)
  const lockedSubject = subjects.find((s) => s.slug === params?.slug)
  const subjectId = lockedSubject?.id

  const [searchInput, setSearchInput] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim())
    }, MODERATION_QUEUE_SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [searchInput])

  const moderationQuestionsUrl = useMemo(() => {
    if (!subjectId) return null
    const p = new URLSearchParams({
      subject_id: String(subjectId),
      moderation_status: "submitted,under_review,needs_revision",
      include_status_totals: "true",
      limit: "500",
      offset: "0",
    })
    if (debouncedSearch) p.set("search", debouncedSearch)
    return `${QUESTIONS_API_URL}?${p.toString()}`
  }, [subjectId, debouncedSearch])

  const canModerate = useMemo(
    () =>
      auth.subjectMemberships?.some(
        (m) => m.subject.slug === params?.slug && m.role === "head_coordinator"
      ),
    [auth.subjectMemberships, params?.slug]
  )

  const {
    data: questionsPayload,
    mutate: mutateQuestions,
    isLoading: questionsLoading,
  } = useSWR(moderationQuestionsUrl, fetcher, {
    dedupingInterval: 60_000,
    keepPreviousData: true,
  })

  const { data: allTags = [] } = useSWR(
    subjectId ? `/api/questions/tags/?subject_id=${subjectId}` : null,
    fetcher
  )

  const queue = useMemo(() => {
    const raw = questionsPayload?.results ?? []
    return raw.filter((item) => ACTIONABLE_MODERATION.has(item.moderation_status))
  }, [questionsPayload])

  const [activeId, setActiveId] = useState(null)
  const [editorData, setEditorData] = useState(null)
  const [draft, setDraft] = useState(null)
  const [status, setStatus] = useState("idle")
  const [saveError, setSaveError] = useState("")
  const [previewExpanded, setPreviewExpanded] = useState(false)

  const activeIndex = useMemo(
    () => queue.findIndex((item) => item.id === activeId),
    [queue, activeId]
  )
  const activeSummary = activeIndex >= 0 ? queue[activeIndex] : null

  const loadDetail = useCallback(async (id) => {
    if (!id) {
      setEditorData(null)
      setDraft(null)
      return
    }
    const detail = await fetcher(`${QUESTIONS_API_URL}${id}/`)
    setEditorData(detail)
    setDraft(null)
  }, [])

  useEffect(() => {
    if (!activeId) return
    loadDetail(activeId)
  }, [activeId, loadDetail])

  useEffect(() => {
    if (queue.length && !activeId) {
      setActiveId(queue[0].id)
    }
  }, [queue, activeId])

  async function patchQuestion(id, body) {
    const response = await fetch(`${QUESTIONS_API_URL}${id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      return { ok: false, data }
    }
    await mutateQuestions()
    await loadDetail(id)
    return { ok: true, data }
  }

  async function persistQuestion(payload) {
    const body = payload || draft
    if (!activeId || !body) return
    setStatus("saving")
    setSaveError("")
    const result = await patchQuestion(activeId, body)
    setStatus("idle")
    if (!result.ok) {
      setSaveError(flattenSaveErrors(result.data))
    }
  }

  async function publishQuestion() {
    if (!activeId) return
    const body = draft
    if (!body) return
    setStatus("saving")
    setSaveError("")
    const result = await patchQuestion(activeId, {
      ...body,
      moderation_status: "published",
    })
    setStatus("idle")
    if (!result.ok) {
      setSaveError(flattenSaveErrors(result.data))
      return
    }
    const next = queue.find((item) => item.id !== activeId)
    setActiveId(next?.id || null)
  }

  async function rejectQuestion() {
    if (!activeId) return
    const body = draft
    if (!body) return
    if (!window.confirm("Reject this question? Analysts can still edit it in the database, but it will stay rejected until a head coordinator publishes it.")) {
      return
    }
    setStatus("saving")
    setSaveError("")
    const result = await patchQuestion(activeId, {
      ...body,
      moderation_status: "rejected",
    })
    setStatus("idle")
    if (!result.ok) {
      setSaveError(flattenSaveErrors(result.data))
      return
    }
    const next = queue.find((item) => item.id !== activeId)
    setActiveId(next?.id || null)
  }

  async function requestRevisionQuestion() {
    if (!activeId) return
    const body = draft
    if (!body) return
    if (
      !window.confirm(
        "Send this question back for analyst edits? It leaves this queue until they save changes in the database — then it returns as submitted."
      )
    ) {
      return
    }
    setStatus("saving")
    setSaveError("")
    const result = await patchQuestion(activeId, {
      ...body,
      moderation_status: "needs_revision",
    })
    setStatus("idle")
    if (!result.ok) {
      setSaveError(flattenSaveErrors(result.data))
      return
    }
    const next = queue.find((item) => item.id !== activeId)
    setActiveId(next?.id || null)
  }

  async function deleteQuestion() {
    if (!activeId) return
    if (
      !window.confirm(
        "Permanently delete this question from the database? This cannot be undone. Student history tied to this row may be affected."
      )
    ) {
      return
    }
    setStatus("saving")
    setSaveError("")
    try {
      const response = await fetch(`${QUESTIONS_API_URL}${activeId}/`, {
        method: "DELETE",
        credentials: "include",
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setSaveError(data.detail || "Could not delete this question.")
        return
      }
      await mutateQuestions()
      setActiveId(null)
      setEditorData(null)
      setDraft(null)
    } finally {
      setStatus("idle")
    }
  }

  const previewTags = useMemo(() => {
    const ids = new Set(draft?.tag_ids || editorData?.tag_ids || [])
    return (allTags || []).filter((t) => ids.has(t.id))
  }, [draft, editorData, allTags])

  const counts = useMemo(() => {
    const totals = questionsPayload?.status_totals
    if (totals && typeof totals === "object") {
      return {
        pending: (totals.submitted || 0) + (totals.under_review || 0),
        needsChanges: totals.needs_revision || 0,
        accepted: totals.published || 0,
        rejected: totals.rejected || 0,
      }
    }
    const c = { pending: 0, needsChanges: 0, accepted: 0, rejected: 0 }
    for (const item of queue || []) {
      if (item.moderation_status === "published") c.accepted += 1
      else if (item.moderation_status === "rejected") c.rejected += 1
      else if (item.moderation_status === "needs_revision") c.needsChanges += 1
      else c.pending += 1
    }
    return c
  }, [questionsPayload, queue])

  if (subjectsLoading) {
    return <div className="p-10 text-[#dac1b7]">Loading moderation…</div>
  }

  if (!lockedSubject) {
    return <div className="p-10 text-[#ffb4ab]">Subject not available.</div>
  }

  if (!canModerate) {
    return (
      <main className="min-h-[calc(100vh-64px)] bg-[#16130f] px-6 py-16 text-[#dac1b7]">
        <p className="mx-auto max-w-lg text-center font-serif text-xl text-[#e5e2e1]">
          Moderation is available to head coordinators only.
        </p>
      </main>
    )
  }

  return (
    <main className="min-h-[calc(100vh-64px)] overflow-x-hidden bg-[#16130f] px-6 py-8">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#ffb595]">
            {lockedSubject.name}
          </p>
          <h1 className="mt-2 font-serif text-[32px] font-medium tracking-[-0.01em] text-[#f0ebe4]">Question Moderation</h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-[#6f6258]">
            Review the queue, edit in place, assign Layer 1–3 tags, then publish, request analyst changes, reject, or
            delete. Rejected questions stay in the database but no longer appear here. Same record as the question bank —
            no duplicate copies.
          </p>
        </div>

        {questionsLoading && (
          <p className="text-sm text-[#a28c83]">Loading questions…</p>
        )}

        {!questionsLoading && queue.length === 0 && (
          <Card className="rounded-[10px] border-[#3b2a22]/55 bg-[#1b1713] p-8 text-[#dac1b7]">
            <p className="font-serif text-[20px] font-medium text-[#d8cfc6]">Queue is clear</p>
            <p className="mt-2 text-[13px] leading-relaxed text-[#6f6258]">
              There are no submitted, in-review, or needs-changes questions for this subject. New analyst submissions or
              re-submissions after revision will appear here. Rejected items remain in the question database.
            </p>
          </Card>
        )}

        {queue.length > 0 && (
          <div
            className={cn(
              "grid min-w-0 gap-6 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
              previewExpanded
                ? "xl:grid-cols-[minmax(0,0px)_minmax(380px,0.82fr)_minmax(620px,1.18fr)]"
                : "xl:grid-cols-[minmax(260px,320px)_minmax(0,1fr)_minmax(320px,420px)]"
            )}
          >
            <Card
              className={cn(
                "min-w-0 self-start overflow-hidden rounded-[10px] border border-[#3b2a22]/55 bg-[#1b1713] text-[#e5e2e1] shadow-[0_0_0_1px_rgba(255,255,255,0.02)] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                previewExpanded && "xl:pointer-events-none xl:max-w-0 xl:-translate-x-4 xl:scale-[0.98] xl:opacity-0"
              )}
            >
              <CardHeader>
                <CardTitle className="font-serif text-[20px] font-medium text-[#d8cfc6]">Review Queue</CardTitle>
                <p className="text-[12px] tracking-[0.02em] text-[#5a4f48]">
                  {counts.pending} submitted / in review · {counts.needsChanges} needs changes · {counts.accepted}{" "}
                  published · {counts.rejected} rejected
                </p>
                <div className="relative mt-3 min-w-0">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#a28c83]" />
                  <Input
                    className="h-9 rounded-[6px] border-[#3b2a22]/55 bg-white/[0.035] pl-9 text-[13px] text-[#e5e2e1] focus-visible:border-[#7c573a]/55 focus-visible:ring-0"
                    placeholder="Search question text"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                  />
                </div>
              </CardHeader>
              <CardContent className="grid max-h-[720px] gap-2 overflow-y-auto pr-1">
                {queue.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      "w-full min-w-0 rounded-[6px] border p-3 text-left transition-colors duration-100",
                      item.id === activeId
                        ? "border-[#7c573a]/55 bg-[#1e1410]"
                        : "border-[#252018]/70 bg-[#181410] hover:bg-[#1e1510]"
                    )}
                    onClick={() => setActiveId(item.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-[#c4b5a8]">
                        <span
                          className={cn(
                            "mr-2 inline-block size-2.5 rounded-full align-middle",
                            STATUS_DOTS[item.moderation_status] || "bg-sky-400"
                          )}
                        />
                        #{item.id}
                      </span>
                      <span
                        className={cn(
                          "rounded-[3px] border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.04em]",
                          STATUS_STYLES[item.moderation_status] || STATUS_STYLES.submitted
                        )}
                      >
                        {STATUS_LABEL[item.moderation_status] || item.moderation_status}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-3 text-[12px] leading-relaxed text-[#5a4f48]">
                      {(item.question_preview || item.question_text || "").slice(0, 260)}
                    </p>
                  </button>
                ))}
                {queue.length === 0 && (
                  <div className="rounded-xl border border-[#3b2a22]/40 bg-[#181410] p-4 text-sm text-[#a28c83]">
                    No questions match that search.
                  </div>
                )}
              </CardContent>
            </Card>

            <section className="flex min-w-0 flex-col gap-4">
              <div className="flex min-h-[64px] flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#3b2a22]/55 bg-[#1b1713] px-5 py-3">
                <div>
                  <p className="text-[13px] font-semibold tracking-[0.02em] text-[#c4b5a8]">
                    {activeSummary ? `Question #${activeSummary.id}` : "Select a question"}
                  </p>
                  {saveError && (
                    <p className="mt-2 max-w-2xl rounded-[4px] border border-red-500/20 bg-[#1a0b0b] px-3 py-2 text-[12px] text-red-300">
                      {saveError}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-[4px] border-[#3b2a22]/55 bg-transparent text-[12px] tracking-[0.04em] text-[#6f6258] hover:border-[#5a3d2e]/60 hover:bg-transparent hover:text-[#9a8880]"
                    disabled={activeIndex <= 0}
                    onClick={() => {
                      const prev = queue[activeIndex - 1]
                      if (prev) setActiveId(prev.id)
                    }}
                  >
                    <ChevronLeft className="size-4" />
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-[4px] border-[#3b2a22]/55 bg-transparent text-[12px] tracking-[0.04em] text-[#6f6258] hover:border-[#5a3d2e]/60 hover:bg-transparent hover:text-[#9a8880]"
                    disabled={activeIndex < 0 || activeIndex >= queue.length - 1}
                    onClick={() => {
                      const next = queue[activeIndex + 1]
                      if (next) setActiveId(next.id)
                    }}
                  >
                    Next
                    <ChevronRight className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    className="rounded-[4px] border border-red-400/25 bg-red-500/12 text-[12px] tracking-[0.04em] text-red-200 hover:border-red-400/35 hover:bg-red-500/18"
                    disabled={!draft || status === "saving"}
                    onClick={rejectQuestion}
                  >
                    <X className="size-4" />
                    Reject
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-[4px] border-orange-500/30 bg-orange-500/8 text-[12px] tracking-[0.04em] text-orange-200/80 hover:border-orange-400/40 hover:bg-transparent hover:text-orange-100"
                    disabled={!draft || status === "saving"}
                    onClick={requestRevisionQuestion}
                  >
                    <FilePenLine className="size-4" />
                    Request changes
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-[4px] border-[#3b2a22]/55 bg-transparent text-[12px] tracking-[0.04em] text-[#6f6258] hover:border-[#5a3d2e]/60 hover:bg-transparent hover:text-[#9a8880]"
                    disabled={!draft || status === "saving"}
                    onClick={() => persistQuestion(draft)}
                  >
                    {status === "saving" ? "Saving…" : "Save progress"}
                  </Button>
                  <Button
                    type="button"
                    className="rounded-[4px] border border-[#7c573a]/60 bg-[#1e1511] text-[12px] font-semibold uppercase tracking-[0.06em] text-[#dba476] hover:border-[#c8864a]/70 hover:bg-[#261a12] hover:text-[#f0c99e]"
                    disabled={!draft || status === "saving"}
                    onClick={publishQuestion}
                  >
                    <Check className="size-4" />
                    Approve &amp; Publish
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-[4px] border-red-400/20 bg-transparent text-[12px] tracking-[0.04em] text-red-300/50 hover:border-red-400/30 hover:bg-transparent hover:text-red-300"
                    disabled={status === "saving"}
                    onClick={deleteQuestion}
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                </div>
              </div>

              {editorData && (
                <QuestionEditor
                  key={activeId}
                  initialData={editorData}
                  lockedSubject={lockedSubject}
                  taggingMode="full"
                  submitLabel="Save progress"
                  statusLabels={{
                    loading: "Saving…",
                    success: "Saved",
                    error: "Save failed",
                  }}
                  onSubmit={persistQuestion}
                  errors={{}}
                  status={status === "saving" ? "loading" : "idle"}
                  onClearErrors={() => setSaveError("")}
                  hidePreview
                  onDraftChange={setDraft}
                />
              )}
            </section>

            <section className="min-w-0 self-start">
              <PreviewPanel
                subject={draft?.subject || lockedSubject.name}
                marks={draft?.marks || editorData?.marks || 1}
                questionText={draft?.question_text || editorData?.question_text || ""}
                hints={[]}
                parts={draft?.parts || editorData?.parts || []}
                attachments={draft?.attachments || editorData?.attachments || []}
                importSource={draft?.import_source || editorData?.import_source || ""}
                tags={previewTags}
                diagramSvg={draft?.diagram_svg || editorData?.diagram_svg || ""}
                tikzCode={draft?.tikz_code || editorData?.tikz_code || ""}
                tikzVisuals={draft?.stem_tikz_visuals || draft?.tikz_visuals || editorData?.stem_tikz_visuals || editorData?.tikz_visuals || []}
                stemTikzVisuals={draft?.stem_tikz_visuals || draft?.tikz_visuals || editorData?.stem_tikz_visuals || editorData?.tikz_visuals || []}
                questionType={draft?.question_type || editorData?.question_type || "saq"}
                mcqOptions={draft?.mcq_options || editorData?.mcq_options || []}
                correctOption={draft?.correct_option || editorData?.correct_option || ""}
                headerAction={
                  <Button
                    type="button"
                    variant="outline"
                    className="size-7 rounded-[4px] border-[#3b2a22]/55 bg-[#181410]/90 p-0 text-[#6f6258] transition-colors hover:border-[#5a3d2e]/60 hover:bg-transparent hover:text-[#9a8880]"
                    onClick={() => setPreviewExpanded((expanded) => !expanded)}
                    aria-label={previewExpanded ? "Compact preview" : "Expand preview"}
                    title={previewExpanded ? "Compact preview" : "Expand preview"}
                  >
                    {previewExpanded ? (
                      <Minimize2 className="size-3.5" />
                    ) : (
                      <Maximize2 className="size-3.5" />
                    )}
                  </Button>
                }
              />
            </section>
          </div>
        )}
      </div>
    </main>
  )
}
