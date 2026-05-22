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
import { Check, ChevronDown } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"

const FAVOURITES_API_URL = "/api/questions/favourites/"
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

  const { data: favourites = [], error, isLoading, isValidating } = useSWR(favouritesUrl, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  })

  if (error) return <div className="p-10 text-[#ffb4ab]">Failed to load favourites</div>
  if (isLoading && !favourites.length) return <div className="p-10 text-[#dac1b7]">Loading favourites...</div>

  return (
    <>
      <div className="mb-6 grid items-end gap-3 lg:grid-cols-[minmax(280px,1fr)_160px_160px_200px]">
        <div className="min-w-[220px]">
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
          <div className="min-w-[160px] lg:min-w-0">
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

      <div className="rounded-[12px] border border-[#3b2a22]/55 bg-[#1b1713]/90 p-4">
        {favourites.length === 0 && !isValidating ? (
          <div className="flex min-h-[320px] items-center justify-center px-6 text-center font-serif text-xl italic text-[#77716b]">
            No saved questions yet. Start practising and save questions as you go.
          </div>
        ) : (
          <div className="max-h-[min(70vh,720px)] overflow-auto">
            <Table className="w-full table-auto border-separate border-spacing-y-2">
              <TableHeader className="sticky top-0 z-10 bg-[#1b1713]/95 backdrop-blur-sm [&_tr]:border-0">
                <TableRow className="border-0 hover:bg-transparent">
                  <TableHead className="w-20 px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">
                    Type
                  </TableHead>
                  <TableHead className="max-w-[420px] px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">
                    Question Preview
                  </TableHead>
                  <TableHead className="w-36 px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">
                    Level
                  </TableHead>
                  <TableHead className="w-56 px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">
                    Topics/Tags
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {favourites.map((favourite) => {
                  const item = favourite.question || {}
                  const preview = item.question_preview ?? item.question_text ?? ""
                  const tags = item.tags || []
                  return (
                    <TableRow
                      key={favourite.id}
                      className="cursor-pointer border-0 bg-[#181410] text-[#e5e2e1] shadow-sm transition-colors hover:bg-[#211913] [&>td:first-child]:rounded-l-xl [&>td:last-child]:rounded-r-xl"
                      onClick={() => router.push(`/subjects/${subjectSlug}/progress/favourites/${item.id}`)}
                    >
                      <TableCell className="px-4">
                        <span className="rounded-full border border-[#8b5e42]/45 bg-[#d49a71]/10 px-2 py-1 text-[10px] font-semibold text-[#dba476]">
                          {questionTypeLabel(item.question_type)}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[420px] px-4">
                        <div className="overflow-hidden whitespace-nowrap [mask-image:linear-gradient(to_right,black_70%,transparent_100%)]">
                          {preview}
                        </div>
                      </TableCell>
                      <TableCell className="px-4">
                        <span className="rounded-[2px] border border-[#7c573a]/70 bg-[#c8864a]/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#d99658]">
                          {titleCase(item.level || "exam_practice")}
                        </span>
                      </TableCell>
                      <TableCell className="min-w-0 max-w-[14rem] px-4 align-top">
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
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  )
}
