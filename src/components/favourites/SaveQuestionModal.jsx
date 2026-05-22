"use client"

import { useState } from "react"
import { Loader2, X } from "lucide-react"

import { cn } from "@/lib/utils"

export default function SaveQuestionModal({
  existingNote = "",
  favourited = false,
  loading = false,
  onClose,
  onSave,
}) {
  const [note, setNote] = useState(existingNote || "")

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 px-4 backdrop-blur-md">
      <div className="w-full max-w-xl rounded-[10px] border border-[#3b2a22]/55 bg-[#181410] p-6 shadow-[0_26px_90px_rgba(0,0,0,0.7)]">
        <div className="relative mb-6 flex items-center justify-center">
          <button
            type="button"
            aria-label="Close save question modal"
            onClick={onClose}
            className="absolute left-0 inline-flex size-9 items-center justify-center rounded-[2px] border border-white/[0.06] text-[#77716b] transition-colors hover:border-[#7c573a]/50 hover:text-[#dba476]"
          >
            <X className="size-4" />
          </button>
          <h2 className="font-serif text-[22px] text-[#eee9e4]">Save Question</h2>
        </div>

        {favourited && (
          <div className="mb-5 rounded-[4px] border border-[#d99658]/25 bg-[#d99658]/8 px-4 py-3 text-[13px] leading-relaxed">
            <p className="font-semibold text-[#dba476]">You&apos;ve already saved this question.</p>
            <p className="mt-1 text-[#8f8982]">
              Current note: {existingNote ? existingNote : "No note saved."}
            </p>
          </div>
        )}

        <label className="block">
          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8f8982]">
            Your note
          </span>
          <div className="rounded-[3px] border border-white/[0.06] bg-[#1b1713] p-5">
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="min-h-36 w-full resize-y bg-transparent font-serif text-base leading-relaxed text-[#e8e4dc] outline-none placeholder:italic placeholder:text-[#4f4a45]"
              placeholder="What did you find difficult, or want to remember?"
            />
          </div>
        </label>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            disabled={loading}
            onClick={() => onSave(note)}
            className={cn(
              "inline-flex h-11 items-center justify-center gap-3 rounded-[2px] border border-[#d49a71]/55 bg-[#d49a71]/78 px-7 text-[12px] font-semibold tracking-[0.08em] text-[#120c08] transition-colors hover:bg-[#d49a71]/90",
              loading && "cursor-not-allowed opacity-60"
            )}
          >
            {favourited ? "Update note" : "Save"}
            {loading && <Loader2 className="size-[18px] animate-spin" />}
          </button>
        </div>
      </div>
    </div>
  )
}
