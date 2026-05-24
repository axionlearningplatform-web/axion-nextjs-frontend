"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"
import ReactMarkdown from "react-markdown"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import useSWR, { preload } from "swr"
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Keyboard,
  Lightbulb,
  Loader2,
  Sigma,
  X,
} from "lucide-react"

import HandwritingCanvas from "@/components/answering/HandwritingCanvas"
import { useAuth } from "@/components/authProvider"
import SaveQuestionModal from "@/components/favourites/SaveQuestionModal"
import fetcher from "@/lib/fetcher"
import { cn } from "@/lib/utils"
import { subjectIsMathematics } from "@/lib/subjectMath"

const QUESTIONS_API_URL = "/api/questions/"
const TAGS_API_URL = "/api/questions/tags/"
const STORAGE_PREFIX = "axon-daily-practice"
const AMBER = "#c8864a"

const sections = [
  { id: "year", label: "Year" },
  { id: "course", label: "Course" },
  { id: "topics", label: "Topics" },
  { id: "dotPoints", label: "Dot Points", disabled: true },
  { id: "level", label: "Level" },
  { id: "type", label: "Type" },
]

const levelOptions = ["Foundational", "Intermediate", "Exam Practice", "Challenge"]
const typeOptions = ["SAQ", "MCQ"]

function titleCase(value = "") {
  return value
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function levelValue(label = "") {
  return label.toLowerCase().replaceAll(" ", "_")
}

function levelLabel(value = "") {
  return titleCase(value || "exam_practice")
}

function shuffledOptions(options = []) {
  const next = [...options]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = next[i]
    next[i] = next[j]
    next[j] = temp
  }
  return next
}

function optionsForPracticeDisplay(options = [], shouldShuffle = false) {
  const ordered = shouldShuffle ? shuffledOptions(options) : [...options]
  return ordered.map((option, index) => {
    const originalLetter = option.answer_letter || option.letter || String.fromCharCode(65 + index)
    return {
      ...option,
      answer_letter: originalLetter,
      display_letter: String.fromCharCode(65 + index),
    }
  })
}

function storageKey(slug) {
  return `${STORAGE_PREFIX}:${slug || "subject"}`
}

function greetingForNow() {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

function normalize(value = "") {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function tagLooksLike(tag, words) {
  const haystack = normalize(`${tag.name} ${tag.slug}`)
  return words.some((word) => haystack.includes(word))
}

function splitTags(tags = []) {
  const year = []
  const difficulty = []
  const type = []
  const topics = []

  tags.forEach((tag) => {
    if (tag.tag_kind === "microskill") return
    if (tag.layer && tag.layer > 2) return
    if (tagLooksLike(tag, ["year 11", "year11", "yr 11", "yr11"])) {
      year.push(tag)
      return
    }
    if (tagLooksLike(tag, ["year 12", "year12", "yr 12", "yr12"])) {
      year.push(tag)
      return
    }
    if (tagLooksLike(tag, ["foundation", "intermediate", "advanced", "easy", "hard"])) {
      difficulty.push(tag)
      return
    }
    if (tagLooksLike(tag, ["saq", "mcq", "short answer", "extended response"])) {
      type.push(tag)
      return
    }
    topics.push(tag)
  })

  return {
    year,
    difficulty,
    type,
    topics: topics.sort((a, b) => {
      if ((a.layer || 1) !== (b.layer || 1)) return (a.layer || 1) - (b.layer || 1)
      return a.name.localeCompare(b.name)
    }),
  }
}

function defaultConfig(subject) {
  return {
    year: "Year 12",
    course: subject?.name || "Mathematical Methods",
    topicIds: [],
    topicNames: [],
    level: "",
    type: "",
  }
}

function configTagIds(config, buckets) {
  const selectedTopicIds = new Set(config.topicIds || [])
  const selectedTopicNames = new Set((config.topicNames || []).map(normalize))

  return buckets.topics
    .filter((tag) => selectedTopicIds.has(tag.id) || selectedTopicNames.has(normalize(tag.name)))
    .map((tag) => tag.id)
}

function questionMatchesConfig(question, config, buckets) {
  if (config.type) {
    const questionType = question.question_type?.toUpperCase()
    if (questionType !== config.type.toUpperCase()) return false
  }

  if (config.level) {
    const questionLevel = question.level || "exam_practice"
    if (questionLevel !== levelValue(config.level)) return false
  }

  const selectedTagIds = new Set(configTagIds(config, buckets))
  if (!selectedTagIds.size) return true

  const questionTagIds = new Set((question.tags || []).map((tag) => tag.id))
  return [...selectedTagIds].every((id) => questionTagIds.has(id))
}

function randomItem(items) {
  if (!items.length) return null
  return items[Math.floor(Math.random() * items.length)]
}

function unwrapQuestions(data) {
  if (Array.isArray(data)) return data
  return data?.results || []
}

function formatTimer(seconds) {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${String(remainder).padStart(2, "0")}`
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve({
      name: file.name,
      mime_type: file.type || "application/octet-stream",
      data_url: reader.result,
    })
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function parseJsonResponse(response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {
      detail:
        "Server returned a non-JSON response (often HTML from a gateway timeout or crash). Check API logs and payload size.",
      message: "non-json",
      raw: text.slice(0, 800),
      status: response.status,
    }
  }
}

function prepareMarkdown(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\\\[((?:.|\n)*?)\\\]/g, (_, expression) => `$$\n${expression.trim()}\n$$`)
    .replace(/\\\((.+?)\\\)/g, (_, expression) => `$${expression.trim()}$`)
    .split("\n")
    .map((line) => {
      const trimmedRight = line.replace(/\s+$/g, "")
      return trimmedRight.replace(
        /^(\s*)\*\*(\d+)\.\s+(.+?)\*\*$/,
        "$1$2. **$3**"
      )
    })
    .join("\n")
    .replace(/(?<!\n)\n(?!\n)/g, "  \n")
}

function latexFirstPrepare(value) {
  const raw = String(value || "")
  const trimmed = raw.trim()
  if (!trimmed || trimmed.includes("$$")) return raw
  if (trimmed.startsWith("\\begin") && !trimmed.startsWith("$")) {
    return `\n$$\n${trimmed}\n$$\n`
  }
  return raw
}

export function MarkdownMath({ children, className }) {
  const markdown = prepareMarkdown(latexFirstPrepare(children))

  return (
    <div className={cn("axion-question-math prose prose-invert max-w-none text-[#eee9e4]", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ children: nodeChildren }) => (
            <p className="my-4 first:mt-0 last:mb-0">{nodeChildren}</p>
          ),
          ol: ({ children: nodeChildren }) => (
            <ol className="my-5 list-outside list-decimal space-y-1.5 pl-6">
              {nodeChildren}
            </ol>
          ),
          ul: ({ children: nodeChildren }) => (
            <ul className="my-5 list-outside list-disc space-y-1.5 pl-6">
              {nodeChildren}
            </ul>
          ),
          li: ({ children: nodeChildren }) => (
            <li className="pl-1 marker:text-[#8f8982]">{nodeChildren}</li>
          ),
          strong: ({ children: nodeChildren }) => (
            <strong className="font-semibold text-[#f3ede6]">{nodeChildren}</strong>
          ),
          em: ({ children: nodeChildren }) => (
            <em className="italic text-[#efe4da]">{nodeChildren}</em>
          ),
          code: ({ children: nodeChildren }) => (
            <code className="whitespace-pre-wrap break-words">{nodeChildren}</code>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
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
  return `\\(${raw}\\)`
}

function normaliseSillyMistake(item, index) {
  if (item?.title) {
    return {
      number: index + 1,
      label: item.title,
      description: item.detail || "",
      latex: prepareMistakeLatex(item.latex),
      score: null,
      maxScore: null,
    }
  }
  return {
    number: index + 1,
    label: item?.label || item?.tag || "",
    description: item?.description || item?.reason || "",
    latex: prepareMistakeLatex(item?.latex),
    score: item?.score ?? null,
    maxScore: item?.maxScore ?? item?.max_score ?? null,
  }
}

function normaliseKnowledgeGap(item) {
  if (item?.title) {
    return {
      label: item.title,
      description: item.detail || "",
      score: null,
      maxScore: null,
    }
  }
  return {
    label: item?.label || item?.tag || "",
    description: item?.description || item?.hint || "",
    score: item?.score ?? null,
    maxScore: item?.maxScore ?? item?.max_score ?? null,
  }
}

function SelectionChip({ children, onRemove, muted = false }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[2px] border px-3 text-[11px] tracking-[0.03em] transition-colors",
        muted
          ? "border-[#312720] text-[#77716b]"
          : "border-[#4d3528]/70 bg-[#1a120e]/45 text-[#a89686] hover:border-[#9c6a4a]/60 hover:text-[#ead8c5]"
      )}
    >
      <span>{children}</span>
      <X className="size-3.5" />
    </button>
  )
}

function OptionButton({ children, active, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-[2px] border px-4 text-[12px] font-medium tracking-[0.02em] transition-colors",
        active
          ? "border-[#d49a71]/70 bg-[#d49a71]/13 text-[#e0a77c]"
          : "border-[#3c2c24] bg-[#120f0d] text-[#968a80] hover:border-[#8b5e42]/70 hover:text-[#e1d8d0]",
        disabled && "cursor-not-allowed border-[#2d2926] bg-[#11100f] text-[#4f4b47] hover:border-[#2d2926] hover:text-[#4f4b47]"
      )}
    >
      {children}
    </button>
  )
}

function PracticeModal({
  buckets,
  config,
  dataLoading,
  onChange,
  onClose,
  onGenerate,
  subject,
}) {
  const [activeSection, setActiveSection] = useState("year")
  const topicById = new Map(buckets.topics.map((tag) => [tag.id, tag]))
  const selectedTopicTags = config.topicIds
    .map((id) => topicById.get(id))
    .filter(Boolean)
  const visibleTopicTags = buckets.topics.filter((tag) => {
    if ((tag.layer || 1) === 1) return true
    return config.topicIds.includes(tag.parent_id)
  })
  const chips = [
    config.year && { key: "year", label: config.year, type: "year" },
    config.course && { key: "course", label: config.course, type: "course" },
    ...selectedTopicTags.map((tag) => ({
      key: `topic-${tag.id}`,
      label: tag.name,
      type: "topic",
      id: tag.id,
    })),
    config.level && { key: "level", label: config.level, type: "level" },
    config.type && { key: "type", label: config.type, type: "type" },
  ].filter(Boolean)
  const canGenerate = Boolean(config.year && config.course && !dataLoading)

  function removeChip(chip) {
    if (chip.type === "year") onChange({ ...config, year: "" })
    else if (chip.type === "level") onChange({ ...config, level: "" })
    else if (chip.type === "type") onChange({ ...config, type: "" })
    else if (chip.type === "topic") {
      const tag = topicById.get(chip.id)
      const childIds = tag?.layer === 1
        ? buckets.topics.filter((item) => item.parent_id === tag.id).map((item) => item.id)
        : []
      const removeIds = new Set([chip.id, ...childIds])
      onChange({
        ...config,
        topicIds: config.topicIds.filter((id) => !removeIds.has(id)),
        topicNames: config.topicIds
          .filter((id) => !removeIds.has(id))
          .map((id) => topicById.get(id)?.name)
          .filter(Boolean),
      })
    }
  }

  function toggleTopic(tag) {
    const selected = config.topicIds.includes(tag.id)
    const childIds = tag.layer === 1
      ? buckets.topics.filter((item) => item.parent_id === tag.id).map((item) => item.id)
      : []
    const removeIds = new Set([tag.id, ...childIds])
    const nextTopicIds = selected
      ? config.topicIds.filter((id) => !removeIds.has(id))
      : [...config.topicIds, tag.id]
    onChange({
      ...config,
      topicIds: nextTopicIds,
      topicNames: nextTopicIds
        .map((id) => topicById.get(id)?.name)
        .filter(Boolean),
    })
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
      <section className="grid h-[min(720px,calc(100vh-44px))] w-full max-w-5xl grid-rows-[auto_1fr_auto] overflow-hidden rounded-[10px] border border-[#3b2a22]/55 bg-[#181410] shadow-[0_26px_90px_rgba(0,0,0,0.7)]">
        <header className="flex items-center gap-5 border-b border-[#3b2a22]/55 px-8 py-6">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium tracking-[0.04em] text-[#7f766e] transition-colors hover:text-[#d8c4b0]"
          >
            <ArrowLeft className="size-3.5" />
            back
          </button>
          <span className="h-5 w-px bg-[#3b332d]" />
          <h2 className="font-serif text-[22px] font-medium tracking-normal text-[#d6c7ba]">
            Configure question
          </h2>
        </header>

        <div className="grid min-h-0 grid-cols-1 md:grid-cols-[240px_1fr]">
          <aside className="border-b border-[#3b2a22]/55 p-8 md:border-b-0 md:border-r">
            <nav className="grid gap-6">
              {sections.map((section) => {
                const hasSelection =
                  (section.id === "year" && config.year) ||
                  (section.id === "course" && config.course) ||
                  (section.id === "topics" && config.topicNames.length) ||
                  (section.id === "level" && config.level) ||
                  (section.id === "type" && config.type)

                return (
                  <button
                    type="button"
                    key={section.id}
                    disabled={section.disabled}
                    onClick={() => setActiveSection(section.id)}
                    className={cn(
                      "flex items-center justify-between text-left font-serif text-[22px] font-medium tracking-normal transition-colors",
                      activeSection === section.id ? "text-[#f2eee9]" : "text-[#8c8178]",
                      section.disabled && "cursor-not-allowed text-[#3e3934]"
                    )}
                  >
                    <span>{section.label}</span>
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        hasSelection ? "bg-[#d49a71]" : "bg-[#524840]",
                        section.disabled && "bg-[#2d2a27]"
                      )}
                    />
                  </button>
                )
              })}
            </nav>
          </aside>

          <div className="min-h-0 overflow-y-auto p-8 md:p-10">
            <p className="mb-6 text-[13px] font-semibold uppercase tracking-[0.22em] text-[#6d5d50]">
              {sections.find((section) => section.id === activeSection)?.label}
            </p>

            {activeSection === "year" && (
              <div className="flex flex-wrap gap-2">
                <OptionButton disabled>Year 11</OptionButton>
                <OptionButton
                  active={config.year === "Year 12"}
                  onClick={() => onChange({ ...config, year: "Year 12" })}
                >
                  Year 12
                </OptionButton>
              </div>
            )}

            {activeSection === "course" && (
              <div className="flex flex-wrap gap-2">
                <OptionButton active onClick={() => onChange({ ...config, course: subject?.name || config.course })}>
                  {subject?.name || config.course}
                </OptionButton>
              </div>
            )}

            {activeSection === "topics" && (
              <div className="flex flex-wrap gap-2">
                {visibleTopicTags.length ? (
                  visibleTopicTags.map((tag) => (
                    <OptionButton
                      key={tag.id}
                      active={config.topicIds.includes(tag.id)}
                      onClick={() => toggleTopic(tag)}
                    >
                      {tag.layer === 2 ? `· ${tag.name}` : tag.name}
                    </OptionButton>
                  ))
                ) : (
                  <p className="font-serif text-xl text-[#77716b]">
                    No topic tags have been added yet.
                  </p>
                )}
              </div>
            )}

            {activeSection === "dotPoints" && (
              <p className="font-serif text-xl text-[#4f4a45]">Dot Points are coming soon.</p>
            )}

            {activeSection === "level" && (
              <div className="flex flex-wrap gap-2">
                {levelOptions.map((option) => (
                  <OptionButton
                    key={option}
                    active={config.level === option}
                    onClick={() => onChange({ ...config, level: config.level === option ? "" : option })}
                  >
                    {option}
                  </OptionButton>
                ))}
              </div>
            )}

            {activeSection === "type" && (
              <div className="flex flex-wrap gap-2">
                {typeOptions.map((option) => (
                  <OptionButton
                    key={option}
                    active={config.type === option}
                    onClick={() => onChange({ ...config, type: config.type === option ? "" : option })}
                  >
                    {option}
                  </OptionButton>
                ))}
              </div>
            )}
          </div>
        </div>

        <footer className="flex flex-col gap-4 border-t border-[#3b2a22]/55 p-8 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
            {chips.map((chip) => (
              <SelectionChip key={chip.key} onRemove={() => removeChip(chip)}>
                {chip.label}
              </SelectionChip>
            ))}
            {!chips.length && <SelectionChip muted>Select a filter</SelectionChip>}
          </div>
          <button
            type="button"
            onClick={() => onGenerate("modal")}
            disabled={!canGenerate}
            title={canGenerate ? "Generate question" : dataLoading ? "Loading question data" : "Choose a year and course first"}
            className={cn(
              "h-12 rounded-[8px] border border-[#d49a71]/45 bg-[#d49a71]/16 px-9 font-serif text-[20px] font-semibold tracking-normal text-[#e6b083] shadow-[0_12px_38px_rgba(0,0,0,0.22)] transition-colors hover:border-[#d49a71]/70 hover:bg-[#d49a71]/24 hover:text-[#f1c39e]",
              !canGenerate && "cursor-not-allowed border-[#2d2926] bg-[#11100f] text-[#4f4b47] opacity-70 hover:border-[#2d2926] hover:bg-[#11100f] hover:text-[#4f4b47]"
            )}
          >
            {dataLoading ? "Loading..." : "Generate"}
          </button>
        </footer>
      </section>
    </div>
  )
}

function PracticeHome({ config, dataLoading, onGenerate, onOpenModal, subject, userName }) {
  const greeting = greetingForNow()
  const displayName = String(userName || "there").trim() || "there"
  const topicLine = config.topicNames.length
    ? config.topicNames.join(" > ")
    : "Choose a topic"
  const streakDots = 7
  const activeStreak = 4

  return (
    <main className="relative flex min-h-[calc(100vh-64px)] items-center justify-center overflow-hidden bg-[#16130f] px-6 py-12 text-[#e8e4dc] before:absolute before:inset-0 before:bg-[radial-gradient(ellipse_58%_40%_at_50%_56%,rgba(212,154,113,0.055)_0%,transparent_70%)] before:content-['']">
      <section className="relative z-10 w-full max-w-3xl text-center">
        <p className="text-[13px] font-semibold uppercase tracking-[0.22em] text-[#74675d]">
          Daily Practice
        </p>
        <h1 className="mt-7 font-serif text-[clamp(3.2rem,5.1vw,5.35rem)] font-medium leading-[0.98] tracking-[-0.015em]">
          {greeting}
          <em className="mt-2 block italic text-[#d49a71]">{displayName}.</em>
        </h1>

        <article className="mx-auto mt-16 grid w-full max-w-[520px] grid-cols-[1fr_auto] items-stretch overflow-hidden rounded-[12px] border border-[#6f4630]/45 bg-[#15100d]/95 text-left shadow-[0_22px_80px_rgba(0,0,0,0.36)] transition-colors hover:border-[#916243]/65 hover:bg-[#1a130f]">
          <button
            type="button"
            onClick={onOpenModal}
            className="min-w-0 px-6 py-5 text-left sm:px-7 sm:py-6"
          >
            <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-[#847165]">
              {config.year || "Year 12"} · {subject?.name || config.course}{config.level ? ` · ${config.level}` : ""}
            </span>
            <span className="mt-2 block truncate font-serif text-[26px] font-medium leading-tight text-[#f1e7dd]">
              {topicLine}
            </span>
            <span className="mt-4 flex items-center gap-2 text-[12px] font-medium tracking-[0.03em] text-[#76685e]">
              streak
              <span className="inline-flex gap-1.5">
                {Array.from({ length: streakDots }).map((_, index) => (
                  <span
                    key={index}
                    className={cn(
                      "size-2 rounded-full",
                      index < activeStreak ? "bg-[#d49a71]" : "bg-[#342a24]"
                    )}
                  />
                ))}
              </span>
            </span>
          </button>
          <button
            type="button"
            aria-label="Start daily practice"
            onClick={() => onGenerate("home")}
            disabled={dataLoading}
            className="m-5 flex size-12 items-center justify-center self-center rounded-[9px] border border-[#d49a71]/55 bg-[#d49a71]/78 text-[#120c08] transition-colors hover:bg-[#d49a71]/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {dataLoading ? <Loader2 className="size-5 animate-spin" /> : <ArrowRight className="size-6" />}
          </button>
        </article>
      </section>
    </main>
  )
}

export function Attachment({ attachment }) {
  if (!attachment?.data_url || !attachment?.mime_type?.startsWith("image/")) return null

  return (
    <figure className="mx-auto my-8 max-w-3xl overflow-hidden rounded-[6px] border border-[#2d2926] bg-[#151412]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={attachment.data_url}
        alt={attachment.caption || attachment.name || "Question image"}
        className="mx-auto max-h-[420px] w-full object-contain"
      />
      {(attachment.caption || attachment.name) && (
        <figcaption className="border-t border-[#2d2926] px-4 py-2 text-xs text-[#77716b]">
          {attachment.caption || attachment.name}
        </figcaption>
      )}
    </figure>
  )
}

export function DiagramSvg({ svg }) {
  if (!svg) return null

  return (
    <figure className="mx-auto my-8 flex w-full max-w-3xl justify-center overflow-x-auto">
      <div
        className="flex w-full min-w-0 justify-center text-center [&_svg]:!mx-auto [&_svg]:!block [&_svg]:h-auto [&_svg]:max-h-[420px] [&_svg]:max-w-full [&_svg]:shrink-0"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </figure>
  )
}

function preferredSolution(solutions = []) {
  return solutions.find((solution) => solution.is_preferred) || solutions[0] || null
}

function solutionForMatch(solutions = [], matchedName = "") {
  const normalized = String(matchedName || "").trim().toLowerCase()
  if (normalized) {
    const matched = solutions.find(
      (solution) => String(solution.name || "").trim().toLowerCase() === normalized
    )
    if (matched) return matched
  }
  return preferredSolution(solutions)
}

function sampleAnswersForQuestion(question, markingResult = null) {
  const partAnswers = (question?.parts || [])
    .map((part, index) => {
      const resultPart = (markingResult?.parts || []).find(
        (item) => String(item.label || "").trim().toLowerCase() === String(part.label || "").trim().toLowerCase()
      )
      const solution = solutionForMatch(part.solutions || [], resultPart?.matched_solution)
      return {
        content: String(solution?.sample_solution || part.sample_solution || "").trim(),
        label: solution?.name
          ? `Part ${part.label || String.fromCharCode(97 + index)} — ${solution.name}`
          : `Part ${part.label || String.fromCharCode(97 + index)}`,
      }
    })
    .filter((item) => item.content)

  if (partAnswers.length) return partAnswers

  const rootSolution = solutionForMatch(question?.solutions || [], markingResult?.parts?.[0]?.matched_solution || markingResult?.matched_solution)
  const wholeQuestionAnswer = String(rootSolution?.sample_solution || question?.sample_solution || "").trim()
  return wholeQuestionAnswer
    ? [{ content: wholeQuestionAnswer, label: rootSolution?.name || "Sample answer" }]
    : []
}

export function SampleAnswers({ markingResult = null, question }) {
  const sampleAnswers = sampleAnswersForQuestion(question, markingResult)
  if (!sampleAnswers.length) return null

  return (
    <section className="mt-5 rounded-[3px] border border-[#7c573a]/35 bg-[#17110e] p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#dba476]">
        Sample answers
      </p>
      <div className="mt-4 grid gap-4">
        {sampleAnswers.map((answer) => (
          <article
            key={answer.label}
            className="rounded-[4px] border border-white/[0.06] bg-[#120f0d] p-4"
          >
            <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-[#8f8982]">
              {answer.label}
            </p>
            <MarkdownMath className="text-[13px] leading-relaxed text-[#d8c4b0]">
              {answer.content}
            </MarkdownMath>
          </article>
        ))}
      </div>
    </section>
  )
}

export function MarkingCriteriaSummary({ question }) {
  if (subjectIsMathematics({ name: question?.subject })) return null

  const partRows = (question?.parts || [])
    .map((part, index) => ({
      label: `Part ${part.label || String.fromCharCode(97 + index)}`,
      rows: part.marking_criteria || [],
    }))
    .filter((item) => item.rows.some((row) => String(row.text || "").trim()))

  const rows = partRows.length
    ? partRows
    : [{
        label: "Question",
        rows: question?.marking_criteria || [],
      }].filter((item) => item.rows.some((row) => String(row.text || "").trim()))

  if (!rows.length) return null

  return (
    <section className="mt-5 rounded-[3px] border border-white/[0.06] bg-[#171410] p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8f8982]">
        Marking criteria
      </p>
      <div className="mt-4 grid gap-4">
        {rows.map((group) => (
          <article key={group.label} className="rounded-[4px] border border-white/[0.06] bg-[#120f0d] p-4">
            <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-[#8f8982]">
              {group.label}
            </p>
            <ul className="grid gap-2">
              {group.rows.map((row, index) => (
                <li key={`${row.mark || index}-${row.text}`} className="text-[13px] leading-relaxed text-[#9b8f84]">
                  <span className="text-[#dba476]">{row.mark || index + 1} mark:</span>{" "}
                  <MarkdownMath className="inline-block max-w-full [&_p]:my-0 [&_p]:inline">
                    {row.text || ""}
                  </MarkdownMath>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  )
}

function McqResultCard({ result }) {
  if (!result) return null
  const correct = Boolean(result.correct)
  return (
    <div
      className={cn(
        "mt-5 rounded-[4px] border px-5 py-4 text-[13px] leading-relaxed",
        correct
          ? "border-emerald-400/30 bg-emerald-500/12 text-emerald-100"
          : "border-red-400/30 bg-red-500/10 text-red-100"
      )}
    >
      <p className={cn("flex items-center gap-2 font-serif text-xl", correct ? "text-emerald-200" : "text-red-200")}>
        {correct ? <Check className="size-5" /> : <X className="size-5" />}
        {correct ? "Correct!" : "Incorrect"}
      </p>
      {result.explanation && (
        <MarkdownMath className="mt-3 text-[14px] leading-relaxed text-[#c4b5a8]">
          {result.explanation}
        </MarkdownMath>
      )}
    </div>
  )
}

function SubmittedFilePreview({ files, submissionType = "photo" }) {
  const imageFiles = files.filter((file) => file.mime_type?.startsWith("image/"))
  const pdfFiles = files.filter((file) => file.mime_type === "application/pdf" || file.name?.toLowerCase().endsWith(".pdf"))
  const [activeIndex, setActiveIndex] = useState(0)
  const displayIndex = Math.min(activeIndex, Math.max(imageFiles.length - 1, 0))
  const activeImage = imageFiles[displayIndex]
  const typeLabel = titleCase(submissionType === "file" ? "File" : submissionType)
  const pageLabel = imageFiles.length > 1 ? `Page ${displayIndex + 1} / ${imageFiles.length}` : ""
  const metadata = [typeLabel, pageLabel].filter(Boolean).join(" · ")

  if (!imageFiles.length && !pdfFiles.length) return null

  return (
    <section className="mb-4 rounded-[6px] border border-[#4a3328]/50 bg-[#141210] p-5">
      <div className="mb-3 flex items-center justify-between gap-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8f8982]">
          Your Submission
        </p>
        {metadata && (
          <p className="shrink-0 text-[11px] text-[#5f5953]">
            {metadata}
          </p>
        )}
      </div>
      {activeImage && (
        <div className="rounded-[4px] border border-[#2a2420] bg-[#0f0d0c] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
          <div className="group relative overflow-hidden rounded-t-[4px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeImage.data_url}
              alt={activeImage.name || "Submitted work"}
              className="max-h-[380px] w-full object-contain"
            />
            {imageFiles.length > 1 && (
              <>
                <button
                  type="button"
                  className="absolute left-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-[#3b2a22]/70 bg-[#0f0d0c]/80 text-[#d99658] opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-0"
                  onClick={() => setActiveIndex((index) => Math.max(0, index - 1))}
                  disabled={displayIndex === 0}
                  aria-label="Previous submission image"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  className="absolute right-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-[#3b2a22]/70 bg-[#0f0d0c]/80 text-[#d99658] opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-0"
                  onClick={() => setActiveIndex((index) => Math.min(imageFiles.length - 1, index + 1))}
                  disabled={displayIndex >= imageFiles.length - 1}
                  aria-label="Next submission image"
                >
                  <ChevronRight className="size-4" />
                </button>
              </>
            )}
          </div>
          <p className="truncate border-t border-[#1f1c1a] px-2 py-1.5 text-[11px] text-[#4f4a45]">
            {activeImage.name || "Submitted image"}
          </p>
        </div>
      )}
      {pdfFiles.length > 0 && (
        <div className="mt-3 grid gap-2">
          {pdfFiles.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="flex items-center gap-3 rounded-[3px] border border-[#2d2926] bg-[#111009] px-4 py-3"
            >
              <FileText className="size-4 shrink-0 text-[#8f8982]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-[#b7aca1]">{file.name || "submission.pdf"}</p>
                <p className="mt-0.5 text-[11px] text-[#4f4a45]">{file.mime_type || "application/pdf"}</p>
              </div>
              <a
                href={file.data_url}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-[12px] text-[#dba476] underline-offset-2 hover:text-[#f0c99e] hover:underline"
              >
                Open
              </a>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function AnswerArea({
  betaSampleRevealed,
  markingDisabled,
  markingError,
  markingLoading,
  markingResult,
  onBetaReveal,
  onNextQuestion,
  onSubmit,
  onToggleQuestionLock,
  lockedQuestionHeight = 0,
  question,
  questionId,
  questionLocked,
  selectedMcqOption,
}) {
  const [activeTab, setActiveTab] = useState("type")
  const [typedAnswer, setTypedAnswer] = useState("")
  const [files, setFiles] = useState([])
  const [submitted, setSubmitted] = useState(false)
  const [submittedTab, setSubmittedTab] = useState(null)
  const [submittedFiles, setSubmittedFiles] = useState([])
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [saveFavouriteNotice, setSaveFavouriteNotice] = useState("")
  const [savingFavourite, setSavingFavourite] = useState(false)
  const [favouriteOverride, setFavouriteOverride] = useState(null)
  const handwritingRef = useRef(null)
  const isMcq = question?.question_type === "mcq"
  const locked = submitted && !markingDisabled
  const canMoveNext = Boolean((markingResult || betaSampleRevealed) && !markingLoading)
  const answerTabs = markingDisabled ? ["type", "draw"] : ["type", "draw", "photo"]
  const activeAnswerTab = markingDisabled && activeTab === "photo" ? "type" : activeTab
  const favouriteStatusUrl =
    canMoveNext && questionId ? `${QUESTIONS_API_URL}favourites/${questionId}/exists/` : null
  const {
    data: favouriteStatus,
    mutate: mutateFavouriteStatus,
  } = useSWR(favouriteStatusUrl, fetcher, {
    revalidateOnFocus: false,
  })
  const resolvedFavouriteStatus = favouriteOverride || favouriteStatus || {
    favourited: false,
    note: "",
  }

  useEffect(() => {
    if (activeTab !== "draw" && questionLocked) {
      onToggleQuestionLock?.()
    }
    // Intentionally only runs when activeTab changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  async function addFiles(fileList) {
    if (locked) return
    const nextFiles = await Promise.all(Array.from(fileList || []).map(readFileAsDataUrl))
    setFiles((current) => [...current, ...nextFiles])
  }

  function removeFile(index) {
    if (locked) return
    setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))
  }

  async function submitAnswer() {
    if (canMoveNext) {
      onNextQuestion?.()
      return
    }
    if (locked && !markingDisabled) return
    if (isMcq) {
      if (!selectedMcqOption) {
        onSubmit({})
        return
      }
      setSubmitted(true)
      setSubmittedTab("mcq")
      onSubmit({})
      return
    }
    if (markingDisabled) {
      setSubmitted(true)
      setSubmittedTab(activeAnswerTab)
      onBetaReveal?.()
      return
    }
    setSubmitted(true)
    setSubmittedTab(activeAnswerTab)
    if (activeAnswerTab === "draw" && handwritingRef.current) {
      const exportPayload = await handwritingRef.current.exportAnswer()
      setSubmittedFiles([])
      const formData = new FormData()
      formData.append("submission_type", "draw")
      formData.append("stroke_data", JSON.stringify(exportPayload.stroke_data || {}))
      formData.append("page_metadata", JSON.stringify(
        exportPayload.pages.map(({ blob, ...metadata }) => metadata)
      ))
      exportPayload.pages.forEach((page) => {
        formData.append("files", page.blob, page.filename)
      })
      onSubmit({
        formData,
        submission_type: "draw",
      })
      return
    }

    if (activeAnswerTab === "type") {
      setSubmittedFiles([])
      onSubmit({
        submission_type: "text",
        files: [{
          name: "typed-answer.txt",
          mime_type: "text/plain",
          data_url: typedAnswer.trim(),
          text: typedAnswer.trim(),
        }],
      })
      return
    }

    setSubmittedFiles(files)
    onSubmit({ submission_type: "file", files })
  }

  async function openSaveModal() {
    setSaveFavouriteNotice("")
    if (favouriteStatusUrl) {
      const latest = await mutateFavouriteStatus()
      if (latest) setFavouriteOverride(latest)
    }
    setSaveModalOpen(true)
  }

  function strokeDataHasInk(strokeData) {
    return (strokeData?.pages || []).some((page) =>
      (page?.strokes || []).some((stroke) => (stroke?.points || []).length > 0)
    )
  }

  function canvasHasInk() {
    const pages = handwritingRef.current?.getPages?.() || []
    return pages.some((page) =>
      (page?.strokes || []).some((stroke) => (stroke?.points || []).length > 0)
    )
  }

  async function saveFavourite(note, responsePayload = null) {
    if (!questionId) return
    setSavingFavourite(true)
    try {
      const response = await fetch(`${QUESTIONS_API_URL}favourites/`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          question_id: questionId,
          note,
        }),
      })
      const data = await parseJsonResponse(response)
      if (!response.ok) {
        throw new Error(data.detail || `Could not save this question (HTTP ${response.status}).`)
      }
      const nextStatus = {
        favourited: true,
        note: data.note || note || "",
      }
      if (responsePayload !== null) {
        let responseSubmissionType = null
        let responseText = ""
        let strokeDataToSave = {}

        if (activeAnswerTab === "draw" && handwritingRef.current) {
          const exported = await handwritingRef.current.exportAnswer()
          if (strokeDataHasInk(exported.stroke_data)) {
            responseSubmissionType = "draw"
            strokeDataToSave = exported.stroke_data
          }
        } else if (activeAnswerTab === "type") {
          const trimmedAnswer = typedAnswer.trim()
          if (trimmedAnswer) {
            responseSubmissionType = "text"
            responseText = trimmedAnswer
          } else if (canvasHasInk() && handwritingRef.current) {
            const exported = await handwritingRef.current.exportAnswer()
            if (strokeDataHasInk(exported.stroke_data)) {
              responseSubmissionType = "draw"
              strokeDataToSave = exported.stroke_data
            }
          }
        }

        if (!responseSubmissionType) {
          setFavouriteOverride(nextStatus)
          mutateFavouriteStatus(nextStatus, false)
          setSaveFavouriteNotice("No unique response data to store/save.")
          return
        }

        const responseSave = await fetch(`${QUESTIONS_API_URL}favourites/responses/`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            question_id: questionId,
            submission_type: responseSubmissionType,
            text_response: responseText,
            stroke_data: strokeDataToSave || {},
            marking_result: markingResult || {},
            marks_awarded: markingResult?.marks_awarded ?? null,
            marks_possible: markingResult?.marks_possible ?? null,
            note: responsePayload.note || "",
          }),
        })
        const responseSaveData = await parseJsonResponse(responseSave)
        if (!responseSave.ok) {
          throw new Error(responseSaveData.detail || `Could not save this response (HTTP ${responseSave.status}).`)
        }
      }
      setFavouriteOverride(nextStatus)
      mutateFavouriteStatus(nextStatus, false)
      setSaveModalOpen(false)
    } finally {
      setSavingFavourite(false)
    }
  }

  return (
    <section className="border-t border-white/[0.06] px-6 py-6 md:px-12">
      {isMcq ? (
        <div className="flex justify-end gap-3">
          {canMoveNext && (
            <button
              type="button"
              onClick={openSaveModal}
              className={cn(
                "inline-flex h-11 items-center justify-center gap-3 rounded-[2px] border border-[#9b673d]/42 bg-transparent px-7 text-[12px] font-medium tracking-[0.06em] text-[#dba476] transition-colors hover:border-[#c8864a]/62 hover:bg-[#c8864a]/10 hover:text-[#efbd94]",
                resolvedFavouriteStatus.favourited && "border-[#c8864a]/62 bg-[#c8864a]/12 text-[#efbd94]"
              )}
            >
              <Bookmark
                className={cn(
                  "size-[18px]",
                  resolvedFavouriteStatus.favourited && "fill-current"
                )}
              />
              Save Question
            </button>
          )}
          <button
            type="button"
            disabled={markingLoading || (submitted && !canMoveNext)}
            onClick={submitAnswer}
            className="inline-flex h-11 items-center justify-center gap-3 rounded-[2px] border border-[#9b673d]/42 bg-[#c8864a]/12 px-7 text-[12px] font-medium tracking-[0.06em] text-[#dba476] transition-colors hover:border-[#c8864a]/62 hover:bg-[#c8864a]/18 hover:text-[#efbd94] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {markingLoading ? "Submitting..." : canMoveNext ? "Next Question" : "Submit Answer"}
            {markingLoading ? <Loader2 className="size-[18px] animate-spin" /> : <ArrowRight className="size-[18px]" />}
          </button>
        </div>
      ) : (
      <>
      {markingDisabled && (
        <div className="mb-6 rounded-[4px] border border-[#7c573a]/35 bg-[#1a1511] px-5 py-4 text-[13px] leading-relaxed text-[#c4b5a8]">
          <p className="font-semibold tracking-[0.04em] text-[#dba476]">Marking unavailable</p>
          <p className="mt-2 text-[#9b8f84]">
            AI marking is currently unavailable during beta. Submit to view the sample solution only — no answer is stored and no external marking is requested.
          </p>
        </div>
      )}

      <div className="mb-5 flex gap-8 border-b border-white/[0.06]">
        {answerTabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            disabled={locked}
            className={cn(
              "h-9 border-b text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors",
              activeAnswerTab === tab
                ? "border-[#e8e4dc] text-[#e8e4dc]"
                : "border-transparent text-[#4f4a45] hover:text-[#8f8982]",
              locked && "pointer-events-none opacity-65"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className={activeAnswerTab === "type" ? "block" : "hidden"}>
        <div className="rounded-[3px] border border-white/[0.06] bg-[#1b1713] p-5">
          <textarea
            value={typedAnswer}
            onChange={(event) => setTypedAnswer(event.target.value)}
            readOnly={locked}
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

      <div className={activeAnswerTab === "draw" ? "block" : "hidden"}>
        <HandwritingCanvas
          ref={handwritingRef}
          isVisible={activeAnswerTab === "draw"}
          lockedQuestionHeight={lockedQuestionHeight}
          onToggleQuestionLock={onToggleQuestionLock}
          questionId={questionId}
          questionLocked={questionLocked}
          readOnly={locked}
        />
      </div>

      <div className={activeAnswerTab === "photo" && !markingDisabled ? "block" : "hidden"}>
        <div className="rounded-[3px] border border-white/[0.06] bg-[#1a1714] p-5">
          <label className={cn(
            "flex min-h-36 flex-col items-center justify-center rounded-[3px] border border-dashed border-white/[0.09] px-4 py-8 text-center text-[13px] tracking-[0.04em] text-[#6f6861] transition-colors hover:border-[#9b673d]/45 hover:text-[#dba476]",
            locked ? "pointer-events-none opacity-70" : "cursor-pointer"
          )}>
            <input
              type="file"
              multiple
              accept="image/*,.heic,.heif,.pdf,application/pdf"
              className="sr-only"
              onChange={(event) => {
                addFiles(event.target.files)
                event.target.value = ""
              }}
            />
            Upload images or PDFs of your working
            <span className="mt-2 text-[11px] text-[#4f4a45]">JPG, PNG, HEIC, PDF</span>
          </label>
          {files.length > 0 && (
            <div className="mt-4 grid gap-2">
              {files.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-3 rounded-[3px] border border-white/[0.06] px-3 py-2 text-[12px] text-[#9b8f84]"
                >
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <span className="shrink-0 text-[#4f4a45]">{file.mime_type || "file"}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => removeFile(index)}
                    disabled={locked}
                    className="shrink-0 text-[#6f6861] transition-colors hover:text-[#e8e4dc] disabled:pointer-events-none disabled:opacity-50"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-3">
        {canMoveNext && (
          <button
            type="button"
            onClick={openSaveModal}
            className={cn(
              "inline-flex h-11 items-center justify-center gap-3 rounded-[2px] border border-[#9b673d]/42 bg-transparent px-7 text-[12px] font-medium tracking-[0.06em] text-[#dba476] transition-colors hover:border-[#c8864a]/62 hover:bg-[#c8864a]/10 hover:text-[#efbd94]",
              resolvedFavouriteStatus.favourited && "border-[#c8864a]/62 bg-[#c8864a]/12 text-[#efbd94]"
            )}
          >
            <Bookmark
              className={cn(
                "size-[18px]",
                resolvedFavouriteStatus.favourited && "fill-current"
              )}
            />
            Save Question
          </button>
        )}
        <button
          type="button"
          disabled={markingLoading || (submitted && !canMoveNext)}
          onClick={submitAnswer}
          className="inline-flex h-11 items-center justify-center gap-3 rounded-[2px] border border-[#9b673d]/42 bg-[#c8864a]/12 px-7 text-[12px] font-medium tracking-[0.06em] text-[#dba476] transition-colors hover:border-[#c8864a]/62 hover:bg-[#c8864a]/18 hover:text-[#efbd94] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {markingLoading ? "Marking..." : canMoveNext ? "Next Question" : "Submit Answer"}
          {markingLoading ? <Loader2 className="size-[18px] animate-spin" /> : <ArrowRight className="size-[18px]" />}
        </button>
      </div>

      {(markingError || markingResult) && (
        <>
          <div className="mt-5 rounded-[3px] border border-white/[0.06] bg-[#1a1714] p-5">
            {markingResult && submittedTab === "photo" && submittedFiles.length > 0 && (
              <SubmittedFilePreview files={submittedFiles} submissionType={submittedTab} />
            )}
            {markingError && (
              <div className="flex items-center gap-4">
                <p className="flex-1 text-[13px] text-[#d99658]">{markingError}</p>
                {!submitted && (
                  <button
                    type="button"
                    onClick={submitAnswer}
                    className="shrink-0 text-[12px] font-medium text-[#dba476] underline underline-offset-2"
                  >
                    Try again
                  </button>
                )}
              </div>
            )}
            {markingResult && (
              <div className="grid gap-4">
                <div className="flex flex-wrap items-center gap-3 text-[13px] text-[#b7aca1]">
                  <span className="font-serif text-[22px] text-[#eee9e4]">
                    {markingResult.marks_awarded}/{markingResult.marks_possible}
                  </span>
                  <span className="text-[#4f4a45]">marks</span>
                </div>
                {(markingResult.feedback || markingResult.next_step_advice) && (
                  <div className="rounded-[4px] border border-white/[0.06] bg-[#120f0d] px-4 py-3">
                    {markingResult?.marking_parse_failed && (
                      <p className="text-[13px] text-[#d99658]">
                        Marking could not be scored for this response - see the sample answer below.
                      </p>
                    )}
                    {markingResult.feedback && (
                      <MarkdownMath className="text-[13px] leading-relaxed text-[#b7aca1] [&_.katex]:text-[#e8e4dc] [&_p]:my-0">
                        {markingResult.feedback}
                      </MarkdownMath>
                    )}
                    {markingResult.next_step_advice && (
                      <MarkdownMath className="mt-2 text-[13px] leading-relaxed text-[#dba476] [&_.katex]:text-[#f0d8ba] [&_p]:my-0">
                        {markingResult.next_step_advice}
                      </MarkdownMath>
                    )}
                  </div>
                )}
                {markingResult?.ocr_empty && (
                  <div className="rounded-[3px] border border-[#d99658]/25 bg-[#d99658]/8 p-5">
                    <p className="text-[13px] text-[#d99658]">
                      No handwriting detected - your canvas may have been blank. Try resubmitting or switch to the Photo tab.
                    </p>
                  </div>
                )}
                {markingResult?.ocr_failed && (
                  <div className="rounded-[3px] border border-[#d99658]/25 bg-[#d99658]/8 p-5">
                    <p className="text-[13px] font-semibold text-[#d99658]">
                      Handwriting not recognised
                    </p>
                    <p className="mt-1 text-[13px] text-[#9b8f84]">
                      Your working was received but couldn&apos;t be read clearly. Try resubmitting, or switch to the Photo tab for a clearer image.
                    </p>
                  </div>
                )}
                {markingResult.marks_awarded < markingResult.marks_possible &&
                  (markingResult.parts || []).map((part) => {
                    const rawSilly = part.silly_mistakes || []
                    const rawGaps = part.knowledge_gaps || []
                    const sillymistakes = rawSilly.map(normaliseSillyMistake)
                    const knowledgeGaps = rawGaps.map(normaliseKnowledgeGap)
                    const hasSilly = sillymistakes.length > 0
                    const hasGaps = knowledgeGaps.length > 0
                    const criteriaFeedback = String(part.criteria_feedback || "").trim()
                    if (!criteriaFeedback && !hasSilly && !hasGaps) return null

                    return (
                      <div key={part.label} className="grid gap-3">
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
                              {sillymistakes.map((item) => (
                                <li key={`${item.label}-${item.number}`} className="flex items-start gap-3 px-3 py-2.5">
                                  <span
                                    className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[3px] text-[10px] font-bold"
                                    style={{
                                      backgroundColor: "rgba(200,134,74,0.85)",
                                      color: "#120c08",
                                    }}
                                  >
                                    {item.number}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 text-[12px]">
                                      {item.score !== null ? (
                                        <TagWithLatex
                                          name={item.label}
                                          className="font-semibold text-[#dba476]"
                                        />
                                      ) : (
                                        <span className="font-semibold text-[#dba476]">{item.label}</span>
                                      )}
                                      {item.score !== null && (
                                        <span className="text-[#5b5048]">
                                          {item.score}/{item.maxScore}
                                        </span>
                                      )}
                                    </div>
                                    <p className="mt-0.5 text-[12px] leading-relaxed text-[#9b8f84]">
                                      {item.description}
                                    </p>
                                    {item.latex && (
                                      <MarkdownMath className="mt-2 rounded-[3px] border border-[#c8864a]/15 bg-[#120f0d]/70 px-2.5 py-2 text-[13px] leading-relaxed text-[#d8c4b0] [&_.katex]:text-[#efd0b2] [&_p]:my-0">
                                        {item.latex}
                                      </MarkdownMath>
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
                                      <TagWithLatex
                                        name={item.label}
                                        className="font-semibold text-[#c98282]"
                                      />
                                    ) : (
                                      <span className="font-semibold text-[#c98282]">{item.label}</span>
                                    )}
                                    {item.score !== null && (
                                      <span className="text-[#7f5555]">
                                        {item.score}/{item.maxScore}
                                      </span>
                                    )}
                                  </div>
                                  {item.description && (
                                    <p className="mt-1 pl-4 text-[12px] leading-relaxed text-[#9b6f6f]">
                                      {item.description}
                                    </p>
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
            )}
          </div>
        </>
      )}
      {(markingResult || betaSampleRevealed) && (
        <>
          <SampleAnswers markingResult={markingResult} question={question} />
          <MarkingCriteriaSummary question={question} />
          {betaSampleRevealed && sampleAnswersForQuestion(question, markingResult).length === 0 && (
            <div className="mt-5 rounded-[3px] border border-white/[0.06] bg-[#1a1714] p-5 text-[13px] leading-relaxed text-[#9b8f84]">
              <p className="font-semibold text-[#dba476]">Sample solution</p>
              <p className="mt-2">
                There is no sample solution on file for this question yet. Ask your coordinator to add one in the
                question editor.
              </p>
            </div>
          )}
        </>
      )}
      </>
      )}
      {saveModalOpen && (
        <SaveQuestionModal
          canSaveResponse={canMoveNext && !isMcq && (activeAnswerTab === "type" || activeAnswerTab === "draw")}
          existingNote={resolvedFavouriteStatus.note || ""}
          favourited={Boolean(resolvedFavouriteStatus.favourited)}
          loading={savingFavourite}
          markingResult={markingResult}
          marksAwarded={markingResult?.marks_awarded ?? null}
          marksPossible={markingResult?.marks_possible ?? null}
          notice={saveFavouriteNotice}
          onClose={() => setSaveModalOpen(false)}
          onSave={saveFavourite}
          strokeData={null}
          submissionType={activeAnswerTab === "draw" ? "draw" : activeAnswerTab === "type" ? "text" : null}
          textResponse={activeAnswerTab === "type" ? typedAnswer : null}
        />
      )}
    </section>
  )
}

function QuestionView({
  betaSampleRevealed,
  config,
  loading,
  markingDisabled,
  markingError,
  markingLoading,
  markingResult,
  onBack,
  onBetaReveal,
  onNextQuestion,
  onSelectMcqOption,
  onSubmitAnswer,
  practiceAttemptKey,
  question,
  selectedMcqOption,
  timer,
}) {
  const questionSectionRef = useRef(null)
  const [questionLocked, setQuestionLocked] = useState(false)
  const [lockedQuestionHeight, setLockedQuestionHeight] = useState(0)

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setQuestionLocked(false)
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [question?.id])

  useEffect(() => {
    let frameId = requestAnimationFrame(() => {
      const el = questionSectionRef.current
      setLockedQuestionHeight(
        questionLocked && el ? el.getBoundingClientRect().height : 0
      )
    })

    if (!questionLocked) {
      return () => cancelAnimationFrame(frameId)
    }

    const el = questionSectionRef.current
    if (!el) {
      return () => cancelAnimationFrame(frameId)
    }

    const measure = () => {
      cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(() => {
        setLockedQuestionHeight(el.getBoundingClientRect().height)
      })
    }

    const ro = new ResizeObserver(measure)
    ro.observe(el)

    return () => {
      cancelAnimationFrame(frameId)
      ro.disconnect()
    }
  }, [questionLocked])

  if (loading) {
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
          onClick={onBack}
          className="absolute left-8 top-24 inline-flex items-center gap-2 text-[15px] font-semibold text-[#4f4a45] hover:text-[#8f8982]"
        >
          <ArrowLeft className="size-[18px]" />
          Back
        </button>
        <p className="text-center font-serif text-3xl italic text-[#77716b]">
          Looks like this course hasn&apos;t been set up yet.
        </p>
      </main>
    )
  }

  const isMcq = question.question_type === "mcq"
  const metadata = [
    config.year,
    config.course,
    ...config.topicNames,
    question.level ? levelLabel(question.level) : null,
    isMcq ? "MCQ" : config.type,
  ].filter(Boolean)
  const levelBadge = question.level ? levelLabel(question.level) : null
  const hasHint = (question.hints || []).some((hint) => hint.text) ||
    (question.parts || []).some((part) => (part.hints || []).some((hint) => hint.text))
  const displayQuestionText = question.question_text?.trim()
    ? (/^Q\)\./i.test(question.question_text.trim()) ? question.question_text : `Q). ${question.question_text}`)
    : ""

  return (
    <main className="min-h-[calc(100vh-64px)] bg-[#171412] text-[#eee9e4]">
      <div className="border-b border-white/[0.06] px-6 py-5 md:px-12">
        <button
          type="button"
          onClick={onBack}
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
                className={cn(
                  "rounded-[2px] border border-white/[0.06] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#4f4a45]",
                  (config.topicNames.includes(item) || item === levelBadge) && "border-[#7c573a]/70 bg-[#c8864a]/10 text-[#d99658]"
                )}
              >
                {item}
              </span>
            ))}
          </div>
          <div className="mr-8 flex flex-col items-end gap-2 text-[13px] text-[#9b8f84] lg:mr-20">
            <span className="flex items-center gap-4">
              <span>{question.marks || 0} marks</span>
              <span className="text-[#5b5048]">·</span>
              <span className="inline-flex items-center gap-2">
                <span className="size-1.5 animate-pulse rounded-full" style={{ backgroundColor: AMBER }} />
                {formatTimer(timer)}
              </span>
            </span>
          </div>
        </div>
      </div>

      <section
        ref={questionSectionRef}
        className={cn(
          "px-6 py-16 md:px-12",
          questionLocked && [
            "sticky top-[64px] z-30 max-h-[45vh] overflow-y-auto",
            "border-y border-[#d49a71]/20 bg-[#171412] shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-sm",
          ]
        )}
      >
        <article className="grid gap-8 font-serif lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="min-w-0">
            <div className="flex items-start gap-4">
              <MarkdownMath className="font-serif text-[19px] leading-[1.75] md:text-[21px]">
                {displayQuestionText}
              </MarkdownMath>
              {hasHint && (
                <span className="mt-1.5 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#3c322b] bg-[#17110e] px-2.5 py-1 text-[11px] font-medium tracking-[0.04em] text-[#6f6258]">
                  <Lightbulb className="size-3.5" />
                  hint
                </span>
              )}
            </div>
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
                  const answerLetter = option.answer_letter || option.letter || String.fromCharCode(65 + index)
                  const displayLetter = option.display_letter || String.fromCharCode(65 + index)
                  const selected = selectedMcqOption === answerLetter
                  const submitted = Boolean(markingResult)
                  const correct = submitted && markingResult.correct_option === answerLetter
                  const incorrectSelection = submitted && markingResult.selected_option === answerLetter && !markingResult.correct
                  return (
                    <button
                      className={cn(
                        "flex min-w-0 items-center gap-4 rounded-[6px] border px-5 py-5 text-left transition-colors",
                        selected && !submitted && "border-[#c8864a]/55 bg-[#c8864a]/10",
                        !selected && !submitted && "border-white/[0.07] bg-[#211d19] hover:border-[#7c573a]/45",
                        correct && "border-emerald-400/40 bg-emerald-500/12",
                        incorrectSelection && "border-red-400/35 bg-red-500/10",
                        submitted && !correct && !incorrectSelection && "border-white/[0.07] bg-[#211d19]"
                      )}
                      disabled={submitted}
                      key={`${option.id || answerLetter}-${displayLetter}`}
                      type="button"
                      onClick={() => onSelectMcqOption(answerLetter)}
                    >
                      <span
                        className={cn(
                          "inline-flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
                          selected || correct
                            ? "border-[#9cc878]/70 text-[#9cc878]"
                            : "border-white/[0.08] text-[#6f6861]",
                          incorrectSelection && "border-red-300/60 text-red-200"
                        )}
                      >
                        {displayLetter}
                      </span>
                      <MarkdownMath className="font-serif text-[17px] leading-relaxed text-[#d8d0c8] md:text-[18px]">
                        {option.text}
                      </MarkdownMath>
                    </button>
                  )
                })}
                <McqResultCard result={markingResult} />
                {markingError && (
                  <p className="rounded-[4px] border border-[#d99658]/25 bg-[#d99658]/10 px-4 py-3 text-[13px] text-[#d99658]">
                    {markingError}
                  </p>
                )}
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

      <AnswerArea
        key={`${question.id}-${practiceAttemptKey}`}
        betaSampleRevealed={betaSampleRevealed}
        markingDisabled={markingDisabled}
        markingError={markingError}
        markingLoading={markingLoading}
        markingResult={markingResult}
        lockedQuestionHeight={lockedQuestionHeight}
        onBetaReveal={onBetaReveal}
        onNextQuestion={onNextQuestion}
        onToggleQuestionLock={() => setQuestionLocked((value) => !value)}
        onSubmit={onSubmitAnswer}
        question={question}
        questionId={question.id}
        questionLocked={questionLocked}
        selectedMcqOption={selectedMcqOption}
      />
    </main>
  )
}

export default function DailyPracticePage() {
  const params = useParams()
  const auth = useAuth()
  const [mode, setMode] = useState("home")
  const [modalOpen, setModalOpen] = useState(false)
  const [config, setConfig] = useState(null)
  const [question, setQuestion] = useState(null)
  const [questionLoading, setQuestionLoading] = useState(false)
  const [arrivalSource, setArrivalSource] = useState("home")
  const [timer, setTimer] = useState(0)
  const [markingLoading, setMarkingLoading] = useState(false)
  const [markingResult, setMarkingResult] = useState(null)
  const [markingError, setMarkingError] = useState("")
  const [betaSampleRevealed, setBetaSampleRevealed] = useState(false)
  const [selectedMcqOption, setSelectedMcqOption] = useState("")
  const [practiceAttemptKey, setPracticeAttemptKey] = useState(0)

  const membership = auth.subjectMemberships?.find(
    (item) => item.subject.slug === params.slug
  )
  const subject = membership?.subject
  const subjectId = subject?.id

  const markingDisabled = auth.markingSystemEnabled === false

  const tagsKey = subjectId ? `${TAGS_API_URL}?subject_id=${subjectId}` : null
  const { data: tags = [], isLoading: tagsLoading } = useSWR(
    tagsKey,
    fetcher
  )
  const buckets = useMemo(() => splitTags(tags), [tags])

  const publishedQuestionsUrl = useMemo(() => {
    if (!subjectId) return null
    const p = new URLSearchParams({
      subject_id: String(subjectId),
      moderation_status: "published",
      limit: "800",
      offset: "0",
      expand: "full",
    })
    if (config) {
      const ids = configTagIds(config, buckets)
      if (ids.length) p.set("all_tag_ids", ids.join(","))
      if (config.type) p.set("question_type", config.type.toLowerCase())
      if (config.level) p.set("level", levelValue(config.level))
    }
    return `${QUESTIONS_API_URL}?${p.toString()}`
  }, [subjectId, config, buckets])

  const { data: questionsPayload, isLoading: questionsLoading } = useSWR(publishedQuestionsUrl, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 120_000,
  })

  const questions = useMemo(
    () => unwrapQuestions(questionsPayload),
    [questionsPayload]
  )
  const dataLoading = Boolean(tagsLoading || questionsLoading || (subjectId && (!tagsKey || !publishedQuestionsUrl)))

  useEffect(() => {
    if (!subjectId || !tagsKey || !publishedQuestionsUrl) return
    preload(tagsKey, fetcher)
    preload(publishedQuestionsUrl, fetcher)
  }, [publishedQuestionsUrl, subjectId, tagsKey])

  useEffect(() => {
    if (!subject) return
    const fallback = defaultConfig(subject)
    const timeout = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(storageKey(params.slug))
        const parsed = saved ? JSON.parse(saved) : {}
        const migrated = {
          ...parsed,
          level: parsed.level || parsed.difficulty || "",
        }
        delete migrated.difficulty
        setConfig(saved ? { ...fallback, ...migrated, course: subject.name } : fallback)
      } catch {
        setConfig(fallback)
      }
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [params.slug, subject])

  useEffect(() => {
    if (!config || !params.slug) return
    window.localStorage.setItem(storageKey(params.slug), JSON.stringify(config))
  }, [config, params.slug])

  useEffect(() => {
    if (mode !== "question") return
    const interval = window.setInterval(() => setTimer((value) => value + 1), 1000)
    return () => window.clearInterval(interval)
  }, [mode])

  const loadQuestion = useCallback(async () => {
    if (!config) return
    if (questionsLoading || tagsLoading) return
    setQuestionLoading(true)
    setTimer(0)
    try {
      const matchingQuestion = randomItem(
        questions.filter((item) => questionMatchesConfig(item, config, buckets))
      )
      if (!matchingQuestion) {
        setQuestion(null)
        setPracticeAttemptKey((value) => value + 1)
        return
      }
      const nextQuestion = { ...matchingQuestion }
      if (nextQuestion.question_type === "mcq") {
        nextQuestion.mcq_options = optionsForPracticeDisplay(
          nextQuestion.mcq_options || [],
          Boolean(nextQuestion.shuffle_options)
        )
      }
      setQuestion(nextQuestion)
      setPracticeAttemptKey((value) => value + 1)
      setMarkingResult(null)
      setMarkingError("")
      setBetaSampleRevealed(false)
      setSelectedMcqOption("")
    } finally {
      setQuestionLoading(false)
    }
  }, [buckets, config, questions, questionsLoading, tagsLoading])

  async function generate(source) {
    setArrivalSource(source)
    setModalOpen(false)
    setMode("question")
    if (questionsLoading || tagsLoading) {
      setQuestionLoading(true)
      return
    }
    await loadQuestion()
  }

  useEffect(() => {
    if (mode !== "question" || !questionLoading) return
    if (questionsLoading || tagsLoading) return
    const timeout = window.setTimeout(() => {
      loadQuestion()
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [loadQuestion, mode, questionLoading, questionsLoading, tagsLoading])

  function backFromQuestion() {
    setMode("home")
    if (arrivalSource === "modal") setModalOpen(true)
  }

  function revealBetaSample() {
    setBetaSampleRevealed(true)
    setMarkingResult(null)
    setMarkingError("")
  }

  async function submitAnswer(payload) {
    if (!question?.id) return
    if (question.question_type === "mcq") {
      if (!selectedMcqOption) {
        setMarkingError("Choose one answer option before submitting.")
        return
      }
      setMarkingLoading(true)
      setMarkingError("")
      setMarkingResult(null)
      try {
        const response = await fetch(`${QUESTIONS_API_URL}${question.id}/mcq/submit/`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ selected_option: selectedMcqOption }),
        })
        const data = await parseJsonResponse(response)
        if (!response.ok) {
          throw new Error(data.detail || `Could not submit this answer (HTTP ${response.status}).`)
        }
        setMarkingResult(data)
      } catch (error) {
        setMarkingError(error.message || "Could not submit this answer.")
      } finally {
        setMarkingLoading(false)
      }
      return
    }
    if (markingDisabled) {
      return
    }
    setMarkingLoading(true)
    setMarkingError("")
    setMarkingResult(null)
    try {
      const isMultipart = payload?.formData instanceof FormData
      const response = await fetch(`${QUESTIONS_API_URL}${question.id}/${isMultipart ? "mark/upload/" : "mark/"}`, {
        method: "POST",
        credentials: "include",
        headers: isMultipart
          ? { Accept: "application/json" }
          : {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
        body: isMultipart ? payload.formData : JSON.stringify(payload),
      })
      const data = await parseJsonResponse(response)
      if (!response.ok) {
        const hint =
          response.status === 502 || response.status === 504
            ? "Marking timed out - the question may be complex. Try submitting again."
            : data.detail ||
              data.message ||
              (typeof data.error === "string" ? data.error : null)
        throw new Error(
          hint || `Could not mark this response (HTTP ${response.status}).`
        )
      }
      setMarkingResult(data)
    } catch (error) {
      setMarkingError(error.message || "Could not mark this response.")
    } finally {
      setMarkingLoading(false)
    }
  }

  if (!config) {
    return (
      <main className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-[#16130f] text-[#8f8982]">
        <Loader2 className="size-8 animate-spin" />
      </main>
    )
  }

  return (
    <>
      {mode === "home" && (
        <PracticeHome
          config={config}
          dataLoading={dataLoading}
          onGenerate={generate}
          onOpenModal={() => setModalOpen(true)}
          subject={subject}
          userName={auth.username}
        />
      )}

      {mode === "question" && (
        <QuestionView
          betaSampleRevealed={betaSampleRevealed}
          config={config}
          loading={questionLoading}
          markingDisabled={markingDisabled}
          markingError={markingError}
          markingLoading={markingLoading}
          markingResult={markingResult}
          onBack={backFromQuestion}
          onBetaReveal={revealBetaSample}
          onNextQuestion={loadQuestion}
          onSelectMcqOption={(letter) => {
            setSelectedMcqOption(letter)
            setMarkingError("")
          }}
          onSubmitAnswer={submitAnswer}
          practiceAttemptKey={practiceAttemptKey}
          question={question}
          selectedMcqOption={selectedMcqOption}
          timer={timer}
        />
      )}

      {modalOpen && (
        <PracticeModal
          buckets={buckets}
          config={config}
          dataLoading={dataLoading}
          onChange={setConfig}
          onClose={() => setModalOpen(false)}
          onGenerate={generate}
          subject={subject}
        />
      )}
    </>
  )
}
