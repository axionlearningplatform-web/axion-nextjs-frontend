"use client"

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"

import PageNavigator from "@/components/answering/PageNavigator"
import PencilToolbar from "@/components/answering/PencilToolbar"
import { cn } from "@/lib/utils"
import { exportHandwrittenAnswer } from "@/services/handwriting/answer_export"
import { drawPageStrokes, drawStroke } from "@/services/handwriting/render_submission"
import { createPoint, createStroke } from "@/services/handwriting/stroke_serializer"

const PAGE_WIDTH = 820
const PAGE_HEIGHT = 1060
const PEN_COLOR = "#e8d6c4"
const PEN_WIDTH = 4.4
const DEFAULT_ERASER_SIZE = 24

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

function strokeNearPoint(stroke, point, radius) {
  const points = stroke.points || []
  if (!points.length || !point) return false
  if (points.length === 1) return Math.hypot(points[0].x - point.x, points[0].y - point.y) <= radius

  for (let index = 1; index < points.length; index += 1) {
    if (distanceToSegment(point, points[index - 1], points[index]) <= radius) {
      return true
    }
  }
  return false
}

function strokeIntersectsEraser(stroke, eraserPoints, radius) {
  for (const eraserPoint of eraserPoints || []) {
    if (strokeNearPoint(stroke, eraserPoint, radius)) return true
  }

  for (const point of stroke.points || []) {
    for (let index = 1; index < (eraserPoints || []).length; index += 1) {
      if (distanceToSegment(point, eraserPoints[index - 1], eraserPoints[index]) <= radius) return true
    }
  }
  return false
}

function drawEraserTarget(ctx, stroke) {
  ctx.save()
  ctx.globalAlpha = 0.26
  drawStroke(ctx, { ...stroke, color: "#f3b184", width: Math.max((stroke.width || PEN_WIDTH) + 8, 11) })
  ctx.globalAlpha = 0.92
  drawStroke(ctx, { ...stroke, color: "#f8d5be", width: Math.max((stroke.width || PEN_WIDTH) + 2, 6) })
  ctx.restore()
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
  const writingSurfaceRef = useRef(null)
  const frameRef = useRef(null)
  const activePointerRef = useRef(null)
  const currentStrokeRef = useRef(null)
  const eraserPreviewRef = useRef({ point: null, strokeIds: new Set() })
  const pagesRef = useRef([createPage(0)])
  const [pages, setPages] = useState(pagesRef.current)
  const [currentPageIndex, setCurrentPageIndex] = useState(0)
  const [tool, setTool] = useState("pen")
  const [eraserSize, setEraserSize] = useState(DEFAULT_ERASER_SIZE)
  const [eraserPoint, setEraserPoint] = useState(null)
  const [writingSurfaceActive, setWritingSurfaceActive] = useState(false)

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
    const pageStrokes = pagesRef.current[currentPageIndex]?.strokes || []
    const visibleStrokes = strokeOverride?.tool === "pen" || strokeOverride?.tool === "pixel-eraser"
      ? [...pageStrokes, strokeOverride]
      : pageStrokes
    drawPageStrokes(ctx, visibleStrokes, { height: PAGE_HEIGHT, pixelRatio: canvasScale, width: PAGE_WIDTH })
    const previewStrokeIds = eraserPreviewRef.current.strokeIds
    if (previewStrokeIds?.size) {
      pageStrokes
        .filter((stroke) => previewStrokeIds.has(stroke.id))
        .forEach((stroke) => drawEraserTarget(ctx, stroke))
    }
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

  useEffect(() => {
    if (tool === "stroke-eraser" || tool === "pixel-eraser") return
    eraserPreviewRef.current = { point: null, strokeIds: new Set() }
    setEraserPoint(null)
    scheduleRender()
  }, [scheduleRender, tool])

  useEffect(() => {
    if (!writingSurfaceActive) return undefined
    function handleKeyDown(event) {
      if (event.key === "e" || event.key === "E") {
        event.preventDefault()
        setTool((currentTool) => (currentTool === "stroke-eraser" || currentTool === "pixel-eraser" ? "pen" : "stroke-eraser"))
      }
      if (event.key === "p" || event.key === "P") {
        event.preventDefault()
        setTool("pen")
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [writingSurfaceActive])

  function updateCurrentPage(updater) {
    const nextPages = pagesRef.current.map((page, index) =>
      index === currentPageIndex ? updater(page) : page
    )
    commitPages(nextPages)
  }

  function updateEraserPreview(event) {
    if ((tool !== "stroke-eraser" && tool !== "pixel-eraser") || !canvasRef.current) return
    const point = createPoint(event, canvasRef.current)
    const strokeIds = tool === "stroke-eraser"
      ? new Set(
        (pagesRef.current[currentPageIndex]?.strokes || [])
          .filter((stroke) => stroke.tool !== "pixel-eraser" && strokeNearPoint(stroke, point, eraserSize))
          .map((stroke) => stroke.id)
      )
      : new Set()
    eraserPreviewRef.current = { point, strokeIds }
    setEraserPoint({ ...point, hitCount: tool === "stroke-eraser" ? strokeIds.size : 0 })
    scheduleRender(currentStrokeRef.current)
  }

  function clearEraserPreview() {
    eraserPreviewRef.current = { point: null, strokeIds: new Set() }
    setEraserPoint(null)
    scheduleRender()
  }

  function preventWritingAreaBrowserGesture(event) {
    event.preventDefault()
  }

  function startStroke(event) {
    if (!canvasRef.current) return
    if (event.pointerType === "touch" && event.width > 45) return
    event.preventDefault()
    updateEraserPreview(event)
    activePointerRef.current = event.pointerId
    canvasRef.current.setPointerCapture(event.pointerId)
    const point = createPoint(event, canvasRef.current)
    currentStrokeRef.current = createStroke({
      tool,
      color: PEN_COLOR,
      width: tool === "pen" ? PEN_WIDTH : eraserSize * 2,
      points: [point],
    })
    scheduleRender(currentStrokeRef.current)
  }

  function extendStroke(event) {
    updateEraserPreview(event)
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
    updateEraserPreview(event)
    const completedStroke = currentStrokeRef.current
    activePointerRef.current = null
    currentStrokeRef.current = null
    if (completedStroke.tool === "stroke-eraser") {
      const strokeEraserRadius = Math.max((completedStroke.width || eraserSize * 2) / 2, 1)
      updateCurrentPage((page) => {
        const removed = page.strokes.filter((stroke) =>
          stroke.tool !== "pixel-eraser" && strokeIntersectsEraser(stroke, completedStroke.points, strokeEraserRadius)
        )
        if (!removed.length) return page
        const removedIds = new Set(removed.map((stroke) => stroke.id))
        return {
          ...page,
          strokes: page.strokes.filter((stroke) => !removedIds.has(stroke.id)),
          history: [...(page.history || []), { type: "erase", strokes: removed }],
          redoStack: [],
        }
      })
      eraserPreviewRef.current = { point: eraserPreviewRef.current.point, strokeIds: new Set() }
      scheduleRender()
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

  function deletePage(pageIndex) {
    if (pagesRef.current.length <= 1) return
    const nextPages = pagesRef.current
      .filter((_, index) => index !== pageIndex)
      .map((page, index) => ({ ...page, page_number: index + 1 }))
    commitPages(nextPages)
    setCurrentPageIndex((index) => {
      if (index === pageIndex) return Math.max(0, pageIndex - 1)
      if (index > pageIndex) return index - 1
      return Math.min(index, nextPages.length - 1)
    })
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
          onDeletePage={deletePage}
          onSelectPage={setCurrentPageIndex}
          pages={pages}
        />
        <div
          ref={writingSurfaceRef}
          className="relative flex min-w-0 flex-1 justify-center overflow-auto overscroll-contain bg-[#100d0b] p-4 outline-none select-none [-webkit-touch-callout:none] [-webkit-user-drag:none] [-webkit-user-select:none] md:p-6"
          onContextMenu={preventWritingAreaBrowserGesture}
          onDragStart={preventWritingAreaBrowserGesture}
          onPointerEnter={() => setWritingSurfaceActive(true)}
          onPointerLeave={() => {
            setWritingSurfaceActive(false)
            clearEraserPreview()
          }}
          onSelect={preventWritingAreaBrowserGesture}
          onSelectCapture={preventWritingAreaBrowserGesture}
        >
          <PencilToolbar
            activeTool={tool}
            canRedo={canRedo}
            canUndo={canUndo}
            eraserSize={eraserSize}
            onClear={clearPage}
            onEraserSizeChange={setEraserSize}
            onRedo={redo}
            onToolChange={setTool}
            onUndo={undo}
          />
          <div
            className="relative h-auto w-full max-w-[820px]"
            style={{ aspectRatio: `${PAGE_WIDTH} / ${PAGE_HEIGHT}` }}
          >
            <canvas
              ref={canvasRef}
              draggable={false}
              className="block h-full w-full touch-none rounded-[4px] border border-[#3a2b23]/70 shadow-[0_18px_70px_rgba(0,0,0,0.42)] select-none [-webkit-touch-callout:none] [-webkit-user-drag:none] [-webkit-user-select:none] [touch-action:none]"
              onContextMenu={preventWritingAreaBrowserGesture}
              onDragStart={preventWritingAreaBrowserGesture}
              onPointerCancel={finishStroke}
              onPointerDown={startStroke}
              onPointerEnter={(event) => updateEraserPreview(event)}
              onPointerLeave={clearEraserPreview}
              onPointerMove={extendStroke}
              onPointerUp={finishStroke}
            />
            {(tool === "stroke-eraser" || tool === "pixel-eraser") && eraserPoint && (
              <>
                <div
                  className="pointer-events-none absolute z-10 rounded-full border border-[#f6c8aa]/85 bg-[#f1d0b9]/10 shadow-[0_0_0_1px_rgba(0,0,0,0.28),0_0_24px_rgba(212,154,113,0.28)] transition-[height,width,opacity] duration-100"
                  style={{
                    height: eraserSize * 2,
                    left: eraserPoint.x,
                    top: eraserPoint.y,
                    transform: "translate(-50%, -50%)",
                    width: eraserSize * 2,
                  }}
                />
                <div
                  className={cn(
                    "pointer-events-none absolute z-10 rounded-full transition-all duration-100",
                    eraserPoint.hitCount
                      ? "size-2.5 bg-[#f6c8aa] shadow-[0_0_18px_rgba(246,200,170,0.72)]"
                      : "size-1.5 bg-[#8f8982]/70"
                  )}
                  style={{
                    left: eraserPoint.x,
                    top: eraserPoint.y,
                    transform: "translate(-50%, -50%)",
                  }}
                />
              </>
            )}
          </div>
          <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full border border-white/[0.06] bg-[#15110e]/75 px-3 py-1.5 text-[11px] font-medium tracking-[0.06em] text-[#8f8982] backdrop-blur">
            Page {currentPageIndex + 1} of {pages.length}
          </div>
        </div>
      </div>
    </div>
  )
})

export default HandwritingCanvas
