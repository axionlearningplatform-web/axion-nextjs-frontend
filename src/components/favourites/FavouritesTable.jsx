"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import fetcher from "@/lib/fetcher"
import { cn } from "@/lib/utils"
import { Check, ChevronDown, Loader2, Pencil, Trash2 } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import rehypeKatex from "rehype-katex"
import remarkMath from "remark-math"
import useSWR from "swr"

import SaveQuestionModal from "@/components/favourites/SaveQuestionModal"

const FAVOURITES_API_URL = "/api/questions/favourites/"
const FAVOURITE_RESPONSES_API_URL = "/api/questions/favourites/responses/"
const TAGS_API_URL = "/api/questions/tags/"
const SEARCH_DEBOUNCE_MS = 260

const QUESTION_TYPE_FILTER_OPTIONS = [
  { value: "", label: "Any type" },
  { value: "saq", label: "SAQ" },
  { value: "mcq", label: "MCQ" },
]

const LEVEL_FILTER_OPTIONS = [
  { value: "", label: "Any level" },
  { value: "foundational", label: "Foundational" },
  { value: "intermediate", label: "Intermediate" },
  { value: "exam_practice", label: "Exam Practice" },
  { value: "challenge", label: "Challenge" },
]

function questionTypeLabel(value) {
  return String(value || "saq").toLowerCase() === "mcq" ? "MCQ" : "SAQ"
}

function titleCase(value = "") {
  return value
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatAttemptDate(value) {
  if (!value) return "Unknown date"
  return new Date(value).toLocaleString()
}

function responseIsMarked(response) {
  return response?.marks_awarded !== null && response?.marks_awarded !== undefined
}

function InlineMathPreview({ children }) {
  function inlineMath(expr) {
    return expr
      .replace(/\\begin\{align\*?\}/g, "")
      .replace(/\\end\{align\*?\}/g, "")
      .replace(/\\\\/g, " ")
      .replace(/&/g, "")
      .replace(/\s+/g, " ")
      .trim()
  }

  const preview = String(children || "")
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, expr) => `$${inlineMath(expr)}$`)
    .replace(/\\\[((?:.|\n)*?)\\\]/g, (_, expr) => `\\(${inlineMath(expr)}\\)`)
    .replace(/\s+/g, " ")
    .trim()

  return (
    <ReactMarkdown
      className="block min-w-0 overflow-hidden whitespace-nowrap text-inherit [&_.katex-display]:my-0 [&_.katex-display]:inline-block [&_.katex]:text-inherit [&_p]:inline"
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p: ({ children: nodeChildren }) => <span>{nodeChildren}</span>,
      }}
    >
      {preview}
    </ReactMarkdown>
  )
}

function FilterDropdown({ active = false, label, onChange, options, value }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function closeOnOutsideClick(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false)
    }
    function closeOnEscape(event) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", closeOnOutsideClick)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [open])

  return (
    <div ref={ref} className="relative min-w-[160px]">
      <button
        type="button"
        aria-expanded={open}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-full border border-[#3b2a22]/55 bg-[#181410] px-4 text-[13px] text-[#c8bdb6] transition-colors hover:border-[#7c573a]/70 hover:text-[#e8e0d8]",
          active && "border-[#7c573a]/70 text-[#dba476]"
        )}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-[calc(100%+8px)] z-30 min-w-full overflow-hidden rounded-[8px] border border-[#3b2a22]/55 bg-[#181410] py-1 shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
        >
          {options.map((option) => {
            const selected = String(value) === String(option.value)
            return (
              <button
                key={option.value || "any"}
                type="button"
                role="option"
                aria-selected={selected}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] text-[#c8bdb6] transition-colors hover:bg-[#251a14] hover:text-[#e8e0d8]"
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
              >
                <span className="flex size-3 items-center justify-center text-[#dba476]">
                  {selected && <Check className="size-3" />}
                </span>
                <span className="whitespace-nowrap">{option.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TagFilterDropdown({
  active,
  label,
  layer1Id,
  layer1Options,
  layer2Id,
  onClear,
  onSelectLayer1,
  onSelectLayer2,
}) {
  const [open, setOpen] = useState(false)
  const [focusedLayer1Id, setFocusedLayer1Id] = useState(layer1Id || "")
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function closeOnOutsideClick(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false)
    }
    function closeOnEscape(event) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", closeOnOutsideClick)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [open])

  const currentFocusedLayer1Id = focusedLayer1Id || layer1Id || layer1Options[0]?.id || ""
  const focusedLayer1 = layer1Options.find((tag) => String(tag.id) === String(currentFocusedLayer1Id))
  const focusedChildren = focusedLayer1?.children || []

  return (
    <div ref={ref} className="relative min-w-[160px]">
      <button
        type="button"
        aria-expanded={open}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-full border border-[#3b2a22]/55 bg-[#181410] px-4 text-[13px] text-[#c8bdb6] transition-colors hover:border-[#7c573a]/70 hover:text-[#e8e0d8]",
          active && "border-[#7c573a]/70 text-[#dba476]"
        )}
        onClick={() => {
          setFocusedLayer1Id(layer1Id || layer1Options[0]?.id || "")
          setOpen((value) => !value)
        }}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-[calc(100%+8px)] z-30 grid w-[min(560px,calc(100vw-48px))] grid-cols-[minmax(0,1fr)_minmax(0,1fr)] overflow-hidden rounded-[8px] border border-[#3b2a22]/55 bg-[#181410] shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
        >
          <div className="border-r border-[#3b2a22]/55 py-1">
            <button
              type="button"
              role="option"
              aria-selected={!layer1Id && !layer2Id}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] text-[#c8bdb6] transition-colors hover:bg-[#251a14] hover:text-[#e8e0d8]"
              onClick={() => {
                onClear()
                setOpen(false)
              }}
            >
              <span className="flex size-3 items-center justify-center text-[#dba476]">
                {!layer1Id && !layer2Id && <Check className="size-3" />}
              </span>
              Any tag
            </button>
            {layer1Options.map((tag) => {
              const selected = String(layer1Id) === String(tag.id) && !layer2Id
              const focused = String(currentFocusedLayer1Id) === String(tag.id)
              const hasChildren = (tag.children || []).length > 0
              return (
                <button
                  key={tag.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={cn(
                    "flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] text-[#c8bdb6] transition-colors hover:bg-[#251a14] hover:text-[#e8e0d8]",
                    focused && "bg-[#251a14] text-[#e8e0d8]"
                  )}
                  onMouseEnter={() => setFocusedLayer1Id(tag.id)}
                  onFocus={() => setFocusedLayer1Id(tag.id)}
                  onClick={() => {
                    setFocusedLayer1Id(tag.id)
                    if (!hasChildren) {
                      onSelectLayer1(tag.id)
                      setOpen(false)
                    } else {
                      onSelectLayer1(tag.id)
                    }
                  }}
                >
                  <span className="flex size-3 items-center justify-center text-[#dba476]">
                    {selected && <Check className="size-3" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                  {hasChildren && <span className="text-[#5f5953]">›</span>}
                </button>
              )
            })}
          </div>
          <div className="py-1">
            {focusedLayer1 ? (
              focusedChildren.length > 0 ? (
                focusedChildren.map((tag) => {
                  const selected = String(layer2Id) === String(tag.id)
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] text-[#c8bdb6] transition-colors hover:bg-[#251a14] hover:text-[#e8e0d8]"
                      onClick={() => {
                        onSelectLayer2(focusedLayer1.id, tag.id)
                        setOpen(false)
                      }}
                    >
                      <span className="flex size-3 items-center justify-center text-[#dba476]">
                        {selected && <Check className="size-3" />}
                      </span>
                      <span className="min-w-0 truncate">{tag.name}</span>
                    </button>
                  )
                })
              ) : (
                <p className="px-4 py-3 text-[13px] text-[#5f5953]">No subtopics</p>
              )
            ) : (
              <p className="px-4 py-3 text-[13px] text-[#5f5953]">Choose a tag</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function FavouritesTable({ subject }) {
  const router = useRouter()
  const params = useParams()
  const subjectSlug = params?.slug
  const subjectId = subject?.id
  const [searchInput, setSearchInput] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [layer1Id, setLayer1Id] = useState("")
  const [layer2Id, setLayer2Id] = useState("")
  const [questionTypeFilter, setQuestionTypeFilter] = useState("")
  const [levelFilter, setLevelFilter] = useState("")
  const [editingFavourite, setEditingFavourite] = useState(null)
  const [editingResponseId, setEditingResponseId] = useState(null)
  const [editNoteValue, setEditNoteValue] = useState("")
  const [savingNote, setSavingNote] = useState(false)
  const [deletingQuestionId, setDeletingQuestionId] = useState(null)
  const [deletingResponseId, setDeletingResponseId] = useState(null)
  const [expandedIds, setExpandedIds] = useState(new Set())

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [searchInput])

  const tagsUrl = subjectId ? `${TAGS_API_URL}?subject_id=${subjectId}&max_layer=3` : null
  const { data: filterTags = [] } = useSWR(tagsUrl, fetcher)
  const layer1Options = useMemo(
    () => filterTags.filter((tag) => tag.layer === 1 && tag.tag_kind !== "microskill"),
    [filterTags]
  )
  const layer2Options = useMemo(() => {
    if (!layer1Id) return []
    return filterTags.filter((tag) => tag.layer === 2 && String(tag.parent_id) === String(layer1Id))
  }, [filterTags, layer1Id])
  const layer1TagOptions = useMemo(
    () => layer1Options.map((tag) => ({
      ...tag,
      children: filterTags.filter(
        (child) => child.layer === 2 && String(child.parent_id) === String(tag.id)
      ),
    })),
    [filterTags, layer1Options]
  )
  const selectedLayer1 = layer1Options.find((tag) => String(tag.id) === String(layer1Id))
  const selectedLayer2 = layer2Options.find((tag) => String(tag.id) === String(layer2Id))
  const tagFilterLabel = selectedLayer1
    ? selectedLayer2
      ? `${selectedLayer1.name} › ${selectedLayer2.name}`
      : selectedLayer1.name
    : "Any tag"

  const favouritesUrl = useMemo(() => {
    const query = new URLSearchParams()
    if (subjectId) query.set("subject_id", String(subjectId))
    else if (subjectSlug) query.set("subject_slug", String(subjectSlug))
    if (debouncedSearch) query.set("search", debouncedSearch)
    if (layer1Id) query.set("layer1_tag_id", String(layer1Id))
    if (layer2Id) query.set("layer2_tag_id", String(layer2Id))
    if (questionTypeFilter) query.set("question_type", questionTypeFilter)
    if (levelFilter) query.set("level", levelFilter)
    return `${FAVOURITES_API_URL}?${query.toString()}`
  }, [debouncedSearch, layer1Id, layer2Id, levelFilter, questionTypeFilter, subjectId, subjectSlug])

  const {
    data: favourites = [],
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR(favouritesUrl, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  })

  async function saveNote(note) {
    if (!editingFavourite?.question?.id) return
    setSavingNote(true)
    try {
      const response = await fetch(FAVOURITES_API_URL, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          question_id: editingFavourite.question.id,
          note,
        }),
      })
      if (!response.ok) throw new Error("Could not update note.")
      await mutate()
      setEditingFavourite(null)
    } finally {
      setSavingNote(false)
    }
  }

  async function deleteFavourite(questionId) {
    setDeletingQuestionId(questionId)
    try {
      const response = await fetch(`${FAVOURITES_API_URL}${questionId}/`, {
        method: "DELETE",
        credentials: "include",
        headers: {
          Accept: "application/json",
        },
      })
      if (!response.ok) throw new Error("Could not remove favourite.")
      await mutate()
    } finally {
      setDeletingQuestionId(null)
    }
  }

  function toggleExpanded(favouriteId) {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(favouriteId)) next.delete(favouriteId)
      else next.add(favouriteId)
      return next
    })
  }

  function startEditingResponse(response) {
    setEditingResponseId(response.id)
    setEditNoteValue(response.note || "")
  }

  async function saveResponseNote(responseId) {
    const response = await fetch(`${FAVOURITE_RESPONSES_API_URL}${responseId}/`, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ note: editNoteValue }),
    })
    if (!response.ok) throw new Error("Could not update response note.")
    await mutate()
    setEditingResponseId(null)
    setEditNoteValue("")
  }

  async function deleteResponse(responseId) {
    if (deletingResponseId !== responseId) {
      setDeletingResponseId(responseId)
      window.setTimeout(() => {
        setDeletingResponseId((current) => (current === responseId ? null : current))
      }, 3000)
      return
    }
    const response = await fetch(`${FAVOURITE_RESPONSES_API_URL}${responseId}/`, {
      method: "DELETE",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    })
    if (!response.ok) throw new Error("Could not delete response.")
    setDeletingResponseId(null)
    await mutate()
  }

  if (error) return <div className="p-10 text-[#ffb4ab]">Failed to load favourites</div>
  if (isLoading && !favourites.length) return <div className="p-10 text-[#dac1b7]">Loading favourites...</div>

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#a28c83]">
            Search
          </label>
          <input
            className="h-10 w-full rounded-full border border-[#3b2a22]/55 bg-white/[0.035] px-4 text-sm text-[#e5e2e1] outline-none focus:border-[#ffb595]/40"
            placeholder="Search question text..."
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
        <div className="min-w-[160px]">
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#a28c83]">
            Question Type
          </label>
          <FilterDropdown
            active={Boolean(questionTypeFilter)}
            label={QUESTION_TYPE_FILTER_OPTIONS.find((opt) => opt.value === questionTypeFilter)?.label || "Any type"}
            onChange={setQuestionTypeFilter}
            options={QUESTION_TYPE_FILTER_OPTIONS}
            value={questionTypeFilter}
          />
        </div>
        <div className="min-w-[160px]">
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#a28c83]">
            Level
          </label>
          <FilterDropdown
            active={Boolean(levelFilter)}
            label={LEVEL_FILTER_OPTIONS.find((opt) => opt.value === levelFilter)?.label || "Any level"}
            onChange={setLevelFilter}
            options={LEVEL_FILTER_OPTIONS}
            value={levelFilter}
          />
        </div>
        {subject && (
          <div className="min-w-[160px]">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#a28c83]">
              Tags
            </label>
            <TagFilterDropdown
              active={Boolean(layer1Id || layer2Id)}
              label={tagFilterLabel}
              layer1Id={layer1Id}
              layer1Options={layer1TagOptions}
              layer2Id={layer2Id}
              onClear={() => {
                setLayer1Id("")
                setLayer2Id("")
              }}
              onSelectLayer1={(id) => {
                setLayer1Id(id)
                setLayer2Id("")
              }}
              onSelectLayer2={(parentId, id) => {
                setLayer1Id(parentId)
                setLayer2Id(id)
              }}
            />
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-[#3b2a22]/55 bg-[#1b1713]/90 p-4">
        {favourites.length === 0 && !isValidating ? (
          <div className="flex min-h-[320px] items-center justify-center px-6 text-center font-serif text-xl italic text-[#77716b]">
            No saved questions yet. Start practising and save questions as you go.
          </div>
        ) : (
          <div className="max-h-[min(70vh,720px)] overflow-auto">
            <Table className="w-full table-auto border-separate border-spacing-y-2">
              <TableHeader className="sticky top-0 z-10 bg-[#1b1713]/95 backdrop-blur-sm [&_tr]:border-0">
                <TableRow className="border-0 hover:bg-transparent">
                  <TableHead className="w-10 px-2" />
                  <TableHead className="w-20 px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">
                    Type
                  </TableHead>
                  <TableHead className="max-w-[520px] px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">
                    Question Preview
                  </TableHead>
                  <TableHead className="w-36 px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">
                    Level
                  </TableHead>
                  <TableHead className="w-64 px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">
                    Topics/Tags
                  </TableHead>
                  <TableHead className="w-28 px-4 text-right text-xs font-bold uppercase tracking-wide text-[#a28c83]">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {favourites.map((favourite) => {
                  const item = favourite.question || {}
                  const preview = item.question_preview ?? item.question_text ?? ""
                  const tags = item.tags || []
                  const responses = favourite.responses || []
                  const isExpanded = expandedIds.has(favourite.id)
                  return (
                    <Fragment key={favourite.id}>
                      <TableRow
                        className="cursor-pointer border-0 bg-[#181410] text-[#e5e2e1] shadow-sm transition-colors hover:bg-[#211913] [&>td:first-child]:rounded-l-xl [&>td:last-child]:rounded-r-xl"
                        onClick={() => router.push(`/subjects/${subjectSlug}/progress/favourites/${item.id}`)}
                      >
                        <TableCell className="px-2">
                          {responses.length > 0 && (
                            <button
                              type="button"
                              aria-label={isExpanded ? "Hide saved responses" : "Show saved responses"}
                              className="inline-flex size-8 items-center justify-center rounded-[2px] border border-[#3b2a22]/55 text-[#8f8982] transition-colors hover:border-[#c8864a]/55 hover:text-[#dba476]"
                              onClick={(event) => {
                                event.stopPropagation()
                                toggleExpanded(favourite.id)
                              }}
                            >
                              <ChevronDown className={cn("size-4 transition-transform", isExpanded && "rotate-180")} />
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="px-4">
                          <span className="rounded-full border border-[#8b5e42]/45 bg-[#d49a71]/10 px-2 py-1 text-[10px] font-semibold text-[#dba476]">
                            {questionTypeLabel(item.question_type)}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[520px] px-4">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="min-w-0 flex-1 overflow-hidden whitespace-nowrap [mask-image:linear-gradient(to_right,black_70%,transparent_100%)]">
                              <InlineMathPreview>{preview}</InlineMathPreview>
                            </div>
                            {responses.length > 0 && (
                              <span className="shrink-0 rounded-full border border-[#2a211a] px-2 py-0.5 text-[10px] text-[#5f5347]">
                                {responses.length} response{responses.length > 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="px-4">
                          <span className="rounded-[2px] border border-[#7c573a]/70 bg-[#c8864a]/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#d99658]">
                            {titleCase(item.level || "exam_practice")}
                          </span>
                        </TableCell>
                        <TableCell className="min-w-0 max-w-[16rem] px-4 align-top">
                          <div className="flex min-w-0 flex-wrap content-start gap-1.5">
                            {tags.slice(0, 4).map((tag) => (
                              <span
                                className="max-w-full truncate rounded-full border border-[#3b2a22]/60 bg-[#211913] px-2 py-1 text-[11px] text-[#dac1b7]"
                                key={tag.id}
                                title={tag.name}
                              >
                                {tag.name}
                              </span>
                            ))}
                            {tags.length > 4 && (
                              <span className="shrink-0 rounded-full border border-[#3b2a22]/55 bg-white/[0.035] px-2 py-1 text-[11px] text-[#a28c83]">
                                +{tags.length - 4}
                              </span>
                            )}
                            {tags.length === 0 && <span className="text-xs text-[#6f5c55]">Untagged</span>}
                          </div>
                        </TableCell>
                        <TableCell className="px-4">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              aria-label="Edit favourite note"
                              className="inline-flex size-9 items-center justify-center rounded-[2px] border border-[#7c573a]/45 text-[#dba476] transition-colors hover:border-[#c8864a]/70 hover:bg-[#c8864a]/10"
                              onClick={(event) => {
                                event.stopPropagation()
                                setEditingFavourite(favourite)
                              }}
                            >
                              <Pencil className="size-4" />
                            </button>
                            <button
                              type="button"
                              aria-label="Remove from favourites"
                              disabled={deletingQuestionId === item.id}
                              className="inline-flex size-9 items-center justify-center rounded-[2px] border border-[#7c573a]/35 text-[#9b8f84] transition-colors hover:border-[#d99658]/55 hover:bg-[#d99658]/8 hover:text-[#dba476] disabled:cursor-not-allowed disabled:opacity-55"
                              onClick={(event) => {
                                event.stopPropagation()
                                deleteFavourite(item.id)
                              }}
                            >
                              {deletingQuestionId === item.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Trash2 className="size-4" />
                              )}
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && responses.length > 0 && (
                        <TableRow className="border-0 bg-transparent hover:bg-transparent">
                          <TableCell colSpan={6} className="px-4 pb-4 pt-0">
                            <div className="ml-10 overflow-hidden rounded-[8px] border border-[#3b2a22]/55 bg-[#181410]/95">
                              {responses.map((savedResponse, index) => (
                                <div
                                  key={savedResponse.id}
                                  className="cursor-pointer border-b border-[#30231b] px-4 py-3 transition-colors last:border-b-0 hover:bg-[#211913]"
                                  onClick={() => router.push(`/subjects/${subjectSlug}/progress/favourites/${item.id}/responses/${savedResponse.id}`)}
                                >
                                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                                    <p className="text-[12px] font-semibold text-[#a89686]">Response {index + 1}</p>
                                    <span
                                      className={cn(
                                        "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]",
                                        responseIsMarked(savedResponse)
                                          ? "border-[#6f8f5f]/35 bg-[#6f8f5f]/10 text-[#9fbe8d]"
                                          : "border-[#9d4d45]/35 bg-[#9d4d45]/10 text-[#d48a82]"
                                      )}
                                    >
                                      {responseIsMarked(savedResponse) ? "Marked" : "Unmarked"}
                                    </span>
                                    <p className="text-[12px] text-[#dba476]">
                                      {responseIsMarked(savedResponse)
                                        ? `${savedResponse.marks_awarded}/${savedResponse.marks_possible ?? "?"} marks`
                                        : <span className="text-[#5f5347]">-</span>}
                                    </p>
                                    <p className="text-[12px] text-[#5f5347]">{formatAttemptDate(savedResponse.created_at)}</p>
                                    <div className="ml-auto flex items-center gap-2">
                                      <button
                                        type="button"
                                        aria-label="Edit response note"
                                        className="inline-flex size-8 items-center justify-center rounded-[2px] border border-[#7c573a]/35 text-[#8f8982] transition-colors hover:border-[#c8864a]/60 hover:text-[#dba476]"
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          startEditingResponse(savedResponse)
                                        }}
                                      >
                                        <Pencil className="size-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        aria-label="Delete response"
                                        className={cn(
                                          "inline-flex size-8 items-center justify-center rounded-[2px] border transition-colors",
                                          deletingResponseId === savedResponse.id
                                            ? "border-[#d99658]/60 bg-[#d99658]/8 text-[#d99658]"
                                            : "border-[#7c573a]/25 text-[#6f6861] hover:border-[#d99658]/55 hover:text-[#dba476]"
                                        )}
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          deleteResponse(savedResponse.id)
                                        }}
                                      >
                                        <Trash2 className="size-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                  {editingResponseId === savedResponse.id ? (
                                    <div
                                      className="mt-2 flex gap-2"
                                      onClick={(event) => event.stopPropagation()}
                                    >
                                      <input
                                        value={editNoteValue}
                                        onChange={(event) => setEditNoteValue(event.target.value)}
                                        className="h-9 min-w-0 flex-1 rounded-[3px] border border-white/[0.06] bg-[#181410] px-3 text-[12px] text-[#c4b5a8] outline-none focus:border-[#7c573a]/55"
                                        placeholder="Response note"
                                      />
                                      <button
                                        type="button"
                                        className="h-9 rounded-[2px] border border-[#c8864a]/50 px-3 text-[11px] font-semibold text-[#dba476] hover:bg-[#c8864a]/10"
                                        onClick={() => saveResponseNote(savedResponse.id)}
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        className="h-9 rounded-[2px] border border-white/[0.06] px-3 text-[11px] font-semibold text-[#6f6861] hover:text-[#9b8f84]"
                                        onClick={() => {
                                          setEditingResponseId(null)
                                          setEditNoteValue("")
                                        }}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : savedResponse.note ? (
                                    <p className="mt-0.5 max-w-[420px] truncate text-[11px] text-[#4f4a45]">
                                      {savedResponse.note}
                                    </p>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      {editingFavourite && (
        <SaveQuestionModal
          existingNote={editingFavourite.note || ""}
          favourited
          loading={savingNote}
          onClose={() => setEditingFavourite(null)}
          onSave={saveNote}
        />
      )}
    </>
  )
}
