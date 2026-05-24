"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import PageNavigator from "@/components/answering/PageNavigator"
import { drawPageStrokes } from "@/services/handwriting/render_submission"

const DEFAULT_WIDTH = 820
const DEFAULT_HEIGHT = 1060

function hasSavedInk(pages = []) {
  return pages.some((page) => (page?.strokes || []).some((stroke) => (stroke?.points || []).length > 0))
}

function drawPaper(ctx, width, height) {
  ctx.save()
  ctx.fillStyle = "#191410"
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = "rgba(232,216,199,0.075)"
  ctx.lineWidth = 1
  for (let y = 86; y < height - 46; y += 34) {
    ctx.beginPath()
    ctx.moveTo(58, y)
    ctx.lineTo(width - 58, y)
    ctx.stroke()
  }
  ctx.strokeStyle = "rgba(212,154,113,0.13)"
  ctx.beginPath()
  ctx.moveTo(58, 52)
  ctx.lineTo(58, height - 52)
  ctx.stroke()
  ctx.restore()
}

export default function HandwritingCanvasViewer({ strokeData }) {
  const paperCanvasRef = useRef(null)
  const committedCanvasRef = useRef(null)
  const [currentPageIndex, setCurrentPageIndex] = useState(0)
  const width = Number(strokeData?.width) || DEFAULT_WIDTH
  const height = Number(strokeData?.height) || DEFAULT_HEIGHT
  const pages = useMemo(() => {
    const sourcePages = Array.isArray(strokeData?.pages) ? strokeData.pages : []
    return sourcePages.length > 0
      ? sourcePages.map((page, index) => ({
          ...page,
          id: page.id || `saved-page-${page.page_number || index + 1}`,
          strokes: page.strokes || [],
        }))
      : []
  }, [strokeData])
  const displayedPageIndex = pages.length > 0 ? Math.min(currentPageIndex, pages.length - 1) : 0
  const currentPage = pages[displayedPageIndex] || pages[0]
  const empty = !strokeData || pages.length === 0 || !hasSavedInk(pages)

  useEffect(() => {
    if (empty || !currentPage) return
    const dpr = Math.min(Math.max(window.devicePixelRatio || 2, 2), 3)
    const paperCanvas = paperCanvasRef.current
    const committedCanvas = committedCanvasRef.current
    if (!paperCanvas || !committedCanvas) return

    ;[paperCanvas, committedCanvas].forEach((canvas) => {
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = "100%"
      canvas.style.height = "100%"
      const ctx = canvas.getContext("2d")
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
    })

    const paperCtx = paperCanvas.getContext("2d")
    const committedCtx = committedCanvas.getContext("2d")
    drawPaper(paperCtx, width, height)
    drawPageStrokes(committedCtx, currentPage.strokes || [])
  }, [currentPage, empty, height, width])

  if (empty) {
    return (
      <div className="flex min-h-[360px] items-center justify-center overflow-hidden rounded-[6px] border border-white/[0.06] bg-[#120f0d] px-6 text-center font-serif text-lg italic text-[#4f4a45]">
        No handwriting saved.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-[6px] border border-white/[0.06] bg-[#120f0d]">
      <div className="flex min-h-[640px] flex-col md:flex-row">
        {pages.length > 1 && (
          <PageNavigator
            currentPageIndex={displayedPageIndex}
            onAddPage={() => {}}
            onDeletePage={() => {}}
            onSelectPage={setCurrentPageIndex}
            pages={pages}
            readOnly
          />
        )}
        <div className="relative flex min-w-0 flex-1 justify-center overflow-auto bg-[#100d0b] p-4 md:p-6">
          <div
            className="relative h-auto w-full max-w-[820px]"
            style={{ aspectRatio: `${width} / ${height}` }}
          >
            <canvas
              ref={paperCanvasRef}
              className="block h-full w-full rounded-[4px] border border-[#3a2b23]/70 shadow-[0_18px_70px_rgba(0,0,0,0.42)]"
            />
            <canvas ref={committedCanvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
            <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full border border-white/[0.06] bg-[#15110e]/75 px-3 py-1.5 text-[11px] font-medium tracking-[0.06em] text-[#8f8982] backdrop-blur">
              Page {displayedPageIndex + 1} of {pages.length}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
