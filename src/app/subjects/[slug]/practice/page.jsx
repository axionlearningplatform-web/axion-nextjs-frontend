"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import ReactMarkdown from "react-markdown"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import useSWR from "swr"
import {
  ArrowLeft,
  ArrowRight,
  Keyboard,
  Lightbulb,
  Loader2,
  Sigma,
  X,
} from "lucide-react"

import { useAuth } from "@/components/authProvider"
import fetcher from "@/lib/fetcher"
import { cn } from "@/lib/utils"

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

  return { year, difficulty, type, topics }
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
  const selectedNames = [
    config.year,
    config.difficulty,
    config.type,
    ...config.topicNames,
  ].map(normalize)

  return [...buckets.year, ...buckets.difficulty, ...buckets.type, ...buckets.topics]
    .filter((tag) => selectedNames.includes(normalize(tag.name)))
    .map((tag) => tag.id)
}

function questionMatchesConfig(question, config, buckets) {
  const selectedTagIds = new Set([...config.topicIds, ...configTagIds(config, buckets)])
  if (!selectedTagIds.size) return true

  const questionTagIds = new Set((question.tags || []).map((tag) => tag.id))
  return [...selectedTagIds].every((id) => questionTagIds.has(id))
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

function MarkdownMath({ children, className }) {
  const markdown = prepareMarkdown(children)

  return (
    <div className={cn("prose prose-invert max-w-none text-[#eee9e4]", className)}>
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
  const chips = [
    config.year,
    config.course,
    ...config.topicNames,
    config.difficulty,
    config.type,
  ].filter(Boolean)

  function removeChip(label) {
    if (label === config.year) onChange({ ...config, year: "" })
    else if (label === config.difficulty) onChange({ ...config, difficulty: "" })
    else if (label === config.type) onChange({ ...config, type: "" })
    else if (config.topicNames.includes(label)) {
      const index = config.topicNames.indexOf(label)
      onChange({
        ...config,
        topicNames: config.topicNames.filter((_, itemIndex) => itemIndex !== index),
        topicIds: config.topicIds.filter((_, itemIndex) => itemIndex !== index),
      })
    }
  }

  function toggleTopic(tag) {
    const selected = config.topicIds.includes(tag.id)
    onChange({
      ...config,
      topicIds: selected
        ? config.topicIds.filter((id) => id !== tag.id)
        : [...config.topicIds, tag.id],
      topicNames: selected
        ? config.topicNames.filter((name) => name !== tag.name)
        : [...config.topicNames, tag.name],
    })
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 backdrop-blur-md">
      <section className="grid h-[min(720px,calc(100vh-44px))] w-full max-w-5xl grid-rows-[auto_1fr_auto] overflow-hidden rounded-[10px] border border-[#4c3427]/60 bg-[#0c0b0a] shadow-[0_26px_90px_rgba(0,0,0,0.7)]">
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
          <h2 className="text-[18px] font-medium tracking-[0.08em] text-[#a5978a]">
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
                      "flex items-center justify-between text-left text-[19px] font-medium tracking-[0.01em] transition-colors",
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
                {buckets.topics.length ? (
                  buckets.topics.map((tag) => (
                    <OptionButton
                      key={tag.id}
                      active={config.topicIds.includes(tag.id)}
                      onClick={() => toggleTopic(tag)}
                    >
                      {tag.name}
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
              <SelectionChip key={chip} onRemove={() => removeChip(chip)}>
                {chip}
              </SelectionChip>
            ))}
            {!chips.length && <SelectionChip muted>Select a filter</SelectionChip>}
          </div>
          <button
            type="button"
            onClick={() => onGenerate("modal")}
            className="h-12 rounded-[8px] border border-[#d49a71]/45 bg-[#d49a71]/16 px-9 text-[14px] font-semibold tracking-[0.08em] text-[#e6b083] shadow-[0_12px_38px_rgba(0,0,0,0.22)] transition-colors hover:border-[#d49a71]/70 hover:bg-[#d49a71]/24 hover:text-[#f1c39e]"
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
    <main className="relative flex min-h-[calc(100vh-64px)] items-center justify-center overflow-hidden bg-[#0d0d0b] px-6 py-12 text-[#e8e4dc] before:absolute before:inset-0 before:bg-[radial-gradient(ellipse_58%_40%_at_50%_56%,rgba(212,154,113,0.07)_0%,transparent_70%)] before:content-['']">
      <section className="relative z-10 w-full max-w-3xl text-center">
        <p className="text-[13px] font-semibold uppercase tracking-[0.22em] text-[#74675d]">
          Daily Practice
        </p>
        <h1 className="mt-7 font-serif text-[clamp(3rem,5.7vw,5.8rem)] font-medium leading-[0.98] tracking-[-0.015em]">
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

function AnswerArea({ onSubmit }) {
  const [activeTab, setActiveTab] = useState("type")

  return (
    <section className="border-t border-white/[0.06] px-6 py-6 md:px-12">
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

      {activeTab === "type" ? (
        <div className="rounded-[3px] border border-white/[0.06] bg-[#141412] p-5">
          <textarea
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
      ) : (
        <div className="flex min-h-44 items-center justify-center rounded-[3px] border border-white/[0.06] bg-[#141412] text-[13px] tracking-[0.04em] text-[#4f4a45]">
          {titleCase(activeTab)} tools are coming soon.
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={onSubmit}
          className="inline-flex h-11 items-center justify-center gap-3 rounded-[2px] border border-[#9b673d]/42 bg-[#c8864a]/12 px-7 text-[12px] font-medium tracking-[0.06em] text-[#dba476] transition-colors hover:border-[#c8864a]/62 hover:bg-[#c8864a]/18 hover:text-[#efbd94]"
        >
          Submit Answer
          <ArrowRight className="size-[18px]" />
        </button>
      </div>
    </section>
  )
}

function QuestionView({
  config,
  loading,
  onBack,
  onNextQuestion,
  question,
  timer,
}) {
  if (loading) {
    return (
      <main className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-[#0f0e0d] text-[#8f8982]">
        <Loader2 className="size-8 animate-spin" />
      </main>
    )
  }

  if (!question) {
    return (
      <main className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-[#0f0e0d] px-6">
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

  const metadata = [
    config.year,
    config.course,
    ...config.topicNames,
    config.difficulty,
    config.type,
  ].filter(Boolean)
  const hasHint = (question.hints || []).some((hint) => hint.text) ||
    (question.parts || []).some((part) => (part.hints || []).some((hint) => hint.text))
  const displayQuestionText = question.question_text?.trim()
    ? (/^Q\)\./i.test(question.question_text.trim()) ? question.question_text : `Q). ${question.question_text}`)
    : ""

  return (
    <main className="min-h-[calc(100vh-64px)] bg-[#0f0e0d] text-[#eee9e4]">
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

      <section className="px-6 py-16 md:px-12">
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
          </div>
          {question.import_source && (
            <p className="pt-1 text-right text-[15px] tracking-[0.04em] text-[#6e6259]">
              {question.import_source}
            </p>
          )}
        </article>
      </section>

      <AnswerArea onSubmit={onNextQuestion} />
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

  const membership = auth.subjectMemberships?.find(
    (item) => item.subject.slug === params.slug
  )
  const subject = membership?.subject
  const subjectId = subject?.id

  const { data: tags = [] } = useSWR(
    subjectId ? `${TAGS_API_URL}?subject_id=${subjectId}` : null,
    fetcher
  )
  const { data: questions = [] } = useSWR(
    subjectId ? `${QUESTIONS_API_URL}?subject_id=${subjectId}` : null,
    fetcher
  )
  const buckets = useMemo(() => splitTags(tags), [tags])

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
      const matchingQuestion = randomItem(
        questions.filter((item) => questionMatchesConfig(item, config, buckets))
      )
      if (!matchingQuestion) {
        setQuestion(null)
        return
      }
      const detail = await fetcher(`${QUESTIONS_API_URL}${matchingQuestion.id}/`)
      setQuestion(detail)
    } finally {
      setQuestionLoading(false)
    }
  }, [buckets, config, questions])

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

  if (!config) {
    return (
      <main className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-[#0f0e0d] text-[#8f8982]">
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
          config={config}
          loading={questionLoading}
          onBack={backFromQuestion}
          onNextQuestion={loadQuestion}
          question={question}
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
