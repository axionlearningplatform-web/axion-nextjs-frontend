import { Eraser, PenLine, RotateCcw, RotateCw, Trash2 } from "lucide-react"

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
  onClear,
  onRedo,
  onToolChange,
  onUndo,
}) {
  return (
    <div className="absolute right-4 top-4 z-20 flex items-center gap-1.5 rounded-[12px] border border-white/[0.08] bg-[#15110e]/80 p-1.5 shadow-[0_14px_50px_rgba(0,0,0,0.34)] backdrop-blur-md">
      <ToolButton active={activeTool === "pen"} label="Pen" onClick={() => onToolChange("pen")}>
        <PenLine className="size-4" />
      </ToolButton>
      <ToolButton active={activeTool === "eraser"} label="Eraser" onClick={() => onToolChange("eraser")}>
        <Eraser className="size-4" />
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
  )
}

