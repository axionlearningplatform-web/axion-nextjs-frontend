"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Bold, Check, ChevronDown, Italic, Plus, Trash2 } from "lucide-react"
import useSWR from "swr"

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { cn } from "@/lib/utils"
import fetcher from "@/lib/fetcher"
import { subjectIsMathematics } from "@/lib/subjectMath"

import { Button } from "@/components/ui/button"
import { PreviewPanel } from "@/components/questionEditor/previewPanel"
import { LatexSegmentPreview } from "@/components/questionEditor/LatexSegmentPreview"
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

const emptyPart = (index = 0) => ({
  id: crypto.randomUUID(),
  label: String.fromCharCode(97 + index),
  text: "",
  marks: 1,
  sample_solution: "",
  answer_type: "proof",
  answer_value: "",
  tag_ids: [],
  tag_requirements: [],
  attachments: [],
  tikz_visuals: [],
  marking_criteria: [],
  hints: [],
})

const emptyTikzVisual = (index = 0) => ({
  id: crypto.randomUUID(),
  name: `Visual ${index + 1}`,
  code: "",
  svg: "",
})

const emptyMcqOption = (index = 0) => ({
  id: crypto.randomUUID(),
  letter: String.fromCharCode(65 + index),
  text: "",
})

const defaultMcqOptions = () => [0, 1, 2, 3].map(emptyMcqOption)

function SectionTitle({ children }) {
  return (
    <div className="font-serif text-xl font-semibold text-[#e5e2e1]">
      {children}
    </div>
  )
}

function EditorToolbarButton({
  onClick,
  label,
  shortcut,
  children,
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className="inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-[#a28c83] transition-colors hover:bg-[#2d2d2d] hover:text-[#ffb595]"
        onClick={onClick}
      >
        {children}
      </TooltipTrigger>

      <TooltipContent
        side="top"
        className="rounded-xl border-[#3b2a22] bg-[#171310] text-[#e5e2e1]"
      >
        <div className="flex items-center gap-3">
          <span>{label}</span>

          {shortcut && (
            <kbd className="rounded-md border border-[#4a3a30] bg-[#211913] px-2 py-0.5 text-[11px] text-[#ffb595]">
              {shortcut}
            </kbd>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

function RichTextArea({ value, onValueChange, className, onAfterChange, toolbarHint, ...props }) {
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
      const insert = selected.length ? selected : fallback
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

  function applyRawInsert(insert, cursorOffsetFromEnd = 0) {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart ?? value.length
    const end = textarea.selectionEnd ?? value.length
    const next = value.slice(0, start) + insert + value.slice(end)
    onValueChange(next)
    onAfterChange?.()
    const pos = start + insert.length - cursorOffsetFromEnd
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(pos, pos)
    })
  }

  function handleKeyDown(event) {
    const isMac = navigator.platform.toUpperCase().includes("MAC")
    const modifier = isMac ? event.metaKey : event.ctrlKey

    if (modifier && event.key.toLowerCase() === "b") {
      event.preventDefault()
      applyWrap({
        before: "\\textbf{",
        after: "}",
        fallback: "text",
      })
      return
    }

    if (modifier && event.key.toLowerCase() === "i") {
      event.preventDefault()
      applyWrap({
        before: "\\textit{",
        after: "}",
        fallback: "text",
      })
      return
    }

    if (event.key === "Tab") {
      const textarea = textareaRef.current
      if (!textarea) return

      const cursor = textarea.selectionStart
      const before = value.slice(0, cursor)

      const snippets = {
        align: `\\begin{align*}
x &= y \\\\
x + 1 &= 2
\\end{align*}`,

        cases: `\\begin{cases}

\\end{cases}`,

        tikz: `\\begin{tikzpicture}

\\end{tikzpicture}`,

        matrix: `\\begin{bmatrix}

\\end{bmatrix}`,
      }

      for (const key of Object.keys(snippets)) {
        if (before.endsWith(key)) {
          event.preventDefault()
          const replacement = snippets[key]
          const next = value.slice(0, cursor - key.length) + replacement + value.slice(cursor)
          onValueChange(next)
          onAfterChange?.()
          requestAnimationFrame(() => {
            textarea.focus()
            const nl = replacement.indexOf("\n\n")
            const position = cursor - key.length + (nl >= 0 ? nl + 1 : replacement.length)
            textarea.setSelectionRange(position, position)
          })
          return
        }
      }
    }
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-[#3b2a22]/55 bg-white/[0.035] focus-within:ring-3 focus-within:ring-[#ffb595]/40">
      <TooltipProvider delayDuration={180}>
        <div className="flex flex-wrap items-center gap-1 border-b border-[#3a302b] px-2 py-1.5 sm:px-3 sm:py-2">
          <EditorToolbarButton
            label="Bold"
            shortcut="⌘B"
            onClick={() =>
              applyWrap({
                before: "\\textbf{",
                after: "}",
                fallback: "text",
              })
            }
          >
            <Bold className="size-4" />
          </EditorToolbarButton>
          <EditorToolbarButton
            label="Italic"
            shortcut="⌘I"
            onClick={() =>
              applyWrap({
                before: "\\textit{",
                after: "}",
                fallback: "text",
              })
            }
          >
            <Italic className="size-4" />
          </EditorToolbarButton>
          <EditorToolbarButton
            label="Align"
            shortcut="align+Tab"
            onClick={() =>
              applyWrap({
                before: "\\begin{align*}\n",
                after: "\n\\end{align*}",
                fallback: "x &= y",
                block: true,
              })
            }
          >
            <span className="font-serif text-[12px]">align</span>
          </EditorToolbarButton>
          <EditorToolbarButton
            label="Fraction"
            onClick={() => applyRawInsert("\\frac{}{}", 3)}
          >
            <span className="font-serif text-[12px]">a/b</span>
          </EditorToolbarButton>
          <EditorToolbarButton label="Sqrt" onClick={() => applyRawInsert("\\sqrt{}", 1)}>
            <span className="font-serif text-[12px]">√</span>
          </EditorToolbarButton>
          <EditorToolbarButton label="Superscript" onClick={() => applyRawInsert("^{}")}>
            <span className="font-serif text-[11px]">xⁿ</span>
          </EditorToolbarButton>
          <EditorToolbarButton label="Subscript" onClick={() => applyRawInsert("_{}")}>
            <span className="font-serif text-[11px]">xₙ</span>
          </EditorToolbarButton>
          <EditorToolbarButton label="Sum" onClick={() => applyRawInsert("\\sum ")}>
            <span className="font-serif text-[12px]">∑</span>
          </EditorToolbarButton>
          <EditorToolbarButton label="Integral" onClick={() => applyRawInsert("\\int ")}>
            <span className="font-serif text-[12px]">∫</span>
          </EditorToolbarButton>
          <EditorToolbarButton
            label="Cases"
            onClick={() =>
              applyWrap({
                before: "\\begin{cases}\n",
                after: "\n\\end{cases}",
                fallback: "x & x<0\\\\\n0 & \\text{otherwise}",
                block: true,
              })
            }
          >
            <span className="font-serif text-[11px]">{`{`}</span>
          </EditorToolbarButton>
          <EditorToolbarButton
            label="Matrix"
            onClick={() =>
              applyWrap({
                before: "\\begin{bmatrix}\n",
                after: "\n\\end{bmatrix}",
                fallback: "a & b\\\\\nc & d",
                block: true,
              })
            }
          >
            <span className="font-serif text-[11px]">[]</span>
          </EditorToolbarButton>
          <EditorToolbarButton
            label="Colour"
            onClick={() => applyRawInsert("\\textcolor{red}{}", 1)}
          >
            <span className="font-serif text-[11px]">RGB</span>
          </EditorToolbarButton>
          <EditorToolbarButton label="Boxed" onClick={() => applyRawInsert("\\boxed{}", 1)}>
            <span className="font-serif text-[11px]">▢</span>
          </EditorToolbarButton>
          <EditorToolbarButton label="Greek θ" onClick={() => applyRawInsert("\\theta")}>
            <span className="font-serif text-[11px]">θ</span>
          </EditorToolbarButton>
          <span className="ml-auto min-w-0 text-[10px] text-[#6f6258] sm:text-[11px]">
            {toolbarHint || "LaTeX-first · preview wraps math"}
          </span>
        </div>
        <Textarea
          ref={textareaRef}
          onKeyDown={handleKeyDown}
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
      </TooltipProvider>
    </div>
  )
}

function DropdownSection({ title, summary, children, defaultOpen = false }) {
  const summaryText = summary != null ? String(summary) : ""
  return (
    <details
      className="group overflow-hidden rounded-2xl border border-[#3b2a22]/55 bg-[#181410]"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-[#dac1b7] transition-colors hover:bg-[#211913] [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <span className="flex shrink-0 items-center gap-2 pl-2 text-xs font-normal text-[#a28c83]">
          <span
            className="max-w-[9rem] truncate text-right sm:max-w-[11rem]"
            title={summaryText}
          >
            {summary}
          </span>
          <ChevronDown className="size-4 shrink-0 text-[#a28c83] transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="border-t border-[#3b2a22]/55 p-4">{children}</div>
    </details>
  )
}

function MarkdownPreview({ value, placeholder = "Preview will appear here." }) {
  return (
    <LatexSegmentPreview
      value={value}
      emptyMessage={placeholder}
      className="text-[15px] leading-7"
    />
  )
}

function moderationStatusBadgeLabel(status) {
  switch (status) {
    case "published":
      return "Published"
    case "submitted":
      return "Submitted"
    case "under_review":
      return "In review"
    case "needs_revision":
      return "Needs changes"
    case "rejected":
      return "Rejected"
    default:
      return status ? String(status).replace(/_/g, " ") : ""
  }
}

function ModerationStatusBadge({ status }) {
  if (!status) return null
  const label = moderationStatusBadgeLabel(status)
  const known = ["published", "submitted", "under_review", "needs_revision", "rejected"].includes(status)
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wide",
        !known && "border-[#3b2a22]/55 bg-[#211913] text-[#dac1b7]",
        status === "published" && "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
        status === "submitted" && "border-sky-400/25 bg-sky-500/10 text-sky-100",
        status === "under_review" && "border-sky-400/25 bg-sky-500/10 text-sky-100",
        status === "needs_revision" && "border-orange-400/30 bg-orange-500/12 text-orange-100",
        status === "rejected" && "border-red-400/25 bg-red-400/10 text-red-100"
      )}
    >
      {label}
    </span>
  )
}

function QuestionTypeBadge({ questionType }) {
  const label = String(questionType || "saq").toLowerCase() === "mcq" ? "MCQ" : "SAQ"
  return (
    <span className="shrink-0 rounded-full border border-[#8b5e42]/45 bg-[#d49a71]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#dba476]">
      {label}
    </span>
  )
}

function QuestionTypeSwitch({ value, onChange }) {
  const options = [
    { value: "saq", label: "Short Answer" },
    { value: "mcq", label: "Multiple Choice" },
  ]

  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-full border border-[#3b2a22]/55 bg-[#120f0d] p-1">
      {options.map((option) => {
        const active = value === option.value
        return (
          <button
            className={cn(
              "h-10 rounded-full text-sm font-semibold transition-colors",
              active
                ? "bg-[#ccb2a3d3] text-[#1a1817]"
                : "text-[#a28c83] hover:bg-white/[0.035] hover:text-[#dac1b7]"
            )}
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function AnswerMetadataFields({ answerType, answerValue, onAnswerTypeChange, onAnswerValueChange, name = "answer_type" }) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-[#6f6861]">Answer type:</span>
        {["proof", "explanation", "value"].map((type) => (
          <label key={type} className="flex items-center gap-1 text-xs text-[#9b8f84]">
            <input
              type="radio"
              name={name}
              value={type}
              checked={(answerType || "proof") === type}
              onChange={() => onAnswerTypeChange?.(type)}
              className="accent-[#c8864a]"
            />
            {type}
          </label>
        ))}
      </div>
      {answerType === "value" && (
        <Input
          value={answerValue || ""}
          onChange={(event) => onAnswerValueChange?.(event.target.value)}
          placeholder="Final numerical answer (e.g. x = 3, 42.7)"
          className="rounded border border-white/[0.08] bg-transparent px-3 py-2 text-sm text-[#e8e4dc] placeholder:text-[#6f5b52]"
        />
      )}
    </div>
  )
}

function SampleSolutionEditor({
  value,
  onChange,
  answerType = "proof",
  answerValue = "",
  onAnswerTypeChange,
  onAnswerValueChange,
  answerTypeName = "answer_type",
  showAnswerMetadata = true,
  compact = false,
}) {
  const [previewOpen, setPreviewOpen] = useState(false)

  return (
    <div className="grid gap-3">
      <div className="flex justify-end">
        <button
          type="button"
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
            previewOpen
              ? "border-[#c8864a]/45 bg-[#c8864a]/14 text-[#e6b083]"
              : "border-[#3b2a22]/55 bg-white/[0.035] text-[#a28c83] hover:text-[#dac1b7]"
          )}
          onClick={() => setPreviewOpen((open) => !open)}
        >
          {previewOpen ? "Hide preview" : "Preview"}
        </button>
      </div>
      <RichTextArea
        className={cn("p-4 text-[#e5e2e1]", compact ? "min-h-[100px]" : "min-h-[145px]")}
        value={value}
        onValueChange={onChange}
        toolbarHint="LaTeX"
        placeholder="Write the sample solution (LaTeX environments do not need $$ wrappers)..."
      />
      {showAnswerMetadata && (
        <AnswerMetadataFields
          answerType={answerType || "proof"}
          answerValue={answerValue || ""}
          onAnswerTypeChange={onAnswerTypeChange}
          onAnswerValueChange={onAnswerValueChange}
          name={answerTypeName}
        />
      )}
      {previewOpen && (
        <div className="rounded-2xl border border-[#3b2a22]/55 bg-[#11100e] p-4 shadow-inner shadow-black/20">
          <MarkdownPreview value={value} placeholder="Your sample solution preview will appear here." />
        </div>
      )}
    </div>
  )
}

function TikzVisualsEditor({ visuals, onChange }) {
  const normalized = Array.isArray(visuals) ? visuals : []

  function updateVisual(index, updates) {
    const next = [...normalized]
    next[index] = { ...next[index], ...updates }
    onChange(next)
  }

  return (
    <div className="grid gap-3">
      <Button
        className="w-fit rounded-full border-[#3b2a22]/55 bg-white/[0.035] text-[#dac1b7] hover:bg-[#211913]"
        type="button"
        variant="outline"
        onClick={() => onChange([...normalized, emptyTikzVisual(normalized.length)])}
      >
        <Plus className="size-4" />
        Add TikZ Visual
      </Button>

      {normalized.length === 0 && (
        <p className="rounded-2xl border border-[#3b2a22]/55 bg-[#181410] px-4 py-3 text-sm text-[#a28c83]">
          No TikZ visuals added.
        </p>
      )}

      {normalized.map((visual, index) => (
        <details
          className="group overflow-hidden rounded-2xl border border-[#3b2a22]/55 bg-[#181410]"
          key={visual.id || index}
          open={index === normalized.length - 1}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 truncate text-sm font-semibold text-[#e5e2e1]">
              {visual.name || `Visual ${index + 1}`}
            </span>
            <span className="flex items-center gap-2 text-xs text-[#a28c83]">
              {visual.code?.trim() ? "code added" : "empty"}
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
            </span>
          </summary>
          <div className="grid gap-3 border-t border-[#3b2a22]/55 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="h-9 min-w-[180px] flex-1 rounded-full border-[#3b2a22]/55 bg-white/[0.035] text-sm text-[#e5e2e1]"
                placeholder={`Visual ${index + 1}`}
                value={visual.name || ""}
                onChange={(event) => updateVisual(index, { name: event.target.value })}
              />
              <Button
                className="rounded-full border-[#3b2a22]/55 bg-white/[0.035] text-xs text-[#dac1b7] hover:bg-[#211913]"
                size="sm"
                type="button"
                variant="outline"
                onClick={() => updateVisual(index, { code: "", svg: "" })}
              >
                Clear editor
              </Button>
              <Button
                className="rounded-full"
                size="sm"
                type="button"
                variant="destructive"
                onClick={() => onChange(normalized.filter((_, itemIndex) => itemIndex !== index))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <Textarea
              className="min-h-[180px] rounded-3xl border-[#3b2a22]/55 bg-white/[0.035] p-5 font-mono text-[13px] leading-relaxed text-[#e5e2e1] focus-visible:ring-[#ffb595]/40"
              placeholder="Paste TikZ code here, e.g. \\begin{tikzpicture} ..."
              spellCheck={false}
              value={visual.code || ""}
              onChange={(event) => updateVisual(index, { code: event.target.value, svg: "" })}
            />
          </div>
        </details>
      ))}
    </div>
  )
}

function getDescendantIds(tags, tagId) {
  const children = tags.filter((tag) => tag.parent_id === tagId)
  return children.flatMap((child) => [child.id, ...getDescendantIds(tags, child.id)])
}

function isMicroskill(tag) {
  return tag?.tag_kind === "microskill" || tag?.layer === 4
}

function isTaxonomyTag(tag) {
  return tag && !isMicroskill(tag)
}

function isGranularMarkingTag(tag) {
  return tag?.layer === 3 || isMicroskill(tag)
}

function selectedGranularTagCount(selectedIds = [], tags = []) {
  const selectedSet = new Set(selectedIds)
  return tags.filter((tag) => selectedSet.has(tag.id) && isGranularMarkingTag(tag)).length
}

function selectedLayer3TagCount(selectedIds = [], tags = []) {
  const selectedSet = new Set(selectedIds)
  return tags.filter((tag) => selectedSet.has(tag.id) && tag.layer === 3 && isTaxonomyTag(tag)).length
}

function scoreScaleForTag(tag) {
  if (isMicroskill(tag)) return [0, 1]
  if (tag?.layer === 3) return [0, 1, 2]
  return []
}

function syncTagRequirements(selectedIds, existing = [], tags = []) {
  const existingById = new Map((existing || []).map((item) => [Number(item.tag_id), item]))
  return selectedIds
    .map((id) => tags.find((tag) => tag.id === id))
    .filter(isGranularMarkingTag)
    .map((tag) => ({
      tag_id: tag.id,
      amount: existingById.get(tag.id)?.amount === "" ? "" : Math.max(Number(existingById.get(tag.id)?.amount || 1), 1),
      score_scale: scoreScaleForTag(tag),
    }))
}

function TagRequirementAmounts({ tags, selectedIds, requirements, onChange }) {
  const selectedTags = selectedIds
    .map((id) => tags.find((tag) => tag.id === id))
    .filter(isGranularMarkingTag)

  if (!selectedTags.length) return null

  const amountFor = (tagId) => requirements.find((item) => Number(item.tag_id) === tagId)?.amount ?? 1

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {selectedTags.map((tag) => (
        <label
          className="inline-flex max-w-full items-center gap-2 rounded-full border border-[#3b2a22]/60 bg-white/[0.03] px-2.5 py-1.5 text-sm text-[#dac1b7]"
          key={tag.id}
        >
          <span className="max-w-[190px] truncate">{tag.name}</span>
          <Input
            className="h-7 w-11 rounded-full border-[#3b2a22]/55 bg-[#131110] px-1 text-center text-xs text-[#e5e2e1] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            min="1"
            aria-label={`${tag.name} count`}
            type="number"
            value={amountFor(tag.id)}
            onChange={(event) => {
              const rawValue = event.target.value
              const amount = rawValue === "" ? "" : Math.max(Number(rawValue) || 1, 1)
              onChange(
                syncTagRequirements(selectedIds, requirements, tags).map((item) =>
                  Number(item.tag_id) === tag.id ? { ...item, amount } : item
                )
              )
            }}
          />
        </label>
      ))}
    </div>
  )
}

function TagTaxonomyPicker({
  tags,
  selectedIds,
  onChange,
  parentSelectedIds = [],
  deepOnly = false,
  showDeep = true,
  includeMicroskills = true,
}) {
  const [openRoot, setOpenRoot] = useState(null)
  const closeTimerRef = useRef(null)
  const layer1 = tags.filter((tag) => tag.layer === 1 && isTaxonomyTag(tag))
  const selectedSet = new Set(selectedIds)
  const parentSet = new Set(parentSelectedIds)
  const hasMainPath = parentSelectedIds.some((id) => {
    const tag = tags.find((item) => item.id === id)
    return tag?.layer === 2
  })

  function toggle(tag) {
    const descendants = getDescendantIds(tags, tag.id)
    if (selectedSet.has(tag.id)) {
      onChange(selectedIds.filter((id) => id !== tag.id && !descendants.includes(id)))
    } else {
      onChange([...selectedIds, tag.id])
    }
  }

  function children(parentId, layer) {
    return tags.filter((tag) => tag.parent_id === parentId && tag.layer === layer && isTaxonomyTag(tag))
  }

  function microskills() {
    return tags.filter(isMicroskill)
  }

  function openFlyout(tagId) {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    setOpenRoot(tagId)
  }

  function scheduleCloseFlyout() {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    closeTimerRef.current = setTimeout(() => setOpenRoot(null), 320)
  }

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [])

  if (deepOnly) {
    const layer2Parents = tags.filter((tag) => tag.layer === 2 && parentSet.has(tag.id))
    const conceptTags = hasMainPath ? layer2Parents.flatMap((parent) => children(parent.id, 3)) : []
    const microskillTags = includeMicroskills ? microskills() : []
    const groups = [
      { label: "Layer 3 concepts", tags: conceptTags },
      includeMicroskills ? { label: "Microskills", tags: microskillTags } : null,
    ].filter(Boolean)

    return (
      <div className="grid gap-3">
        {!hasMainPath && (
          <span className="text-sm text-[#a28c83]">Assign a Layer 1 topic and Layer 2 subtopic to unlock concept tags.</span>
        )}
        {hasMainPath && conceptTags.length === 0 && microskillTags.length === 0 && (
          <span className="text-sm text-[#a28c83]">No concepts or microskills exist yet.</span>
        )}
        {groups.map((group) => group.tags.length > 0 && (
          <div className="grid gap-2" key={group.label}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8c8178]">{group.label}</p>
            <div className="flex flex-wrap gap-2">
              {group.tags.map((tag) => (
                <button
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors",
                    selectedSet.has(tag.id)
                      ? "border-[#ffb595]/60 bg-[#4a2f26] text-[#ffb595]"
                      : "border-[#3b2a22]/55 bg-white/[0.035] text-[#dac1b7] hover:bg-[#211913]"
                  )}
                  key={tag.id}
                  type="button"
                  onClick={() => toggle(tag)}
                >
                  {isMicroskill(tag) ? "MS" : "L3"} · {tag.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {layer1.length === 0 && (
          <span className="text-sm text-[#a28c83]">Create Layer 1 tags in the Tags admin section.</span>
        )}
        {layer1.map((tag) => {
          const selected = selectedSet.has(tag.id)
          const subtopics = children(tag.id, 2)
          return (
            <span
              className="relative"
              key={tag.id}
              onMouseEnter={() => openFlyout(tag.id)}
              onMouseLeave={scheduleCloseFlyout}
            >
              <button
                className={cn(
                  "rounded-full border px-2.5 py-1 font-serif text-[14px] transition-colors",
                  selected
                    ? "border-[#ffb595]/60 bg-[#4a2f26] text-[#ffb595]"
                    : "border-[#3b2a22]/55 bg-white/[0.035] text-[#dac1b7] hover:bg-[#211913]"
                )}
                type="button"
                onClick={() => toggle(tag)}
              >
                {tag.name}
              </button>
              {openRoot === tag.id && subtopics.length > 0 && (
                <span
                  className="absolute left-0 top-9 z-30 grid min-w-[240px] gap-2 rounded-2xl border border-[#3b2a22]/70 bg-[#131110] p-3 shadow-2xl shadow-black/40"
                  onMouseEnter={() => openFlyout(tag.id)}
                  onMouseLeave={scheduleCloseFlyout}
                >
                  <span className="px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8c8178]">
                    Layer 2 under {tag.name}
                  </span>
                  {subtopics.map((child) => (
                    <button
                      className={cn(
                        "rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                        selectedSet.has(child.id)
                          ? "border-[#ffb595]/60 bg-[#4a2f26] text-[#ffb595]"
                          : "border-[#3b2a22]/55 bg-white/[0.035] text-[#dac1b7] hover:bg-[#211913]"
                      )}
                      key={child.id}
                      type="button"
                      onClick={() => {
                        const withParent = selectedSet.has(tag.id) ? selectedIds : [...selectedIds, tag.id]
                        onChange(
                          selectedSet.has(child.id)
                            ? withParent.filter((id) => id !== child.id && !getDescendantIds(tags, child.id).includes(id))
                            : [...withParent, child.id]
                        )
                      }}
                    >
                      {child.name}
                    </button>
                  ))}
                </span>
              )}
            </span>
          )
        })}
      </div>

      {showDeep && (selectedIds.some((id) => tags.find((tag) => tag.id === id)?.layer === 2) || (includeMicroskills && microskills().length > 0)) && (
        <div className="rounded-2xl border border-[#3b2a22]/55 bg-[#181410] p-3">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8c8178]">
            Granular tags for this question
          </p>
          <TagTaxonomyPicker
            tags={tags}
            selectedIds={selectedIds}
            onChange={onChange}
            parentSelectedIds={selectedIds}
            deepOnly
            includeMicroskills={includeMicroskills}
          />
        </div>
      )}
      {!showDeep && selectedIds.some((id) => tags.find((tag) => tag.id === id)?.layer === 2) && (
        <p className="rounded-2xl border border-[#3b2a22]/55 bg-[#181410] px-4 py-3 text-sm text-[#a28c83]">
          Granular Layer 3 and 4 tags are assigned inside each part.
        </p>
      )}
    </div>
  )
}

function criteriaRowCount(marksField, existingCriteria) {
  const existingLen = (existingCriteria || []).length
  if (marksField === "" || marksField == null) {
    return Math.max(1, existingLen)
  }
  const n = Number(marksField)
  if (!Number.isFinite(n) || n < 1) {
    return Math.max(1, existingLen)
  }
  return n
}

function normalizeCriteriaRows(marks, existing = []) {
  const n = Math.max(1, Number(marks) || 1)
  const rows = Array.isArray(existing) ? [...existing] : []
  const out = []
  for (let i = 0; i < n; i += 1) {
    const prev = rows[i]
    const text = typeof prev === "string" ? prev : prev?.text || ""
    out.push({ mark: i + 1, text })
  }
  return out
}

function MarkingCriteriaFields({ rows, onChange, compact }) {
  return (
    <div className="grid gap-3">
      <p className="text-xs leading-relaxed text-[#a28c83]">
        Non-mathematics subjects require one criterion per mark (what earns each mark).
      </p>
      {rows.map((row, index) => (
        <Field key={`mc-row-${index}`}>
          <FieldLabel className="text-[#dac1b7]">Mark {row.mark}</FieldLabel>
          <RichTextArea
            className={cn(
              "min-h-[72px] p-3 text-sm text-[#e5e2e1]",
              compact && "min-h-[60px]"
            )}
            placeholder={`What earns mark ${row.mark}?`}
            value={row.text || ""}
            onValueChange={(v) => {
              const next = [...rows]
              next[index] = { ...row, text: v }
              onChange(next)
            }}
            toolbarHint="Marking criterion"
          />
        </Field>
      ))}
    </div>
  )
}

function normalizeOptionLetters(options = []) {
  return options.map((option, index) => ({
    ...option,
    letter: String.fromCharCode(65 + index),
  }))
}

function McqOptionsEditor({
  options,
  correctOption,
  onOptionsChange,
  onCorrectOptionChange,
  shuffleOptions,
  onShuffleOptionsChange,
}) {
  const normalized = normalizeOptionLetters(options)

  function updateOption(index, text) {
    const next = [...normalized]
    next[index] = { ...next[index], text }
    onOptionsChange(next)
  }

  function deleteOption(index) {
    const removed = normalized[index]
    const next = normalizeOptionLetters(normalized.filter((_, itemIndex) => itemIndex !== index))
    onOptionsChange(next)
    if (removed?.letter === correctOption) {
      onCorrectOptionChange("")
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3">
        {normalized.map((option, index) => {
          const selected = option.letter === correctOption
          return (
            <div className="grid grid-cols-[38px_minmax(0,1fr)_34px] items-center gap-2" key={option.id || option.letter}>
              <button
                className={cn(
                  "inline-flex size-9 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                  selected
                    ? "border-emerald-300/60 bg-emerald-500/15 text-emerald-200"
                    : "border-[#3b2a22]/60 bg-white/[0.035] text-[#a28c83] hover:border-[#ffb595]/50 hover:text-[#ffb595]"
                )}
                type="button"
                onClick={() => onCorrectOptionChange(option.letter)}
                aria-label={`Mark option ${option.letter} as correct`}
                title={`Mark option ${option.letter} as correct`}
              >
                {selected ? <Check className="size-4" /> : option.letter}
              </button>
              <RichTextArea
                className="min-h-[58px] p-3 text-sm text-[#e5e2e1]"
                toolbarHint={`Option ${option.letter}`}
                value={option.text || ""}
                onValueChange={(value) => updateOption(index, value)}
                placeholder={`Option ${option.letter}`}
              />
              <Button
                className="size-9 rounded-full p-0"
                disabled={normalized.length <= 2}
                type="button"
                variant="ghost"
                onClick={() => deleteOption(index)}
                aria-label={`Delete option ${option.letter}`}
                title={`Delete option ${option.letter}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#3b2a22]/55 pt-4">
        <Button
          className="w-fit rounded-full border-[#3b2a22]/55 bg-white/[0.035] text-[#dac1b7] hover:bg-[#211913]"
          type="button"
          variant="outline"
          onClick={() => onOptionsChange(normalizeOptionLetters([...normalized, emptyMcqOption(normalized.length)]))}
        >
          <Plus className="size-4" />
          Add option
        </Button>
        <label className="inline-flex items-center gap-2 text-sm text-[#a28c83]">
          <input
            checked={shuffleOptions}
            className="size-4 accent-[#c8864a]"
            type="checkbox"
            onChange={(event) => onShuffleOptionsChange(event.target.checked)}
          />
          Shuffle options when displaying to students
        </label>
      </div>

      <p className="text-xs text-[#8f8378]">
        Correct answer: {correctOption || "Select a letter"}
      </p>
    </div>
  )
}

export function QuestionEditor({
  initialData = null,
  subjects = [],
  lockedSubject = null,
  taggingMode = "full",
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
  const [questionType, setQuestionType] = useState("saq")
  const [questionText, setQuestionText] = useState("")
  const [sampleSolution, setSampleSolution] = useState("")
  const [answerType, setAnswerType] = useState("proof")
  const [answerValue, setAnswerValue] = useState("")
  const [tikzCode, setTikzCode] = useState("")
  const [diagramSvg, setDiagramSvg] = useState("")
  const [tikzVisuals, setTikzVisuals] = useState([])
  const [importSource, setImportSource] = useState("")
  const [parts, setParts] = useState([])
  const [attachments, setAttachments] = useState([])
  const [tagRequirements, setTagRequirements] = useState([])
  const [tagIds, setTagIds] = useState([])
  const [useTagMarking, setUseTagMarking] = useState(true)
  const [rootMarkingCriteria, setRootMarkingCriteria] = useState([])
  const [mcqOptions, setMcqOptions] = useState(defaultMcqOptions)
  const [correctOption, setCorrectOption] = useState("")
  const [shuffleOptions, setShuffleOptions] = useState(false)
  const [explanation, setExplanation] = useState("")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [validationMessage, setValidationMessage] = useState("")

  const showTagging = taggingMode !== "hidden"
  const isMcq = questionType === "mcq"
  const questionTypeLocked = Boolean(initialData?.id)

  const resolvedSubject = useMemo(() => {
    if (lockedSubject) return lockedSubject
    return subjects.find((s) => String(s.id) === String(subjectId))
  }, [lockedSubject, subjects, subjectId])

  const isMathSubject = useMemo(
    () => subjectIsMathematics(resolvedSubject),
    [resolvedSubject]
  )

  const tagsUrl = subjectId
    ? `/api/questions/tags/?subject_id=${subjectId}`
    : "/api/questions/tags/"
  const { data: tags = [] } = useSWR(tagsUrl, fetcher)
  const selectedTags = tags.filter((tag) => tagIds.includes(tag.id))
  const sourcePlaceholder = `e.g. HSC ${subject || lockedSubject?.name || "Chemistry"} 2025`

  const effectiveMarks = !isMcq && parts.length
    ? Number(marks) || parts.reduce((total, part) => total + (Number(part.marks) || 0), 0)
    : criteriaRowCount(marks, rootMarkingCriteria)
  const partMarksTotal = parts.reduce((total, part) => total + (Number(part.marks) || 0), 0)

  useEffect(() => {
    if (!initialData) return

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSubject(initialData.subject || "")
    setSubjectId(initialData.subject_id ? String(initialData.subject_id) : "")
    setMarks(String(initialData.marks || "1"))
    setQuestionType(initialData.question_type === "mcq" ? "mcq" : "saq")
    setQuestionText(initialData.question_text || "")
    setSampleSolution(initialData.sample_solution || "")
    setAnswerType(initialData.answer_type || "proof")
    setAnswerValue(initialData.answer_value || "")
    const incomingTikzVisuals = initialData.stem_tikz_visuals?.length
      ? initialData.stem_tikz_visuals
      : initialData.tikz_visuals?.length
        ? initialData.tikz_visuals
        : initialData.tikz_code
          ? [{
              id: "legacy-tikz",
              name: "Visual 1",
              code: initialData.tikz_code || "",
              svg: initialData.diagram_svg || "",
            }]
          : []
    setTikzCode("")
    setDiagramSvg("")
    setTikzVisuals(incomingTikzVisuals)
    setImportSource(initialData.import_source || "")
    setParts(
      (initialData.question_type === "mcq" ? [] : initialData.parts || []).map((part, index) => ({
        id: part.id || crypto.randomUUID(),
        label: part.label || String.fromCharCode(97 + index),
        text: part.text || "",
        marks: Number(part.marks || 1),
        sample_solution: part.sample_solution || "",
        answer_type: part.answer_type || "proof",
        answer_value: part.answer_value || "",
        tag_ids: part.tag_ids || [],
        tag_requirements: part.tag_requirements || [],
        attachments: part.attachments || [],
        tikz_visuals: part.tikz_visuals || [],
        marking_criteria: normalizeCriteriaRows(
          part.marks || 1,
          part.marking_criteria || []
        ),
        hints: [],
      }))
    )
    setAttachments(initialData.attachments || [])
    setTagRequirements(initialData.tag_requirements || [])
    setTagIds(initialData.tag_ids || [])
    setUseTagMarking(initialData.use_tag_marking !== false)
    setRootMarkingCriteria(
      normalizeCriteriaRows(initialData.marks || 1, initialData.marking_criteria || [])
    )
    setMcqOptions(
      initialData.mcq_options?.length
        ? normalizeOptionLetters(initialData.mcq_options)
        : defaultMcqOptions()
    )
    setCorrectOption(initialData.correct_option || "")
    setShuffleOptions(Boolean(initialData.shuffle_options))
    setExplanation(initialData.explanation || "")
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
      question_type: questionType,
      question_text: questionText,
      latex: "",
      graph: "",
      tikz_code: tikzCode,
      diagram_svg: diagramSvg,
      tikz_visuals: tikzVisuals,
      stem_tikz_visuals: tikzVisuals,
      hints: [],
      parts: isMcq ? [] : parts.map((part) => ({
        label: part.label,
        text: part.text,
        marks: criteriaRowCount(part.marks, part.marking_criteria),
        sample_solution: part.sample_solution || "",
        answer_type: part.answer_type || "proof",
        answer_value: part.answer_type === "value" ? part.answer_value || "" : "",
        tag_ids: part.tag_ids || [],
        tag_requirements: syncTagRequirements(part.tag_ids || [], part.tag_requirements || [], tags),
        attachments: part.attachments || [],
        tikz_visuals: part.tikz_visuals || [],
        marking_criteria: normalizeCriteriaRows(
          criteriaRowCount(part.marks, part.marking_criteria),
          part.marking_criteria || []
        ),
        hints: [],
      })),
      attachments,
      marking_criteria: isMcq || parts.length
        ? []
        : normalizeCriteriaRows(criteriaRowCount(marks, rootMarkingCriteria), rootMarkingCriteria),
      sample_solution: isMcq || parts.length ? "" : sampleSolution,
      answer_type: isMcq || parts.length ? "proof" : answerType,
      answer_value: !isMcq && !parts.length && answerType === "value" ? answerValue : "",
      marking_enabled: !isMcq,
      use_tag_marking: isMathSubject ? true : useTagMarking,
      mcq_options: isMcq ? normalizeOptionLetters(mcqOptions) : [],
      correct_option: isMcq ? correctOption : "",
      shuffle_options: isMcq ? shuffleOptions : false,
      explanation: isMcq ? explanation : "",
      tag_ids: tagIds,
      tag_requirements: isMcq || parts.length ? [] : syncTagRequirements(tagIds, tagRequirements, tags),
      import_source: importSource,
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    const message = validateQuestionDraft()
    setValidationMessage(message)
    if (message) return
    onSubmit(payload())
  }

  function validateQuestionDraft() {
    if (!subjectId && !subject.trim()) return "Subject is required."
    if (!Number(marks) || Number(marks) < 1) return "Marks are required."
    if (!importSource.trim()) return "Source is required."
    if (!questionText.trim()) return "Question text is required."
    if (showTagging && !tagIds.length) return "At least one topic tag is required."
    if (isMcq && showTagging && selectedLayer3TagCount(tagIds, tags) === 0) {
      return "Multiple choice questions require a Layer 3 concept tag."
    }

    if (isMcq) {
      const filledOptions = normalizeOptionLetters(mcqOptions).filter((option) => String(option.text || "").trim())
      if (filledOptions.length < 2) return "Add at least two multiple choice options."
      if (!correctOption || !filledOptions.some((option) => option.letter === correctOption)) {
        return "Select the correct multiple choice answer."
      }
      return ""
    }

    if (!isMathSubject) {
      if (parts.length) {
        for (const part of parts) {
          const need = criteriaRowCount(part.marks, part.marking_criteria)
          const crits = normalizeCriteriaRows(need, part.marking_criteria || [])
          if (crits.some((c) => !String(c.text || "").trim())) {
            return `Marking criteria required for every mark in part (${part.label || "?"}).`
          }
        }
      } else {
        const crits = normalizeCriteriaRows(criteriaRowCount(marks, rootMarkingCriteria), rootMarkingCriteria)
        if (crits.some((c) => !String(c.text || "").trim())) {
          return "Marking criteria required for every mark."
        }
      }
    }

    if (parts.length) {
      const missingPart = parts.find((part) => !String(part.text || "").trim())
      if (missingPart) return `Question text is required for part (${missingPart.label || "?"}).`
      const missingSolution = parts.find((part) => !String(part.sample_solution || "").trim())
      if (missingSolution) return `Sample solution is required for part (${missingSolution.label || "?"}).`
      return ""
    }

    if (!sampleSolution.trim()) return "Sample solution is required."
    return ""
  }

  useEffect(() => {
    if (!onDraftChange) return
    onDraftChange(payload())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, subjectId, marks, questionType, questionText, sampleSolution, answerType, answerValue, tikzCode, diagramSvg, tikzVisuals, importSource, parts, attachments, tagIds, tagRequirements, tags, rootMarkingCriteria, useTagMarking, mcqOptions, correctOption, shuffleOptions, explanation])

  return (
    <div className={cn("grid gap-8", !hidePreview && "lg:grid-cols-2")}>
      <div className="flex min-w-0 flex-col gap-6">
        <Card
          className={cn(
            "w-full rounded-3xl border-[#3b2a22]/55 bg-[#1b1713] text-[#e5e2e1] shadow-2xl shadow-black/20 transition-colors",
            errors?.question_text && "border-destructive shadow-destructive/20"
          )}
        >
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="min-w-0 flex-1 font-serif text-2xl font-semibold">
                {submitLabel === "Save Changes" ? "Edit Question" : "Create Question"}
              </CardTitle>

              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {submitLabel === "Save Changes" && initialData?.moderation_status ? (
                  <ModerationStatusBadge status={initialData.moderation_status} />
                ) : null}
                {questionTypeLocked ? <QuestionTypeBadge questionType={questionType} /> : null}

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
            </div>
          </CardHeader>

          <CardContent className="relative flex flex-col gap-6">
            <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
              <FieldGroup className="flex flex-col gap-6">
                {!questionTypeLocked && (
                  <QuestionTypeSwitch
                    value={questionType}
                    onChange={(value) => {
                      setQuestionType(value)
                      setValidationMessage("")
                    }}
                  />
                )}

                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_112px]">
                  <Field>
                    <FieldLabel className="text-[#dac1b7]">Subject</FieldLabel>
                    {lockedSubject ? (
                      <Input
                        className="rounded-full border-[#3b2a22]/55 bg-white/[0.035] text-[#a28c83]"
                        disabled
                        value={lockedSubject.name}
                      />
                    ) : subjects.length > 0 ? (
                      <select
                        className="h-10 w-full rounded-full border border-[#3b2a22]/55 bg-white/[0.035] py-2 pl-4 pr-10 text-[#e5e2e1] outline-none focus:border-[#ffb595]/40"
                        value={subjectId}
                        onChange={(e) => {
                          const value = e.target.value
                          setSubjectId(value)
                          const found = subjects.find((s) => String(s.id) === value)
                          setSubject(found?.name || "")
                          if (validationMessage) setValidationMessage("")
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
                        className="rounded-full border-[#3b2a22]/55 bg-white/[0.035] text-[#a28c83]"
                        value={subject}
                        onChange={(e) => {
                          setSubject(e.target.value)
                          if (validationMessage) setValidationMessage("")
                        }}
                      />
                    )}
                  </Field>

                  <Field>
                    <FieldLabel className="text-[#dac1b7]">
                      {!isMcq && parts.length ? "Total Marks" : "Marks"}
                    </FieldLabel>
                    <Input
                      className="h-10 rounded-full border-[#3b2a22]/55 bg-white/[0.035] px-2 text-center text-sm text-[#e5e2e1] [appearance:textfield] focus-visible:ring-[#ffb595]/40 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      min="1"
                      type="number"
                      value={marks}
                      onChange={(e) => {
                        const v = e.target.value
                        setMarks(v)
                        if (!isMcq && !parts.length) {
                          setRootMarkingCriteria((prev) =>
                            normalizeCriteriaRows(criteriaRowCount(v, prev), prev)
                          )
                        }
                        if (validationMessage) setValidationMessage("")
                      }}
                    />
                    {!isMcq && parts.length > 0 && partMarksTotal !== Number(marks) && (
                      <p className="mt-2 text-xs text-amber-200">
                        Parts currently add to {partMarksTotal} marks.
                      </p>
                    )}
                  </Field>
                </div>

                <Field>
                  <FieldLabel className="text-[#dac1b7]">Source</FieldLabel>
                  <Input
                    className="rounded-full border-[#3b2a22]/55 bg-white/[0.035] text-[#e5e2e1] focus-visible:ring-[#ffb595]/40"
                    placeholder={sourcePlaceholder}
                    value={importSource}
                    onChange={(event) => {
                      setImportSource(event.target.value)
                      if (validationMessage) setValidationMessage("")
                    }}
                  />
                </Field>

                <Field>
                  <FieldLabel className="text-[#dac1b7]">
                    {!isMcq && parts.length ? "Question Stem / Background" : "Question"}
                  </FieldLabel>
                  <RichTextArea
                    className={cn(
                      "min-h-[180px] p-5 text-[#e5e2e1]",
                      errors?.question_text && "border-destructive focus-visible:ring-destructive"
                    )}
                    value={questionText}
                    onValueChange={(value) => {
                      setQuestionText(value)
                      if (validationMessage) setValidationMessage("")
                    }}
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

                <DropdownSection
                  title="TikZ Visuals"
                  summary={`${tikzVisuals.filter((item) => item.code).length} added`}
                >
                  <TikzVisualsEditor
                    visuals={tikzVisuals}
                    onChange={setTikzVisuals}
                  />
                </DropdownSection>

                {isMcq && (
                  <div className="grid gap-4">
                    <DropdownSection
                      title="Multiple Choice Options"
                      summary={`${normalizeOptionLetters(mcqOptions).filter((item) => String(item.text || "").trim()).length} added`}
                      defaultOpen
                    >
                      <McqOptionsEditor
                        options={mcqOptions}
                        correctOption={correctOption}
                        onOptionsChange={(value) => {
                          setMcqOptions(value)
                          if (validationMessage) setValidationMessage("")
                        }}
                        onCorrectOptionChange={(value) => {
                          setCorrectOption(value)
                          if (validationMessage) setValidationMessage("")
                        }}
                        shuffleOptions={shuffleOptions}
                        onShuffleOptionsChange={setShuffleOptions}
                      />
                    </DropdownSection>
                    <DropdownSection
                      title="Explanation"
                      summary={explanation.trim() ? "ready" : "optional"}
                    >
                      <SampleSolutionEditor
                        value={explanation}
                        onChange={setExplanation}
                        showAnswerMetadata={false}
                      />
                    </DropdownSection>
                  </div>
                )}

                {!isMcq && (
                <div className="grid gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <SectionTitle>Parts</SectionTitle>
                    <Button
                      className="rounded-full border border-[#3b2a22]/55 bg-white/[0.035] text-[#dac1b7] hover:bg-[#211913]"
                      type="button"
                      onClick={() => setParts([...parts, emptyPart(parts.length)])}
                    >
                      <Plus className="size-4" />
                      Add Part
                    </Button>
                  </div>

                  {parts.map((part, index) => (
                    <details
                      className="group overflow-hidden rounded-2xl border border-[#3b2a22]/55 bg-[#181410]"
                      key={part.id}
                      open
                    >
                      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
                        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                          <Input
                            className="h-8 w-11 shrink-0 rounded-full border-[#3b2a22]/55 bg-white/[0.035] text-center text-sm text-[#e5e2e1]"
                            value={part.label}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => {
                              const next = [...parts]
                              next[index] = { ...part, label: event.target.value }
                              setParts(next)
                            }}
                          />
                          <span className="min-w-0 truncate text-sm font-semibold text-[#e5e2e1]">
                            {part.text || `Part ${index + 1}`}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5 pr-1 sm:gap-2">
                          <Input
                            className="h-8 w-11 rounded-full border-[#3b2a22]/55 bg-white/[0.035] px-1 text-center text-sm text-[#e5e2e1] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            min="1"
                            type="number"
                            value={part.marks}
                            onClick={(event) => event.stopPropagation()}
                            onBlur={() => {
                              if (part.marks === "" || Number(part.marks) < 1) {
                                setParts((prev) => {
                                  const next = [...prev]
                                  const current = next[index]
                                  if (!current) return prev
                                  next[index] = {
                                    ...current,
                                    marks: 1,
                                    marking_criteria: normalizeCriteriaRows(1, current.marking_criteria || []),
                                  }
                                  return next
                                })
                              }
                            }}
                            onChange={(event) => {
                              const rawValue = event.target.value
                              setParts((prev) => {
                                const next = [...prev]
                                const current = next[index]
                                if (!current) return prev
                                const nextMarks = rawValue === "" ? "" : Math.max(1, Number(rawValue) || 1)
                                next[index] = {
                                  ...current,
                                  marks: nextMarks,
                                  marking_criteria:
                                    nextMarks === ""
                                      ? current.marking_criteria || []
                                      : normalizeCriteriaRows(nextMarks, current.marking_criteria || []),
                                }
                                return next
                              })
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
                          <ChevronDown className="size-4 shrink-0 text-[#a28c83] transition-transform group-open:rotate-180" />
                        </div>
                      </summary>

                      <div className="grid gap-4 border-t border-[#3b2a22]/55 p-4">
                        <Field>
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <FieldLabel className="text-[#dac1b7]">Question Text</FieldLabel>
                            {onBranchPart && (
                              <Button
                                className="rounded-full border-[#3b2a22]/55 bg-white/[0.035] text-xs text-[#dac1b7] hover:bg-[#211913]"
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
                              if (validationMessage) setValidationMessage("")
                            }}
                          />
                        </Field>

                        <DropdownSection
                          title="TikZ Visuals"
                          summary={`${part.tikz_visuals?.filter((item) => item.code)?.length || 0} added`}
                        >
                          <TikzVisualsEditor
                            visuals={part.tikz_visuals || []}
                            onChange={(value) => {
                              const next = [...parts]
                              next[index] = { ...part, tikz_visuals: value }
                              setParts(next)
                            }}
                          />
                        </DropdownSection>

                        <DropdownSection
                          title="Sample Solution"
                          summary={part.sample_solution?.trim() ? "ready" : "required"}
                          defaultOpen={!part.sample_solution?.trim()}
                        >
                          <SampleSolutionEditor
                            compact
                            value={part.sample_solution || ""}
                            onChange={(value) => {
                              const next = [...parts]
                              next[index] = { ...part, sample_solution: value }
                              setParts(next)
                              if (validationMessage) setValidationMessage("")
                            }}
                            answerType={part.answer_type || "proof"}
                            answerValue={part.answer_value || ""}
                            answerTypeName={`answer_type_${index}`}
                            onAnswerTypeChange={(value) => {
                              const next = [...parts]
                              next[index] = {
                                ...part,
                                answer_type: value,
                                answer_value: value === "value" ? part.answer_value || "" : "",
                              }
                              setParts(next)
                            }}
                            onAnswerValueChange={(value) => {
                              const next = [...parts]
                              next[index] = { ...part, answer_value: value }
                              setParts(next)
                            }}
                          />
                        </DropdownSection>

                        {!isMathSubject && (
                          <DropdownSection
                            title="Marking Criteria"
                            summary={`${(part.marking_criteria || []).filter((c) => String(c.text || "").trim()).length}/${criteriaRowCount(part.marks, part.marking_criteria)}`}
                            defaultOpen
                          >
                            <MarkingCriteriaFields
                              compact
                              rows={normalizeCriteriaRows(
                                criteriaRowCount(part.marks, part.marking_criteria),
                                part.marking_criteria || []
                              )}
                              onChange={(rows) => {
                                setParts((prev) => {
                                  const next = [...prev]
                                  const current = next[index]
                                  if (!current) return prev
                                  next[index] = { ...current, marking_criteria: rows }
                                  return next
                                })
                              }}
                            />
                          </DropdownSection>
                        )}

                        {showTagging && (
                        <DropdownSection
                          title="Concepts & Microskills"
                          summary={`${selectedGranularTagCount(part.tag_ids || [], tags)} selected`}
                        >
                          <TagTaxonomyPicker
                            tags={tags}
                            selectedIds={part.tag_ids || []}
                            parentSelectedIds={tagIds}
                            deepOnly
                            onChange={(value) => {
                              const next = [...parts]
                              next[index] = {
                                ...part,
                                tag_ids: value,
                                tag_requirements: syncTagRequirements(value, part.tag_requirements || [], tags),
                              }
                              setParts(next)
                            }}
                          />
                          <TagRequirementAmounts
                            tags={tags}
                            selectedIds={part.tag_ids || []}
                            requirements={part.tag_requirements || []}
                            onChange={(value) => {
                              const next = [...parts]
                              next[index] = { ...part, tag_requirements: value }
                              setParts(next)
                            }}
                          />
                        </DropdownSection>
                        )}

                      </div>
                    </details>
                  ))}
                </div>
                )}

                {!isMcq && parts.length === 0 && (
                  <div className="grid gap-4">
                    <DropdownSection
                      title="Sample Solution"
                      summary={sampleSolution.trim() ? "ready" : "required"}
                      defaultOpen={!sampleSolution.trim()}
                    >
                      <SampleSolutionEditor
                        value={sampleSolution}
                        onChange={(value) => {
                          setSampleSolution(value)
                          if (validationMessage) setValidationMessage("")
                        }}
                        answerType={answerType}
                        answerValue={answerValue}
                        answerTypeName="answer_type_question"
                        onAnswerTypeChange={(value) => {
                          setAnswerType(value)
                          if (value !== "value") setAnswerValue("")
                        }}
                        onAnswerValueChange={setAnswerValue}
                      />
                    </DropdownSection>
                    {!isMathSubject && (
                      <DropdownSection
                        title="Marking Criteria"
                        summary={`${rootMarkingCriteria.filter((c) => String(c.text || "").trim()).length}/${criteriaRowCount(marks, rootMarkingCriteria)}`}
                        defaultOpen
                      >
                        <MarkingCriteriaFields
                          rows={normalizeCriteriaRows(criteriaRowCount(marks, rootMarkingCriteria), rootMarkingCriteria)}
                          onChange={setRootMarkingCriteria}
                        />
                      </DropdownSection>
                    )}
                  </div>
                )}

                {showTagging && (
                <Field>
                  <FieldLabel className="text-[#dac1b7]">Tags</FieldLabel>
                  <div className="flex flex-wrap gap-2 rounded-2xl border border-[#3b2a22]/55 bg-[#181410] p-3">
                    {tags.length === 0 && (
                      <span className="text-sm text-[#a28c83]">
                        Add question tags in the Tags admin section.
                      </span>
                    )}
                    {tags.length > 0 && (
                      <TagTaxonomyPicker
                        tags={tags}
                        selectedIds={tagIds}
                        onChange={(value) => {
                          setTagIds(value)
                          setTagRequirements(syncTagRequirements(value, tagRequirements, tags))
                          if (validationMessage) setValidationMessage("")
                        }}
                        showDeep={isMcq || parts.length === 0}
                        includeMicroskills={!isMcq}
                      />
                    )}
                    {!isMcq && parts.length === 0 && (
                      <TagRequirementAmounts
                        tags={tags}
                        selectedIds={tagIds}
                        requirements={tagRequirements}
                        onChange={setTagRequirements}
                      />
                    )}
                  </div>
                </Field>
                )}

                {showTagging && taggingMode === "full" && !isMathSubject && !isMcq && (
                  <label className="mt-4 flex items-center gap-3 rounded-2xl border border-[#3b2a22]/55 bg-[#181410] p-4 text-sm text-[#9b8f84]">
                    <input
                      id="use_tag_marking"
                      type="checkbox"
                      checked={useTagMarking ?? true}
                      onChange={(event) => setUseTagMarking(event.target.checked)}
                      className="size-4 accent-[#c8864a]"
                    />
                    <span>
                      Use tag-based marking
                      <span className="ml-2 text-xs text-[#6f6861]">
                        (uncheck for long-form criteria marking)
                      </span>
                    </span>
                  </label>
                )}

                {validationMessage && (
                  <p className="rounded-2xl border border-[#c8864a]/30 bg-[#c8864a]/10 px-4 py-3 text-sm text-[#e6b083]">
                    {validationMessage}
                  </p>
                )}

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
          hints={[]}
          markingCriteria={[]}
          marks={effectiveMarks}
          parts={isMcq ? [] : parts}
          questionText={questionText}
          importSource={importSource}
          subject={subject}
          tags={selectedTags}
          diagramSvg={diagramSvg}
          tikzCode={tikzCode}
          tikzVisuals={tikzVisuals}
          stemTikzVisuals={tikzVisuals}
          questionType={questionType}
          mcqOptions={normalizeOptionLetters(mcqOptions)}
          correctOption={correctOption}
        />
      )}
    </div>
  )
}
