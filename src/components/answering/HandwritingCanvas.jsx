"use client"

/**
 * HandwritingCanvas v3 — Incremental Ink Engine
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE CORE ARCHITECTURAL CHANGE
 * ─────────────────────────────────────────────────────────────────────────
 * Previous architecture:              This architecture:
 *   pointermove → push point            pointermove → draw ONE segment (O(1))
 *   RAF → clearRect + redraw all        RAF → prediction layer only (cheap)
 *   = O(n²) over stroke lifetime        = O(1) per move, always
 *
 * Every other "optimization" in v1/v2 was irrelevant while this existed.
 * A 500-point stroke redraws 500 segments per frame in the old model.
 * Here it draws exactly 1 segment per event, no matter how long the stroke.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LAYER STACK (bottom → top):
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ paperCanvas      — drawn once on mount/page-change, never touched   │
 * │ committedCanvas  — finished strokes (cumulative, freehand quality)  │
 * │ inkCanvas        — live ink: APPEND ONLY, never cleared mid-stroke  │
 * │ predCanvas       — RAF predicted ink, cleared every frame           │
 * │ activeCanvas     — pointer capture only (transparent, top layer)    │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PEN STROKE LIFECYCLE:
 *   pointerdown  → seed dot on inkCanvas
 *   pointermove  → append ONE segment to inkCanvas (O(1), no clear)
 *   pointerup    → clear inkCanvas, run perfect-freehand, blit to committed
 *
 * PIXEL ERASER LIFECYCLE:
 *   pointerdown  → destination-out circle on committedCanvas (instant)
 *   pointermove  → destination-out segment on committedCanvas (live, O(1))
 *   pointerup    → split stroke data, redraw committed from clean data
 *   Visual erase is immediate. Data reconciliation happens on lift.
 *
 * STROKE ERASER:
 *   Never draws anything on any canvas.
 *   Only maintains a Set<id> of highlighted strokes.
 *   Triggers committed redraw when the hit set changes.
 *   Removes on pointerup.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY NO clearRect ON inkCanvas DURING STROKE:
 *   clearRect forces the GPU to invalidate the entire canvas texture.
 *   On iPad, this takes ~2–5ms per frame. At 120Hz that's a 24–60% budget.
 *   By never clearing inkCanvas mid-stroke, we avoid this entirely.
 *   The raw segments look fine during writing; perfect-freehand replaces
 *   them instantly and invisibly on lift.
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
import { getStroke } from "perfect-freehand"
import { exportHandwrittenAnswer } from "@/services/handwriting/answer_export"

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const PAGE_WIDTH = 820
const PAGE_HEIGHT = 1060
const PEN_COLOR = "#e8d6c4"
const PEN_WIDTH = 4.4
const DEFAULT_ERASER_SIZE = 24

// ─────────────────────────────────────────────────────────────────────────────
// Geometry helpers
// ─────────────────────────────────────────────────────────────────────────────
function distanceToSegment(point, start, end) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (dx === 0 && dy === 0)
    return Math.hypot(point.x - start.x, point.y - start.y)
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) /
        (dx * dx + dy * dy)
    )
  )
  return Math.hypot(
    point.x - (start.x + t * dx),
    point.y - (start.y + t * dy)
  )
}

function strokeNearPoint(stroke, point, radius) {
  const pts = stroke.points || []
  if (!pts.length || !point) return false
  if (pts.length === 1)
    return Math.hypot(pts[0].x - point.x, pts[0].y - point.y) <= radius
  for (let i = 1; i < pts.length; i++) {
    if (distanceToSegment(point, pts[i - 1], pts[i]) <= radius) return true
  }
  return false
}

function strokeIntersectsPath(stroke, pathPoints, radius) {
  for (const ep of pathPoints || []) {
    if (strokeNearPoint(stroke, ep, radius)) return true
  }
  for (const p of stroke.points || []) {
    for (let i = 1; i < (pathPoints || []).length; i++) {
      if (distanceToSegment(p, pathPoints[i - 1], pathPoints[i]) <= radius)
        return true
    }
  }
  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// Point creation — CSS/logical pixel space
// ─────────────────────────────────────────────────────────────────────────────
/** Uses pre-synced bounds — never call getBoundingClientRect on the hot path. */
function createPoint(event, bounds) {
  const x = event.clientX - bounds.left
  const y = event.clientY - bounds.top
  let pressure
  if (event.pointerType === "pen") {
    pressure = Math.min(Math.max(event.pressure ?? 0.5, 0.08), 1.0)
  } else if (event.pressure > 0) {
    pressure = event.pressure
  }
  return { x, y, pressure, timestamp: performance.now() }
}

// ─────────────────────────────────────────────────────────────────────────────
// Point thinning — accept coalesced samples, reject only true duplicates/jitter
// ─────────────────────────────────────────────────────────────────────────────
function shouldAddPoint(newPoint, lastPoint, velocityRef) {
  if (!lastPoint) return true
  const dx = newPoint.x - lastPoint.x
  const dy = newPoint.y - lastPoint.y
  const dist = Math.hypot(dx, dy)
  if (velocityRef && newPoint.timestamp && lastPoint.timestamp) {
    const dt = Math.max(newPoint.timestamp - lastPoint.timestamp, 1)
    velocityRef.current = dist / dt
  }
  // Coalesced hardware samples can be closely spaced at high stylus speed.
  return dist >= 0.5
}

// ─────────────────────────────────────────────────────────────────────────────
// Chaikin smoothing — commit-time only
// ─────────────────────────────────────────────────────────────────────────────
function chaikinSmooth(points, iterations = 2) {
  if (points.length < 3) return points
  let pts = points
  for (let i = 0; i < iterations; i++) {
    const s = [pts[0]]
    for (let j = 0; j < pts.length - 1; j++) {
      s.push({
        x: pts[j].x * 0.75 + pts[j + 1].x * 0.25,
        y: pts[j].y * 0.75 + pts[j + 1].y * 0.25,
        pressure: pts[j].pressure,
      })
      s.push({
        x: pts[j].x * 0.25 + pts[j + 1].x * 0.75,
        y: pts[j].y * 0.25 + pts[j + 1].y * 0.75,
        pressure: pts[j + 1].pressure,
      })
    }
    s.push(pts[pts.length - 1])
    pts = s
  }
  return pts
}

// ─────────────────────────────────────────────────────────────────────────────
// perfect-freehand helpers — commit-time only
// ─────────────────────────────────────────────────────────────────────────────
const STROKE_OPTIONS = (width) => ({
  size: width,
  thinning: 0.618,
  smoothing: 0.72,
  streamline: 0.62,
  taperStart: 12,
  taperEnd: 18,
  capStart: true,
  capEnd: true,
  simulatePressure: false,
})

function svgPath(points) {
  if (!points.length) return ""
  const d = points.reduce((acc, [x0, y0], i, arr) => {
    const [x1, y1] = arr[(i + 1) % arr.length]
    acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
    return acc
  }, ["M", ...points[0], "Q"])
  d.push("Z")
  return d.join(" ")
}

function getOrBuildOutline(stroke) {
  if (!stroke._outline) {
    const pts = stroke.points.map((p) => [p.x, p.y, p.pressure ?? 0.5])
    stroke._outline = getStroke(pts, STROKE_OPTIONS(stroke.width))
  }
  return stroke._outline
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas drawing
// ─────────────────────────────────────────────────────────────────────────────
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

function drawCommittedStroke(ctx, stroke) {
  if (!stroke?.points?.length) return
  const outline = getOrBuildOutline(stroke)
  if (!outline?.length) return
  ctx.save()
  ctx.globalCompositeOperation =
    stroke.tool === "pixel-eraser" ? "destination-out" : "source-over"
  ctx.fillStyle = stroke.color || PEN_COLOR
  ctx.fill(new Path2D(svgPath(outline)))
  ctx.restore()
}

function drawEraserHighlight(ctx, stroke) {
  if (!stroke?.points?.length) return
  const pts = stroke.points.map((p) => [p.x, p.y, p.pressure ?? 0.5])
  const makeOutline = (extra) =>
    getStroke(pts, {
      ...STROKE_OPTIONS(stroke.width + extra),
      thinning: 0,
      taperStart: 0,
      taperEnd: 0,
    })
  const outer = makeOutline(7)
  const inner = makeOutline(1)
  if (!outer?.length) return
  ctx.save()
  ctx.globalAlpha = 0.15
  ctx.fillStyle = "#f6c8aa"
  ctx.fill(new Path2D(svgPath(outer)))
  ctx.globalCompositeOperation = "destination-out"
  ctx.globalAlpha = 1
  const innerPath = new Path2D(svgPath(inner))
  ctx.fill(innerPath)
  ctx.globalCompositeOperation = "source-over"
  ctx.globalAlpha = 0.75
  ctx.fillStyle = "#f6c8aa"
  const border = makeOutline(3)
  if (border?.length) {
    ctx.fill(new Path2D(svgPath(border)))
    ctx.globalCompositeOperation = "destination-out"
    ctx.globalAlpha = 1
    ctx.fill(innerPath)
  }
  ctx.restore()
}

// ─────────────────────────────────────────────────────────────────────────────
// Pixel eraser: split stroke by eraser path
// ─────────────────────────────────────────────────────────────────────────────
function splitStrokeByEraser(stroke, eraserPoints, eraserRadius) {
  if (!eraserPoints?.length || stroke.tool === "pixel-eraser") return null
  const points = stroke.points || []
  if (points.length < 2) return null

  const erased = points.map((p) => {
    for (let i = 0; i < eraserPoints.length; i++) {
      if (Math.hypot(p.x - eraserPoints[i].x, p.y - eraserPoints[i].y) <= eraserRadius)
        return true
      if (i > 0 && distanceToSegment(p, eraserPoints[i - 1], eraserPoints[i]) <= eraserRadius)
        return true
    }
    return false
  })

  const segments = []
  let current = null
  for (let i = 0; i < points.length; i++) {
    if (!erased[i]) {
      if (!current) current = []
      current.push(points[i])
    } else {
      if (current?.length >= 2) segments.push(current)
      current = null
    }
  }
  if (current?.length >= 2) segments.push(current)

  if (segments.length === 0) return [] // fully erased
  if (segments.length === 1 && segments[0].length === points.length) return null // unchanged

  return segments.map((pts) => ({
    ...stroke,
    id: crypto.randomUUID(),
    points: pts,
    _outline: null, // force recompute
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Page factory
// ─────────────────────────────────────────────────────────────────────────────
function createPage(index) {
  return {
    id: crypto.randomUUID(),
    page_number: index + 1,
    strokes: [],
    history: [],
    redoStack: [],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared canvas class
// ─────────────────────────────────────────────────────────────────────────────
const LAYER_CLASS =
  "absolute inset-0 block h-full w-full touch-none select-none [touch-action:none] [-webkit-touch-callout:none] [-webkit-user-drag:none] [-webkit-user-select:none]"
const ACTIVE_CANVAS_CLASS =
  "absolute inset-0 block h-full w-full select-none [-webkit-touch-callout:none] [-webkit-user-drag:none] [-webkit-user-select:none]"

// ─────────────────────────────────────────────────────────────────────────────
// Live ink width — cheap pressure + velocity bias (no perfect-freehand here)
// ─────────────────────────────────────────────────────────────────────────────
function liveStrokeWidth(baseWidth, pressure, velocity) {
  const p = pressure != null ? pressure : 0.55
  const pressureMul = 0.62 + 0.38 * p
  const velClamp = Math.min(Math.max(velocity, 0), 4.5)
  const velocityMul = 1.05 - velClamp * 0.055
  return baseWidth * pressureMul * Math.max(0.72, Math.min(velocityMul, 1.08))
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
const HandwritingCanvas = forwardRef(function HandwritingCanvas(
  {
    lockedQuestionHeight = 0,
    onSubmit,
    onToggleQuestionLock,
    isVisible = true,
    questionId,
    questionLocked = false,
    readOnly = false,
  },
  ref
) {
  // ── 5 canvas layers ─────────────────────────────────────────────────────
  const paperCanvasRef = useRef(null)     // static bg — drawn once
  const committedCanvasRef = useRef(null) // finished strokes
  const inkCanvasRef = useRef(null)       // live ink, APPEND ONLY
  const predCanvasRef = useRef(null)      // RAF predicted ink
  const activeCanvasRef = useRef(null)    // pointer events (transparent)
  const handwritingShellRef = useRef(null)
  const navigatorColumnRef = useRef(null)
  const canvasWrapperRef = useRef(null)

  // ── Cached 2D contexts — avoid repeated getContext on pointermove ─────────
  const paperCtxRef = useRef(null)
  const committedCtxRef = useRef(null)
  const inkCtxRef = useRef(null)
  const predCtxRef = useRef(null)

  /** Logical/CSS-space bounds for createPoint — synced outside the hot path */
  const canvasBoundsRef = useRef({ left: 0, top: 0 })

  /** Prediction RAF — non-null while a frame is queued or chaining during pen stroke */
  const predRafIdRef = useRef(null)
  const highlightRafIdRef = useRef(null)

  // ── Hot-path refs — never trigger re-renders ─────────────────────────────
  const activePointerRef = useRef(null)
  const currentStrokeRef = useRef(null)
  const lastInkPointRef = useRef(null)   // last committed point on inkCanvas
  const velocityRef = useRef(0)
  const predictedPointsRef = useRef([])
  const lastEraserPointRef = useRef(null)
  // Maps stroke id → setTimeout timer id for pending live stroke-eraser deletions
  const pendingEraserDeletionsRef = useRef(new Map())

  // ── Eraser highlight state (ref so RAF can read, no render cost) ─────────
  const eraserHighlightIdsRef = useRef(new Set())
  const highlightDirtyRef = useRef(false)

  // ── Page data ─────────────────────────────────────────────────────────────
  const initialPages = useMemo(() => [createPage(0)], [])
  const pagesRef = useRef(initialPages)
  const currentPageIndexRef = useRef(0)
  const pageScrollPositionsRef = useRef(new Map())

  // ── React UI state (minimal — only triggers re-renders when needed) ───────
  const [pages, setPages] = useState(initialPages)
  const [currentPageIndex, setCurrentPageIndex] = useState(0)
  const [tool, setTool] = useState("pen")
  const [eraserSize, setEraserSize] = useState(DEFAULT_ERASER_SIZE)
  const [eraserPanelOpen, setEraserPanelOpen] = useState(true)
  const [eraserPoint, setEraserPoint] = useState(null)
  const [writingSurfaceActive, setWritingSurfaceActive] = useState(false)
  const [navbarHeight, setNavbarHeight] = useState(64)
  const [navigatorLeftOffset, setNavigatorLeftOffset] = useState(0)
  const [navigatorMaxHeight, setNavigatorMaxHeight] = useState(640)
  const [toolbarRightOffset, setToolbarRightOffset] = useState(16)
  const [toolbarSticky, setToolbarSticky] = useState(false)

  const currentPage = pages[currentPageIndex] || pages[0]
  const canUndo = Boolean(currentPage?.history?.length)
  const canRedo = Boolean(currentPage?.redoStack?.length)
  const floatingControlsTop = navbarHeight + lockedQuestionHeight + 8
  const floatingControlsHeight =
    (tool === "stroke-eraser" || tool === "pixel-eraser") && eraserPanelOpen
      ? 220
      : 96

  const canvasScale = useMemo(() => {
    if (typeof window === "undefined") return 2
    return Math.min(Math.max(window.devicePixelRatio || 2, 2), 3)
  }, [])

  const selectTool = useCallback((nextTool) => {
    if (readOnly) return
    if (nextTool === "stroke-eraser" || nextTool === "pixel-eraser") {
      setEraserPanelOpen(true)
    }
    setTool(nextTool)
  }, [readOnly])

  const cancelPredAnimation = useCallback(() => {
    if (predRafIdRef.current != null) {
      cancelAnimationFrame(predRafIdRef.current)
      predRafIdRef.current = null
    }
  }, [])

  // ── EFFECT 1: Sync page index ref (must be declared first) ───────────────
  useEffect(() => {
    currentPageIndexRef.current = currentPageIndex
  }, [currentPageIndex])

  // ─────────────────────────────────────────────────────────────────────────
  // Paper layer — drawn once, never redrawn unless page changes
  // ─────────────────────────────────────────────────────────────────────────
  const drawPaperLayer = useCallback(() => {
    const ctx = paperCtxRef.current
    if (!ctx) return
    ctx.save()
    ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0)
    drawPaper(ctx)
    ctx.restore()
  }, [canvasScale])

  // ─────────────────────────────────────────────────────────────────────────
  // Committed canvas — full redraw
  // Called: page switch, undo, redo, clear, pixel-erase commit
  // NOT called during active pen strokes
  // ─────────────────────────────────────────────────────────────────────────
  const redrawCommitted = useCallback(() => {
    const canvas = committedCanvasRef.current
    const ctx = committedCtxRef.current
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0)
    const strokes = pagesRef.current[currentPageIndexRef.current]?.strokes || []
    strokes.forEach((s) => drawCommittedStroke(ctx, s))
    // Stroke-eraser highlights
    const hitIds = eraserHighlightIdsRef.current
    if (hitIds.size) {
      strokes.filter((s) => hitIds.has(s.id)).forEach((s) => drawEraserHighlight(ctx, s))
    }
    ctx.restore()
  }, [canvasScale])

  // ─────────────────────────────────────────────────────────────────────────
  // Ink canvas — clear between strokes only
  // ─────────────────────────────────────────────────────────────────────────
  const clearInkCanvas = useCallback(() => {
    const canvas = inkCanvasRef.current
    const ctx = inkCtxRef.current
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  const scheduleHighlightRedraw = useCallback(() => {
    if (highlightRafIdRef.current != null) return
    highlightRafIdRef.current = requestAnimationFrame(() => {
      highlightRafIdRef.current = null
      if (highlightDirtyRef.current) {
        redrawCommitted()
        highlightDirtyRef.current = false
      }
    })
  }, [redrawCommitted])

  // ─────────────────────────────────────────────────────────────────────────
  // Prediction RAF — ONLY while pen stroke active
  // Idle: zero RAF (avoids full pred clearRect every frame at 120Hz on iPad).
  // ─────────────────────────────────────────────────────────────────────────
  const runPredFrame = useCallback(function runPredFrame() {
    predRafIdRef.current = null

    const predCanvas = predCanvasRef.current
    const predCtx = predCtxRef.current
    if (predCanvas && predCtx) {
      predCtx.clearRect(0, 0, predCanvas.width, predCanvas.height)

      const predicted = predictedPointsRef.current
      const stroke = currentStrokeRef.current
      const lastPt = lastInkPointRef.current

      if (stroke?.tool === "pen" && predicted.length > 0 && lastPt) {
        predCtx.save()
        predCtx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0)
        predCtx.lineCap = "round"
        predCtx.lineJoin = "round"
        predCtx.strokeStyle = stroke.color

        let px = lastPt.x
        let py = lastPt.y
        const n = predicted.length
        for (let i = 0; i < n; i++) {
          const p = predicted[i]
          const t = (i + 1) / (n + 1)
          predCtx.globalAlpha = 0.22 + t * 0.28
          predCtx.lineWidth = liveStrokeWidth(stroke.width, p.pressure, velocityRef.current) * 0.82
          predCtx.beginPath()
          predCtx.moveTo(px, py)
          predCtx.lineTo(p.x, p.y)
          predCtx.stroke()
          px = p.x
          py = p.y
        }
        predCtx.restore()
      }
    }

    if (currentStrokeRef.current?.tool === "pen") {
      predRafIdRef.current = requestAnimationFrame(runPredFrame)
    }
  }, [canvasScale])

  const schedulePredFrame = useCallback(() => {
    if (predRafIdRef.current != null) return
    predRafIdRef.current = requestAnimationFrame(runPredFrame)
  }, [runPredFrame])

  // ─────────────────────────────────────────────────────────────────────────
  // Canvas sizing — resize all 5 canvases, redraw static layers
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvases = [
      paperCanvasRef.current,
      committedCanvasRef.current,
      inkCanvasRef.current,
      predCanvasRef.current,
      activeCanvasRef.current,
    ]
    if (canvases.some((c) => !c)) return

    const w = Math.round(PAGE_WIDTH * canvasScale)
    const h = Math.round(PAGE_HEIGHT * canvasScale)
    canvases.forEach((c) => {
      c.width = w
      c.height = h
    })

    paperCtxRef.current = paperCanvasRef.current.getContext("2d", {
      alpha: true,
      desynchronized: true,
    })
    committedCtxRef.current = committedCanvasRef.current.getContext("2d", {
      alpha: true,
      desynchronized: true,
    })
    inkCtxRef.current = inkCanvasRef.current.getContext("2d", {
      alpha: true,
      desynchronized: true,
    })
    predCtxRef.current = predCanvasRef.current.getContext("2d", {
      alpha: true,
      desynchronized: true,
    })

    drawPaperLayer()
    redrawCommitted()
  }, [canvasScale, currentPageIndex, drawPaperLayer, redrawCommitted])

  // Keep cached canvas bounds accurate without reading layout in pointer handlers.
  useEffect(() => {
    const el = activeCanvasRef.current
    if (!el) return

    const sync = () => {
      const r = el.getBoundingClientRect()
      canvasBoundsRef.current = { left: r.left, top: r.top }
    }

    sync()

    const ro = new ResizeObserver(sync)
    ro.observe(el)

    window.addEventListener("scroll", sync, { passive: true })
    window.addEventListener("resize", sync, { passive: true })

    return () => {
      ro.disconnect()
      window.removeEventListener("scroll", sync)
      window.removeEventListener("resize", sync)
    }
  }, [])

  // Safari/iPadOS scroll recognizer guard during active ink strokes.
  useEffect(() => {
    const el = activeCanvasRef.current
    if (!el) return

    const prevent = (e) => {
      if (activePointerRef.current !== null) {
        e.preventDefault()
      }
    }
    const lockBody = (e) => {
      if (e.pointerType === "pen") {
        document.body.style.touchAction = "none"
      }
    }
    const unlockBody = () => {
      document.body.style.touchAction = ""
    }

    el.addEventListener("touchstart", prevent, { passive: false })
    el.addEventListener("touchmove", prevent, { passive: false })
    el.addEventListener("pointerdown", lockBody)
    window.addEventListener("pointerup", unlockBody)
    window.addEventListener("pointercancel", unlockBody)

    return () => {
      el.removeEventListener("touchstart", prevent)
      el.removeEventListener("touchmove", prevent)
      el.removeEventListener("pointerdown", lockBody)
      window.removeEventListener("pointerup", unlockBody)
      window.removeEventListener("pointercancel", unlockBody)
    }
  }, [])

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      const navbar =
        document.querySelector("header") ||
        document.querySelector('nav[role="navigation"]') ||
        document.querySelector("[data-navbar]")
      if (navbar) {
        setNavbarHeight(navbar.getBoundingClientRect().height)
      }
    })
    return () => cancelAnimationFrame(frameId)
  }, [])

  useEffect(() => {
    const wrapper = canvasWrapperRef.current
    if (!wrapper) return

    const updateControlOffsets = () => {
      const rect = wrapper.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return
      setToolbarRightOffset(window.innerWidth - rect.right + 16)

      const navigatorColumn = navigatorColumnRef.current
      if (navigatorColumn) {
        const navRect = navigatorColumn.getBoundingClientRect()
        setNavigatorLeftOffset(navRect.left)
        setNavigatorMaxHeight(Math.max(96, Math.floor(rect.bottom - navRect.top)))
      }

      if (window.innerWidth < 768) {
        setToolbarSticky(false)
      }
    }

    updateControlOffsets()

    const ro = new ResizeObserver(updateControlOffsets)
    ro.observe(wrapper)
    if (navigatorColumnRef.current) ro.observe(navigatorColumnRef.current)
    window.addEventListener("resize", updateControlOffsets, { passive: true })

    return () => {
      ro.disconnect()
      window.removeEventListener("resize", updateControlOffsets)
    }
  }, [])

  useEffect(() => {
    const checkSticky = () => {
      const wrapper = canvasWrapperRef.current
      if (!wrapper) return
      if (window.innerWidth < 768) {
        setToolbarSticky(false)
        return
      }
      const rect = wrapper.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return
      const naturalTop = rect.top + 16
      const pastTopBarrier = naturalTop < floatingControlsTop
      const beforeBottomBarrier =
        rect.bottom > floatingControlsTop + floatingControlsHeight
      const nextSticky = pastTopBarrier && beforeBottomBarrier
      setToolbarSticky(nextSticky)

      const navigatorColumn = navigatorColumnRef.current
      const navTop = nextSticky
        ? floatingControlsTop
        : navigatorColumn?.getBoundingClientRect().top ?? rect.top
      setNavigatorMaxHeight(Math.max(96, Math.floor(rect.bottom - navTop)))
    }

    checkSticky()

    window.addEventListener("scroll", checkSticky, { passive: true })
    return () => window.removeEventListener("scroll", checkSticky)
  }, [floatingControlsHeight, floatingControlsTop])

  useEffect(() => {
    if (!isVisible) return undefined
    const frameId = requestAnimationFrame(() => {
      const wrapper = canvasWrapperRef.current
      if (!wrapper) return
      const rect = wrapper.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return

      setToolbarRightOffset(window.innerWidth - rect.right + 16)
      const navigatorColumn = navigatorColumnRef.current
      if (navigatorColumn) {
        const navRect = navigatorColumn.getBoundingClientRect()
        setNavigatorLeftOffset(navRect.left)
        setNavigatorMaxHeight(Math.max(96, Math.floor(rect.bottom - navRect.top)))
      }
      if (window.innerWidth < 768) {
        setToolbarSticky(false)
      } else {
        const naturalTop = rect.top + 16
        const pastTopBarrier = naturalTop < floatingControlsTop
        const beforeBottomBarrier =
          rect.bottom > floatingControlsTop + floatingControlsHeight
        const nextSticky = pastTopBarrier && beforeBottomBarrier
        setToolbarSticky(nextSticky)
        const navigatorColumn = navigatorColumnRef.current
        const navTop = nextSticky
          ? floatingControlsTop
          : navigatorColumn?.getBoundingClientRect().top ?? rect.top
        setNavigatorMaxHeight(Math.max(96, Math.floor(rect.bottom - navTop)))
      }

      const activeCanvas = activeCanvasRef.current
      if (activeCanvas) {
        const canvasRect = activeCanvas.getBoundingClientRect()
        canvasBoundsRef.current = { left: canvasRect.left, top: canvasRect.top }
      }
    })
    return () => cancelAnimationFrame(frameId)
  }, [floatingControlsHeight, floatingControlsTop, isVisible])

  useEffect(() => () => {
    cancelPredAnimation()
    if (highlightRafIdRef.current != null) {
      cancelAnimationFrame(highlightRafIdRef.current)
      highlightRafIdRef.current = null
    }
    const pending = pendingEraserDeletionsRef.current
    for (const timerId of pending.values()) clearTimeout(timerId)
    pending.clear()
  }, [cancelPredAnimation])

  // Redraw committed when page data changes
  useEffect(() => {
    redrawCommitted()
  }, [pages, currentPageIndex, redrawCommitted])

  // Clear eraser state when switching away from eraser tools
  useEffect(() => {
    if (tool !== "stroke-eraser" && tool !== "pixel-eraser") {
      const pending = pendingEraserDeletionsRef.current
      for (const timerId of pending.values()) clearTimeout(timerId)
      pending.clear()

      const hadHighlight = eraserHighlightIdsRef.current.size > 0
      eraserHighlightIdsRef.current = new Set()
      queueMicrotask(() => setEraserPoint(null))
      if (hadHighlight) {
        highlightDirtyRef.current = true
        scheduleHighlightRedraw()
      }
    }
  }, [tool, scheduleHighlightRedraw])

  // Keyboard shortcuts
  useEffect(() => {
    if (!writingSurfaceActive) return
    function onKey(e) {
      if (e.key === "e" || e.key === "E") {
        e.preventDefault()
        selectTool(
          tool === "stroke-eraser" || tool === "pixel-eraser"
            ? "pen"
            : "stroke-eraser"
        )
      }
      if (e.key === "p" || e.key === "P") {
        e.preventDefault()
        selectTool("pen")
      }
      if (e.key === "q" || e.key === "Q") {
        e.preventDefault()
        onToggleQuestionLock?.()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onToggleQuestionLock, selectTool, tool, writingSurfaceActive])

  // ─────────────────────────────────────────────────────────────────────────
  // Page state helpers
  // ─────────────────────────────────────────────────────────────────────────
  function commitPages(nextPages) {
    pagesRef.current = nextPages
    setPages(nextPages)
  }

  function updateCurrentPage(updater) {
    const next = pagesRef.current.map((page, i) =>
      i === currentPageIndexRef.current ? updater(page) : page
    )
    commitPages(next)
  }

  function getPageScrollOffset() {
    const wrapper = canvasWrapperRef.current
    if (!wrapper || typeof window === "undefined") return 0
    const wrapperTop = window.scrollY + wrapper.getBoundingClientRect().top
    return Math.max(0, window.scrollY - wrapperTop)
  }

  function saveCurrentPageScrollPosition() {
    pageScrollPositionsRef.current.set(
      currentPageIndexRef.current,
      getPageScrollOffset()
    )
  }

  function restorePageScrollPosition(pageIndex) {
    const offset = pageScrollPositionsRef.current.get(pageIndex) || 0
    requestAnimationFrame(() => {
      const wrapper = canvasWrapperRef.current
      if (!wrapper) return
      const wrapperTop = window.scrollY + wrapper.getBoundingClientRect().top
      window.scrollTo({ top: wrapperTop + offset, behavior: "auto" })
    })
  }

  function selectPage(pageIndex) {
    if (readOnly || pageIndex === currentPageIndexRef.current) return
    saveCurrentPageScrollPosition()
    currentPageIndexRef.current = pageIndex
    setCurrentPageIndex(pageIndex)
    restorePageScrollPosition(pageIndex)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Eraser cursor helpers
  // ─────────────────────────────────────────────────────────────────────────
  function commitLiveErasure(strokeId) {
    pendingEraserDeletionsRef.current.delete(strokeId)
    eraserHighlightIdsRef.current.delete(strokeId)

    updateCurrentPage((page) => {
      const target = page.strokes.find((s) => s.id === strokeId)
      if (!target) return page
      return {
        ...page,
        strokes: page.strokes.filter((s) => s.id !== strokeId),
        history: [
          ...(page.history || []),
          { type: "erase", strokes: [target] },
        ],
        redoStack: [],
      }
    })

    highlightDirtyRef.current = true
    scheduleHighlightRedraw()
  }

  function updateEraserCursor(event) {
    if (
      (tool !== "stroke-eraser" && tool !== "pixel-eraser") ||
      !activeCanvasRef.current
    )
      return
    const point = createPoint(event, canvasBoundsRef.current)

    if (tool === "stroke-eraser") {
      const strokes =
        pagesRef.current[currentPageIndexRef.current]?.strokes || []
      const hitIds = new Set(
        strokes
          .filter(
            (s) =>
              s.tool !== "pixel-eraser" && strokeNearPoint(s, point, eraserSize)
          )
          .map((s) => s.id)
      )
      // Only redraw if hit set changed — avoids thrashing on hover
      const prev = eraserHighlightIdsRef.current
      const changed =
        hitIds.size !== prev.size ||
        [...hitIds].some((id) => !prev.has(id))
      if (changed) {
        eraserHighlightIdsRef.current = hitIds
        highlightDirtyRef.current = true
        scheduleHighlightRedraw()
      }

      const pending = pendingEraserDeletionsRef.current

      for (const [id, timerId] of pending) {
        if (!hitIds.has(id)) {
          clearTimeout(timerId)
          pending.delete(id)
        }
      }

      if (activePointerRef.current !== null) {
        for (const id of hitIds) {
          if (!pending.has(id)) {
            const timerId = setTimeout(() => {
              if (activePointerRef.current !== null) {
                commitLiveErasure(id)
              } else {
                pending.delete(id)
              }
            }, 0)
            pending.set(id, timerId)
          }
        }
      }
      setEraserPoint({ ...point, hitCount: hitIds.size })
    } else {
      // pixel eraser — just cursor position, no highlight
      setEraserPoint({ ...point, hitCount: 0 })
    }
  }

  function clearEraserCursor() {
    const pending = pendingEraserDeletionsRef.current
    for (const timerId of pending.values()) clearTimeout(timerId)
    pending.clear()

    const prev = eraserHighlightIdsRef.current
    eraserHighlightIdsRef.current = new Set()
    setEraserPoint(null)
    if (prev.size > 0) {
      highlightDirtyRef.current = true
      scheduleHighlightRedraw()
    }
  }

  function stopDefault(e) {
    e.preventDefault()
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // POINTER HANDLERS — absolute hot path
  // Rule: zero canvas work inside handlers except O(1) operations.
  //       No clears, no loops, no redraws.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ─────────────────────────────────────────────────────────────────────────

  function startStroke(event) {
    if (readOnly) return
    if (!activeCanvasRef.current) return
    // Reject finger/touch input — only pen and mouse create ink.
    if (event.pointerType === "touch") return
    // Palm rejection — wide touch contacts are palms
    if (event.pointerType === "touch" && event.width > 45) return
    event.preventDefault()

    updateEraserCursor(event)
    activePointerRef.current = event.pointerId
    activeCanvasRef.current.setPointerCapture(event.pointerId)

    velocityRef.current = 0
    predictedPointsRef.current = []
    lastEraserPointRef.current = null

    const point = createPoint(event, canvasBoundsRef.current)
    lastInkPointRef.current = point

    currentStrokeRef.current = {
      id: crypto.randomUUID(),
      tool,
      color: PEN_COLOR,
      width: tool === "pen" ? PEN_WIDTH : eraserSize * 2,
      points: [point],
      _outline: null,
    }

    if (tool === "pen") {
      // Seed dot so single taps register — configure ink ctx once per stroke (hot path avoids save/restore)
      const ink = inkCtxRef.current
      if (ink) {
        ink.setTransform(canvasScale, 0, 0, canvasScale, 0, 0)
        ink.fillStyle = PEN_COLOR
        ink.beginPath()
        ink.arc(point.x, point.y, PEN_WIDTH / 2, 0, Math.PI * 2)
        ink.fill()
        ink.strokeStyle = PEN_COLOR
        ink.lineCap = "round"
        ink.lineJoin = "round"
      }
      schedulePredFrame()
    } else if (tool === "pixel-eraser") {
      // Initial erase circle — immediate visual on committedCanvas
      lastEraserPointRef.current = point
      const ctx = committedCtxRef.current
      if (ctx) {
        ctx.save()
        ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0)
        ctx.globalCompositeOperation = "destination-out"
        ctx.beginPath()
        ctx.arc(point.x, point.y, eraserSize, 0, Math.PI * 2)
        ctx.fillStyle = "rgba(0,0,0,1)"
        ctx.fill()
        ctx.restore()
      }
    }
    // stroke-eraser: no drawing at all — only highlights existing strokes
  }

  function extendStroke(event) {
    if (readOnly) return
    // Belt-and-suspenders: ignore touch events that leaked through.
    if (event.pointerType === "touch" && activePointerRef.current !== event.pointerId) return

    // Always update cursor (even without active stroke)
    updateEraserCursor(event)

    if (
      activePointerRef.current !== event.pointerId ||
      !currentStrokeRef.current
    )
      return
    event.preventDefault()

    const bounds = canvasBoundsRef.current
    // getCoalescedEvents captures sub-frame stylus samples
    const coalesced = event.getCoalescedEvents?.() || [event]
    const predicted = event.getPredictedEvents?.() || []
    const pts = currentStrokeRef.current.points
    const currentTool = currentStrokeRef.current.tool

    for (const e of coalesced) {
      const p = createPoint(e, bounds)
      if (!shouldAddPoint(p, pts[pts.length - 1], velocityRef)) continue
      pts.push(p)

      if (currentTool === "pen") {
        // ════════════════════════════════════════════════════════════════
        // THE CORE FAST PATH: draw ONE segment (O(1), no clear, no redraw)
        // ════════════════════════════════════════════════════════════════
        const prev = lastInkPointRef.current
        if (prev) {
          const ink = inkCtxRef.current
          if (ink) {
            ink.setTransform(canvasScale, 0, 0, canvasScale, 0, 0)
            ink.lineWidth = liveStrokeWidth(PEN_WIDTH, p.pressure, velocityRef.current)
            ink.beginPath()
            ink.moveTo(prev.x, prev.y)
            ink.lineTo(p.x, p.y)
            ink.stroke()
          }
        }
        lastInkPointRef.current = p

      } else if (currentTool === "pixel-eraser") {
        // Immediate destructive erase — applied directly to committedCanvas
        const ctx = committedCtxRef.current
        if (ctx && lastEraserPointRef.current) {
          ctx.save()
          ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0)
          ctx.globalCompositeOperation = "destination-out"
          ctx.lineCap = "round"
          ctx.lineJoin = "round"
          ctx.lineWidth = eraserSize * 2
          ctx.strokeStyle = "rgba(0,0,0,1)"
          ctx.beginPath()
          ctx.moveTo(lastEraserPointRef.current.x, lastEraserPointRef.current.y)
          ctx.lineTo(p.x, p.y)
          ctx.stroke()
          ctx.restore()
        }
        lastEraserPointRef.current = p

      }
      // stroke-eraser: nothing drawn — updateEraserCursor() above handles it
    }

    // Predictions — stored for RAF to render on predCanvas this frame
    if (currentTool === "pen") {
      predictedPointsRef.current = predicted
        .map((e) => createPoint(e, bounds))
        .filter((p, i, arr) => {
          if (i === 0) return true
          const prev = arr[i - 1]
          return Math.hypot(p.x - prev.x, p.y - prev.y) > 0.5
        })
    }
  }

  function finishStroke(event) {
    if (readOnly) return
    if (
      activePointerRef.current !== event.pointerId ||
      !currentStrokeRef.current
    )
      return
    event.preventDefault()

    const completedStroke = { ...currentStrokeRef.current }
    const isCancelled = event.type === "pointercancel"

    // Reset all hot-path refs
    activePointerRef.current = null
    currentStrokeRef.current = null
    predictedPointsRef.current = []
    lastInkPointRef.current = null
    lastEraserPointRef.current = null

    cancelPredAnimation()

    // Clear prediction canvas immediately
    const predCanvas = predCanvasRef.current
    const predCtx = predCtxRef.current
    if (predCtx && predCanvas)
      predCtx.clearRect(0, 0, predCanvas.width, predCanvas.height)

    // Discard tiny cancelled strokes caused by palm rejection/pointercancel.
    if (isCancelled && completedStroke.points.length < 4) {
      clearInkCanvas()
      return
    }

    // ── STROKE ERASER ──────────────────────────────────────────────────────
    if (completedStroke.tool === "stroke-eraser") {
      const pending = pendingEraserDeletionsRef.current
      for (const timerId of pending.values()) clearTimeout(timerId)
      pending.clear()

      const eraserPath = completedStroke.points
      const radius = Math.max(eraserSize, 1)

      updateCurrentPage((page) => {
        const removed = page.strokes.filter(
          (s) =>
            s.tool !== "pixel-eraser" &&
            strokeIntersectsPath(s, eraserPath, radius)
        )
        if (!removed.length) return page
        const removedIds = new Set(removed.map((s) => s.id))
        return {
          ...page,
          strokes: page.strokes.filter((s) => !removedIds.has(s.id)),
          history: [
            ...(page.history || []),
            { type: "erase", strokes: removed },
          ],
          redoStack: [],
        }
      })
      eraserHighlightIdsRef.current = new Set()
      highlightDirtyRef.current = true
      scheduleHighlightRedraw()
      return
    }

    // ── PIXEL ERASER ───────────────────────────────────────────────────────
    if (completedStroke.tool === "pixel-eraser") {
      const eraserPoints = completedStroke.points
      const eraserRadius = eraserSize

      updateCurrentPage((page) => {
        let nextStrokes = []
        let changed = false
        for (const s of page.strokes) {
          if (s.tool === "pixel-eraser") {
            nextStrokes.push(s)
            continue
          }
          const split = splitStrokeByEraser(s, eraserPoints, eraserRadius)
          if (split === null) {
            nextStrokes.push(s)
          } else if (split.length === 0) {
            changed = true // fully erased, drop it
          } else {
            nextStrokes = [...nextStrokes, ...split]
            changed = true
          }
        }
        if (!changed) return page
        return {
          ...page,
          strokes: nextStrokes,
          history: [
            ...(page.history || []),
            {
              type: "pixel-erase",
              eraserPoints,
              eraserRadius,
              prevStrokes: page.strokes,
            },
          ],
          redoStack: [],
        }
      })

      // Visual is already correct (we applied destination-out live to committedCanvas).
      // Redraw from data on the next tick to reconcile — invisible because it matches.
      // This also ensures stroke-eraser split awareness is correct after the erase.
      setTimeout(redrawCommitted, 0)
      return
    }

    // ── PEN ────────────────────────────────────────────────────────────────
    // 1. Clear the raw inkCanvas — the temporary stroke disappears
    clearInkCanvas()

    // 2. Smooth + build perfect-freehand outline (synchronous)
    const smoothed = chaikinSmooth(completedStroke.points, 2)
    const finalStroke = {
      ...completedStroke,
      points: smoothed,
      _outline: null,
    }
    getOrBuildOutline(finalStroke) // builds and caches

    // 3. Blit directly to committedCanvas — same JS task, zero-flicker swap
    //    At this point: inkCanvas is clear, committedCanvas gets the final stroke.
    //    There is no intermediate frame where neither is drawn.
    const ctx = committedCanvasRef.current?.getContext("2d")
    if (ctx) {
      ctx.save()
      ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0)
      drawCommittedStroke(ctx, finalStroke)
      ctx.restore()
    }

    // 4. Update React state — triggers re-render but canvas already looks correct
    updateCurrentPage((page) => ({
      ...page,
      strokes: [...page.strokes, finalStroke],
      history: [
        ...(page.history || []),
        { type: "add", stroke: finalStroke },
      ],
      redoStack: [],
    }))
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Undo / Redo / Clear
  // ─────────────────────────────────────────────────────────────────────────
  function undo() {
    if (readOnly) return
    updateCurrentPage((page) => {
      const history = page.history || []
      if (!history.length) return page
      const action = history[history.length - 1]
      let next
      if (action.type === "add") {
        next = {
          ...page,
          strokes: page.strokes.filter((s) => s.id !== action.stroke.id),
        }
      } else if (action.type === "erase") {
        next = { ...page, strokes: [...page.strokes, ...action.strokes] }
      } else if (action.type === "pixel-erase") {
        next = { ...page, strokes: action.prevStrokes }
      } else {
        next = page
      }
      return {
        ...next,
        history: history.slice(0, -1),
        redoStack: [action, ...(page.redoStack || [])],
      }
    })
    highlightDirtyRef.current = true
    scheduleHighlightRedraw()
  }

  function redo() {
    if (readOnly) return
    updateCurrentPage((page) => {
      if (!page.redoStack?.length) return page
      const [action, ...redoStack] = page.redoStack
      let next
      if (action.type === "add") {
        next = { ...page, strokes: [...page.strokes, action.stroke] }
      } else if (action.type === "erase") {
        const ids = new Set(action.strokes.map((x) => x.id))
        next = {
          ...page,
          strokes: page.strokes.filter((s) => !ids.has(s.id)),
        }
      } else if (action.type === "pixel-erase") {
        let nextStrokes = []
        for (const s of action.prevStrokes) {
          if (s.tool === "pixel-eraser") {
            nextStrokes.push(s)
            continue
          }
          const split = splitStrokeByEraser(
            s,
            action.eraserPoints,
            action.eraserRadius
          )
          if (split === null) nextStrokes.push(s)
          else if (split.length > 0)
            nextStrokes = [...nextStrokes, ...split]
        }
        next = { ...page, strokes: nextStrokes }
      } else {
        next = page
      }
      return {
        ...next,
        history: [...(page.history || []), action],
        redoStack,
      }
    })
    highlightDirtyRef.current = true
    scheduleHighlightRedraw()
  }

  function clearPage() {
    if (readOnly) return
    updateCurrentPage((page) => ({
      ...page,
      strokes: [],
      history: page.strokes.length
        ? [
            ...(page.history || []),
            { type: "erase", strokes: page.strokes },
          ]
        : page.history || [],
      redoStack: [],
    }))
    clearInkCanvas()
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Page management
  // ─────────────────────────────────────────────────────────────────────────
  function addPage() {
    if (readOnly) return
    saveCurrentPageScrollPosition()
    const next = [...pagesRef.current, createPage(pagesRef.current.length)]
    const nextIndex = next.length - 1
    pageScrollPositionsRef.current.set(nextIndex, 0)
    commitPages(next)
    currentPageIndexRef.current = nextIndex
    setCurrentPageIndex(nextIndex)
    restorePageScrollPosition(nextIndex)
  }

  function deletePage(pageIndex) {
    if (readOnly) return
    if (pagesRef.current.length <= 1) return
    saveCurrentPageScrollPosition()
    const next = pagesRef.current
      .filter((_, i) => i !== pageIndex)
      .map((p, i) => ({ ...p, page_number: i + 1 }))
    const nextScrollPositions = new Map()
    pageScrollPositionsRef.current.forEach((offset, index) => {
      if (index < pageIndex) nextScrollPositions.set(index, offset)
      if (index > pageIndex) nextScrollPositions.set(index - 1, offset)
    })
    pageScrollPositionsRef.current = nextScrollPositions
    commitPages(next)
    const nextIndex = (() => {
      const i = currentPageIndexRef.current
      if (i === pageIndex) return Math.max(0, pageIndex - 1)
      if (i > pageIndex) return i - 1
      return Math.min(i, next.length - 1)
    })()
    currentPageIndexRef.current = nextIndex
    setCurrentPageIndex(nextIndex)
    restorePageScrollPosition(nextIndex)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Export
  // ─────────────────────────────────────────────────────────────────────────
  async function submit() {
    const payload = await exportHandwrittenAnswer({
      questionId,
      pages: pagesRef.current,
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
    })
    onSubmit?.(payload)
    return payload
  }

  useImperativeHandle(ref, () => ({
    exportAnswer: submit,
    getPages: () => pagesRef.current,
  }))

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      ref={handwritingShellRef}
      className="overflow-hidden rounded-[6px] border border-white/[0.06] bg-[#120f0d]"
    >
      <div className="flex min-h-[640px] flex-col md:flex-row">
        <div ref={navigatorColumnRef} className="shrink-0 md:w-28">
          <PageNavigator
            currentPageIndex={currentPageIndex}
            leftOffset={navigatorLeftOffset}
            maxHeight={navigatorMaxHeight}
            onAddPage={addPage}
            onDeletePage={deletePage}
            onSelectPage={selectPage}
            pages={pages}
            readOnly={readOnly}
            sticky={toolbarSticky}
            topOffset={floatingControlsTop}
          />
        </div>
        <div
          ref={canvasWrapperRef}
          className="relative flex min-w-0 flex-1 justify-center bg-[#100d0b] p-4 outline-none select-none [-webkit-touch-callout:none] [-webkit-user-drag:none] [-webkit-user-select:none] md:p-6"
          onContextMenu={stopDefault}
          onDragStart={stopDefault}
          onPointerEnter={() => {
            setWritingSurfaceActive(true)
          }}
          onPointerLeave={() => {
            setWritingSurfaceActive(false)
            clearEraserCursor()
          }}
          onSelect={stopDefault}
          onSelectCapture={stopDefault}
        >
          <PencilToolbar
            activeTool={tool}
            canRedo={canRedo}
            canUndo={canUndo}
            eraserPanelOpen={eraserPanelOpen}
            eraserSize={eraserSize}
            lockedQuestionHeight={lockedQuestionHeight}
            navbarHeight={navbarHeight}
            onClear={clearPage}
            onEraserSizeChange={readOnly ? () => {} : setEraserSize}
            onRedo={redo}
            onToggleEraserPanel={readOnly ? () => {} : () => setEraserPanelOpen((value) => !value)}
            onToggleQuestionLock={onToggleQuestionLock}
            onToolChange={selectTool}
            onUndo={undo}
            questionLocked={questionLocked}
            rightOffset={toolbarRightOffset}
            sticky={toolbarSticky}
          />

          <div
            className="relative h-auto w-full max-w-[820px]"
            style={{
              aspectRatio: `${PAGE_WIDTH} / ${PAGE_HEIGHT}`,
              WebkitUserSelect: "none",
              userSelect: "none",
            }}
          >
            {/* ── Layer 1: Paper background — drawn once ── */}
            <canvas
              ref={paperCanvasRef}
              draggable={false}
              className="block h-full w-full touch-none rounded-[4px] border border-[#3a2b23]/70 shadow-[0_18px_70px_rgba(0,0,0,0.42)] select-none [touch-action:none] [-webkit-touch-callout:none] [-webkit-user-drag:none] [-webkit-user-select:none]"
            />

            {/* ── Layer 2: Committed strokes ── */}
            <canvas
              ref={committedCanvasRef}
              draggable={false}
              className={`${LAYER_CLASS} pointer-events-none`}
            />

            {/* ── Layer 3: Live ink — append only, never cleared mid-stroke ── */}
            <canvas
              ref={inkCanvasRef}
              draggable={false}
              className={`${LAYER_CLASS} pointer-events-none`}
            />

            {/* ── Layer 4: Predicted ink — RAF only ── */}
            <canvas
              ref={predCanvasRef}
              draggable={false}
              className={`${LAYER_CLASS} pointer-events-none`}
            />

            {/* ── Layer 5: Pointer capture — transparent, receives all events ── */}
            <canvas
              ref={activeCanvasRef}
              inputMode="none"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-gramm="false"
              draggable={false}
              className={`${ACTIVE_CANVAS_CLASS} ${readOnly ? "pointer-events-none" : ""}`}
              style={{
                background: "transparent",
                cursor:
                  tool === "stroke-eraser" || tool === "pixel-eraser"
                    ? "none"
                    : "crosshair",
              }}
              onContextMenu={stopDefault}
              onDragStart={stopDefault}
              onPointerCancel={finishStroke}
              onPointerDown={startStroke}
              onPointerEnter={updateEraserCursor}
              onPointerLeave={clearEraserCursor}
              onPointerMove={extendStroke}
              onPointerUp={finishStroke}
            />

            {/* ── Eraser cursor ── */}
            {(tool === "stroke-eraser" || tool === "pixel-eraser") &&
              eraserPoint && (
                <>
                  <div
                    className="pointer-events-none absolute z-10 rounded-full border border-[#f6c8aa]/85 bg-[#f1d0b9]/10 shadow-[0_0_0_1px_rgba(0,0,0,0.28),0_0_24px_rgba(212,154,113,0.28)] transition-[height,width,opacity] duration-100"
                    style={{
                      height: eraserSize * 2,
                      width: eraserSize * 2,
                      left: eraserPoint.x,
                      top: eraserPoint.y,
                      transform: "translate(-50%, -50%)",
                    }}
                  />
                  <div
                    className={`pointer-events-none absolute z-10 rounded-full transition-all duration-100 ${
                      eraserPoint.hitCount
                        ? "size-2.5 bg-[#f6c8aa] shadow-[0_0_18px_rgba(246,200,170,0.72)]"
                        : "size-1.5 bg-[#8f8982]/70"
                    }`}
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
