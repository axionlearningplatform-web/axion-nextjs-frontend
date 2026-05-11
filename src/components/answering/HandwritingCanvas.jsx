"use client"

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"

import PageNavigator from "@/components/answering/PageNavigator"
import PencilToolbar from "@/components/answering/PencilToolbar"
import StrokeRenderer from "@/components/answering/StrokeRenderer"
import { exportHandwrittenAnswer } from "@/services/handwriting/answer_export"
import { drawStroke } from "@/services/handwriting/render_submission"
import { createPoint, createStroke } from "@/services/handwriting/stroke_serializer"

const PAGE_WIDTH = 820
const PAGE_HEIGHT = 1060
const PEN_COLOR = "#e8d6c4"
const PEN_WIDTH = 4.4
const ERASER_WIDTH = 18

function createPage(index) {
  return {
    id: crypto.randomUUID(),
    page_number: index + 1,
    strokes: [],
    redoStack: [],
  }
}

function drawPaper(ctx) {
  ctx.fillStyle = "#191410"
  ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT)

  ctx.strokeStyle = "rgba(232,216,199,0.075)"
  ctx.lineWidth = 1
  for (let y = 86; y < PAGE_HEIGHT - 46; y += 34) {
    ctx.beginPath()
    ctx.moveTo(58, y)
    ctx.lineTo(PAGE_WIDTH - 58, y)
    ctx.stroke()
  }

  ctx.strokeStyle = "rgba(212,154,113,0.13)"
  ctx.beginPath()
  ctx.moveTo(58, 52)
  ctx.lineTo(58, PAGE_HEIGHT - 52)
  ctx.stroke()
}

const HandwritingCanvas = forwardRef(function HandwritingCanvas(
  { devMode = false, onSubmit, questionId },
  ref
) {
  const canvasRef = useRef(null)
  const frameRef = useRef(null)
  const activePointerRef = useRef(null)
  const currentStrokeRef = useRef(null)
  const pagesRef = useRef([createPage(0)])
  const [pages, setPages] = useState(pagesRef.current)
  const [currentPageIndex, setCurrentPageIndex] = useState(0)
  const [tool, setTool] = useState("pen")

  const currentPage = pages[currentPageIndex] || pages[0]
  const canUndo = Boolean(currentPage?.strokes?.length)
  const canRedo = Boolean(currentPage?.redoStack?.length)

  const canvasScale = useMemo(() => {
    if (typeof window === "undefined") return 2
    return Math.min(Math.max(window.devicePixelRatio || 2, 2), 3)
  }, [])

  function commitPages(nextPages) {
    pagesRef.current = nextPages
    setPages(nextPages)
  }

  const renderPage = useCallback((strokeOverride = null) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    ctx.save()
    ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0)
    drawPaper(ctx)
    ;(pagesRef.current[currentPageIndex]?.strokes || []).forEach((stroke) => drawStroke(ctx, stroke))
    if (strokeOverride) drawStroke(ctx, strokeOverride)
    ctx.restore()
  }, [canvasScale, currentPageIndex])

  const scheduleRender = useCallback((strokeOverride = null) => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => renderPage(strokeOverride))
  }, [renderPage])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = PAGE_WIDTH * canvasScale
    canvas.height = PAGE_HEIGHT * canvasScale
    scheduleRender()
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [canvasScale, currentPageIndex, scheduleRender])

  useEffect(() => {
    scheduleRender()
  }, [pages, currentPageIndex, scheduleRender])

  function updateCurrentPage(updater) {
    const nextPages = pagesRef.current.map((page, index) =>
      index === currentPageIndex ? updater(page) : page
    )
    commitPages(nextPages)
  }

  function startStroke(event) {
    if (!canvasRef.current) return
    if (event.pointerType === "touch" && event.width > 45) return
    event.preventDefault()
    activePointerRef.current = event.pointerId
    canvasRef.current.setPointerCapture(event.pointerId)
    const point = createPoint(event, canvasRef.current)
    currentStrokeRef.current = createStroke({
      tool,
      color: tool === "eraser" ? "#000000" : PEN_COLOR,
      width: tool === "eraser" ? ERASER_WIDTH : PEN_WIDTH,
      points: [point],
    })
    scheduleRender(currentStrokeRef.current)
  }

  function extendStroke(event) {
    if (activePointerRef.current !== event.pointerId || !currentStrokeRef.current || !canvasRef.current) return
    event.preventDefault()
    const events = event.getCoalescedEvents?.() || [event]
    events.forEach((coalescedEvent) => {
      currentStrokeRef.current.points.push(createPoint(coalescedEvent, canvasRef.current))
    })
    scheduleRender(currentStrokeRef.current)
  }

  function finishStroke(event) {
    if (activePointerRef.current !== event.pointerId || !currentStrokeRef.current) return
    event.preventDefault()
    const completedStroke = currentStrokeRef.current
    activePointerRef.current = null
    currentStrokeRef.current = null
    updateCurrentPage((page) => ({
      ...page,
      strokes: [...page.strokes, completedStroke],
      redoStack: [],
    }))
  }

  function undo() {
    updateCurrentPage((page) => {
      if (!page.strokes.length) return page
      const strokes = page.strokes.slice(0, -1)
      const undone = page.strokes[page.strokes.length - 1]
      return { ...page, strokes, redoStack: [undone, ...page.redoStack] }
    })
  }

  function redo() {
    updateCurrentPage((page) => {
      if (!page.redoStack.length) return page
      const [stroke, ...redoStack] = page.redoStack
      return { ...page, strokes: [...page.strokes, stroke], redoStack }
    })
  }

  function clearPage() {
    updateCurrentPage((page) => ({
      ...page,
      strokes: [],
      redoStack: page.strokes.length ? [...page.strokes, ...page.redoStack] : page.redoStack,
    }))
  }

  function addPage() {
    const nextPages = [...pagesRef.current, createPage(pagesRef.current.length)]
    commitPages(nextPages)
    setCurrentPageIndex(nextPages.length - 1)
  }

  async function submit() {
    const exportPayload = await exportHandwrittenAnswer({
      questionId,
      pages: pagesRef.current,
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
    })
    onSubmit?.(exportPayload)
    return exportPayload
  }

  useImperativeHandle(ref, () => ({
    exportAnswer: submit,
    getPages: () => pagesRef.current,
  }))

  return (
    <div className="overflow-hidden rounded-[6px] border border-white/[0.06] bg-[#120f0d]">
      <div className="flex min-h-[640px] flex-col md:flex-row">
        <PageNavigator
          currentPageIndex={currentPageIndex}
          onAddPage={addPage}
          onSelectPage={setCurrentPageIndex}
          pages={pages}
        />
        <div className="relative flex min-w-0 flex-1 justify-center overflow-auto bg-[#100d0b] p-4 md:p-6">
          <PencilToolbar
            activeTool={tool}
            canRedo={canRedo}
            canUndo={canUndo}
            onClear={clearPage}
            onRedo={redo}
            onToolChange={setTool}
            onUndo={undo}
          />
          <canvas
            ref={canvasRef}
            className="h-auto w-full max-w-[820px] touch-none rounded-[4px] border border-[#3a2b23]/70 shadow-[0_18px_70px_rgba(0,0,0,0.42)]"
            style={{ aspectRatio: `${PAGE_WIDTH} / ${PAGE_HEIGHT}` }}
            onPointerDown={startStroke}
            onPointerMove={extendStroke}
            onPointerUp={finishStroke}
            onPointerCancel={finishStroke}
          />
          <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full border border-white/[0.06] bg-[#15110e]/75 px-3 py-1.5 text-[11px] font-medium tracking-[0.06em] text-[#8f8982] backdrop-blur">
            Page {currentPageIndex + 1} of {pages.length}
          </div>
        </div>
      </div>

      {devMode && (
        <div className="grid gap-4 border-t border-white/[0.06] bg-[#15110e] p-4 md:grid-cols-[220px_1fr]">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8f8982]">
              Stroke replay preview
            </p>
            <StrokeRenderer page={currentPage} width={260} height={336} />
          </div>
          <pre className="max-h-64 overflow-auto rounded-[6px] border border-white/[0.06] bg-[#100d0b] p-3 text-[11px] leading-relaxed text-[#9b8f84]">
            {JSON.stringify({ page: currentPageIndex + 1, strokes: currentPage?.strokes || [] }, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
})

export default HandwritingCanvas
