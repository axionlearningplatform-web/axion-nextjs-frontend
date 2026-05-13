"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import ReactMarkdown from "react-markdown"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import useSWR from "swr"
import { ChevronRight, Loader2, Plus, Trash2 } from "lucide-react"

import fetcher from "@/lib/fetcher"
import { cn } from "@/lib/utils"

const SUBJECTS_API_URL = "/api/subjects/"
const TAGS_API_URL = "/api/questions/tags/"
const LAYERS = [
  { id: 1, title: "Topics", hint: "Vectors, Complex, Integration", kind: "taxonomy" },
  { id: 2, title: "Subtopics", hint: "2D vectors, equations, volumes", kind: "taxonomy" },
  { id: 3, title: "Concepts", hint: "y-axis rotation, proof methods", kind: "taxonomy" },
  { id: 4, title: "Microskills", hint: "tiny behaviours and traps", kind: "microskill" },
]

function childrenOf(tags, parentId) {
  return tags.filter((tag) => (tag.parent_id || null) === (parentId || null))
}

function isMicroskill(tag) {
  return tag?.tag_kind === "microskill" || tag?.layer === 4
}

function supportsRichTag(tagOrLayer) {
  const layer = typeof tagOrLayer === "number" ? tagOrLayer : tagOrLayer?.layer
  return layer === 3 || layer === 4 || isMicroskill(tagOrLayer)
}

function MarkdownInline({ value, fallback = "" }) {
  const content = String(value || fallback || "").trim()
  if (!content) return null

  return (
    <span className="axion-question-math min-w-0 break-words font-serif [overflow-wrap:anywhere] [&_.katex]:whitespace-normal">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ children }) => <>{children}</>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
        }}
      >
        {content}
      </ReactMarkdown>
    </span>
  )
}

function TagDetailCard({ tag }) {
  if (!tag || !supportsRichTag(tag)) return null

  return (
    <div className="mt-4 min-w-0 rounded-2xl border border-[#c8864a]/20 bg-[#c8864a]/8 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#c8864a]/65">
        {isMicroskill(tag) ? "Microskill preview" : "Concept preview"}
      </p>
      <div className="mt-2 min-w-0 break-words text-[18px] leading-snug text-[#eee9e4] [overflow-wrap:anywhere]">
        <MarkdownInline value={tag.name} />
      </div>
      {tag.description && (
        <div className="mt-3 grid gap-2 text-sm leading-6 text-[#bda99c]">
          <MarkdownInline value={tag.description} />
        </div>
      )}
    </div>
  )
}

function TagEditPanel({ tag, onUpdated }) {
  const [name, setName] = useState(tag.name)
  const [description, setDescription] = useState(tag.description || "")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    setName(tag.name)
    setDescription(tag.description || "")
  }, [tag.id, tag.name, tag.description])

  async function saveTag(event) {
    event.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setMessage("")

    const body = { name: name.trim() }
    if (supportsRichTag(tag)) {
      body.description = description.trim()
    }

    const response = await fetch(`${TAGS_API_URL}${tag.id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await response.json()
    setSaving(false)

    if (!response.ok) {
      setMessage(data.detail || "Could not update tag.")
      return
    }

    onUpdated()
  }

  return (
    <form
      className="mt-3 rounded-2xl border border-[#3b2a22]/55 bg-[#14110f] p-3"
      onSubmit={saveTag}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8c8178]">
        Edit tag
      </p>
      <div className="mt-2 grid gap-2">
        {supportsRichTag(tag) ? (
          <textarea
            className="min-h-[72px] w-full resize-y rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2 text-sm text-[#eee9e4] outline-none focus:border-[#c8864a]/50"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        ) : (
          <input
            className="h-10 w-full rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 text-sm text-[#eee9e4] outline-none focus:border-[#c8864a]/50"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        )}
        {supportsRichTag(tag) && (
          <textarea
            className="min-h-[72px] w-full resize-y rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-sm text-[#eee9e4] outline-none focus:border-[#c8864a]/50"
            placeholder="Descriptor"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        )}
      </div>
      {message && <p className="mt-2 text-xs text-red-200">{message}</p>}
      <button
        type="submit"
        disabled={saving || !name.trim()}
        className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-[#c8864a]/30 bg-[#c8864a]/12 py-2 text-sm font-semibold text-[#e6b083] transition-colors hover:bg-[#c8864a]/20 disabled:opacity-50"
      >
        {saving ? <Loader2 className="size-4 animate-spin" /> : "Save changes"}
      </button>
    </form>
  )
}

function TagPill({ tag, active, deleting, onClick, onDelete }) {
  const terminalTag = supportsRichTag(tag)

  return (
    <button
      type="button"
      disabled={deleting}
      onClick={onClick}
      className={cn(
        "group flex w-full min-w-0 items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-all",
        active
          ? "border-[#c8864a]/55 bg-[#c8864a]/13 text-[#f1d0b9]"
          : "border-[#3b2a22]/55 bg-white/[0.025] text-[#d8c4b0] hover:border-[#c8864a]/30 hover:bg-white/[0.04]",
        deleting && "cursor-wait opacity-70"
      )}
    >
      <span className="min-w-0 flex-1 overflow-hidden">
        <span className="block min-w-0 whitespace-normal break-words font-serif text-[17px] font-medium leading-snug [overflow-wrap:anywhere]">
          {supportsRichTag(tag) ? <MarkdownInline value={tag.name} /> : tag.name}
        </span>
        <span className="mt-1 block text-[10px] uppercase tracking-[0.16em] text-[#8c8178]">
          {isMicroskill(tag) ? "Microskill" : `Layer ${tag.layer}`}
          {!terminalTag && <> · {tag.children_count || 0} child tags</>}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span
          className="inline-flex size-7 items-center justify-center rounded-full text-[#8c8178] opacity-0 transition-opacity hover:bg-red-400/10 hover:text-red-200 group-hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation()
            if (!deleting) onDelete()
          }}
        >
          {deleting ? (
            <Loader2 className="size-3.5 animate-spin text-[#c8864a]" />
          ) : (
            <Trash2 className="size-3.5" />
          )}
        </span>
        <ChevronRight className="size-4 text-[#c8864a]/70" />
      </span>
    </button>
  )
}

function CreateTagForm({ layer, kind = "taxonomy", parent, subjectId, onCreated }) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [previewOpen, setPreviewOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)
  const rich = supportsRichTag(layer)
  const microskill = kind === "microskill"

  async function createTag(event) {
    event.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setMessage("")

    const response = await fetch(TAGS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        subject_id: subjectId,
        parent_id: parent?.id || null,
        layer,
        tag_kind: kind,
        description: rich ? description.trim() : "",
        visual: "",
      }),
    })
    const data = await response.json()
    setSaving(false)

    if (!response.ok) {
      setMessage(data.detail || "Could not create tag.")
      return
    }

    setName("")
    setDescription("")
    onCreated()
  }

  return (
    <form className="mt-4 rounded-2xl border border-[#3b2a22]/55 bg-[#181410] p-3" onSubmit={createTag}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8c8178]">
        {microskill ? "Root microskill" : parent ? `Under ${parent.name}` : "Root topic"}
      </p>
      <div className="mt-3 flex gap-2">
        {rich ? (
          <textarea
            className="min-h-10 min-w-0 flex-1 resize-y rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2 text-sm leading-6 text-[#eee9e4] outline-none transition-colors placeholder:text-[#6f6258] focus:border-[#c8864a]/50"
            placeholder={`New ${microskill ? "microskill" : "concept"} with LaTeX, e.g. $\\arg(z)$`}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        ) : (
          <input
            className="h-10 min-w-0 flex-1 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 text-sm text-[#eee9e4] outline-none transition-colors placeholder:text-[#6f6258] focus:border-[#c8864a]/50"
            placeholder={`New ${LAYERS[layer - 1].title.replace(/s$/, "").toLowerCase()}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        )}
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="inline-flex size-10 items-center justify-center rounded-xl border border-[#c8864a]/30 bg-[#c8864a]/12 text-[#e6b083] transition-colors hover:bg-[#c8864a]/20 disabled:opacity-50"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        </button>
      </div>
      {rich && (
        <textarea
          className="mt-2 min-h-20 w-full resize-y rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-sm leading-6 text-[#eee9e4] outline-none placeholder:text-[#6f6258] focus:border-[#c8864a]/50"
          placeholder={microskill ? "Descriptor for the microskill with LaTeX..." : "Optional"}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      )}
      {rich && (
        <>
          <button
            type="button"
            className="mt-2 rounded-full border border-[#3b2a22]/55 bg-white/[0.035] px-3 py-1.5 text-xs font-semibold text-[#a28c83] transition-colors hover:text-[#dac1b7]"
            onClick={() => setPreviewOpen((open) => !open)}
          >
            {previewOpen ? "Hide preview" : "Preview"}
          </button>
          {previewOpen && (
            <div className="mt-2 rounded-xl border border-[#3b2a22]/55 bg-[#11100e] p-3 text-[#eee9e4]">
              <div className="text-[16px]">
                <MarkdownInline value={name} fallback="Tag name preview" />
              </div>
              {description && (
                <div className="mt-2 grid gap-1 text-sm text-[#bda99c]">
                  <MarkdownInline value={description} />
                </div>
              )}
            </div>
          )}
        </>
      )}
      {message && <p className="mt-2 text-xs text-red-200">{message}</p>}
    </form>
  )
}

export default function SubjectTagsPage() {
  const params = useParams()
  const { data: subjects = [] } = useSWR(SUBJECTS_API_URL, fetcher)
  const subject = subjects.find((item) => item.slug === params.slug)
  const tagsUrl = subject ? `${TAGS_API_URL}?subject_id=${subject.id}` : null
  const { data: tags = [], mutate, isLoading } = useSWR(tagsUrl, fetcher)
  const [selected, setSelected] = useState({})
  const [deletingTagId, setDeletingTagId] = useState(null)

  const visibleByLayer = useMemo(() => {
    const layer1 = tags.filter((tag) => tag.layer === 1 && !isMicroskill(tag))
    const layer2 = selected[1]
      ? childrenOf(tags, selected[1].id).filter((tag) => tag.layer === 2 && !isMicroskill(tag))
      : []
    const layer3 = selected[2]
      ? childrenOf(tags, selected[2].id).filter((tag) => tag.layer === 3 && !isMicroskill(tag))
      : []
    const layer4 = tags.filter(isMicroskill)
    return { 1: layer1, 2: layer2, 3: layer3, 4: layer4 }
  }, [selected, tags])

  function selectTag(layer, tag) {
    setSelected((current) => {
      const alreadySelected = current[layer]?.id === tag.id
      const next = { ...current }
      if (alreadySelected) {
        delete next[layer]
      } else {
        next[layer] = tag
      }
      if (layer === 1) {
        delete next[2]
        delete next[3]
        delete next[4]
      }
      if (layer === 2) {
        delete next[3]
        delete next[4]
      }
      return next
    })
  }

  async function deleteTag(tag) {
    if (deletingTagId) return
    setDeletingTagId(tag.id)
    try {
      const response = await fetch(`${TAGS_API_URL}${tag.id}/`, { method: "DELETE" })
      if (response.ok) {
        setSelected((current) => {
          const next = { ...current }
          Object.entries(next).forEach(([layer, value]) => {
            if (value.id === tag.id) delete next[layer]
          })
          return next
        })
        mutate()
      }
    } finally {
      setDeletingTagId(null)
    }
  }

  if (!subject) {
    return (
      <main className="min-h-[calc(100vh-64px)] bg-[#16130f] p-10 text-[#dac1b7]">
        Loading subject tags...
      </main>
    )
  }

  return (
    <main className="min-h-[calc(100vh-64px)] bg-[#16130f] px-6 py-10 text-[#eee9e4] md:px-10">
      <section className="mx-auto flex w-full max-w-[1500px] flex-col gap-8">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c8864a]/55">
            {subject.name} taxonomy
          </p>
          <h1 className="mt-3 font-serif text-[34px] font-semibold text-[#eee9e4]">
            Question Tags
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#8c8178]">
            Build the four-layer map analysts use for questions. Students only see layers 1 and 2 in Daily Practice.
          </p>
        </div>

        <div className="grid min-w-0 gap-4 xl:grid-cols-[repeat(4,minmax(0,1fr))]">
          {LAYERS.map((layer) => {
            const parent = layer.id === 1 || layer.id === 4 ? null : selected[layer.id - 1]
            const locked = layer.id > 1 && layer.id !== 4 && !parent
            const items = visibleByLayer[layer.id] || []

            return (
              <article
                key={layer.id}
                className={cn(
                  "min-w-0 overflow-hidden rounded-3xl border border-[#3b2a22]/55 bg-[#1b1713] p-4 shadow-2xl shadow-black/15 xl:min-h-[520px]",
                  locked && "opacity-50"
                )}
              >
                <div className="rounded-2xl border border-white/[0.055] bg-white/[0.025] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#c8864a]/60">
                    {layer.kind === "microskill" ? "Separate skill set" : `Layer ${layer.id}`}
                  </p>
                  <h2 className="mt-2 font-serif text-[24px] font-semibold text-[#eee9e4]">
                    {layer.title}
                  </h2>
                  <p className="mt-2 text-xs leading-5 text-[#8c8178]">{layer.hint}</p>
                </div>

                {locked ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-[#3b2a22]/55 p-4 text-sm leading-6 text-[#8c8178]">
                    Select a layer {layer.id - 1} tag first.
                  </div>
                ) : (
                  <>
                    <CreateTagForm
                      layer={layer.id}
                      kind={layer.kind}
                      parent={parent}
                      subjectId={subject.id}
                      onCreated={mutate}
                    />
                    <div className="mt-4 grid min-w-0 gap-2">
                      {isLoading && layer.id === 1 && (
                        <div className="flex items-center gap-2 rounded-2xl border border-[#3b2a22]/55 bg-[#181410] px-4 py-3 text-sm text-[#8c8178]">
                          <Loader2 className="size-4 animate-spin" />
                          Loading tags
                        </div>
                      )}
                      {items.map((tag) => (
                        <div key={tag.id}>
                          <TagPill
                            tag={tag}
                            active={selected[layer.id]?.id === tag.id}
                            deleting={deletingTagId === tag.id}
                            onClick={() => selectTag(layer.id, tag)}
                            onDelete={() => deleteTag(tag)}
                          />
                          {selected[layer.id]?.id === tag.id && <TagDetailCard tag={tag} />}
                          {selected[layer.id]?.id === tag.id && (
                            <TagEditPanel tag={tag} onUpdated={mutate} />
                          )}
                        </div>
                      ))}
                      {!items.length && !isLoading && (
                        <div className="rounded-2xl border border-dashed border-[#3b2a22]/55 p-4 text-sm leading-6 text-[#8c8178]">
                          No tags here yet.
                        </div>
                      )}
                    </div>
                  </>
                )}
              </article>
            )
          })}
        </div>
      </section>
    </main>
  )
}
