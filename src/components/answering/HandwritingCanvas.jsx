"use client"

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"

import PageNavigator from "@/components/answering/PageNavigator"
import PencilToolbar from "@/components/answering/PencilToolbar"
import { exportHandwrittenAnswer } from "@/services/handwriting/answer_export"
import { drawStroke } from "@/services/handwriting/render_submission"
import { createPoint, createStroke } from "@/services/handwriting/stroke_serializer"

const PAGE_WIDTH = 820
const PAGE_HEIGHT = 1060
const PEN_COLOR = "#e8d6c4"
const PEN_WIDTH = 4.4
const ERASER_RADIUS = 20

function createPage(index) {
  return {
    id: crypto.randomUUID(),
    page_number: index + 1,
    strokes: [],
    history: [],
    redoStack: [],
  }
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y)
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)))
  const x = start.x + t * dx
  const y = start.y + t * dy
  return Math.hypot(point.x - x, point.y - y)
}

function strokeIntersectsEraser(stroke, eraserPoints) {
  for (const point of stroke.points || []) {
    for (let index = 1; index < eraserPoints.length; index += 1) {
      if (distanceToSegment(point, eraserPoints[index - 1], eraserPoints[index]) <= ERASER_RADIUS) {
        return true
      }
    }
  }
  return false
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
  { onSubmit, questionId },
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
  const canUndo = Boolean(currentPage?.history?.length)
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
    if (strokeOverride?.tool === "pen") drawStroke(ctx, strokeOverride)
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
      color: PEN_COLOR,
      width: PEN_WIDTH,
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
    if (completedStroke.tool === "eraser") {
      updateCurrentPage((page) => {
        const removed = page.strokes.filter((stroke) => strokeIntersectsEraser(stroke, completedStroke.points))
        if (!removed.length) return page
        const removedIds = new Set(removed.map((stroke) => stroke.id))
        return {
          ...page,
          strokes: page.strokes.filter((stroke) => !removedIds.has(stroke.id)),
          history: [...(page.history || []), { type: "erase", strokes: removed }],
          redoStack: [],
        }
      })
      return
    }
    updateCurrentPage((page) => ({
      ...page,
      strokes: [...page.strokes, completedStroke],
      history: [...(page.history || []), { type: "add", stroke: completedStroke }],
      redoStack: [],
    }))
  }

  function undo() {
    updateCurrentPage((page) => {
      const history = page.history || []
      if (!history.length) return page
      const action = history[history.length - 1]
      if (action.type === "add") {
        return {
          ...page,
          strokes: page.strokes.filter((stroke) => stroke.id !== action.stroke.id),
          history: history.slice(0, -1),
          redoStack: [action, ...page.redoStack],
        }
      }
      return {
        ...page,
        strokes: [...page.strokes, ...action.strokes],
        history: history.slice(0, -1),
        redoStack: [action, ...page.redoStack],
      }
    })
  }

  function redo() {
    updateCurrentPage((page) => {
      if (!page.redoStack.length) return page
      const [action, ...redoStack] = page.redoStack
      if (action.type === "add") {
        return {
          ...page,
          strokes: [...page.strokes, action.stroke],
          history: [...(page.history || []), action],
          redoStack,
        }
      }
      const removedIds = new Set(action.strokes.map((stroke) => stroke.id))
      return {
        ...page,
        strokes: page.strokes.filter((stroke) => !removedIds.has(stroke.id)),
        history: [...(page.history || []), action],
        redoStack,
      }
    })
  }

  function clearPage() {
    updateCurrentPage((page) => ({
      ...page,
      strokes: [],
      history: page.strokes.length ? [...(page.history || []), { type: "erase", strokes: page.strokes }] : page.history,
      redoStack: [],
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
    </div>
  )
})

export default HandwritingCanvas
