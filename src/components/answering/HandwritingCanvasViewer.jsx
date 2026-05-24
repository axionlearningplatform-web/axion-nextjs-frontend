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
  ctx.fillStyle = "#f7f0e7"
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = "rgba(90,70,54,0.14)"
  ctx.lineWidth = 1
  for (let y = 64; y < height; y += 32) {
    ctx.beginPath()
    ctx.moveTo(48, y)
    ctx.lineTo(width - 48, y)
    ctx.stroke()
  }
  ctx.strokeStyle = "rgba(160,90,72,0.18)"
  ctx.beginPath()
  ctx.moveTo(74, 0)
  ctx.lineTo(74, height)
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
        <div className="relative flex flex-1 items-center justify-center overflow-auto bg-[#100d0b] p-4">
          <div
            className="relative max-w-full shadow-[0_18px_60px_rgba(0,0,0,0.35)]"
            style={{ aspectRatio: `${width} / ${height}`, width: `min(${width}px, 100%)` }}
          >
            <canvas ref={paperCanvasRef} className="absolute inset-0" />
            <canvas ref={committedCanvasRef} className="absolute inset-0" />
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-black/10 bg-black/35 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/70 backdrop-blur">
              Page {displayedPageIndex + 1} of {pages.length}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
