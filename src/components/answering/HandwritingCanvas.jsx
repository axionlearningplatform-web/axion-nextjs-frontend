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
const DEFAULT_ERASER_SIZE = 24
const PAPER_COLOR = "#191410"

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

function mergeRects(first, second) {
  if (!first) return second
  if (!second) return first
  const left = Math.min(first.left, second.left)
  const top = Math.min(first.top, second.top)
  const right = Math.max(first.left + first.width, second.left + second.width)
  const bottom = Math.max(first.top + first.height, second.top + second.height)
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  }
}

function getStrokeBounds(stroke) {
  const points = stroke?.points || []
  if (!points.length) return null

  let minX = points[0].x
  let minY = points[0].y
  let maxX = points[0].x
  let maxY = points[0].y
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }

  const padding = Math.max((stroke.width || PEN_WIDTH) * 2, 12)
  const left = Math.max(0, minX - padding)
  const top = Math.max(0, minY - padding)
  const right = Math.min(PAGE_WIDTH, maxX + padding)
  const bottom = Math.min(PAGE_HEIGHT, maxY + padding)
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  }
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
  ctx.fillStyle = PAPER_COLOR
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
  const backgroundCanvasRef = useRef(null)
  const inkCanvasRef = useRef(null)
  const liveCanvasRef = useRef(null)
  const overlayCanvasRef = useRef(null)
  const writingSurfaceRef = useRef(null)
  const liveFrameRef = useRef(null)
  const activePointerRef = useRef(null)
  const currentStrokeRef = useRef(null)
  const liveDirtyRectRef = useRef(null)
  const skipNextCommittedInkRedrawRef = useRef(null)
  const eraserPreviewRef = useRef({ point: null, strokeIds: new Set() })
  const pagesRef = useRef([createPage(0)])
  const [pages, setPages] = useState(pagesRef.current)
  const [currentPageIndex, setCurrentPageIndex] = useState(0)
  const [tool, setTool] = useState("pen")
  const [eraserSize, setEraserSize] = useState(DEFAULT_ERASER_SIZE)
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

  const configureCanvas = useCallback((canvas) => {
    if (!canvas) return
    canvas.width = PAGE_WIDTH * canvasScale
    canvas.height = PAGE_HEIGHT * canvasScale
    const ctx = canvas.getContext("2d")
    ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0)
  }, [canvasScale])

  const clearCanvas = useCallback((canvas) => {
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    ctx.save()
    ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0)
    ctx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT)
    ctx.restore()
    if (canvas === liveCanvasRef.current) liveDirtyRectRef.current = null
  }, [canvasScale])

  const renderBackground = useCallback(() => {
    const canvas = backgroundCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    ctx.save()
    ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0)
    drawPaper(ctx)
    ctx.restore()
  }, [canvasScale])

  const renderCommittedInk = useCallback(() => {
    const canvas = inkCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    ctx.save()
    ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0)
    ctx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT)
    const pageStrokes = pagesRef.current[currentPageIndex]?.strokes || []
    pageStrokes.forEach((stroke) => drawStroke(ctx, stroke))
    ctx.restore()
  }, [canvasScale, currentPageIndex])

  const drawStrokeToCommittedInk = useCallback((stroke) => {
    const canvas = inkCanvasRef.current
    if (!canvas || !stroke) return
    const ctx = canvas.getContext("2d")
    ctx.save()
    ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0)
    drawStroke(ctx, stroke)
    ctx.restore()
  }, [canvasScale])

  const renderLiveStroke = useCallback(() => {
    const stroke = currentStrokeRef.current
    const canvas = liveCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    const previousDirtyRect = liveDirtyRectRef.current
    const nextDirtyRect = getStrokeBounds(stroke)
    const clearRect = mergeRects(previousDirtyRect, nextDirtyRect)
    ctx.save()
    ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0)
    if (clearRect) {
      ctx.clearRect(clearRect.left, clearRect.top, clearRect.width, clearRect.height)
    } else {
      ctx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT)
    }
    if (stroke?.tool === "pen") {
      drawStroke(ctx, stroke)
    } else if (stroke?.tool === "pixel-eraser") {
      drawStroke(ctx, stroke, { color: PAPER_COLOR, tool: "pen" })
    }
    ctx.restore()
    liveDirtyRectRef.current = nextDirtyRect
    liveFrameRef.current = null
  }, [canvasScale])

  const scheduleLiveRender = useCallback(() => {
    if (liveFrameRef.current) return
    liveFrameRef.current = requestAnimationFrame(renderLiveStroke)
  }, [renderLiveStroke])

  const clearOverlay = useCallback(() => clearCanvas(overlayCanvasRef.current), [clearCanvas])

  const renderEraserOverlay = useCallback((point, strokeIds = new Set()) => {
    const canvas = overlayCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    ctx.save()
    ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0)
    ctx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT)
    if (strokeIds.size) {
      const pageStrokes = pagesRef.current[currentPageIndex]?.strokes || []
      pageStrokes
        .filter((stroke) => strokeIds.has(stroke.id))
        .forEach((stroke) => drawEraserTarget(ctx, stroke))
    }
    if (point) {
      ctx.beginPath()
      ctx.arc(point.x, point.y, eraserSize, 0, Math.PI * 2)
      ctx.fillStyle = "rgba(241, 208, 185, 0.1)"
      ctx.strokeStyle = "rgba(246, 200, 170, 0.85)"
      ctx.lineWidth = 1.2
      ctx.fill()
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(point.x, point.y, strokeIds.size ? 5 : 3, 0, Math.PI * 2)
      ctx.fillStyle = strokeIds.size ? "#f6c8aa" : "rgba(143, 137, 130, 0.7)"
      ctx.fill()
    }
    ctx.restore()
  }, [canvasScale, currentPageIndex, eraserSize])

  useEffect(() => {
    ;[
      backgroundCanvasRef.current,
      inkCanvasRef.current,
      liveCanvasRef.current,
      overlayCanvasRef.current,
    ].forEach(configureCanvas)
    renderBackground()
    renderCommittedInk()
    clearCanvas(liveCanvasRef.current)
    clearCanvas(overlayCanvasRef.current)
    return () => {
      if (liveFrameRef.current) cancelAnimationFrame(liveFrameRef.current)
    }
  }, [canvasScale, clearCanvas, configureCanvas, renderBackground, renderCommittedInk])

  useEffect(() => {
    const skipRedraw = skipNextCommittedInkRedrawRef.current
    const page = pagesRef.current[currentPageIndex]
    if (
      skipRedraw &&
      skipRedraw.pageId === page?.id &&
      page?.strokes?.some((stroke) => stroke.id === skipRedraw.strokeId)
    ) {
      skipNextCommittedInkRedrawRef.current = null
    } else {
      skipNextCommittedInkRedrawRef.current = null
      renderCommittedInk()
    }
    clearCanvas(liveCanvasRef.current)
    clearCanvas(overlayCanvasRef.current)
  }, [clearCanvas, pages, currentPageIndex, renderCommittedInk])

  useEffect(() => {
    if (tool === "stroke-eraser" || tool === "pixel-eraser") return
    eraserPreviewRef.current = { point: null, strokeIds: new Set() }
    clearOverlay()
  }, [clearOverlay, tool])

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

  function updateEraserPreview(event, rect = null) {
    const canvas = liveCanvasRef.current
    if ((tool !== "stroke-eraser" && tool !== "pixel-eraser") || !canvas) return
    const point = createPoint(event, canvas, rect || canvas.getBoundingClientRect())
    const strokeIds = tool === "stroke-eraser"
      ? new Set(
        (pagesRef.current[currentPageIndex]?.strokes || [])
          .filter((stroke) => stroke.tool !== "pixel-eraser" && strokeNearPoint(stroke, point, eraserSize))
          .map((stroke) => stroke.id)
      )
      : new Set()
    eraserPreviewRef.current = { point, strokeIds }
    renderEraserOverlay(point, strokeIds)
  }

  function clearEraserPreview() {
    eraserPreviewRef.current = { point: null, strokeIds: new Set() }
    clearOverlay()
  }

  function preventWritingAreaBrowserGesture(event) {
    event.preventDefault()
  }

  function startStroke(event) {
    const canvas = liveCanvasRef.current
    if (!canvas) return
    if (event.pointerType === "touch" && event.width > 45) return
    event.preventDefault()
    const rect = canvas.getBoundingClientRect()
    updateEraserPreview(event, rect)
    activePointerRef.current = event.pointerId
    canvas.setPointerCapture(event.pointerId)
    const point = createPoint(event, canvas, rect)
    currentStrokeRef.current = createStroke({
      tool,
      color: PEN_COLOR,
      width: tool === "pen" ? PEN_WIDTH : eraserSize * 2,
      points: [point],
    })
    scheduleLiveRender()
  }

  function extendStroke(event) {
    const canvas = liveCanvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    updateEraserPreview(event, rect)
    if (activePointerRef.current !== event.pointerId || !currentStrokeRef.current) return
    event.preventDefault()
    const events = event.getCoalescedEvents?.() || [event]
    events.forEach((coalescedEvent) => {
      currentStrokeRef.current.points.push(createPoint(coalescedEvent, canvas, rect))
    })
    scheduleLiveRender()
  }

  function finishStroke(event) {
    if (activePointerRef.current !== event.pointerId || !currentStrokeRef.current) return
    event.preventDefault()
    const rect = liveCanvasRef.current?.getBoundingClientRect()
    updateEraserPreview(event, rect)
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
      clearCanvas(liveCanvasRef.current)
      clearOverlay()
      return
    }
    skipNextCommittedInkRedrawRef.current = {
      pageId: pagesRef.current[currentPageIndex]?.id,
      strokeId: completedStroke.id,
    }
    updateCurrentPage((page) => {
      const nextPage = {
        ...page,
        strokes: [...page.strokes, completedStroke],
        history: [...(page.history || []), { type: "add", stroke: completedStroke }],
        redoStack: [],
      }
      return nextPage
    })
    drawStrokeToCommittedInk(completedStroke)
    clearCanvas(liveCanvasRef.current)
    clearOverlay()
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
              ref={backgroundCanvasRef}
              draggable={false}
              className="absolute inset-0 block h-full w-full rounded-[4px] border border-[#3a2b23]/70 shadow-[0_18px_70px_rgba(0,0,0,0.42)]"
            />
            <canvas
              ref={inkCanvasRef}
              draggable={false}
              className="pointer-events-none absolute inset-0 block h-full w-full rounded-[4px]"
            />
            <canvas
              ref={liveCanvasRef}
              draggable={false}
              className="absolute inset-0 block h-full w-full touch-none rounded-[4px] select-none [-webkit-touch-callout:none] [-webkit-user-drag:none] [-webkit-user-select:none] [touch-action:none]"
              onContextMenu={preventWritingAreaBrowserGesture}
              onDragStart={preventWritingAreaBrowserGesture}
              onPointerCancel={finishStroke}
              onPointerDown={startStroke}
              onPointerEnter={(event) => updateEraserPreview(event)}
              onPointerLeave={clearEraserPreview}
              onPointerMove={extendStroke}
              onPointerUp={finishStroke}
            />
            <canvas
              ref={overlayCanvasRef}
              draggable={false}
              className="pointer-events-none absolute inset-0 block h-full w-full rounded-[4px]"
            />
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
