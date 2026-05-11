import { Plus } from "lucide-react"

import { cn } from "@/lib/utils"

export default function PageNavigator({ currentPageIndex, onAddPage, onSelectPage, pages }) {
  return (
    <aside className="flex gap-2 overflow-x-auto border-b border-white/[0.06] bg-[#14100d] p-3 md:w-28 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r">
      {pages.map((page, index) => (
        <button
          key={page.id}
          type="button"
          onClick={() => onSelectPage(index)}
          className={cn(
            "grid h-16 min-w-20 place-items-center rounded-[8px] border text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors md:min-w-0",
            currentPageIndex === index
              ? "border-[#d49a71]/55 bg-[#d49a71]/14 text-[#efbd94]"
              : "border-white/[0.06] bg-[#1a1714] text-[#6f6861] hover:border-[#8b5e42]/55 hover:text-[#d8c4b0]"
          )}
        >
          Page {index + 1}
        </button>
      ))}
      <button
        type="button"
        onClick={onAddPage}
        className="inline-flex h-16 min-w-20 items-center justify-center gap-1.5 rounded-[8px] border border-dashed border-white/[0.09] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6f6861] transition-colors hover:border-[#8b5e42]/55 hover:text-[#d8c4b0] md:min-w-0"
      >
        <Plus className="size-3.5" />
        Add
      </button>
    </aside>
  )
}

