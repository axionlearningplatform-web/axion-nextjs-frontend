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
import { useParams, useRouter } from "next/navigation"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"

const QUESTIONS_API_URL = "/api/questions/"
const TAGS_API_URL = "/api/questions/tags/"
const PAGE_SIZE = 75
const SEARCH_DEBOUNCE_MS = 260

/** Extra right padding so the native select chevron clears the curved border. */
const FILTER_SELECT_CLASS =
  "h-10 w-full min-w-[140px] cursor-pointer rounded-full border border-[#3b2a22]/55 bg-[#181410] py-2 pl-4 pr-10 text-sm text-[#e5e2e1] outline-none focus:border-[#ffb595]/40"

const MODERATION_FILTER_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "In review" },
  { value: "needs_revision", label: "Needs changes" },
  { value: "published", label: "Published" },
  { value: "rejected", label: "Rejected" },
]

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
        {item.moderation_status === "submitted" && (
          <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-2 py-1 text-[10px] text-sky-100">
            Submitted
          </span>
        )}
        {item.moderation_status === "under_review" && (
          <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-2 py-1 text-[10px] text-sky-100">
            In review
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
      <TableCell className="max-w-[520px] px-4">
        <div className="overflow-hidden text-ellipsis line-clamp-3 break-words">{preview}</div>
      </TableCell>
      <TableCell className="max-w-48 px-4 text-[#dac1b7]">
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
  const [page, setPage] = useState(0)

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim())
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    setPage(0)
  }, [debouncedSearch, layer1Id, layer2Id, moderationFilter, subjectSlug])

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

  const questionsListUrl = useMemo(() => {
    const p = new URLSearchParams()
    if (lockedSubject?.id) p.set("subject_id", String(lockedSubject.id))
    if (debouncedSearch) p.set("search", debouncedSearch)
    if (layer1Id) p.set("layer1_tag_id", String(layer1Id))
    if (layer2Id) p.set("layer2_tag_id", String(layer2Id))
    if (moderationFilter) p.set("moderation_status", moderationFilter)
    p.set("limit", String(PAGE_SIZE))
    p.set("offset", String(page * PAGE_SIZE))
    return `${QUESTIONS_API_URL}?${p.toString()}`
  }, [lockedSubject?.id, debouncedSearch, layer1Id, layer2Id, moderationFilter, page])

  const swrKey = subjectSlug ? (lockedSubject ? questionsListUrl : null) : questionsListUrl

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
  }, [page, debouncedSearch, layer1Id, layer2Id, moderationFilter, lockedSubject?.id])

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
  if (subjectsLoading || (isLoading && !listPayload)) {
    return <div className="p-10 text-[#dac1b7]">Loading questions...</div>
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-8 py-10">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#ffb595]">
          {lockedSubject?.name || "Question Database"}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-[#e5e2e1]">Question Database</h1>
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#a28c83]">
            Search
          </label>
          <input
            className="h-10 w-full rounded-full border border-[#3b2a22]/55 bg-white/[0.035] px-4 text-sm text-[#e5e2e1] outline-none focus:border-[#ffb595]/40"
            placeholder="Question text…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="min-w-[160px]">
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#a28c83]">
            Status
          </label>
          <select
            className={FILTER_SELECT_CLASS}
            value={moderationFilter}
            onChange={(e) => setModerationFilter(e.target.value)}
          >
            {MODERATION_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value || "any"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        {lockedSubject && (
          <>
            <div className="min-w-[160px]">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#a28c83]">
                Layer 1
              </label>
              <select
                className={FILTER_SELECT_CLASS}
                value={layer1Id}
                onChange={(e) => {
                  setLayer1Id(e.target.value)
                  setLayer2Id("")
                }}
              >
                <option value="">Any topic</option>
                {layer1Options.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[160px]">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#a28c83]">
                Layer 2
              </label>
              <select
                className={cn(FILTER_SELECT_CLASS, !layer1Id && "opacity-40")}
                disabled={!layer1Id}
                value={layer2Id}
                onChange={(e) => setLayer2Id(e.target.value)}
              >
                <option value="">Any subtopic</option>
                {layer2Options.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      <div className="rounded-2xl border border-[#3b2a22]/55 bg-[#1b1713]/90 p-3">
        <div ref={scrollParentRef} className="max-h-[min(70vh,720px)] overflow-auto">
          <Table className="w-full table-fixed border-separate border-spacing-y-2">
            <TableHeader className="sticky top-0 z-10 bg-[#1b1713]/95 backdrop-blur-sm [&_tr]:border-0">
              <TableRow className="border-0 hover:bg-transparent">
                <TableHead className="w-28 px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">
                  Status
                </TableHead>
                <TableHead className="w-20 px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">
                  ID
                </TableHead>
                <TableHead className="px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">
                  Question
                </TableHead>
                <TableHead className="w-48 px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">
                  Source
                </TableHead>
                <TableHead className="w-52 px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">
                  Topics
                </TableHead>
                <TableHead className="w-36 px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">
                  Creator
                </TableHead>
                <TableHead className="w-24 px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">
                  Marks
                </TableHead>
                <TableHead className="w-36 px-4 text-xs font-bold uppercase tracking-wide text-[#a28c83]">
                  Created
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paddingTop > 0 && (
                <TableRow className="border-0 hover:bg-transparent">
                  <TableCell colSpan={8} className="p-0" style={{ height: `${paddingTop}px` }} />
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
                  <TableCell colSpan={8} className="p-0" style={{ height: `${paddingBottom}px` }} />
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
