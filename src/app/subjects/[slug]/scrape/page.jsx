"use client"

import { useCallback, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  FileUp,
  LinkIcon,
  ListChecks,
  Maximize2,
  Minimize2,
  Search,
  SkipForward,
  X,
} from "lucide-react"
import useSWR from "swr"

import { PreviewPanel } from "@/components/questionEditor/previewPanel"
import { QuestionEditor } from "@/components/question-editor"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import fetcher from "@/lib/fetcher"
import { cn } from "@/lib/utils"

const IMPORT_PARSE_URL = "/api/questions/import/parse/"
const QUESTIONS_API_URL = "/api/questions/"
const SUBJECTS_API_URL = "/api/subjects/"
const MAX_IMPORT_FILE_MB = 20
const MAX_IMPORT_FILE_BYTES = MAX_IMPORT_FILE_MB * 1024 * 1024

const REVIEW_STATUSES = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  skipped: "Skipped",
  error: "Needs attention",
}

const STATUS_STYLES = {
  pending: "border-orange-400/25 bg-orange-400/10 text-orange-100",
  accepted: "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
  rejected: "border-red-400/25 bg-red-400/10 text-red-100",
  skipped: "border-[#a28c83]/25 bg-[#a28c83]/10 text-[#dac1b7]",
  error: "border-red-400/25 bg-red-400/10 text-red-100",
}

const STATUS_DOTS = {
  pending: "bg-orange-300",
  accepted: "bg-emerald-300",
  rejected: "bg-red-300",
  skipped: "bg-[#a28c83]",
  error: "bg-red-300",
}

function candidateToQuestion(candidate, subject) {
  return {
    subject: subject?.name || candidate.detected_subject || "",
    subject_id: subject?.id || null,
    marks: candidate.marks || 1,
    question_text: candidate.question_text || "",
    latex: "",
    graph: "",
    tikz_code: candidate.tikz_code || "",
    diagram_svg: candidate.diagram_svg || "",
    tikz_visuals: candidate.tikz_visuals || [],
    sample_solution: candidate.sample_solution || "",
    hints: [],
    parts: candidate.parts || [],
    attachments: candidate.attachments || [],
    marking_criteria: [],
    tag_ids: candidate.tag_ids || [],
    import_source: candidate.import_source || "",
  }
}

function emptyQuestionDraft(subject, importSource = "") {
  return {
    subject: subject?.name || "",
    subject_id: subject?.id || null,
    marks: 1,
    question_text: "",
    latex: "",
    graph: "",
    tikz_code: "",
    diagram_svg: "",
    tikz_visuals: [],
    sample_solution: "",
    hints: [],
    parts: [],
    attachments: [],
    marking_criteria: [],
    tag_ids: [],
    import_source: importSource,
  }
}

function draftToCandidate(draft, sourceMetadata = {}) {
  return {
    temporary_id: `manual-${crypto.randomUUID()}`,
    question_text: draft.question_text || "Untitled question",
    latex: "",
    tikz_code: draft.tikz_code || "",
    diagram_svg: draft.diagram_svg || "",
    tikz_visuals: draft.tikz_visuals || [],
    sample_solution: draft.sample_solution || "",
    marks: draft.marks || 1,
    detected_subject: draft.subject || "",
    confidence: 1,
    needs_manual_graph: false,
    needs_manual_table: false,
    needs_manual_visual: false,
    import_notes: "Manually added during review.",
    source_metadata: sourceMetadata,
    parts: draft.parts || [],
    attachments: draft.attachments || [],
    marking_criteria: [],
    import_source: draft.import_source || "",
    draft,
    review_status: "pending",
    save_error: "",
  }
}

function manualFlags(candidate) {
  return [
    candidate?.needs_manual_graph && "Graph",
    candidate?.needs_manual_table && "Table",
    candidate?.needs_manual_visual && "Visual",
  ].filter(Boolean)
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || "")
      resolve(result.split(",")[1] || "")
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function parseErrorMessage(data) {
  if (!data) return "Import parsing failed."

  if (typeof data.detail === "string") return data.detail
  if (Array.isArray(data.detail)) {
    return data.detail
      .map((item) => item.msg || item.message || JSON.stringify(item))
      .join(" ")
  }
  if (typeof data.message === "string") {
    return data.raw
      ? `${data.message}: ${String(data.raw).slice(0, 700)}`
      : data.message
  }
  if (typeof data.error === "string") return data.error
  if (data.raw) return String(data.raw).slice(0, 500)

  return JSON.stringify(data).slice(0, 500)
}

function flattenSaveErrors(data) {
  if (!data) return "Could not save this question."
  if (typeof data === "string") return data
  if (typeof data.detail === "string") return data.detail
  if (Array.isArray(data.detail)) {
    return data.detail
      .map((item) => {
        const location = Array.isArray(item.loc) ? item.loc.join(".") : ""
        const message = item.msg || item.message || JSON.stringify(item)
        return location ? `${location}: ${message}` : message
      })
      .join(" ")
  }

  const fieldMessages = Object.entries(data)
    .flatMap(([field, value]) => {
      if (Array.isArray(value)) {
        return value.map((item) => {
          const message = item?.message || item?.msg || String(item)
          return `${field}: ${message}`
        })
      }
      if (typeof value === "string") return `${field}: ${value}`
      return []
    })

  return fieldMessages.length
    ? fieldMessages.join(" ")
    : "Could not save this question. Please check the required fields and try again."
}

export default function QuestionImportPage() {
  const params = useParams()
  const [sourceMode, setSourceMode] = useState("paste")
  const [pastedContent, setPastedContent] = useState("")
  const [importInstructions, setImportInstructions] = useState("")
  const [importSource, setImportSource] = useState("")
  const [sourceUrl, setSourceUrl] = useState("")
  const [file, setFile] = useState(null)
  const [sourceCollapsed, setSourceCollapsed] = useState(false)
  const [candidates, setCandidates] = useState([])
  const [candidateSearch, setCandidateSearch] = useState("")
  const [parseMetadata, setParseMetadata] = useState(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [editorInitialData, setEditorInitialData] = useState(null)
  const [draft, setDraft] = useState(null)
  const [status, setStatus] = useState("idle")
  const [parseError, setParseError] = useState("")
  const [saveErrors, setSaveErrors] = useState({})
  const [previewExpanded, setPreviewExpanded] = useState(false)

  const { data: subjects = [], isLoading: subjectsLoading } = useSWR(
    SUBJECTS_API_URL,
    fetcher
  )
  const lockedSubject = subjects.find(
    (subject) => subject.slug === params?.slug
  )

  const activeCandidate = candidates[activeIndex] || null
  const activeQuestion = editorInitialData
  const sourcePlaceholder = `e.g. HSC ${lockedSubject?.name || "Chemistry"} 2025`

  const counts = useMemo(
    () =>
      candidates.reduce(
        (summary, candidate) => ({
          ...summary,
          [candidate.review_status]: (summary[candidate.review_status] || 0) + 1,
        }),
        {}
      ),
    [candidates]
  )

  const activeFlags = manualFlags(activeCandidate)
  const filteredCandidates = useMemo(
    () =>
      candidates
        .map((candidate, index) => ({ candidate, index }))
        .filter(({ candidate, index }) => {
          const query = candidateSearch.trim().toLowerCase()
          if (!query) return true

          return (
            String(index + 1).includes(query) ||
            candidate.question_text.toLowerCase().includes(query) ||
            REVIEW_STATUSES[candidate.review_status].toLowerCase().includes(query)
          )
        }),
    [candidateSearch, candidates]
  )

  const selectCandidate = useCallback((index, candidate = candidates[index]) => {
    setActiveIndex(index)
    setDraft(
      candidate
        ? candidate.draft || candidateToQuestion(candidate, lockedSubject)
        : null
    )
    setEditorInitialData(
      candidate
        ? candidate.draft || candidateToQuestion(candidate, lockedSubject)
        : null
    )
    setSaveErrors({})
  }, [candidates, lockedSubject])

  const updateDraft = useCallback((nextDraft) => {
    setDraft(nextDraft)
    setCandidates((items) =>
      items.map((item, index) =>
        index === activeIndex
          ? {
              ...item,
              draft: nextDraft,
            }
          : item
      )
    )
  }, [activeIndex])

  const updateActiveCandidate = useCallback((updates) => {
    setCandidates((items) =>
      items.map((item, index) =>
        index === activeIndex
          ? {
              ...item,
              ...updates,
            }
          : item
      )
    )
  }, [activeIndex])

  const updateCandidateAt = useCallback((targetIndex, updates) => {
    setCandidates((items) =>
      items.map((item, index) =>
        index === targetIndex
          ? {
              ...item,
              ...updates,
            }
          : item
      )
    )
  }, [])

  const addManualQuestion = useCallback(() => {
    const manualDraft = emptyQuestionDraft(lockedSubject, importSource)
    const candidate = draftToCandidate(manualDraft, { parser: "manual-review-add" })
    setCandidates((items) => {
      const next = [...items, candidate]
      setActiveIndex(next.length - 1)
      return next
    })
    setDraft(manualDraft)
    setEditorInitialData(manualDraft)
    setSaveErrors({})
  }, [importSource, lockedSubject])

  const branchPartToQuestion = useCallback((part, partIndex) => {
    if (!draft) return

    const nextParts = (draft.parts || []).filter((_, index) => index !== partIndex)
    const nextDraft = {
      ...draft,
      marks: nextParts.length
        ? nextParts.reduce((total, item) => total + (Number(item.marks) || 0), 0)
        : draft.marks,
      parts: nextParts,
    }
    updateDraft(nextDraft)
    setEditorInitialData(nextDraft)

    const branchedDraft = {
      ...emptyQuestionDraft(lockedSubject, draft.import_source || importSource),
      marks: part.marks || 1,
      question_text: part.text || "",
      sample_solution: part.sample_solution || "",
      hints: [],
      attachments: part.attachments || [],
      marking_criteria: [],
      tag_ids: draft.tag_ids || [],
    }
    const candidate = draftToCandidate(branchedDraft, {
      parser: "manual-branch-part",
      branched_from: activeCandidate?.temporary_id || "",
      part_label: part.label || "",
    })

    setCandidates((items) => {
      const insertAt = activeIndex + 1
      return [
        ...items.slice(0, insertAt),
        candidate,
        ...items.slice(insertAt),
      ]
    })
  }, [activeCandidate, activeIndex, draft, importSource, lockedSubject, updateDraft])

  const parseImportSource = async () => {
    setStatus("parsing")
    setParseError("")
    setSaveErrors({})
    setParseMetadata(null)

    const payload = {
      source_type: sourceMode,
      parser_mode: "hybrid",
      import_instructions: importInstructions,
      import_source: importSource,
      content: sourceMode === "paste" ? pastedContent : "",
      url: sourceMode === "url" ? sourceUrl : "",
      subject_id: lockedSubject?.id || null,
    }

    if (sourceMode === "file" && file) {
      if (file.size > MAX_IMPORT_FILE_BYTES) {
        setParseError(
          `This file is too large for the current importer. Please use a PDF under ${MAX_IMPORT_FILE_MB}MB or split the source.`
        )
        setStatus("idle")
        return
      }

      payload.filename = file.name
      payload.file_base64 = await readFileAsBase64(file)
    }

    let response
    let data

    try {
      response = await fetch(IMPORT_PARSE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })
      data = await response.json()
    } catch (error) {
      setParseError(`Import request failed before the backend could parse it: ${String(error)}`)
      setStatus("idle")
      return
    }

    if (!response.ok) {
      setParseError(parseErrorMessage(data))
      setStatus("idle")
      return
    }

    const parsedCandidates = data.candidates.map((candidate) => ({
        ...candidate,
        review_status: "pending",
        save_error: "",
      }))

    setCandidates(parsedCandidates)
    setParseMetadata(data.source_metadata || null)
    setActiveIndex(0)
    const firstDraft = parsedCandidates[0]
      ? candidateToQuestion(parsedCandidates[0], lockedSubject)
      : null
    setDraft(firstDraft)
    setEditorInitialData(firstDraft)
    setSourceCollapsed(Boolean(data.candidates.length))
    setStatus("idle")
  }

  const saveDraft = async (payload, targetIndex = activeIndex) => {
    const existingId = candidates[targetIndex]?.saved_id
    const response = await fetch(
      existingId ? `/api/questions/${existingId}/` : QUESTIONS_API_URL,
      {
        method: existingId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    )
    let data
    try {
      data = await response.json()
    } catch {
      data = { detail: "Backend returned an unreadable response while saving." }
    }

    if (!response.ok) {
      const saveMessage = flattenSaveErrors(data)
      setSaveErrors(data)
      updateCandidateAt(targetIndex, {
        review_status: "error",
        save_error: saveMessage,
      })
      return false
    }

    setSaveErrors({})
    updateCandidateAt(targetIndex, {
      review_status: "accepted",
      saved_id: data.id || existingId,
      save_error: "",
      draft: payload,
    })
    return true
  }

  const acceptCurrent = async (payload) => {
    setStatus("saving")
    const saved = await saveDraft(payload)
    setStatus("idle")

    if (saved && !activeCandidate?.saved_id && activeIndex < candidates.length - 1) {
      selectCandidate(activeIndex + 1)
    }
  }

  const markCurrent = (reviewStatus) => {
    updateActiveCandidate({
      review_status: reviewStatus,
      save_error: "",
    })

    if (activeIndex < candidates.length - 1) {
      selectCandidate(activeIndex + 1)
    }
  }

  const acceptAllPending = async () => {
    setStatus("saving")

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index]
      if (candidate.review_status !== "pending") continue

      selectCandidate(index, candidate)
      const payload =
        index === activeIndex && draft
          ? draft
          : candidateToQuestion(candidate, lockedSubject)
      const saved = await saveDraft(payload, index)

      if (!saved) break
    }

    setStatus("idle")
  }

  const rejectAllPending = () => {
    setCandidates((items) =>
      items.map((candidate) =>
        candidate.review_status === "pending"
          ? {
              ...candidate,
              review_status: "rejected",
            }
          : candidate
      )
    )
  }

  const removeCurrentCandidate = () => {
    if (!activeCandidate) return

    const nextCandidates = candidates.filter((_, index) => index !== activeIndex)
    const nextIndex = Math.min(activeIndex, Math.max(nextCandidates.length - 1, 0))
    const nextCandidate = nextCandidates[nextIndex]

    setCandidates(nextCandidates)
    setActiveIndex(nextIndex)
    setDraft(
      nextCandidate
        ? nextCandidate.draft || candidateToQuestion(nextCandidate, lockedSubject)
        : null
    )
    setEditorInitialData(
      nextCandidate
        ? nextCandidate.draft || candidateToQuestion(nextCandidate, lockedSubject)
        : null
    )
    setSaveErrors({})
  }

  if (subjectsLoading) {
    return <div className="p-10 text-[#dac1b7]">Loading importer...</div>
  }

  if (!lockedSubject) {
    return <div className="p-10 text-[#ffb4ab]">Subject not available for this user.</div>
  }

  return (
    <main className="min-h-[calc(100vh-64px)] overflow-x-hidden bg-[#16130f] px-6 py-8">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#ffb595]">
              {lockedSubject.name}
            </p>
            <h1 className="mt-2 text-3xl font-bold text-[#e5e2e1]">
              Question Import Review
            </h1>
          </div>
          {candidates.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="rounded-full bg-[#ccb2a3d3] text-[#1a1817] hover:bg-[#ddbeaa]"
                disabled={status === "saving"}
                onClick={acceptAllPending}
              >
                <ListChecks className="size-4" />
                Accept Pending
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full border-[#3b2a22]/55 bg-[#181410] text-[#dac1b7] hover:bg-[#211913]"
                onClick={rejectAllPending}
              >
                Reject Pending
              </Button>
            </div>
          )}
        </div>

        <Card className="rounded-2xl border-[#3b2a22]/55 bg-[#1b1713] text-[#e5e2e1]">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="font-serif text-2xl">Import Source</CardTitle>
              {candidates.length > 0 && (
                <p className="mt-1 text-sm text-[#a28c83]">
                  Parsed {candidates.length} candidate questions locally.
                </p>
              )}
              {parseMetadata?.parser_mode && (
                <p className="mt-1 text-sm text-[#a28c83]">
                  Parser: {parseMetadata.parser_mode}
                  {parseMetadata.llm_model ? ` · ${parseMetadata.llm_model}` : ""}
                </p>
              )}
            </div>
            {candidates.length > 0 && (
              <button
                type="button"
                className="flex h-10 items-center gap-2 rounded-full border border-[#3b2a22]/55 bg-[#181410] px-4 text-sm font-semibold text-[#dac1b7] transition-colors hover:bg-[#211913]"
                onClick={() => setSourceCollapsed((value) => !value)}
              >
                <ChevronDown
                  className={cn(
                    "size-4 transition-transform",
                    sourceCollapsed && "-rotate-90"
                  )}
                />
                {sourceCollapsed ? "Show Source" : "Hide Source"}
              </button>
            )}
          </CardHeader>
          {!sourceCollapsed && (
            <CardContent className="grid gap-5">
              <div className="flex flex-wrap gap-2">
                {[
                  ["paste", FileText, "Pasted Text"],
                  ["file", FileUp, "File / PDF"],
                  ["url", LinkIcon, "URL"],
                ].map(([mode, Icon, label]) => (
                  <button
                    key={mode}
                    type="button"
                    className={cn(
                      "flex h-11 shrink-0 items-center gap-3 rounded-xl px-4 text-left text-sm font-semibold transition-colors",
                      candidates.length > 0 && "cursor-not-allowed opacity-45",
                      sourceMode === mode
                        ? "bg-[#4a2f26] text-[#ffb595]"
                        : "bg-white/[0.035] text-[#dac1b7] hover:bg-[#211913]"
                    )}
                    disabled={candidates.length > 0}
                    onClick={() => setSourceMode(mode)}
                  >
                    <Icon className="size-4" />
                    {label}
                  </button>
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div>
                  <Field>
                    <FieldLabel className="text-[#dac1b7]">Source</FieldLabel>
                    <Input
                      className="rounded-full border-[#3b2a22]/55 bg-white/[0.035] text-[#e5e2e1] focus-visible:ring-[#ffb595]/40"
                      disabled={candidates.length > 0}
                      placeholder={sourcePlaceholder}
                      value={importSource}
                      onChange={(event) => setImportSource(event.target.value)}
                    />
                  </Field>

                  {sourceMode === "paste" && (
                    <Field className="mt-4">
                      <FieldLabel className="text-[#dac1b7]">Content</FieldLabel>
                      <Textarea
                        className="min-h-[150px] rounded-2xl border-[#3b2a22]/55 bg-white/[0.035] p-4 text-[#e5e2e1] focus-visible:ring-[#ffb595]/40"
                        disabled={candidates.length > 0}
                        placeholder="Paste numbered questions, LaTeX source, or exported document text."
                        value={pastedContent}
                        onChange={(event) => setPastedContent(event.target.value)}
                      />
                    </Field>
                  )}

                  {sourceMode === "file" && (
                    <Field className="mt-4">
                      <FieldLabel className="text-[#dac1b7]">File</FieldLabel>
                      <Input
                        type="file"
                        accept=".pdf,.tex,.txt,.md,.docx,application/pdf"
                        className="rounded-full border-[#3b2a22]/55 bg-white/[0.035] text-[#e5e2e1] file:text-[#dac1b7]"
                        disabled={candidates.length > 0}
                        onChange={(event) => setFile(event.target.files?.[0] || null)}
                      />
                    </Field>
                  )}

                  {sourceMode === "url" && (
                    <Field className="mt-4">
                      <FieldLabel className="text-[#dac1b7]">URL</FieldLabel>
                      <Input
                        className="rounded-full border-[#3b2a22]/55 bg-white/[0.035] text-[#e5e2e1] focus-visible:ring-[#ffb595]/40"
                        disabled={candidates.length > 0}
                        placeholder="https://..."
                        value={sourceUrl}
                        onChange={(event) => setSourceUrl(event.target.value)}
                      />
                    </Field>
                  )}

                  {parseError && (
                    <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                      {parseError}
                    </p>
                  )}

                  <Field className="mt-4">
                    <FieldLabel className="text-[#dac1b7]">Parsing Notes</FieldLabel>
                    <Textarea
                      className="min-h-[84px] rounded-2xl border-[#3b2a22]/55 bg-white/[0.035] p-4 text-[#e5e2e1] focus-visible:ring-[#ffb595]/40"
                      disabled={candidates.length > 0}
                      placeholder="Optional: e.g. questions start at page 3, ignore solutions, use marks in right margin, split by Exercise 2A."
                      value={importInstructions}
                      onChange={(event) => setImportInstructions(event.target.value)}
                    />
                  </Field>
                </div>

                <div className="flex items-end">
                  <Button
                    type="button"
                    className="rounded-full bg-[#ccb2a3d3] text-[#1a1817] hover:bg-[#ddbeaa]"
                    disabled={
                      status === "parsing" ||
                      candidates.length > 0 ||
                      (sourceMode === "paste" && !pastedContent.trim()) ||
                      (sourceMode === "url" && !sourceUrl.trim()) ||
                      (sourceMode === "file" && !file)
                    }
                    onClick={parseImportSource}
                  >
                    {status === "parsing" ? "Understanding..." : "Parse Locally"}
                  </Button>
                </div>
              </div>
            </CardContent>
          )}
          {parseMetadata?.llm_warning && (
            <div className="mx-6 mb-6 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              Ollama was not used: {parseMetadata.llm_warning}
            </div>
          )}
        </Card>

        {candidates.length > 0 && (
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
                "min-w-0 self-start overflow-hidden rounded-2xl border-[#3b2a22]/55 bg-[#1b1713] text-[#e5e2e1] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                previewExpanded && "xl:pointer-events-none xl:max-w-0 xl:-translate-x-4 xl:scale-[0.98] xl:opacity-0"
              )}
            >
              <CardHeader>
                <CardTitle className="font-serif text-xl">Review Queue</CardTitle>
                <p className="text-sm text-[#a28c83]">
                  {counts.pending || 0} pending · {counts.accepted || 0} accepted · {counts.rejected || 0} rejected
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#a28c83]" />
                    <Input
                      className="h-10 rounded-full border-[#3b2a22]/55 bg-white/[0.035] pl-9 text-sm text-[#e5e2e1] focus-visible:ring-[#ffb595]/40"
                      placeholder="Search candidates"
                      value={candidateSearch}
                      onChange={(event) => setCandidateSearch(event.target.value)}
                    />
                  </div>
                  <Button
                    className="size-8 shrink-0 rounded-full border-[#3b2a22]/55 bg-white/[0.035] p-0 text-base leading-none text-[#dac1b7] hover:bg-[#211913]"
                    type="button"
                    variant="outline"
                    onClick={addManualQuestion}
                    title="Add question"
                  >
                    +
                  </Button>
                  <Button
                    className="size-8 shrink-0 rounded-full border-red-400/25 bg-red-400/10 p-0 text-sm leading-none text-red-100 hover:bg-red-400/15"
                    disabled={!activeCandidate}
                    type="button"
                    variant="outline"
                    onClick={removeCurrentCandidate}
                    title="Remove current question"
                  >
                    ×
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid max-h-[720px] gap-2 overflow-x-hidden overflow-y-auto pr-1">
                {filteredCandidates.map(({ candidate, index }) => (
                  <button
                    key={candidate.temporary_id}
                    type="button"
                    className={cn(
                      "w-full min-w-0 rounded-xl border p-3 text-left transition-colors",
                      index === activeIndex
                        ? "border-[#ffb595]/60 bg-[#2a211e]"
                        : "border-[#3b2a22]/40 bg-[#181410] hover:bg-[#211913]"
                    )}
                    onClick={() => selectCandidate(index, candidate)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-[#e5e2e1]">
                        <span
                          className={cn(
                            "mr-2 inline-block size-2.5 rounded-full align-middle",
                            STATUS_DOTS[candidate.review_status]
                          )}
                        />
                        Question {index + 1}
                      </span>
                      <span
                        className={cn(
                          "rounded-full border px-2 py-1 text-[11px]",
                          STATUS_STYLES[candidate.review_status]
                        )}
                      >
                        {REVIEW_STATUSES[candidate.review_status]}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-[#a28c83]">
                      {candidate.question_text.slice(0, 260)}
                    </p>
                    <p className="mt-2 text-[11px] text-[#ffb595]">
                      {Math.round(candidate.confidence * 100)}% parser confidence
                    </p>
                  </button>
                ))}
                {filteredCandidates.length === 0 && (
                  <div className="rounded-xl border border-[#3b2a22]/40 bg-[#181410] p-4 text-sm text-[#a28c83]">
                    No candidates match that search.
                  </div>
                )}
              </CardContent>
            </Card>

            <section className="flex min-w-0 flex-col gap-4 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]">
              <div className="flex min-h-[76px] flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#3b2a22]/55 bg-[#1b1713] px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-[#e5e2e1]">
                    Candidate {activeIndex + 1} of {candidates.length}
                  </p>
                  {activeFlags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {activeFlags.map((flag) => (
                        <span
                          key={flag}
                          className="inline-flex items-center gap-1 rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-xs text-amber-100"
                        >
                          <AlertTriangle className="size-3" />
                          Manual {flag}
                        </span>
                      ))}
                    </div>
                  )}
                  {activeCandidate?.save_error && (
                    <p className="mt-3 max-w-2xl rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                      {activeCandidate.save_error}
                    </p>
                  )}
                  {activeCandidate?.import_notes && (
                    <p className="mt-2 max-w-2xl text-sm text-[#dac1b7]">
                      {activeCandidate.import_notes}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full border-[#3b2a22]/55 bg-[#181410] text-[#dac1b7] hover:bg-[#211913]"
                    disabled={activeIndex === 0}
                    onClick={() => selectCandidate(activeIndex - 1)}
                  >
                    <ChevronLeft className="size-4" />
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full border-[#3b2a22]/55 bg-[#181410] text-[#dac1b7] hover:bg-[#211913]"
                    disabled={activeIndex >= candidates.length - 1}
                    onClick={() => selectCandidate(activeIndex + 1)}
                  >
                    Next
                    <ChevronRight className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full border-[#3b2a22]/55 bg-[#181410] text-[#dac1b7] hover:bg-[#211913]"
                    onClick={() => markCurrent("skipped")}
                  >
                    <SkipForward className="size-4" />
                    Skip
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    className="rounded-full"
                    onClick={() => markCurrent("rejected")}
                  >
                    <X className="size-4" />
                    Reject
                  </Button>
                  <Button
                    type="button"
                    className="rounded-full bg-[#ccb2a3d3] text-[#1a1817] hover:bg-[#ddbeaa]"
                    disabled={status === "saving" || !draft}
                    onClick={() => acceptCurrent(draft)}
                  >
                    <Check className="size-4" />
                    {status === "saving" ? "Saving..." : activeCandidate?.saved_id ? "Save Changes" : "Accept & Save"}
                  </Button>
                </div>
              </div>

              {activeQuestion && (
                <QuestionEditor
                  key={activeCandidate.temporary_id}
                  initialData={activeQuestion}
                  lockedSubject={lockedSubject}
                  submitLabel={activeCandidate?.saved_id ? "Save Changes" : "Accept & Save"}
                  statusLabels={{
                    loading: "Saving question...",
                    success: "Question saved",
                    error: "Question needs attention",
                  }}
                  onSubmit={acceptCurrent}
                  errors={saveErrors}
                  status={status === "saving" ? "loading" : "idle"}
                  onClearErrors={() => setSaveErrors({})}
                  hidePreview
                  onDraftChange={updateDraft}
                  onBranchPart={branchPartToQuestion}
                />
              )}
            </section>

            <section className="min-w-0 self-start transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]">
              <PreviewPanel
                subject={draft?.subject || lockedSubject.name}
                marks={draft?.marks || activeCandidate?.marks || 1}
                questionText={draft?.question_text || activeCandidate?.question_text || ""}
                hints={[]}
                parts={draft?.parts || activeCandidate?.parts || []}
                attachments={draft?.attachments || activeCandidate?.attachments || []}
                markingCriteria={[]}
                importSource={draft?.import_source || activeCandidate?.import_source || ""}
                tags={[]}
                diagramSvg={draft?.diagram_svg || activeCandidate?.diagram_svg || ""}
                tikzCode={draft?.tikz_code || activeCandidate?.tikz_code || ""}
                tikzVisuals={draft?.tikz_visuals || activeCandidate?.tikz_visuals || []}
                headerAction={
                  <Button
                    type="button"
                    variant="outline"
                    className="size-8 rounded-full border-[#3b2a22]/55 bg-[#181410]/90 p-0 text-[#dac1b7] shadow-lg shadow-black/20 transition-colors hover:bg-[#211913]"
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
