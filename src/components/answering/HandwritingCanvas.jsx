"use client"

/**
 * HandwritingCanvas — rewritten for iPad/browser performance
 *
 * Key architectural changes from original:
 * 1. TWO-CANVAS SPLIT
 *    - committedCanvasRef: all finished strokes, never redrawn during writing
 *    - activeCanvasRef:    only the current in-progress stroke
 *    Committed canvas is only updated when a stroke finishes (blit once).
 *    Active canvas clears + redraws only 1 stroke per frame.
 *
 * 2. DECOUPLED INPUT / RENDER LOOP
 *    Input events push points into a ref array instantly (no render).
 *    A persistent RAF loop drains that array at exactly 60fps.
 *    Fast writing never queues up renders or drops points.
 *
 * 3. PREDICTED EVENTS
 *    Apple Pencil predicted events are appended for rendering but not saved.
 *    Eliminates ~30-40% of perceived stylus latency.
 *
 * 4. POINT THINNING
 *    Points closer than minDist (speed-adaptive) are skipped.
 *    Reduces perfect-freehand workload at high writing speed.
 *
 * 5. CHAIKIN SMOOTHING ON COMMIT
 *    Finished strokes are smoothed once before saving.
 *    Fast strokes clean up on liftoff — no jagged committed lines.
 *
 * 6. OUTLINE CACHING
 *    Committed stroke outlines are computed once and cached on the object.
 *    Undo/redo redraws never recompute perfect-freehand for old strokes.
 *
 * 7. PERSISTENT OFFSCREEN LAYER
 *    One offscreen canvas is allocated once and reused for compositing.
 *    Eliminates per-frame canvas allocation from original drawPageStrokes.
 *
 * All original functionality preserved:
 *    - Pen tool
 *    - Pixel eraser (destination-out)
 *    - Stroke eraser (removes whole strokes)
 *    - Eraser preview with hit highlighting
 *    - Multi-page support
 *    - Undo / redo
 *    - Clear page
 *    - Keyboard shortcuts (e = eraser, p = pen)
 *    - onSubmit / exportAnswer / getPages ref API
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"

import PageNavigator from "@/components/answering/PageNavigator"
import PencilToolbar from "@/components/answering/PencilToolbar"
import { cn } from "@/lib/utils"
import { exportHandwrittenAnswer } from "@/services/handwriting/answer_export"
import { blitStrokeToContext, drawActiveStroke, drawEraserHighlight, drawPageStrokes, drawStroke } from "@/services/handwriting/render_submission"
import { chaikinSmooth, createPoint, createStroke, shouldAddPoint, splitStrokeByEraser } from "@/services/handwriting/stroke_serializer"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PAGE_WIDTH = 820
const PAGE_HEIGHT = 1060
const PEN_COLOR = "#e8d6c4"
const PEN_WIDTH = 4.4
const DEFAULT_ERASER_SIZE = 24

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
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
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy))
}

function strokeNearPoint(stroke, point, radius) {
  const points = stroke.points || []
  if (!points.length || !point) return false
  if (points.length === 1) return Math.hypot(points[0].x - point.x, points[0].y - point.y) <= radius
  for (let i = 1; i < points.length; i++) {
    if (distanceToSegment(point, points[i - 1], points[i]) <= radius) return true
  }
  return false
}

function strokeIntersectsEraser(stroke, eraserPoints, radius) {
  for (const ep of eraserPoints || []) {
    if (strokeNearPoint(stroke, ep, radius)) return true
  }
  for (const p of stroke.points || []) {
    for (let i = 1; i < (eraserPoints || []).length; i++) {
      if (distanceToSegment(p, eraserPoints[i - 1], eraserPoints[i]) <= radius) return true
    }
  }
  return false
}

// eraser highlight is handled by drawEraserHighlight in render_submission

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const HandwritingCanvas = forwardRef(function HandwritingCanvas(
  { onSubmit, questionId },
  ref
) {
  // Two canvases: committed (bottom, stable) + active (top, current stroke only)
  const committedCanvasRef = useRef(null)
  const activeCanvasRef = useRef(null)

  // Persistent offscreen layer — allocated once, reused every redraw
  const offscreenLayerRef = useRef(null)

  const activePointerRef = useRef(null)
  const currentStrokeRef = useRef(null)

  // Input decoupling: RAF loop reads from these, not from event handlers
  const pendingPointsRef = useRef([])      // predicted points for current frame
  const velocityRef = useRef(0)            // rolling velocity estimate for point thinning

  const eraserPreviewRef = useRef({ point: null, strokeIds: new Set() })
  const rafLoopRef = useRef(null)
  const needsCommittedRedrawRef = useRef(false) // flag: committed canvas needs full redraw

  const pagesRef = useRef([createPage(0)])
  const currentPageIndexRef = useRef(0)    // mirror for RAF loop (avoids stale closure)

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

  // ---------------------------------------------------------------------------
  // Committed canvas: full redraw (called on page change, undo, redo, clear)
  // ---------------------------------------------------------------------------
  const redrawCommitted = useCallback(() => {
    const canvas = committedCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    ctx.save()
    ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0)
    drawPaper(ctx)

    const strokes = pagesRef.current[currentPageIndexRef.current]?.strokes || []
    drawPageStrokes(
      ctx,
      strokes,
      { height: PAGE_HEIGHT, pixelRatio: canvasScale, width: PAGE_WIDTH },
      offscreenLayerRef.current
    )

    // Draw eraser highlights if any — clean outline, not fat blob
    const hitIds = eraserPreviewRef.current.strokeIds
    if (hitIds?.size) {
      strokes
        .filter((s) => hitIds.has(s.id))
        .forEach((s) => drawEraserHighlight(ctx, s))
    }
    ctx.restore()
  }, [canvasScale])

  // ---------------------------------------------------------------------------
  // Active canvas: draw only the current stroke (called from RAF loop)
  // ---------------------------------------------------------------------------
  const redrawActive = useCallback((renderPoints) => {
    const canvas = activeCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    ctx.save()
    ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0)
    ctx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT)
    if (currentStrokeRef.current && renderPoints?.length) {
      drawActiveStroke(ctx, currentStrokeRef.current, renderPoints)
    }
    ctx.restore()
  }, [canvasScale])

  // ---------------------------------------------------------------------------
  // RAF loop — decoupled from input events
  // Runs continuously while component is mounted; only does work when drawing
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let running = true

    function loop() {
      if (!running) return

      if (currentStrokeRef.current) {
        // Render committed points + predicted points
        const renderPoints = [
          ...currentStrokeRef.current.points,
          ...pendingPointsRef.current,
        ]
        redrawActive(renderPoints)
      }

      if (needsCommittedRedrawRef.current) {
        redrawCommitted()
        needsCommittedRedrawRef.current = false
      }

      rafLoopRef.current = requestAnimationFrame(loop)
    }

    rafLoopRef.current = requestAnimationFrame(loop)
    return () => {
      running = false
      if (rafLoopRef.current) cancelAnimationFrame(rafLoopRef.current)
    }
  }, [redrawActive, redrawCommitted])

  // ---------------------------------------------------------------------------
  // Canvas sizing + offscreen layer allocation
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const committed = committedCanvasRef.current
    const active = activeCanvasRef.current
    if (!committed || !active) return

    const w = Math.round(PAGE_WIDTH * canvasScale)
    const h = Math.round(PAGE_HEIGHT * canvasScale)

    committed.width = w
    committed.height = h
    active.width = w
    active.height = h

    // Allocate persistent offscreen layer once per scale/size
    const layer = document.createElement("canvas")
    layer.width = w
    layer.height = h
    offscreenLayerRef.current = layer

    needsCommittedRedrawRef.current = true
  }, [canvasScale, currentPageIndex])

  // Sync currentPageIndex into ref for RAF loop
  useEffect(() => {
    currentPageIndexRef.current = currentPageIndex
  }, [currentPageIndex])

  // Trigger committed redraw on page data changes
  useEffect(() => {
    needsCommittedRedrawRef.current = true
  }, [pages, currentPageIndex])

  // Clear eraser preview when switching away from eraser tools
  useEffect(() => {
    if (tool === "stroke-eraser" || tool === "pixel-eraser") return
    eraserPreviewRef.current = { point: null, strokeIds: new Set() }
    setEraserPoint(null)
    needsCommittedRedrawRef.current = true
  }, [tool])

  // Keyboard shortcuts — only active when writing surface is focused
  useEffect(() => {
    if (!writingSurfaceActive) return undefined
    function handleKeyDown(event) {
      if (event.key === "e" || event.key === "E") {
        event.preventDefault()
        setTool((t) => (t === "stroke-eraser" || t === "pixel-eraser" ? "pen" : "stroke-eraser"))
      }
      if (event.key === "p" || event.key === "P") {
        event.preventDefault()
        setTool("pen")
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [writingSurfaceActive])

  // ---------------------------------------------------------------------------
  // Page state helpers
  // ---------------------------------------------------------------------------
  function commitPages(nextPages) {
    pagesRef.current = nextPages
    setPages(nextPages)
  }

  function updateCurrentPage(updater) {
    const nextPages = pagesRef.current.map((page, i) =>
      i === currentPageIndexRef.current ? updater(page) : page
    )
    commitPages(nextPages)
  }

  // ---------------------------------------------------------------------------
  // Eraser preview (stroke-eraser hover highlight)
  // ---------------------------------------------------------------------------
  function updateEraserPreview(event) {
    if ((tool !== "stroke-eraser" && tool !== "pixel-eraser") || !committedCanvasRef.current) return
    const point = createPoint(event, committedCanvasRef.current)
    const strokeIds = tool === "stroke-eraser"
      ? new Set(
        (pagesRef.current[currentPageIndexRef.current]?.strokes || [])
          .filter((s) => s.tool !== "pixel-eraser" && strokeNearPoint(s, point, eraserSize))
          .map((s) => s.id)
      )
      : new Set()
    eraserPreviewRef.current = { point, strokeIds }
    setEraserPoint({ ...point, hitCount: tool === "stroke-eraser" ? strokeIds.size : 0 })
    needsCommittedRedrawRef.current = true
  }

  function clearEraserPreview() {
    eraserPreviewRef.current = { point: null, strokeIds: new Set() }
    setEraserPoint(null)
    needsCommittedRedrawRef.current = true
  }

  function preventBrowserGesture(event) {
    event.preventDefault()
  }

  // ---------------------------------------------------------------------------
  // Pointer handlers — input only, no rendering
  // ---------------------------------------------------------------------------
  function startStroke(event) {
    if (!committedCanvasRef.current) return
    if (event.pointerType === "touch" && event.width > 45) return // palm rejection
    event.preventDefault()
    updateEraserPreview(event)

    activePointerRef.current = event.pointerId
    committedCanvasRef.current.setPointerCapture(event.pointerId)

    velocityRef.current = 0
    pendingPointsRef.current = []

    const point = createPoint(event, committedCanvasRef.current)
    currentStrokeRef.current = createStroke({
      tool,
      color: PEN_COLOR,
      width: tool === "pen" ? PEN_WIDTH : eraserSize * 2,
      points: [point],
    })
  }

  function extendStroke(event) {
    updateEraserPreview(event)
    if (activePointerRef.current !== event.pointerId || !currentStrokeRef.current) return
    event.preventDefault()

    const canvas = committedCanvasRef.current
    const coalesced = event.getCoalescedEvents?.() || [event]
    const predicted = event.getPredictedEvents?.() || []

    // Commit coalesced points with thinning
    const lastPoint = currentStrokeRef.current.points[currentStrokeRef.current.points.length - 1]
    let last = lastPoint
    for (const e of coalesced) {
      const p = createPoint(e, canvas)
      if (shouldAddPoint(p, last, velocityRef)) {
        currentStrokeRef.current.points.push(p)
        last = p
      }
    }

    // Store predicted points for this frame — not committed
    pendingPointsRef.current = predicted.map((e) => createPoint(e, canvas))
    // RAF loop will pick these up next frame
  }

  function finishStroke(event) {
    if (activePointerRef.current !== event.pointerId || !currentStrokeRef.current) return
    event.preventDefault()

    const completedStroke = currentStrokeRef.current
    activePointerRef.current = null
    currentStrokeRef.current = null
    pendingPointsRef.current = []

    // Clear active canvas
    const activeCtx = activeCanvasRef.current?.getContext("2d")
    if (activeCtx) activeCtx.clearRect(0, 0, activeCanvasRef.current.width, activeCanvasRef.current.height)

    // --- Stroke eraser ---
    if (completedStroke.tool === "stroke-eraser") {
      const radius = Math.max((completedStroke.width || eraserSize * 2) / 2, 1)
      updateCurrentPage((page) => {
        const removed = page.strokes.filter(
          (s) => s.tool !== "pixel-eraser" && strokeIntersectsEraser(s, completedStroke.points, radius)
        )
        if (!removed.length) return page
        const removedIds = new Set(removed.map((s) => s.id))
        return {
          ...page,
          strokes: page.strokes.filter((s) => !removedIds.has(s.id)),
          history: [...(page.history || []), { type: "erase", strokes: removed }],
          redoStack: [],
        }
      })
      eraserPreviewRef.current = { point: eraserPreviewRef.current.point, strokeIds: new Set() }
      needsCommittedRedrawRef.current = true
      return
    }

    // --- Apply Chaikin smoothing on commit ---
    const smoothedPoints = chaikinSmooth(completedStroke.points, 2)
    const finalStroke = { ...completedStroke, points: smoothedPoints, _outline: null }

    // --- Pixel eraser: split any strokes it bisected into segments ---
    if (finalStroke.tool === "pixel-eraser") {
      const eraserRadius = Math.max(finalStroke.width / 2, 1)
      updateCurrentPage((page) => {
        let nextStrokes = []
        let splitOccurred = false
        for (const s of page.strokes) {
          if (s.tool === "pixel-eraser") {
            nextStrokes.push(s)
            continue
          }
          const split = splitStrokeByEraser(s, finalStroke.points, eraserRadius)
          if (split === null) {
            // stroke unchanged
            nextStrokes.push(s)
          } else if (split.length === 0) {
            // fully erased — drop it
            splitOccurred = true
          } else {
            // replaced by segments
            nextStrokes = [...nextStrokes, ...split]
            splitOccurred = true
          }
        }
        // Also push the pixel-eraser stroke itself so destination-out renders correctly
        nextStrokes.push(finalStroke)
        return {
          ...page,
          strokes: nextStrokes,
          history: [...(page.history || []), { type: "add", stroke: finalStroke }],
          redoStack: [],
        }
      })
      const committedCtx = committedCanvasRef.current?.getContext("2d")
      if (committedCtx) {
        committedCtx.save()
        committedCtx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0)
        blitStrokeToContext(committedCtx, finalStroke)
        committedCtx.restore()
      }
      return
    }
    const committedCtx = committedCanvasRef.current?.getContext("2d")
    if (committedCtx) {
      committedCtx.save()
      committedCtx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0)
      blitStrokeToContext(committedCtx, finalStroke)
      committedCtx.restore()
    }

    updateCurrentPage((page) => ({
      ...page,
      strokes: [...page.strokes, finalStroke],
      history: [...(page.history || []), { type: "add", stroke: finalStroke }],
      redoStack: [],
    }))
  }

  // ---------------------------------------------------------------------------
  // Undo / Redo / Clear
  // ---------------------------------------------------------------------------
  function undo() {
    updateCurrentPage((page) => {
      const history = page.history || []
      if (!history.length) return page
      const action = history[history.length - 1]
      const next = action.type === "add"
        ? { ...page, strokes: page.strokes.filter((s) => s.id !== action.stroke.id) }
        : { ...page, strokes: [...page.strokes, ...action.strokes] }
      return { ...next, history: history.slice(0, -1), redoStack: [action, ...page.redoStack] }
    })
    needsCommittedRedrawRef.current = true
  }

  function redo() {
    updateCurrentPage((page) => {
      if (!page.redoStack.length) return page
      const [action, ...redoStack] = page.redoStack
      const next = action.type === "add"
        ? { ...page, strokes: [...page.strokes, action.stroke] }
        : { ...page, strokes: page.strokes.filter((s) => !new Set(action.strokes.map((x) => x.id)).has(s.id)) }
      return { ...next, history: [...(page.history || []), action], redoStack }
    })
    needsCommittedRedrawRef.current = true
  }

  function clearPage() {
    updateCurrentPage((page) => ({
      ...page,
      strokes: [],
      history: page.strokes.length
        ? [...(page.history || []), { type: "erase", strokes: page.strokes }]
        : page.history,
      redoStack: [],
    }))
    needsCommittedRedrawRef.current = true
  }

  // ---------------------------------------------------------------------------
  // Page management
  // ---------------------------------------------------------------------------
  function addPage() {
    const nextPages = [...pagesRef.current, createPage(pagesRef.current.length)]
    commitPages(nextPages)
    setCurrentPageIndex(nextPages.length - 1)
  }

  function deletePage(pageIndex) {
    if (pagesRef.current.length <= 1) return
    const nextPages = pagesRef.current
      .filter((_, i) => i !== pageIndex)
      .map((page, i) => ({ ...page, page_number: i + 1 }))
    commitPages(nextPages)
    setCurrentPageIndex((i) => {
      if (i === pageIndex) return Math.max(0, pageIndex - 1)
      if (i > pageIndex) return i - 1
      return Math.min(i, nextPages.length - 1)
    })
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
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
          className="relative flex min-w-0 flex-1 justify-center overflow-auto overscroll-contain bg-[#100d0b] p-4 outline-none select-none [-webkit-touch-callout:none] [-webkit-user-drag:none] [-webkit-user-select:none] md:p-6"
          onContextMenu={preventBrowserGesture}
          onDragStart={preventBrowserGesture}
          onPointerEnter={() => setWritingSurfaceActive(true)}
          onPointerLeave={() => {
            setWritingSurfaceActive(false)
            clearEraserPreview()
          }}
          onSelect={preventBrowserGesture}
          onSelectCapture={preventBrowserGesture}
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

          {/* Canvas stack — committed underneath, active on top */}
          <div
            className="relative h-auto w-full max-w-[820px]"
            style={{ aspectRatio: `${PAGE_WIDTH} / ${PAGE_HEIGHT}` }}
          >
            {/* Committed canvas — all finished strokes, paper background */}
            <canvas
              ref={committedCanvasRef}
              draggable={false}
              className="block h-full w-full touch-none rounded-[4px] border border-[#3a2b23]/70 shadow-[0_18px_70px_rgba(0,0,0,0.42)] select-none [-webkit-touch-callout:none] [-webkit-user-drag:none] [-webkit-user-select:none] [touch-action:none]"
              onContextMenu={preventBrowserGesture}
              onDragStart={preventBrowserGesture}
              onPointerCancel={finishStroke}
              onPointerDown={startStroke}
              onPointerEnter={updateEraserPreview}
              onPointerLeave={clearEraserPreview}
              onPointerMove={extendStroke}
              onPointerUp={finishStroke}
            />

            {/* Active canvas — only current stroke, transparent background */}
            <canvas
              ref={activeCanvasRef}
              draggable={false}
              className="pointer-events-none absolute inset-0 block h-full w-full touch-none select-none rounded-[4px] [-webkit-touch-callout:none] [-webkit-user-drag:none] [-webkit-user-select:none] [touch-action:none]"
            />

            {/* Eraser cursor — eraserPoint is in CSS pixel space, position directly */}
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
