import { Eraser, PenLine, RotateCcw, RotateCw, SlidersHorizontal, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"

function ToolButton({ active, children, disabled, label, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-[8px] border transition-colors",
        active
          ? "border-[#d49a71]/55 bg-[#d49a71]/18 text-[#f0bd97]"
          : "border-white/[0.06] bg-[#15110e]/70 text-[#8f8982] hover:border-[#8b5e42]/65 hover:text-[#e8d6c4]",
        disabled && "cursor-not-allowed opacity-40 hover:border-white/[0.06] hover:text-[#8f8982]"
      )}
    >
      {children}
    </button>
  )
}

export default function PencilToolbar({
  activeTool,
  canRedo,
  canUndo,
  eraserSize,
  onClear,
  onRedo,
  onEraserSizeChange,
  onToolChange,
  onUndo,
}) {
  const eraserActive = activeTool === "stroke-eraser" || activeTool === "pixel-eraser"
  const eraserPresets = [
    { label: "S", value: 12 },
    { label: "M", value: 24 },
    { label: "L", value: 42 },
  ]

  return (
    <div className="absolute right-4 top-4 z-20 grid justify-items-end gap-2">
      <div className="flex items-center gap-1.5 rounded-[12px] border border-white/[0.08] bg-[#15110e]/80 p-1.5 shadow-[0_14px_50px_rgba(0,0,0,0.34)] backdrop-blur-md">
        <ToolButton active={activeTool === "pen"} label="Pen (P)" onClick={() => onToolChange("pen")}>
          <PenLine className="size-4" />
        </ToolButton>
        <ToolButton active={activeTool === "stroke-eraser"} label="Full stroke eraser (E)" onClick={() => onToolChange("stroke-eraser")}>
          <Eraser className="size-4" />
        </ToolButton>
        <ToolButton active={activeTool === "pixel-eraser"} label="Pixel eraser" onClick={() => onToolChange("pixel-eraser")}>
          <span className="relative flex size-4 items-center justify-center">
            <Eraser className="size-4" />
            <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-current" />
          </span>
        </ToolButton>
        <span className="mx-1 h-5 w-px bg-white/[0.08]" />
        <ToolButton disabled={!canUndo} label="Undo" onClick={onUndo}>
          <RotateCcw className="size-4" />
        </ToolButton>
        <ToolButton disabled={!canRedo} label="Redo" onClick={onRedo}>
          <RotateCw className="size-4" />
        </ToolButton>
        <ToolButton label="Clear page" onClick={onClear}>
          <Trash2 className="size-4" />
        </ToolButton>
      </div>

      {eraserActive && (
        <div className="w-[230px] rounded-[14px] border border-white/[0.08] bg-[#15110e]/85 p-3 shadow-[0_18px_50px_rgba(0,0,0,0.34)] backdrop-blur-md">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8f8982]">
              <SlidersHorizontal className="size-3.5" />
              Eraser size
            </span>
            <span className="rounded-full border border-white/[0.06] bg-black/20 px-2 py-0.5 text-[11px] text-[#d8c4b0]">
              {eraserSize}
            </span>
          </div>
          <div className="grid gap-2">
            <input
              type="range"
              min="8"
              max="54"
              step="1"
              value={eraserSize}
              onChange={(event) => onEraserSizeChange(Number(event.target.value))}
              className="h-1.5 w-full accent-[#d49a71]"
            />
            <div className="grid grid-cols-3 gap-1.5">
              {eraserPresets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onEraserSizeChange(preset.value)}
                  className={cn(
                    "h-7 rounded-[7px] border text-[10px] font-semibold transition-colors",
                    Math.abs(eraserSize - preset.value) <= 2
                      ? "border-[#d49a71]/60 bg-[#d49a71]/16 text-[#efbd94]"
                      : "border-white/[0.06] bg-[#15110e]/70 text-[#7f766e] hover:border-[#8b5e42]/55 hover:text-[#d8c4b0]"
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
