"use client"

import { useAuth } from "@/components/authProvider"
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
import { useVirtualizer } from "@tanstack/react-virtual"
import { Check, ChevronDown } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"

const QUESTIONS_API_URL = "/api/questions/"
const TAGS_API_URL = "/api/questions/tags/"
const PAGE_SIZE = 75
const SEARCH_DEBOUNCE_MS = 260

const MODERATION_FILTER_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "submitted,under_review", label: "Coordinator review" },
  { value: "needs_revision", label: "Needs changes" },
  { value: "published", label: "Published" },
  { value: "rejected", label: "Rejected" },
]

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

function FilterDropdown({ active = false, label, onChange, options, value }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function closeOnOutsideClick(event) {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false)
      }
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
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false)
      }
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

const QuestionRow = memo(function QuestionRow({ item, onRowClick }) {
  const preview = item.question_preview ?? item.question_text ?? ""
  const tags = item.tags || []

  return (
    <TableRow
      className="cursor-pointer border-0 bg-[#181410] text-[#e5e2e1] shadow-sm transition-colors hover:bg-[#211913] [&>td:first-child]:rounded-l-xl [&>td:last-child]:rounded-r-xl"
      onClick={() => onRowClick(item.id)}
    >
      <TableCell className="px-4 text-xs text-[#dac1b7]">
        {item.moderation_status === "published" && (
          <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-100">
            Published
          </span>
        )}
        {(item.moderation_status === "submitted" || item.moderation_status === "under_review") && (
          <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-2 py-1 text-[10px] text-sky-100">
            Coordinator review
          </span>
        )}
        {item.moderation_status === "needs_revision" && (
          <span className="rounded-full border border-orange-400/30 bg-orange-500/12 px-2 py-1 text-[10px] text-orange-100">
            Needs changes
          </span>
        )}
        {item.moderation_status === "rejected" && (
          <span className="rounded-full border border-red-400/25 bg-red-400/10 px-2 py-1 text-[10px] text-red-100">
            Rejected
          </span>
        )}
      </TableCell>
      <TableCell className="px-4 font-semibold text-[#ffb595]">{item.id}</TableCell>
      <TableCell className="px-4">
        <span className="rounded-full border border-[#8b5e42]/45 bg-[#d49a71]/10 px-2 py-1 text-[10px] font-semibold text-[#dba476]">
          {questionTypeLabel(item.question_type)}
        </span>
      </TableCell>
    <TableCell className="max-w-[375px] px-4">
  <div className="overflow-hidden whitespace-nowrap [mask-image:linear-gradient(to_right,black_70%,transparent_100%)]">{preview}</div>
</TableCell>
      <TableCell className="w-44 shrink-0 px-4 text-[#dac1b7]">
        <div className="line-clamp-2 whitespace-normal break-words">
          {item.import_source || "Manual"}
        </div>
      </TableCell>
      <TableCell className="min-w-0 max-w-[11rem] px-4 align-top">
        <div className="flex min-w-0 flex-wrap content-start gap-1.5">
          {tags.slice(0, 3).map((tag) => (
            <span
              className="max-w-full truncate rounded-full border border-[#3b2a22]/60 bg-[#211913] px-2 py-1 text-[11px] text-[#dac1b7]"
              key={tag.id}
              title={tag.name}
            >
              {tag.name}
            </span>
          ))}
          {tags.length > 3 && (
            <span className="shrink-0 rounded-full border border-[#3b2a22]/55 bg-white/[0.035] px-2 py-1 text-[11px] text-[#a28c83]">
              +{tags.length - 3}
            </span>
          )}
          {tags.length === 0 && <span className="text-xs text-[#6f5c55]">Untagged</span>}
        </div>
      </TableCell>
      <TableCell className="min-w-0 max-w-[9rem] px-4 text-[#dac1b7]">
        <div className="line-clamp-1 whitespace-normal break-words">
          {item.creator_name || "Unknown"}
        </div>
      </TableCell>
      <TableCell className="px-4">{item.marks}</TableCell>
      <TableCell className="px-4">
        <span className="rounded-[2px] border border-[#7c573a]/70 bg-[#c8864a]/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#d99658]">
          {titleCase(item.level || "exam_practice")}
        </span>
      </TableCell>
      <TableCell className="px-4 text-[#dac1b7]">
        {new Date(item.created_at).toLocaleDateString()}
      </TableCell>
    </TableRow>
  )
})

export default function QuestionTable() {
  const router = useRouter()
  const params = useParams()
  const subjectSlug = params?.slug
  const [searchInput, setSearchInput] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [layer1Id, setLayer1Id] = useState("")
  const [layer2Id, setLayer2Id] = useState("")
  const [moderationFilter, setModerationFilter] = useState("")
  const [questionTypeFilter, setQuestionTypeFilter] = useState("")
  const [levelFilter, setLevelFilter] = useState("")
  const [page, setPage] = useState(0)

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim())
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    setPage(0)
  }, [debouncedSearch, layer1Id, layer2Id, moderationFilter, questionTypeFilter, levelFilter, subjectSlug])

  const {
    data: subjects = [],
    isLoading: subjectsLoading,
  } = useSWR("/api/subjects/", fetcher)
  const lockedSubject = subjects.find((subject) => subject.slug === subjectSlug)
  const tagsUrl = lockedSubject?.id
    ? `${TAGS_API_URL}?subject_id=${lockedSubject.id}&max_layer=3`
    : null
  const { data: filterTags = [] } = useSWR(tagsUrl, fetcher)

  const layer1Options = useMemo(
    () => filterTags.filter((t) => t.layer === 1 && t.tag_kind !== "microskill"),
    [filterTags]
  )
  const layer2Options = useMemo(() => {
    if (!layer1Id) return []
    return filterTags.filter(
      (t) => t.layer === 2 && String(t.parent_id) === String(layer1Id)
    )
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
  const selectedLayer1 = useMemo(
    () => layer1Options.find((tag) => String(tag.id) === String(layer1Id)),
    [layer1Id, layer1Options]
  )
  const selectedLayer2 = useMemo(
    () => layer2Options.find((tag) => String(tag.id) === String(layer2Id)),
    [layer2Id, layer2Options]
  )
  const tagFilterLabel = selectedLayer1
    ? selectedLayer2
      ? `${selectedLayer1.name} › ${selectedLayer2.name}`
      : selectedLayer1.name
    : "Any tag"

  const questionsListUrl = useMemo(() => {
    const p = new URLSearchParams()
    if (lockedSubject?.id) p.set("subject_id", String(lockedSubject.id))
    else if (subjectSlug) p.set("subject_slug", String(subjectSlug))
    if (debouncedSearch) p.set("search", debouncedSearch)
    if (layer1Id) p.set("layer1_tag_id", String(layer1Id))
    if (layer2Id) p.set("layer2_tag_id", String(layer2Id))
    if (moderationFilter) p.set("moderation_status", moderationFilter)
    if (questionTypeFilter) p.set("question_type", questionTypeFilter)
    if (levelFilter) p.set("level", levelFilter)
    p.set("limit", String(PAGE_SIZE))
    p.set("offset", String(page * PAGE_SIZE))
    return `${QUESTIONS_API_URL}?${p.toString()}`
  }, [lockedSubject?.id, subjectSlug, debouncedSearch, layer1Id, layer2Id, moderationFilter, questionTypeFilter, levelFilter, page])

  const swrKey = questionsListUrl

  const { data: listPayload, error, isLoading, isValidating } = useSWR(swrKey, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
    keepPreviousData: true,
  })

  const rows = listPayload?.results ?? []
  const totalCount = listPayload?.count ?? 0
  const canGoNext = (page + 1) * PAGE_SIZE < totalCount
  const canGoPrev = page > 0

  const auth = useAuth()
  useEffect(() => {
    if (error?.status === 401) {
      auth.loginRequiredRedirect()
    }
  }, [auth, error])

  const scrollParentRef = useRef(null)
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 88,
    overscan: 10,
  })

  useEffect(() => {
    scrollParentRef.current?.scrollTo({ top: 0 })
  }, [page, debouncedSearch, layer1Id, layer2Id, moderationFilter, questionTypeFilter, levelFilter, lockedSubject?.id])

  const virtualRows = rowVirtualizer.getVirtualItems()
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0
  const paddingBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0

  const onRowClick = useCallback(
    (id) => {
      router.push(
        lockedSubject
          ? `/subjects/${lockedSubject.slug}/questions/${id}`
          : `/questions/${id}`
      )
    },
    [lockedSubject, router]
  )

  if (error) return <div className="p-10 text-[#ffb4ab]">Failed to load questions</div>
  if (subjectSlug && !subjectsLoading && !lockedSubject) {
    return <div className="p-10 text-[#ffb4ab]">Subject not available for this user</div>
  }
  if ((!subjectSlug && subjectsLoading) || (isLoading && !listPayload)) {
    return <div className="p-10 text-[#dac1b7]">Loading questions...</div>
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] px-8 py-10">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#ffb595]">
          {lockedSubject?.name || "Question Database"}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-[#e5e2e1]">Question Database</h1>
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#a28c83]">
            Search
          </label>
          <input
            className="h-10 w-full rounded-full border border-[#3b2a22]/55 bg-white/[0.035] px-4 text-sm text-[#e5e2e1] outline-none focus:border-[#ffb595]/40"
            placeholder="Question ID or text..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
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
            Status
          </label>
          <FilterDropdown
            active={Boolean(moderationFilter)}
            label={MODERATION_FILTER_OPTIONS.find((opt) => opt.value === moderationFilter)?.label || "Any status"}
            onChange={setModerationFilter}
            options={MODERATION_FILTER_OPTIONS}
            value={moderationFilter}
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
        {lockedSubject && (
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
        <div ref={scrollParentRef} className="max-h-[min(70vh,720px)] overflow-auto">
          <Table className="w-full table-auto border-separate border-spacing-y-2">
            <TableHeader className="sticky top-0 z-10 bg-[#1b1713]/95 backdrop-blur-sm [&_tr]:border-0">
              <TableRow className="border-0 hover:bg-transparent">
                <TableHead className="w-32 px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">
                  Status
                </TableHead>
                <TableHead className="w-16 px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">
                  ID
                </TableHead>
                <TableHead className="w-20 px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">
                  Type
                </TableHead>
                <TableHead className="max-w-[320px] px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">
                  Question
                </TableHead>
                <TableHead className="w-44 px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">
                  Source
                </TableHead>
                <TableHead className="w-56 px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">
                  Topics
                </TableHead>
                <TableHead className="w-32 px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">
                  Creator
                </TableHead>
                <TableHead className="w-16 px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">
                  Marks
                </TableHead>
                <TableHead className="w-36 px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">
                  Level
                </TableHead>
                <TableHead className="w-28 px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">
                  Created
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paddingTop > 0 && (
                <TableRow className="border-0 hover:bg-transparent">
                  <TableCell colSpan={10} className="p-0" style={{ height: `${paddingTop}px` }} />
                </TableRow>
              )}
              {virtualRows.map((virtualRow) => {
                const item = rows[virtualRow.index]
                if (!item) return null
                return (
                  <QuestionRow key={item.id} item={item} onRowClick={onRowClick} />
                )
              })}
              {paddingBottom > 0 && (
                <TableRow className="border-0 hover:bg-transparent">
                  <TableCell colSpan={10} className="p-0" style={{ height: `${paddingBottom}px` }} />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {totalCount > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#3b2a22]/40 px-2 py-2 text-xs text-[#a28c83]">
            <span>
              {totalCount} question{totalCount === 1 ? "" : "s"}
              {isValidating ? " · updating…" : ""}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-[#3b2a22]/55 bg-[#181410] px-3 py-1.5 text-[#dac1b7] transition-colors hover:bg-[#211913] disabled:cursor-not-allowed disabled:opacity-35"
                disabled={!canGoPrev}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </button>
              <span className="tabular-nums text-[#dac1b7]">
                {page + 1} / {Math.max(1, Math.ceil(totalCount / PAGE_SIZE))}
              </span>
              <button
                type="button"
                className="rounded-full border border-[#3b2a22]/55 bg-[#181410] px-3 py-1.5 text-[#dac1b7] transition-colors hover:bg-[#211913] disabled:cursor-not-allowed disabled:opacity-35"
                disabled={!canGoNext}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {rows.length === 0 && !isValidating && (
          <div className="px-4 py-10 text-center text-sm text-[#a28c83]">
            No questions in this subject yet.
          </div>
        )}
      </div>
    </div>
  )
}
