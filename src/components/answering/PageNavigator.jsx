import { Plus, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"

export default function PageNavigator({ currentPageIndex, onAddPage, onDeletePage, onSelectPage, pages, readOnly = false }) {
  return (
    <aside className="flex select-none gap-2 overflow-x-auto border-b border-white/[0.06] bg-[#14100d] p-3 md:w-28 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r">
      {pages.map((page, index) => (
        <button
          key={page.id}
          type="button"
          onClick={() => onSelectPage(index)}
          className={cn(
            "group relative flex h-16 min-w-20 items-center justify-center rounded-[8px] border px-2 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors md:min-w-0",
            currentPageIndex === index
              ? "border-[#d49a71]/55 bg-[#d49a71]/14 text-[#efbd94]"
              : "border-white/[0.06] bg-[#1a1714] text-[#6f6861] hover:border-[#8b5e42]/55 hover:text-[#d8c4b0]"
          )}
        >
          <span>Page {index + 1}</span>
          {!readOnly && pages.length > 1 && (
            <span
              role="button"
              tabIndex={-1}
              aria-label={`Delete page ${index + 1}`}
              title={`Delete page ${index + 1}`}
              onClick={(event) => {
                event.stopPropagation()
                onDeletePage(index)
              }}
              className="absolute right-1 top-1 inline-flex size-5 items-center justify-center rounded-full border border-white/[0.05] bg-[#120f0d]/72 text-[#6f6861] opacity-0 shadow-sm backdrop-blur transition-all duration-150 hover:border-red-300/15 hover:bg-red-400/12 hover:text-red-200 group-hover:opacity-100"
            >
              <Trash2 className="size-2" />
            </span>
          )}
        </button>
      ))}
      {!readOnly && (
        <button
          type="button"
          onClick={onAddPage}
          className="inline-flex h-16 min-w-20 items-center justify-center gap-1.5 rounded-[8px] border border-dashed border-white/[0.09] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6f6861] transition-colors hover:border-[#8b5e42]/55 hover:text-[#d8c4b0] md:min-w-0"
        >
          <Plus className="size-3.5" />
          Add
        </button>
      )}
    </aside>
  )
}
