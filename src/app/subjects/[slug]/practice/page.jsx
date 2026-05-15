"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"
import ReactMarkdown from "react-markdown"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import useSWR from "swr"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Keyboard,
  Lightbulb,
  Loader2,
  Sigma,
  X,
} from "lucide-react"

import HandwritingCanvas from "@/components/answering/HandwritingCanvas"
import { useAuth } from "@/components/authProvider"
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
  { id: "difficulty", label: "Difficulty" },
  { id: "type", label: "Type" },
]

const difficultyOptions = ["Foundation", "Intermediate", "Advanced"]
const typeOptions = ["SAQ", "MCQ", "Extended Response"]

function titleCase(value = "") {
  return value
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
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
    difficulty: "Intermediate",
    type: "SAQ",
  }
}

function configTagIds(config, buckets) {
  const selectedTopicIds = new Set(config.topicIds || [])
  const selectedTopicNames = new Set((config.topicNames || []).map(normalize))

  return buckets.topics
    .filter((tag) => selectedTopicIds.has(tag.id) || selectedTopicNames.has(normalize(tag.name)))
    .map((tag) => tag.id)
}

function randomItem(items) {
  if (!items.length) return null
  return items[Math.floor(Math.random() * items.length)]
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

function MarkdownMath({ children, className }) {
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
    config.difficulty && { key: "difficulty", label: config.difficulty, type: "difficulty" },
    config.type && { key: "type", label: config.type, type: "type" },
  ].filter(Boolean)

  function removeChip(chip) {
    if (chip.type === "year") onChange({ ...config, year: "" })
    else if (chip.type === "difficulty") onChange({ ...config, difficulty: "" })
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
                  (section.id === "difficulty" && config.difficulty) ||
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

            {activeSection === "difficulty" && (
              <div className="flex flex-wrap gap-2">
                {difficultyOptions.map((option) => (
                  <OptionButton
                    key={option}
                    active={config.difficulty === option}
                    onClick={() => onChange({ ...config, difficulty: option })}
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
                    onClick={() => onChange({ ...config, type: option })}
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
            className="h-12 rounded-[8px] border border-[#d49a71]/45 bg-[#d49a71]/16 px-9 font-serif text-[20px] font-semibold tracking-normal text-[#e6b083] shadow-[0_12px_38px_rgba(0,0,0,0.22)] transition-colors hover:border-[#d49a71]/70 hover:bg-[#d49a71]/24 hover:text-[#f1c39e]"
          >
            Generate
          </button>
        </footer>
      </section>
    </div>
  )
}

function PracticeHome({ config, onGenerate, onOpenModal, subject, userName }) {
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
              {config.year || "Year 12"} · {subject?.name || config.course} · {config.difficulty || "Intermediate"}
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
            className="m-5 flex size-12 items-center justify-center self-center rounded-[9px] border border-[#d49a71]/55 bg-[#d49a71]/78 text-[#120c08] transition-colors hover:bg-[#d49a71]/90"
          >
            <ArrowRight className="size-6" />
          </button>
        </article>
      </section>
    </main>
  )
}

function Attachment({ attachment }) {
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

function DiagramSvg({ svg }) {
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

function sampleAnswersForQuestion(question) {
  const partAnswers = (question?.parts || [])
    .map((part, index) => ({
      content: String(part.sample_solution || "").trim(),
      label: `Part ${part.label || String.fromCharCode(97 + index)}`,
    }))
    .filter((item) => item.content)

  if (partAnswers.length) return partAnswers

  const wholeQuestionAnswer = String(question?.sample_solution || "").trim()
  return wholeQuestionAnswer
    ? [{ content: wholeQuestionAnswer, label: "Sample answer" }]
    : []
}

function SampleAnswers({ question }) {
  const sampleAnswers = sampleAnswersForQuestion(question)
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

function MarkingCriteriaSummary({ question }) {
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

function AnswerArea({
  betaSampleRevealed,
  markingDisabled,
  markingError,
  markingLoading,
  markingResult,
  onBetaReveal,
  onSubmit,
  onToggleQuestionLock,
  lockedQuestionHeight = 0,
  question,
  questionId,
  questionLocked,
}) {
  const [activeTab, setActiveTab] = useState("type")
  const [typedAnswer, setTypedAnswer] = useState("")
  const [files, setFiles] = useState([])
  const handwritingRef = useRef(null)
  const isMcq = question?.question_type === "mcq"

  useEffect(() => {
    if (activeTab !== "draw" && questionLocked) {
      onToggleQuestionLock?.()
    }
    // Intentionally only runs when activeTab changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  async function addFiles(fileList) {
    const nextFiles = await Promise.all(Array.from(fileList || []).map(readFileAsDataUrl))
    setFiles((current) => [...current, ...nextFiles])
  }

  function removeFile(index) {
    setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))
  }

  async function submitAnswer() {
    if (isMcq) {
      onSubmit({})
      return
    }
    if (markingDisabled) {
      onBetaReveal?.()
      return
    }
    if (activeTab === "draw" && handwritingRef.current) {
      const exportPayload = await handwritingRef.current.exportAnswer()
      onSubmit({
        files: exportPayload.pages.map((page) => ({
          name: `handwriting-page-${page.page_number}.png`,
          mime_type: "image/png",
          data_url: page.page_image,
        })),
        submission_type: "draw",
      })
      return
    }

    if (activeTab === "type") {
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

    onSubmit({ submission_type: "file", files })
  }

  return (
    <section className="border-t border-white/[0.06] px-6 py-6 md:px-12">
      {isMcq ? (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={markingLoading}
            onClick={submitAnswer}
            className="inline-flex h-11 items-center justify-center gap-3 rounded-[2px] border border-[#9b673d]/42 bg-[#c8864a]/12 px-7 text-[12px] font-medium tracking-[0.06em] text-[#dba476] transition-colors hover:border-[#c8864a]/62 hover:bg-[#c8864a]/18 hover:text-[#efbd94] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {markingLoading ? "Submitting..." : "Submit Answer"}
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

      {!markingDisabled && (
      <div className="mb-5 flex gap-8 border-b border-white/[0.06]">
        {["type", "draw", "photo"].map((tab) => (
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
      )}

      {markingDisabled ? (
        <div className="rounded-[3px] border border-white/[0.06] bg-[#1b1713] px-5 py-6 text-[13px] leading-relaxed text-[#7a726b]">
          When you are ready, use Submit Answer to reveal the sample solution. Your working is not saved during beta.
        </div>
      ) : activeTab === "type" ? (
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
      ) : activeTab === "draw" ? (
        <HandwritingCanvas
          ref={handwritingRef}
          lockedQuestionHeight={lockedQuestionHeight}
          onToggleQuestionLock={onToggleQuestionLock}
          questionId={questionId}
          questionLocked={questionLocked}
        />
      ) : activeTab === "photo" ? (
        <div className="rounded-[3px] border border-white/[0.06] bg-[#1a1714] p-5">
          <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-[3px] border border-dashed border-white/[0.09] px-4 py-8 text-center text-[13px] tracking-[0.04em] text-[#6f6861] transition-colors hover:border-[#9b673d]/45 hover:text-[#dba476]">
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
                    className="shrink-0 text-[#6f6861] transition-colors hover:text-[#e8e4dc]"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-44 items-center justify-center rounded-[3px] border border-white/[0.06] bg-[#1a1714] text-[13px] tracking-[0.04em] text-[#4f4a45]">
          {titleCase(activeTab)} tools are coming soon.
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          disabled={markingLoading}
          onClick={submitAnswer}
          className="inline-flex h-11 items-center justify-center gap-3 rounded-[2px] border border-[#9b673d]/42 bg-[#c8864a]/12 px-7 text-[12px] font-medium tracking-[0.06em] text-[#dba476] transition-colors hover:border-[#c8864a]/62 hover:bg-[#c8864a]/18 hover:text-[#efbd94] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {markingLoading ? "Marking..." : "Submit Answer"}
          {markingLoading ? <Loader2 className="size-[18px] animate-spin" /> : <ArrowRight className="size-[18px]" />}
        </button>
      </div>

      {(markingError || markingResult) && (
        <>
          <div className="mt-5 rounded-[3px] border border-white/[0.06] bg-[#1a1714] p-5">
            {markingError && (
              <p className="text-[13px] text-[#d99658]">{markingError}</p>
            )}
            {markingResult && (
              <div className="grid gap-4">
              <div className="flex flex-wrap items-center gap-3 text-[13px] text-[#b7aca1]">
                <span className="font-serif text-[22px] text-[#eee9e4]">
                  {markingResult.marks_awarded}/{markingResult.marks_possible}
                </span>
                <span className="text-[#4f4a45]">question marks</span>
                {Number(markingResult.tag_score_possible || 0) > 0 && (
                  <>
                    <span className="text-[#5b5048]">·</span>
                    <span>{markingResult.tag_score}/{markingResult.tag_score_possible} tag score</span>
                  </>
                )}
              </div>
              {(markingResult.feedback || markingResult.next_step_advice) && (
                <div className="grid gap-3 rounded-[4px] border border-white/[0.06] bg-[#120f0d] p-3 text-[13px] leading-relaxed text-[#b7aca1]">
                  {markingResult.feedback && (
                    <MarkdownMath className="text-[13px] leading-relaxed text-[#b7aca1] [&_.katex]:text-[#e8e4dc]">
                      {markingResult.feedback}
                    </MarkdownMath>
                  )}
                  {markingResult.next_step_advice && (
                    <MarkdownMath className="text-[13px] leading-relaxed text-[#dba476] [&_.katex]:text-[#f0d8ba]">
                      {markingResult.next_step_advice}
                    </MarkdownMath>
                  )}
                </div>
              )}
              {(markingResult.parts || []).map((part) => (
                <div key={part.label} className="border-t border-white/[0.06] pt-4">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#8f8982]">
                    {part.label}: {part.marks_awarded}/{part.marks_possible} marks
                  </p>
                  {part.marks_awarded < part.marks_possible && part.lost_tags?.length > 0 && (
                    <ul className="mt-3 grid gap-2">
                      {part.lost_tags.map((item) => (
                        <li key={item.tag} className="text-[13px] leading-relaxed text-[#9b8f84]">
                          <span className="text-[#dba476]">{item.tag}</span>
                          <span className="text-[#5b5048]">
                            {" "}
                            {item.score}/{item.max_score}:{" "}
                          </span>
                          <MarkdownMath className="inline-block max-w-full text-[13px] leading-relaxed [&_.katex]:text-[#cfc3b8] [&_p]:my-0 [&_p]:inline">
                            {item.reason || ""}
                          </MarkdownMath>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              </div>
            )}
          </div>
        </>
      )}
      {(markingResult || betaSampleRevealed) && (
        <>
          <SampleAnswers question={question} />
          <MarkingCriteriaSummary question={question} />
          {betaSampleRevealed && sampleAnswersForQuestion(question).length === 0 && (
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
  onSelectMcqOption,
  onSubmitAnswer,
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
    config.difficulty,
    isMcq ? "MCQ" : config.type,
  ].filter(Boolean)
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
                  config.topicNames.includes(item) && "border-[#7c573a]/70 bg-[#c8864a]/10 text-[#d99658]"
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
        betaSampleRevealed={betaSampleRevealed}
        markingDisabled={markingDisabled}
        markingError={markingError}
        markingLoading={markingLoading}
        markingResult={markingResult}
        lockedQuestionHeight={lockedQuestionHeight}
        onBetaReveal={onBetaReveal}
        onToggleQuestionLock={() => setQuestionLocked((value) => !value)}
        onSubmit={onSubmitAnswer}
        question={question}
        questionId={question.id}
        questionLocked={questionLocked}
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

  const membership = auth.subjectMemberships?.find(
    (item) => item.subject.slug === params.slug
  )
  const subject = membership?.subject
  const subjectId = subject?.id

  const markingDisabled = auth.markingSystemEnabled === false

  const { data: tags = [] } = useSWR(
    subjectId ? `${TAGS_API_URL}?subject_id=${subjectId}` : null,
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
    })
    if (config) {
      const ids = configTagIds(config, buckets)
      if (ids.length) p.set("all_tag_ids", ids.join(","))
    }
    return `${QUESTIONS_API_URL}?${p.toString()}`
  }, [subjectId, config, buckets])

  const { data: questionsPayload } = useSWR(publishedQuestionsUrl, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 120_000,
  })

  const questions = useMemo(
    () => questionsPayload?.results ?? questionsPayload ?? [],
    [questionsPayload]
  )

  useEffect(() => {
    if (!subject) return
    const fallback = defaultConfig(subject)
    const timeout = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(storageKey(params.slug))
        setConfig(saved ? { ...fallback, ...JSON.parse(saved), course: subject.name } : fallback)
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
    setQuestionLoading(true)
    setTimer(0)
    try {
      const matchingQuestion = randomItem(questions)
      if (!matchingQuestion) {
        setQuestion(null)
        return
      }
      const detail = await fetcher(`${QUESTIONS_API_URL}${matchingQuestion.id}/`)
      if (detail.question_type === "mcq") {
        detail.mcq_options = optionsForPracticeDisplay(
          detail.mcq_options || [],
          Boolean(detail.shuffle_options)
        )
      }
      setQuestion(detail)
      setMarkingResult(null)
      setMarkingError("")
      setBetaSampleRevealed(false)
      setSelectedMcqOption("")
    } finally {
      setQuestionLoading(false)
    }
  }, [config, questions])

  async function generate(source) {
    setArrivalSource(source)
    setModalOpen(false)
    setMode("question")
    await loadQuestion()
  }

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
      const response = await fetch(`${QUESTIONS_API_URL}${question.id}/mark/`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      })
      const data = await parseJsonResponse(response)
      if (!response.ok) {
        const hint =
          data.detail ||
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
          onSelectMcqOption={(letter) => {
            setSelectedMcqOption(letter)
            setMarkingError("")
          }}
          onSubmitAnswer={submitAnswer}
          question={question}
          selectedMcqOption={selectedMcqOption}
          timer={timer}
        />
      )}

      {modalOpen && (
        <PracticeModal
          buckets={buckets}
          config={config}
          onChange={setConfig}
          onClose={() => setModalOpen(false)}
          onGenerate={generate}
          subject={subject}
        />
      )}
    </>
  )
}
