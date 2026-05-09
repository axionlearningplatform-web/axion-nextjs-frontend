"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Bold, ChevronDown, ImagePlus, Italic, Plus, Trash2 } from "lucide-react"
import useSWR from "swr"

import { cn } from "@/lib/utils"
import fetcher from "@/lib/fetcher"

import { Button } from "@/components/ui/button"
import { PreviewPanel } from "@/components/questionEditor/previewPanel"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const emptyCriteria = (mark = 1) => ({
  mark,
  text: "",
})

const emptyPart = (index = 0) => ({
  id: crypto.randomUUID(),
  label: String.fromCharCode(97 + index),
  text: "",
  marks: 1,
  attachments: [],
  marking_criteria: [emptyCriteria(1)],
  hints: [],
})

function criteriaForMarks(marks, existing = []) {
  const count = Math.max(Number(marks) || 1, 1)
  return Array.from({ length: count }, (_, index) => {
    const mark = index + 1
    const found = existing.find((item) => Number(item.mark) === mark)
    return {
      mark,
      text: found?.text || "",
    }
  })
}

function readAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = String(reader.result || "")
      resolve({
        id: crypto.randomUUID(),
        name: file.name,
        mime_type: file.type || "application/octet-stream",
        data_url: dataUrl,
        caption: "",
      })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function SectionTitle({ children }) {
  return (
    <div className="font-serif text-xl font-semibold text-[#e5e2e1]">
      {children}
    </div>
  )
}

function RichTextArea({ value, onValueChange, className, onAfterChange, ...props }) {
  const textareaRef = useRef(null)

  function applyWrap({ before, after = before, fallback, block = false }) {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart ?? value.length
    const end = textarea.selectionEnd ?? value.length
    const selected = value.slice(start, end)
    let next = value
    let cursorStart = start
    let cursorEnd = end

    if (
      selected &&
      value.slice(start - before.length, start) === before &&
      value.slice(end, end + after.length) === after
    ) {
      next = `${value.slice(0, start - before.length)}${selected}${value.slice(end + after.length)}`
      cursorStart = start - before.length
      cursorEnd = cursorStart + selected.length
    } else if (selected.startsWith(before) && selected.endsWith(after)) {
      const unwrapped = selected.slice(before.length, selected.length - after.length)
      next = `${value.slice(0, start)}${unwrapped}${value.slice(end)}`
      cursorStart = start
      cursorEnd = start + unwrapped.length
    } else {
      const insert = selected || fallback
      const opening = block && start > 0 && value[start - 1] !== "\n" ? `\n\n${before}` : before
      const closing = block && value[end] && value[end] !== "\n" ? `${after}\n\n` : after
      next = `${value.slice(0, start)}${opening}${insert}${closing}${value.slice(end)}`
      cursorStart = start + opening.length
      cursorEnd = cursorStart + insert.length
    }

    onValueChange(next)
    onAfterChange?.()

    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(cursorStart, cursorEnd)
    })
  }

  function applyMarker(marker) {
    applyWrap({
      before: marker,
      after: marker,
      fallback: marker === "**" ? "bold text" : "italic text",
    })
  }

  function applyInlineMath() {
    applyWrap({
      before: "$",
      after: "$",
      fallback: "x^2",
    })
  }

  function applyBlockMath() {
    applyWrap({
      before: "$$\n",
      after: "\n$$",
      fallback: "x^2 + y^2 = r^2",
      block: true,
    })
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-[#2a2a2a] bg-[#242424] focus-within:ring-3 focus-within:ring-[#ffb595]/40">
      <div className="flex items-center gap-1 border-b border-[#3a302b] px-3 py-2">
        <button
          type="button"
          className="inline-flex size-8 items-center justify-center rounded-md text-[#a28c83] transition-colors hover:bg-[#2d2d2d] hover:text-[#ffb595]"
          onClick={() => applyMarker("**")}
          aria-label="Bold"
        >
          <Bold className="size-4" />
        </button>
        <button
          type="button"
          className="inline-flex size-8 items-center justify-center rounded-md text-[#a28c83] transition-colors hover:bg-[#2d2d2d] hover:text-[#ffb595]"
          onClick={() => applyMarker("*")}
          aria-label="Italic"
        >
          <Italic className="size-4" />
        </button>
        <button
          type="button"
          className="inline-flex h-8 items-center justify-center rounded-md px-2 font-serif text-[13px] text-[#a28c83] transition-colors hover:bg-[#2d2d2d] hover:text-[#ffb595]"
          onClick={applyInlineMath}
          aria-label="Inline LaTeX"
          title="Inline LaTeX"
        >
          $x$
        </button>
        <button
          type="button"
          className="inline-flex h-8 items-center justify-center rounded-md px-2 font-serif text-[13px] text-[#a28c83] transition-colors hover:bg-[#2d2d2d] hover:text-[#ffb595]"
          onClick={applyBlockMath}
          aria-label="Block LaTeX"
          title="Block LaTeX"
        >
          $$
        </button>
        <span className="ml-2 text-[11px] text-[#6f6258]">Markdown + LaTeX</span>
      </div>
      <Textarea
        ref={textareaRef}
        className={cn(
          "rounded-none border-0 bg-transparent focus-visible:ring-0",
          className
        )}
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value)
          onAfterChange?.()
        }}
        {...props}
      />
    </div>
  )
}

function DropdownSection({ title, summary, children, defaultOpen = false }) {
  return (
    <details
      className="group overflow-hidden rounded-2xl border border-[#54433c]/30 bg-[#1c1b1b]"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#dac1b7] transition-colors hover:bg-[#242424] [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <span className="flex items-center gap-2 text-xs font-normal text-[#a28c83]">
          {summary}
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="border-t border-[#54433c]/25 p-4">{children}</div>
    </details>
  )
}

function AttachmentEditor({ attachments, onChange }) {
  async function addFiles(files) {
    const next = [...attachments]
    for (const file of files) {
      next.push(await readAttachment(file))
    }
    onChange(next)
  }

  return (
    <div className="grid gap-3">
      <label className="inline-flex h-10 w-fit cursor-pointer items-center gap-2 rounded-full border border-[#54433c]/50 bg-[#242424] px-4 text-sm font-semibold text-[#dac1b7] transition-colors hover:bg-[#2d2d2d]">
        <ImagePlus className="size-4" />
        Add Visual
        <input
          accept="image/*,.svg"
          className="hidden"
          multiple
          type="file"
          onChange={(event) => {
            addFiles(Array.from(event.target.files || []))
            event.target.value = ""
          }}
        />
      </label>

      {attachments.map((attachment, index) => (
        <div
          className="grid gap-3 rounded-2xl border border-[#54433c]/30 bg-[#201f1f] p-3"
          key={attachment.id || attachment.name || index}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-sm text-[#e5e2e1]">
              {attachment.name || "Attachment"}
            </span>
            <Button
              className="rounded-full"
              size="sm"
              type="button"
              variant="destructive"
              onClick={() => onChange(attachments.filter((_, i) => i !== index))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
          <Input
            className="rounded-full border-[#2a2a2a] bg-[#242424] text-[#e5e2e1]"
            placeholder="Caption"
            value={attachment.caption || ""}
            onChange={(event) => {
              const next = [...attachments]
              next[index] = {
                ...next[index],
                caption: event.target.value,
              }
              onChange(next)
            }}
          />
        </div>
      ))}
    </div>
  )
}

function CriteriaEditor({ marks, criteria, onChange }) {
  const normalized = useMemo(
    () => criteriaForMarks(marks, criteria),
    [criteria, marks]
  )

  useEffect(() => {
    if (JSON.stringify(normalized) !== JSON.stringify(criteria)) {
      onChange(normalized)
    }
  }, [criteria, normalized, onChange])

  return (
    <div className="grid gap-3">
      {normalized.map((item, index) => (
        <div
          className="grid gap-2 rounded-2xl border border-[#54433c]/25 bg-[#201f1f] p-3"
          key={item.mark}
        >
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-[#2a2a2a] bg-[#242424] px-3 py-2 text-sm text-[#ffb595]">
              Mark {item.mark}
            </span>
            <span className="text-xs text-[#a28c83]">criterion</span>
          </div>
          <Textarea
            className="min-h-20 rounded-2xl border-[#2a2a2a] bg-[#242424] text-[#e5e2e1]"
            placeholder="Explain how this mark is awarded. Inline LaTeX is supported."
            value={item.text}
            onChange={(event) => {
              const next = [...normalized]
              next[index] = {
                ...next[index],
                text: event.target.value,
              }
              onChange(next)
            }}
          />
        </div>
      ))}
    </div>
  )
}

function HintsEditor({ hints, onChange }) {
  return (
    <div className="grid gap-3">
      {hints.length === 0 && (
        <p className="rounded-2xl border border-[#54433c]/25 bg-[#201f1f] px-4 py-3 text-sm text-[#a28c83]">
          No hints added.
        </p>
      )}
      {hints.map((hint, index) => (
        <div className="grid gap-2 rounded-2xl border border-[#54433c]/25 bg-[#201f1f] p-3" key={index}>
          <div className="flex items-center gap-2">
            <Input
              className="h-9 w-14 rounded-full border-[#2a2a2a] bg-[#242424] px-2 text-center text-sm text-[#e5e2e1] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              min="1"
              type="number"
              value={hint.mark}
              onChange={(event) => {
                const next = [...hints]
                next[index] = { ...hint, mark: event.target.value }
                onChange(next)
              }}
            />
            <span className="text-xs text-[#a28c83]">mark hint</span>
            <Button
              className="ml-auto rounded-full"
              size="sm"
              type="button"
              variant="destructive"
              onClick={() => onChange(hints.filter((_, i) => i !== index))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
          <Textarea
            className="min-h-16 rounded-2xl border-[#2a2a2a] bg-[#242424] text-[#e5e2e1]"
            placeholder="Write a hint for this mark."
            value={hint.text}
            onChange={(event) => {
              const next = [...hints]
              next[index] = { ...hint, text: event.target.value }
              onChange(next)
            }}
          />
        </div>
      ))}
      <Button
        className="w-fit rounded-full border border-[#54433c]/40 bg-[#242424] text-[#dac1b7] hover:bg-[#2d2d2d]"
        type="button"
        onClick={() => onChange([...hints, { text: "", mark: "1" }])}
      >
        <Plus className="size-4" />
        Add Hint
      </Button>
    </div>
  )
}

export function QuestionEditor({
  initialData = null,
  subjects = [],
  lockedSubject = null,
  submitLabel = "Create Question",
  statusLabels = {
    loading: "Submitting question...",
    success: "Question submitted",
    error: "Failed to submit",
  },
  onSubmit,
  onDelete = null,
  deleting = false,
  errors,
  status,
  onClearErrors,
  hidePreview = false,
  onDraftChange = null,
  onBranchPart = null,
}) {
  const [subject, setSubject] = useState("")
  const [subjectId, setSubjectId] = useState("")
  const [marks, setMarks] = useState("1")
  const [questionText, setQuestionText] = useState("")
  const [importSource, setImportSource] = useState("")
  const [hints, setHints] = useState([{ text: "", mark: "1" }])
  const [parts, setParts] = useState([])
  const [attachments, setAttachments] = useState([])
  const [markingCriteria, setMarkingCriteria] = useState([emptyCriteria(1)])
  const [tagIds, setTagIds] = useState([])
  const [confirmDelete, setConfirmDelete] = useState(false)

  const tagsUrl = subjectId
    ? `/api/questions/tags/?subject_id=${subjectId}`
    : "/api/questions/tags/"
  const { data: tags = [] } = useSWR(tagsUrl, fetcher)
  const selectedTags = tags.filter((tag) => tagIds.includes(tag.id))
  const sourcePlaceholder = `e.g. HSC ${subject || lockedSubject?.name || "Chemistry"} 2025`

  const effectiveMarks = parts.length
    ? Number(marks) || parts.reduce((total, part) => total + (Number(part.marks) || 0), 0)
    : Number(marks) || 1
  const partMarksTotal = parts.reduce((total, part) => total + (Number(part.marks) || 0), 0)

  useEffect(() => {
    if (!initialData) return

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSubject(initialData.subject || "")
    setSubjectId(initialData.subject_id ? String(initialData.subject_id) : "")
    setMarks(String(initialData.marks || "1"))
    setQuestionText(initialData.question_text || "")
    setImportSource(initialData.import_source || "")
    setHints(
      initialData.hints?.length
        ? initialData.hints.map((hint) => ({
            text: hint.text || "",
            mark: String(hint.mark || "1"),
          }))
        : [{ text: "", mark: "1" }]
    )
    setParts(
      (initialData.parts || []).map((part, index) => ({
        id: part.id || crypto.randomUUID(),
        label: part.label || String.fromCharCode(97 + index),
        text: part.text || "",
        marks: Number(part.marks || 1),
        attachments: part.attachments || [],
        marking_criteria: criteriaForMarks(
          part.marks || 1,
          part.marking_criteria || []
        ),
        hints: (part.hints || []).map((hint) => ({
          text: hint.text || "",
          mark: String(hint.mark || "1"),
        })),
      }))
    )
    setAttachments(initialData.attachments || [])
    setMarkingCriteria(
      criteriaForMarks(
        initialData.marks || 1,
        initialData.marking_criteria || []
      )
    )
    setTagIds(initialData.tag_ids || [])
  }, [initialData])

  useEffect(() => {
    if (!lockedSubject) return

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSubject(lockedSubject.name || "")
    setSubjectId(lockedSubject.id ? String(lockedSubject.id) : "")
  }, [lockedSubject])

  function payload() {
    return {
      subject,
      subject_id: subjectId ? Number(subjectId) : null,
      marks: effectiveMarks,
      question_text: questionText,
      latex: "",
      graph: "",
      hints: hints.map((hint) => ({
        text: hint.text,
        mark: Number(hint.mark),
      })),
      parts: parts.map((part) => ({
        label: part.label,
        text: part.text,
        marks: Number(part.marks) || 1,
        attachments: part.attachments || [],
        marking_criteria: part.marking_criteria || [],
        hints: (part.hints || []).map((hint) => ({
          text: hint.text,
          mark: Number(hint.mark),
        })),
      })),
      attachments,
      marking_criteria: parts.length ? [] : markingCriteria,
      tag_ids: tagIds,
      import_source: importSource,
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    onSubmit(payload())
  }

  useEffect(() => {
    if (!onDraftChange) return
    onDraftChange(payload())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, subjectId, marks, questionText, importSource, hints, parts, attachments, markingCriteria, tagIds])

  return (
    <div className={cn("grid gap-8", !hidePreview && "lg:grid-cols-2")}>
      <div className="flex min-w-0 flex-col gap-6">
        <Card
          className={cn(
            "w-full rounded-3xl border-[#54433c]/45 bg-[#151515] text-[#e5e2e1] shadow-2xl shadow-black/20 transition-colors",
            errors?.question_text && "border-destructive shadow-destructive/20"
          )}
        >
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="font-serif text-2xl font-semibold">
                {submitLabel === "Save Changes" ? "Edit Question" : "Create Question"}
              </CardTitle>

              {onDelete && (
                <div className="flex items-center gap-2">
                  {!confirmDelete ? (
                    <Button
                      className="rounded-full"
                      type="button"
                      variant="destructive"
                      onClick={() => setConfirmDelete(true)}
                    >
                      Delete Question
                    </Button>
                  ) : (
                    <>
                      <Button
                        className="rounded-full"
                        type="button"
                        variant="outline"
                        onClick={() => setConfirmDelete(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="rounded-full"
                        disabled={deleting}
                        type="button"
                        variant="destructive"
                        onClick={onDelete}
                      >
                        {deleting ? "Deleting..." : "Confirm Delete"}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="relative flex flex-col gap-6">
            <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
              <FieldGroup className="flex flex-col gap-6">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_112px]">
                  <Field>
                    <FieldLabel className="text-[#dac1b7]">Subject</FieldLabel>
                    {lockedSubject ? (
                      <Input
                        className="rounded-full border-[#2a2a2a] bg-[#242424] text-[#a28c83]"
                        disabled
                        value={lockedSubject.name}
                      />
                    ) : subjects.length > 0 ? (
                      <select
                        className="h-10 rounded-full border border-[#2a2a2a] bg-[#242424] px-4 text-[#e5e2e1]"
                        value={subjectId}
                        onChange={(e) => {
                          const value = e.target.value
                          setSubjectId(value)
                          const found = subjects.find((s) => String(s.id) === value)
                          setSubject(found?.name || "")
                        }}
                      >
                        <option value="">Select subject</option>
                        {subjects.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        className="rounded-full border-[#2a2a2a] bg-[#242424] text-[#a28c83]"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                      />
                    )}
                  </Field>

                  <Field>
                    <FieldLabel className="text-[#dac1b7]">
                      {parts.length ? "Total Marks" : "Marks"}
                    </FieldLabel>
                    <Input
                      className="h-10 rounded-full border-[#2a2a2a] bg-[#242424] px-2 text-center text-sm text-[#e5e2e1] [appearance:textfield] focus-visible:ring-[#ffb595]/40 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      min="1"
                      type="number"
                      value={marks}
                      onChange={(e) => setMarks(e.target.value)}
                    />
                    {parts.length > 0 && partMarksTotal !== Number(marks) && (
                      <p className="mt-2 text-xs text-amber-200">
                        Parts currently add to {partMarksTotal} marks.
                      </p>
                    )}
                  </Field>
                </div>

                <Field>
                  <FieldLabel className="text-[#dac1b7]">Source</FieldLabel>
                  <Input
                    className="rounded-full border-[#2a2a2a] bg-[#242424] text-[#e5e2e1] focus-visible:ring-[#ffb595]/40"
                    placeholder={sourcePlaceholder}
                    value={importSource}
                    onChange={(event) => setImportSource(event.target.value)}
                  />
                </Field>

                <Field>
                  <FieldLabel className="text-[#dac1b7]">
                    {parts.length ? "Question Stem / Background" : "Question"}
                  </FieldLabel>
                  <RichTextArea
                    className={cn(
                      "min-h-[180px] p-5 text-[#e5e2e1]",
                      errors?.question_text && "border-destructive focus-visible:ring-destructive"
                    )}
                    value={questionText}
                    onValueChange={setQuestionText}
                    onAfterChange={() => {
                      if (errors?.question_text && onClearErrors) onClearErrors()
                    }}
                  />
                  {errors?.question_text?.[0]?.message && (
                    <p className="mt-2 text-sm text-destructive">
                      {errors.question_text[0].message}
                    </p>
                  )}
                </Field>

                <div className="grid gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <SectionTitle>Parts</SectionTitle>
                    <Button
                      className="rounded-full border border-[#54433c]/40 bg-[#242424] text-[#dac1b7] hover:bg-[#2d2d2d]"
                      type="button"
                      onClick={() => setParts([...parts, emptyPart(parts.length)])}
                    >
                      <Plus className="size-4" />
                      Add Part
                    </Button>
                  </div>

                  {parts.map((part, index) => (
                    <details
                      className="group overflow-hidden rounded-2xl border border-[#54433c]/30 bg-[#1c1b1b]"
                      key={part.id}
                      open
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 [&::-webkit-details-marker]:hidden">
                        <div className="flex min-w-0 items-center gap-3">
                          <Input
                            className="h-8 w-11 rounded-full border-[#2a2a2a] bg-[#242424] text-center text-sm text-[#e5e2e1]"
                            value={part.label}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => {
                              const next = [...parts]
                              next[index] = { ...part, label: event.target.value }
                              setParts(next)
                            }}
                          />
                          <span className="truncate text-sm font-semibold text-[#e5e2e1]">
                            {part.text || `Part ${index + 1}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            className="h-8 w-11 rounded-full border-[#2a2a2a] bg-[#242424] px-1 text-center text-sm text-[#e5e2e1] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            min="1"
                            type="number"
                            value={part.marks}
                            onClick={(event) => event.stopPropagation()}
                            onBlur={() => {
                              if (part.marks === "" || Number(part.marks) < 1) {
                                const next = [...parts]
                                next[index] = {
                                  ...part,
                                  marks: 1,
                                  marking_criteria: criteriaForMarks(1, part.marking_criteria),
                                }
                                setParts(next)
                              }
                            }}
                            onChange={(event) => {
                              const rawValue = event.target.value
                              const next = [...parts]
                              next[index] = {
                                ...part,
                                marks: rawValue,
                                marking_criteria: rawValue
                                  ? criteriaForMarks(Number(rawValue) || 1, part.marking_criteria)
                                  : part.marking_criteria,
                              }
                              setParts(next)
                            }}
                          />
                          <span className="hidden text-xs text-[#a28c83] sm:inline">marks</span>
                          <Button
                            className="rounded-full"
                            size="sm"
                            type="button"
                            variant="destructive"
                            onClick={(event) => {
                              event.stopPropagation()
                              setParts(parts.filter((_, i) => i !== index))
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                          <ChevronDown className="size-4 text-[#a28c83] transition-transform group-open:rotate-180" />
                        </div>
                      </summary>

                      <div className="grid gap-4 border-t border-[#54433c]/25 p-4">
                        <Field>
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <FieldLabel className="text-[#dac1b7]">Question Text</FieldLabel>
                            {onBranchPart && (
                              <Button
                                className="rounded-full border-[#54433c]/50 bg-[#242424] text-xs text-[#dac1b7] hover:bg-[#2d2d2d]"
                                size="sm"
                                type="button"
                                variant="outline"
                                onClick={() => onBranchPart(part, index)}
                              >
                                Branch to Question
                              </Button>
                            )}
                          </div>
                          <RichTextArea
                            className="min-h-[110px] p-4 text-[#e5e2e1]"
                            value={part.text}
                            onValueChange={(value) => {
                              const next = [...parts]
                              next[index] = { ...part, text: value }
                              setParts(next)
                            }}
                          />
                        </Field>

                        <DropdownSection
                          title="Visuals"
                          summary={`${part.attachments?.length || 0} added`}
                        >
                          <AttachmentEditor
                            attachments={part.attachments || []}
                            onChange={(value) => {
                              const next = [...parts]
                              next[index] = { ...part, attachments: value }
                              setParts(next)
                            }}
                          />
                        </DropdownSection>

                        <DropdownSection
                          title="Marking Criteria"
                          summary={`${part.marking_criteria?.filter((item) => item.text)?.length || 0}/${part.marks || 1} filled`}
                        >
                          <CriteriaEditor
                            criteria={part.marking_criteria || []}
                            marks={part.marks}
                            onChange={(value) => {
                              const next = [...parts]
                              next[index] = { ...part, marking_criteria: value }
                              setParts(next)
                            }}
                          />
                        </DropdownSection>

                        <DropdownSection
                          title="Hints"
                          summary={`${part.hints?.filter((item) => item.text)?.length || 0} added`}
                        >
                          <HintsEditor
                            hints={part.hints || []}
                            onChange={(value) => {
                              const next = [...parts]
                              next[index] = { ...part, hints: value }
                              setParts(next)
                            }}
                          />
                        </DropdownSection>
                      </div>
                    </details>
                  ))}
                </div>

                {parts.length === 0 && (
                  <div className="grid gap-4">
                    <DropdownSection
                      title="Visuals"
                      summary={`${attachments.length} added`}
                    >
                        <AttachmentEditor
                          attachments={attachments}
                          onChange={setAttachments}
                        />
                    </DropdownSection>
                    <DropdownSection
                      title="Marking Criteria"
                      summary={`${markingCriteria.filter((item) => item.text).length}/${marks || 1} filled`}
                    >
                        <CriteriaEditor
                          criteria={markingCriteria}
                          marks={marks}
                          onChange={setMarkingCriteria}
                        />
                    </DropdownSection>
                    <DropdownSection
                      title="Hints"
                      summary={`${hints.filter((item) => item.text).length} added`}
                    >
                      <HintsEditor hints={hints} onChange={setHints} />
                    </DropdownSection>
                  </div>
                )}

                <Field>
                  <FieldLabel className="text-[#dac1b7]">Tags</FieldLabel>
                  <div className="flex flex-wrap gap-2 rounded-2xl border border-[#54433c]/25 bg-[#201f1f] p-3">
                    {tags.length === 0 && (
                      <span className="text-sm text-[#a28c83]">
                        Add question tags in Django admin.
                      </span>
                    )}
                    {tags.map((tag) => {
                      const selected = tagIds.includes(tag.id)
                      return (
                        <button
                          className={cn(
                            "rounded-full border px-3 py-1 text-sm transition-colors",
                            selected
                              ? "border-[#ffb595]/60 bg-[#4a2f26] text-[#ffb595]"
                              : "border-[#54433c]/35 bg-[#242424] text-[#dac1b7] hover:bg-[#2d2d2d]"
                          )}
                          key={tag.id}
                          type="button"
                          onClick={() =>
                            setTagIds(
                              selected
                                ? tagIds.filter((id) => id !== tag.id)
                                : [...tagIds, tag.id]
                            )
                          }
                        >
                          {tag.name}
                        </button>
                      )
                    })}
                  </div>
                </Field>

                <Button
                  className="rounded-full bg-[#ccb2a3d3] text-base font-semibold text-[#1a1817] shadow-[0_0_0_1px_rgba(255,255,255,0.03)] transition-all duration-300 hover:bg-[#ddbeaa] hover:text-black hover:shadow-[0_8px_30px_rgba(255,220,200,0.06)] active:scale-[0.995]"
                  type="submit"
                >
                  {submitLabel}
                </Button>
              </FieldGroup>
            </form>

            <div
              className={cn(
                "overflow-hidden rounded-xl border transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]",
                status === "idle" && "max-h-0 border-transparent px-0 py-0 opacity-0",
                status === "loading" && "mt-2 max-h-24 border-white/10 bg-white/5 px-4 py-3 text-white/80 opacity-100",
                status === "success" && "mt-2 max-h-24 border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-emerald-200 opacity-100",
                status === "error" && "mt-2 max-h-24 border-red-500/20 bg-red-500/10 px-4 py-3 text-red-200 opacity-100"
              )}
            >
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    status === "loading" && "animate-pulse bg-white/70",
                    status === "success" && "bg-emerald-400",
                    status === "error" && "bg-red-400"
                  )}
                />
                <span>
                  {status === "loading" && statusLabels.loading}
                  {status === "success" && statusLabels.success}
                  {status === "error" && statusLabels.error}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {!hidePreview && (
        <PreviewPanel
          attachments={attachments}
          hints={hints}
          markingCriteria={markingCriteria}
          marks={effectiveMarks}
          parts={parts}
          questionText={questionText}
          importSource={importSource}
          subject={subject}
          tags={selectedTags}
        />
      )}
    </div>
  )
}
