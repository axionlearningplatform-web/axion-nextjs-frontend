import { Plus, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"

export default function PageNavigator({
  currentPageIndex,
  leftOffset = 0,
  maxHeight,
  onAddPage,
  onDeletePage,
  onSelectPage,
  pages,
  readOnly = false,
  sticky = false,
  topOffset = 80,
}) {
  const resolvedMaxHeight =
    maxHeight == null ? `calc(100vh - ${topOffset + 16}px)` : `${maxHeight}px`

  return (
    <aside
      className={cn(
        "overflow-hidden md:w-28",
        sticky && "md:fixed md:z-40"
      )}
      style={
        sticky
          ? {
              left: `${leftOffset}px`,
              top: `${topOffset}px`,
              height: resolvedMaxHeight,
              maxHeight: resolvedMaxHeight,
            }
          : {
              height: resolvedMaxHeight,
              maxHeight: resolvedMaxHeight,
            }
      }
    >
      <div className="flex max-h-full select-none gap-2 overflow-x-auto p-3 pb-6 [scrollbar-width:none] [scroll-padding-bottom:24px] [&::-webkit-scrollbar]:hidden md:h-full md:flex-col md:overflow-x-hidden md:overflow-y-auto">
        {pages.map((page, index) => (
          <button
            key={page.id}
            type="button"
            onClick={() => onSelectPage(index)}
            className={cn(
              "group relative flex h-16 shrink-0 basis-16 min-w-20 items-center justify-center rounded-[8px] border px-2 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors md:min-w-0 md:basis-16",
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
            className="inline-flex h-16 shrink-0 basis-16 min-w-20 items-center justify-center gap-1.5 rounded-[8px] border border-dashed border-white/[0.09] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6f6861] transition-colors hover:border-[#8b5e42]/55 hover:text-[#d8c4b0] md:min-w-0 md:basis-16"
          >
            <Plus className="size-3.5" />
            Add
          </button>
        )}
      </div>
    </aside>
  )
}
