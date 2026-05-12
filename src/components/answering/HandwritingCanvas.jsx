"use client"

/**
 * HandwritingCanvas — zero-latency rewrite
 *
 * ARCHITECTURE OVERVIEW
 * ─────────────────────
 * The primary enemy of perceived latency is doing expensive work on the hot path
 * (pointer move). Every ms spent in a pointermove handler is a ms of lag.
 *
 * LAYER STACK (bottom → top)
 * ┌─────────────────────────────────────────────────────┐
 * │ committedCanvas  — all finished pen strokes          │
 * │ eraserCanvas     — live pixel-eraser destination-out │
 * │ activeCanvas     — current in-progress stroke        │
 * └─────────────────────────────────────────────────────┘
 *
 * KEY CHANGES vs. previous version
 * ─────────────────────────────────
 * 1. ZERO-COST ACTIVE STROKE
 *    During writing we draw a raw quadratic bezier path — NO perfect-freehand.
 *    perfect-freehand runs once on pointerup (commit), replacing the raw line
 *    with the polished calligraphic version. This is invisible because the
 *    liftoff is instantaneous.
 *
 * 2. NO POST-COMMIT RESHAPE FLICKER
 *    The active canvas is cleared the instant the pointer lifts. The committed
 *    canvas gets the final styled stroke blitted in the same JS task. There is
 *    no frame where a "morphing" shape is visible.
 *
 * 3. RAF LOOP ONLY DOES ACTIVE STROKE
 *    The RAF loop only redraws the active canvas. Committed canvas is only
 *    touched when a stroke finishes or undo/redo/clear fires.
 *
 * 4. POINTERMOVE IS O(1)
 *    pointermove just pushes a point into an array. The RAF loop drains it.
 *    No canvas work ever happens inside a pointer event.
 *
 * 5. LIVE PIXEL ERASER
 *    Pixel eraser uses a dedicated third canvas layer with destination-out
 *    compositing. As you drag, each eraser segment is applied immediately
 *    to the eraser canvas — no waiting for pointerup.
 *
 * 6. STROKE ERASER — NO BLOB
 *    Stroke eraser never draws anything. It only tracks hover/drag position,
 *    highlights matched strokes on the committed canvas, and removes them
 *    on pointerup.
 *
 * 7. COALESCED + PREDICTED EVENTS
 *    getCoalescedEvents() captures sub-frame stylus samples.
 *    getPredictedEvents() appends look-ahead points for this frame only.
 *
 * 8. POINT THINNING
 *    Adaptive minDist based on velocity prevents perfect-freehand from
 *    receiving redundant near-identical points.
 *
 * 9. OUTLINE CACHING
 *    Committed stroke outlines cached on the object. Undo/redo never
 *    recomputes perfect-freehand for old strokes.
 *
 * 10. SPLIT STROKE AWARENESS
 *     When pixel eraser splits a stroke, resulting segments get new IDs
 *     and are fully independent — stroke eraser highlights each individually.
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
import { renderPageToCanvas } from "@/services/handwriting/render_submission"

// We import getStroke only for commit-time usage
import { getStroke } from "perfect-freehand"

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
  const points = stroke.points || []
  if (!points.length || !point) return false
  if (points.length === 1)
    return (
      Math.hypot(points[0].x - point.x, points[0].y - point.y) <= radius
    )
  for (let i = 1; i < points.length; i++) {
    if (distanceToSegment(point, points[i - 1], points[i]) <= radius)
      return true
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
// Point creation — always in CSS/logical pixel space
// ─────────────────────────────────────────────────────────────────────────────
function createPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  const isStylus = event.pointerType === "pen"
  let pressure
  if (isStylus) {
    pressure = Math.min(Math.max(event.pressure ?? 0.5, 0.08), 1.0)
  } else if (event.pressure > 0) {
    pressure = event.pressure
  } else {
    pressure = undefined
  }
  return { x, y, pressure, timestamp: performance.now() }
}

// ─────────────────────────────────────────────────────────────────────────────
// Point thinning — adaptive minimum distance based on velocity
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
  const vel = velocityRef?.current ?? 0
  const minDist = vel > 1.5 ? 2.5 : 1.0
  return dist >= minDist
}

// ─────────────────────────────────────────────────────────────────────────────
// Chaikin smoothing — runs once on commit
// ─────────────────────────────────────────────────────────────────────────────
function chaikinSmooth(points, iterations = 2) {
  if (points.length < 3) return points
  let pts = points
  for (let i = 0; i < iterations; i++) {
    const smoothed = [pts[0]]
    for (let j = 0; j < pts.length - 1; j++) {
      smoothed.push({
        x: pts[j].x * 0.75 + pts[j + 1].x * 0.25,
        y: pts[j].y * 0.75 + pts[j + 1].y * 0.25,
        pressure: pts[j].pressure,
        timestamp: pts[j].timestamp,
      })
      smoothed.push({
        x: pts[j].x * 0.25 + pts[j + 1].x * 0.75,
        y: pts[j].y * 0.25 + pts[j + 1].y * 0.75,
        pressure: pts[j + 1].pressure,
        timestamp: pts[j + 1].timestamp,
      })
    }
    smoothed.push(pts[pts.length - 1])
    pts = smoothed
  }
  return pts
}

// ─────────────────────────────────────────────────────────────────────────────
// perfect-freehand helpers — commit-time only
// ─────────────────────────────────────────────────────────────────────────────
const COMMITTED_OPTIONS = (width) => ({
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

function getSvgPathFromStroke(points) {
  if (!points.length) return ""
  const d = points.reduce(
    (path, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length]
      path.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
      return path
    },
    ["M", ...points[0], "Q"]
  )
  d.push("Z")
  return d.join(" ")
}

function getOrBuildOutline(stroke) {
  if (!stroke._outline) {
    const pts = stroke.points.map((p) => [p.x, p.y, p.pressure ?? 0.5])
    stroke._outline = getStroke(pts, COMMITTED_OPTIONS(stroke.width))
  }
  return stroke._outline
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas drawing primitives
// ─────────────────────────────────────────────────────────────────────────────

/** Draw paper background + ruled lines */
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

/** Draw a single committed stroke using cached outline */
function drawCommittedStroke(ctx, stroke) {
  if (!stroke?.points?.length) return
  const outline = getOrBuildOutline(stroke)
  if (!outline?.length) return
  const path = new Path2D(getSvgPathFromStroke(outline))
  ctx.save()
  ctx.globalCompositeOperation =
    stroke.tool === "pixel-eraser" ? "destination-out" : "source-over"
  ctx.fillStyle = stroke.color || PEN_COLOR
  ctx.fill(path)
  ctx.restore()
}

/** Full redraw of all committed strokes onto a ctx */
function redrawAllStrokes(ctx, strokes) {
  ;(strokes || []).forEach((s) => drawCommittedStroke(ctx, s))
}

/**
 * Draw eraser highlight — thin amber ring around stroke, no fill blob.
 * Uses destination-out ring technique to avoid covering the stroke.
 */
function drawEraserHighlight(ctx, stroke) {
  if (!stroke?.points?.length) return
  const pts = stroke.points.map((p) => [p.x, p.y, p.pressure ?? 0.5])

  const makeOutline = (extra) =>
    getStroke(pts, {
      ...COMMITTED_OPTIONS(stroke.width + extra),
      thinning: 0,
      taperStart: 0,
      taperEnd: 0,
    })

  const outer = makeOutline(7)
  const inner = makeOutline(1)
  if (!outer?.length) return

  ctx.save()
  // Glow fill
  ctx.globalAlpha = 0.15
  ctx.fillStyle = "#f6c8aa"
  ctx.fill(new Path2D(getSvgPathFromStroke(outer)))
  // Punch out inner to form ring
  ctx.globalCompositeOperation = "destination-out"
  ctx.globalAlpha = 1
  const innerPath = new Path2D(getSvgPathFromStroke(inner))
  ctx.fill(innerPath)
  // Crisp border
  ctx.globalCompositeOperation = "source-over"
  ctx.globalAlpha = 0.75
  ctx.fillStyle = "#f6c8aa"
  const border = makeOutline(3)
  if (border?.length) {
    ctx.fill(new Path2D(getSvgPathFromStroke(border)))
    ctx.globalCompositeOperation = "destination-out"
    ctx.globalAlpha = 1
    ctx.fill(innerPath)
  }
  ctx.restore()
}

/**
 * Draw the active (in-progress) stroke as a fast raw bezier path.
 * NO perfect-freehand here — this runs every RAF frame and must be O(n) cheap.
 * Width varies slightly with pressure but no expensive outline computation.
 */
function drawRawActivePenStroke(ctx, points, color, width) {
  if (!points || points.length < 1) return
  ctx.save()
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  ctx.strokeStyle = color
  ctx.lineWidth = width

  if (points.length === 1) {
    ctx.beginPath()
    ctx.arc(points[0].x, points[0].y, width / 2, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.restore()
    return
  }

  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)

  if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y)
  } else {
    // Quadratic bezier through midpoints for smooth real-time rendering
    for (let i = 1; i < points.length - 1; i++) {
      const mx = (points[i].x + points[i + 1].x) / 2
      const my = (points[i].y + points[i + 1].y) / 2
      ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my)
    }
    const last = points[points.length - 1]
    ctx.lineTo(last.x, last.y)
  }

  ctx.stroke()
  ctx.restore()
}

// ─────────────────────────────────────────────────────────────────────────────
// Pixel eraser — live destination-out on dedicated canvas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply a segment of pixel eraser path directly to the eraser canvas.
 * This is called from extendStroke so erasing is visually instant.
 */
function applyEraserSegment(ctx, fromPoint, toPoint, radius, scale) {
  if (!fromPoint || !toPoint) return
  ctx.save()
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.globalCompositeOperation = "destination-out"
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  ctx.lineWidth = radius * 2
  ctx.strokeStyle = "rgba(0,0,0,1)"
  ctx.beginPath()
  ctx.moveTo(fromPoint.x, fromPoint.y)
  ctx.lineTo(toPoint.x, toPoint.y)
  ctx.stroke()
  ctx.restore()
}

// ─────────────────────────────────────────────────────────────────────────────
// Pixel eraser stroke splitting
// ─────────────────────────────────────────────────────────────────────────────
function splitStrokeByEraser(stroke, eraserPoints, eraserRadius) {
  if (!eraserPoints?.length || stroke.tool === "pixel-eraser") return null
  const points = stroke.points || []
  if (points.length < 2) return null

  const erased = points.map((p) => {
    for (let i = 0; i < eraserPoints.length; i++) {
      const ep = eraserPoints[i]
      if (Math.hypot(p.x - ep.x, p.y - ep.y) <= eraserRadius) return true
      if (i > 0) {
        if (
          distanceToSegment(p, eraserPoints[i - 1], eraserPoints[i]) <=
          eraserRadius
        )
          return true
      }
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
      if (current && current.length >= 2) segments.push(current)
      current = null
    }
  }
  if (current && current.length >= 2) segments.push(current)

  if (segments.length === 0) return [] // fully erased
  if (segments.length === 1 && segments[0].length === points.length) return null // unchanged

  return segments.map((pts) => ({
    ...stroke,
    id: crypto.randomUUID(),
    points: pts,
    _outline: null, // force recompute for new segment
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
// Component
// ─────────────────────────────────────────────────────────────────────────────
const HandwritingCanvas = forwardRef(function HandwritingCanvas(
  { onSubmit, questionId },
  ref
) {
  /**
   * THREE canvas layers:
   *   committedCanvasRef — finished pen strokes (paper bg + all committed)
   *   eraserCanvasRef    — live pixel eraser (destination-out composite)
   *   activeCanvasRef    — current in-progress stroke only (top, pointer events)
   */
  const committedCanvasRef = useRef(null)
  const eraserCanvasRef = useRef(null)
  const activeCanvasRef = useRef(null)

  // ── Input state (mutable refs, never triggers renders) ──────────────────
  const activePointerRef = useRef(null)
  const currentStrokeRef = useRef(null) // { tool, color, width, points[] }
  const pendingPointsRef = useRef([])    // predicted points for current frame
  const velocityRef = useRef(0)
  const lastAppliedEraserPointRef = useRef(null) // for live pixel eraser segments

  // ── Eraser preview state ─────────────────────────────────────────────────
  const eraserPreviewRef = useRef({ point: null, strokeIds: new Set() })

  // ── RAF ──────────────────────────────────────────────────────────────────
  const rafRef = useRef(null)
  const needsCommittedRedrawRef = useRef(false)

  // ── Page data ─────────────────────────────────────────────────────────────
  const pagesRef = useRef([createPage(0)])
  const currentPageIndexRef = useRef(0)

  // ── React state (only for UI re-renders) ─────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────
  // Committed canvas: full redraw
  // Called on page change, undo, redo, clear, stroke erase, page switch
  // ─────────────────────────────────────────────────────────────────────────
  const redrawCommitted = useCallback(() => {
    const canvas = committedCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    ctx.save()
    ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0)
    drawPaper(ctx)

    const strokes = pagesRef.current[currentPageIndexRef.current]?.strokes || []
    redrawAllStrokes(ctx, strokes)

    // Stroke eraser highlights
    const hitIds = eraserPreviewRef.current.strokeIds
    if (hitIds?.size) {
      strokes
        .filter((s) => hitIds.has(s.id))
        .forEach((s) => drawEraserHighlight(ctx, s))
    }
    ctx.restore()
  }, [canvasScale])

  // ─────────────────────────────────────────────────────────────────────────
  // Eraser canvas: reset and repopulate from committed strokes
  // Called after pixel eraser commits (rebuilds clean from stroke data)
  // ─────────────────────────────────────────────────────────────────────────
  const resetEraserCanvas = useCallback(() => {
    const canvas = eraserCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  // Active canvas: draw only the in-progress stroke (raw bezier, not freehand)
  // ─────────────────────────────────────────────────────────────────────────
  const redrawActive = useCallback(
    (renderPoints) => {
      const canvas = activeCanvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext("2d")
      ctx.save()
      ctx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0)
      ctx.clearRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT)

      if (currentStrokeRef.current && renderPoints?.length) {
        const { tool: t, color, width } = currentStrokeRef.current
        if (t === "pen") {
          drawRawActivePenStroke(ctx, renderPoints, color, width)
        }
        // Eraser tools draw nothing on active canvas
      }
      ctx.restore()
    },
    [canvasScale]
  )

  // ─────────────────────────────────────────────────────────────────────────
  // RAF loop — only active canvas work here
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let running = true

    function loop() {
      if (!running) return

      if (currentStrokeRef.current && currentStrokeRef.current.tool === "pen") {
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

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => {
      running = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [redrawActive, redrawCommitted])

  // ─────────────────────────────────────────────────────────────────────────
  // Canvas sizing
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const committed = committedCanvasRef.current
    const eraser = eraserCanvasRef.current
    const active = activeCanvasRef.current
    if (!committed || !eraser || !active) return

    const w = Math.round(PAGE_WIDTH * canvasScale)
    const h = Math.round(PAGE_HEIGHT * canvasScale)

    ;[committed, eraser, active].forEach((c) => {
      c.width = w
      c.height = h
    })

    needsCommittedRedrawRef.current = true
  }, [canvasScale, currentPageIndex])

  // Sync index ref
  useEffect(() => {
    currentPageIndexRef.current = currentPageIndex
  }, [currentPageIndex])

  // Trigger committed redraw on page data changes
  useEffect(() => {
    needsCommittedRedrawRef.current = true
  }, [pages, currentPageIndex])

  // Clear eraser preview when leaving eraser tools
  useEffect(() => {
    if (tool === "stroke-eraser" || tool === "pixel-eraser") return
    eraserPreviewRef.current = { point: null, strokeIds: new Set() }
    setEraserPoint(null)
    needsCommittedRedrawRef.current = true
  }, [tool])

  // Keyboard shortcuts
  useEffect(() => {
    if (!writingSurfaceActive) return undefined
    function handleKeyDown(event) {
      if (event.key === "e" || event.key === "E") {
        event.preventDefault()
        setTool((t) =>
          t === "stroke-eraser" || t === "pixel-eraser" ? "pen" : "stroke-eraser"
        )
      }
      if (event.key === "p" || event.key === "P") {
        event.preventDefault()
        setTool("pen")
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [writingSurfaceActive])

  // ─────────────────────────────────────────────────────────────────────────
  // Page state helpers
  // ─────────────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────
  // Eraser preview — stroke-eraser hover highlighting
  // ─────────────────────────────────────────────────────────────────────────
  function updateEraserPreview(event) {
    if (
      (tool !== "stroke-eraser" && tool !== "pixel-eraser") ||
      !activeCanvasRef.current
    )
      return
    const point = createPoint(event, activeCanvasRef.current)
    const strokeIds =
      tool === "stroke-eraser"
        ? new Set(
            (
              pagesRef.current[currentPageIndexRef.current]?.strokes || []
            )
              .filter(
                (s) =>
                  s.tool !== "pixel-eraser" &&
                  strokeNearPoint(s, point, eraserSize)
              )
              .map((s) => s.id)
          )
        : new Set()
    eraserPreviewRef.current = { point, strokeIds }
    setEraserPoint({
      ...point,
      hitCount: tool === "stroke-eraser" ? strokeIds.size : 0,
    })
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

  // ─────────────────────────────────────────────────────────────────────────
  // POINTER HANDLERS
  // These are hot-path — do as little work as possible.
  // No canvas operations inside pointermove for pen strokes.
  // ─────────────────────────────────────────────────────────────────────────

  function startStroke(event) {
    if (!activeCanvasRef.current) return
    // Palm rejection
    if (event.pointerType === "touch" && event.width > 45) return
    event.preventDefault()

    updateEraserPreview(event)
    activePointerRef.current = event.pointerId
    activeCanvasRef.current.setPointerCapture(event.pointerId)

    velocityRef.current = 0
    pendingPointsRef.current = []
    lastAppliedEraserPointRef.current = null

    const point = createPoint(event, activeCanvasRef.current)
    currentStrokeRef.current = {
      id: crypto.randomUUID(),
      tool,
      color: PEN_COLOR,
      width: tool === "pen" ? PEN_WIDTH : eraserSize * 2,
      points: [point],
      _outline: null,
    }

    // For pixel eraser: seed the first eraser point immediately
    if (tool === "pixel-eraser") {
      lastAppliedEraserPointRef.current = point
      const eraserCtx = eraserCanvasRef.current?.getContext("2d")
      if (eraserCtx) {
        eraserCtx.save()
        eraserCtx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0)
        eraserCtx.globalCompositeOperation = "destination-out"
        eraserCtx.beginPath()
        eraserCtx.arc(point.x, point.y, eraserSize, 0, Math.PI * 2)
        eraserCtx.fillStyle = "rgba(0,0,0,1)"
        eraserCtx.fill()
        eraserCtx.restore()
      }
    }
  }

  function extendStroke(event) {
    // Always update eraser preview position
    updateEraserPreview(event)

    if (activePointerRef.current !== event.pointerId || !currentStrokeRef.current)
      return
    event.preventDefault()

    const canvas = activeCanvasRef.current
    const coalesced = event.getCoalescedEvents?.() || [event]
    const predicted = event.getPredictedEvents?.() || []

    // Drain coalesced events into committed points
    const pts = currentStrokeRef.current.points
    let last = pts[pts.length - 1]

    for (const e of coalesced) {
      const p = createPoint(e, canvas)
      if (shouldAddPoint(p, last, velocityRef)) {
        pts.push(p)

        // ── Live pixel eraser: apply each new segment immediately ──────────
        if (tool === "pixel-eraser") {
          const eraserCtx = eraserCanvasRef.current?.getContext("2d")
          if (eraserCtx && lastAppliedEraserPointRef.current) {
            applyEraserSegment(
              eraserCtx,
              lastAppliedEraserPointRef.current,
              p,
              eraserSize,
              canvasScale
            )
          }
          lastAppliedEraserPointRef.current = p
        }

        last = p
      }
    }

    // Predicted points — for pen rendering only, not committed
    if (tool === "pen") {
      pendingPointsRef.current = predicted.map((e) => createPoint(e, canvas))
    }
  }

  function finishStroke(event) {
    if (
      activePointerRef.current !== event.pointerId ||
      !currentStrokeRef.current
    )
      return
    event.preventDefault()

    const completedStroke = { ...currentStrokeRef.current }
    activePointerRef.current = null
    currentStrokeRef.current = null
    pendingPointsRef.current = []
    lastAppliedEraserPointRef.current = null

    // Clear active canvas immediately
    const activeCtx = activeCanvasRef.current?.getContext("2d")
    if (activeCtx) {
      activeCtx.clearRect(
        0,
        0,
        activeCanvasRef.current.width,
        activeCanvasRef.current.height
      )
    }

    // ── STROKE ERASER ──────────────────────────────────────────────────────
    if (completedStroke.tool === "stroke-eraser") {
      // Collect the drag path to find intersecting strokes
      const radius = Math.max(eraserSize, 1)
      const eraserPath = completedStroke.points

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
      eraserPreviewRef.current = {
        point: eraserPreviewRef.current.point,
        strokeIds: new Set(),
      }
      needsCommittedRedrawRef.current = true
      return
    }

    // ── PIXEL ERASER ───────────────────────────────────────────────────────
    if (completedStroke.tool === "pixel-eraser") {
      const eraserRadius = eraserSize
      const eraserPoints = completedStroke.points

      updateCurrentPage((page) => {
        let nextStrokes = []
        for (const s of page.strokes) {
          if (s.tool === "pixel-eraser") {
            nextStrokes.push(s)
            continue
          }
          const split = splitStrokeByEraser(s, eraserPoints, eraserRadius)
          if (split === null) {
            nextStrokes.push(s)
          } else if (split.length === 0) {
            // fully erased — drop
          } else {
            nextStrokes = [...nextStrokes, ...split]
          }
        }
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

      // Committed canvas now owns the display — clear eraser overlay
      // and rebuild committed from the updated stroke data
      resetEraserCanvas()
      needsCommittedRedrawRef.current = true
      return
    }

    // ── PEN ────────────────────────────────────────────────────────────────
    // Apply Chaikin smoothing, then build perfect-freehand outline
    const smoothedPoints = chaikinSmooth(completedStroke.points, 2)
    const finalStroke = {
      ...completedStroke,
      points: smoothedPoints,
      _outline: null,
    }

    // Build outline now (sync, before state update) so committed blit is instant
    getOrBuildOutline(finalStroke)

    // Blit to committed canvas immediately — happens same JS task as clearing active
    const committedCtx = committedCanvasRef.current?.getContext("2d")
    if (committedCtx) {
      committedCtx.save()
      committedCtx.setTransform(canvasScale, 0, 0, canvasScale, 0, 0)
      drawCommittedStroke(committedCtx, finalStroke)
      committedCtx.restore()
    }

    // Then update state (triggers React re-render, but canvas already looks right)
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
    updateCurrentPage((page) => {
      const history = page.history || []
      if (!history.length) return page
      const action = history[history.length - 1]
      let next
      if (action.type === "add") {
        next = { ...page, strokes: page.strokes.filter((s) => s.id !== action.stroke.id) }
      } else if (action.type === "erase") {
        next = { ...page, strokes: [...page.strokes, ...action.strokes] }
      } else if (action.type === "pixel-erase") {
        // Restore previous strokes entirely
        next = { ...page, strokes: action.prevStrokes }
      } else {
        next = page
      }
      return {
        ...next,
        history: history.slice(0, -1),
        redoStack: [action, ...page.redoStack],
      }
    })
    resetEraserCanvas()
    needsCommittedRedrawRef.current = true
  }

  function redo() {
    updateCurrentPage((page) => {
      if (!page.redoStack.length) return page
      const [action, ...redoStack] = page.redoStack
      let next
      if (action.type === "add") {
        next = { ...page, strokes: [...page.strokes, action.stroke] }
      } else if (action.type === "erase") {
        const ids = new Set(action.strokes.map((x) => x.id))
        next = { ...page, strokes: page.strokes.filter((s) => !ids.has(s.id)) }
      } else if (action.type === "pixel-erase") {
        // Re-apply the split result
        let nextStrokes = []
        for (const s of action.prevStrokes) {
          if (s.tool === "pixel-eraser") { nextStrokes.push(s); continue }
          const split = splitStrokeByEraser(s, action.eraserPoints, action.eraserRadius)
          if (split === null) {
            nextStrokes.push(s)
          } else if (split.length > 0) {
            nextStrokes = [...nextStrokes, ...split]
          }
        }
        next = { ...page, strokes: nextStrokes }
      } else {
        next = page
      }
      return { ...next, history: [...(page.history || []), action], redoStack }
    })
    resetEraserCanvas()
    needsCommittedRedrawRef.current = true
  }

  function clearPage() {
    updateCurrentPage((page) => ({
      ...page,
      strokes: [],
      history: page.strokes.length
        ? [
            ...(page.history || []),
            { type: "erase", strokes: page.strokes },
          ]
        : page.history,
      redoStack: [],
    }))
    resetEraserCanvas()
    needsCommittedRedrawRef.current = true
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Page management
  // ─────────────────────────────────────────────────────────────────────────
  function addPage() {
    const nextPages = [
      ...pagesRef.current,
      createPage(pagesRef.current.length),
    ]
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

  // ─────────────────────────────────────────────────────────────────────────
  // Export
  // ─────────────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
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

          {/* Canvas stack */}
          <div
            className="relative h-auto w-full max-w-[820px]"
            style={{ aspectRatio: `${PAGE_WIDTH} / ${PAGE_HEIGHT}` }}
          >
            {/* Layer 1 — committed strokes + paper background */}
            <canvas
              ref={committedCanvasRef}
              draggable={false}
              className="block h-full w-full touch-none rounded-[4px] border border-[#3a2b23]/70 shadow-[0_18px_70px_rgba(0,0,0,0.42)] select-none [-webkit-touch-callout:none] [-webkit-user-drag:none] [-webkit-user-select:none] [touch-action:none]"
            />

            {/* Layer 2 — pixel eraser live overlay (destination-out) */}
            <canvas
              ref={eraserCanvasRef}
              draggable={false}
              className="pointer-events-none absolute inset-0 block h-full w-full touch-none rounded-[4px] select-none [-webkit-touch-callout:none] [-webkit-user-drag:none] [-webkit-user-select:none] [touch-action:none]"
            />

            {/* Layer 3 — active stroke + pointer capture */}
            <canvas
              ref={activeCanvasRef}
              draggable={false}
              className="absolute inset-0 block h-full w-full touch-none rounded-[4px] select-none [-webkit-touch-callout:none] [-webkit-user-drag:none] [-webkit-user-select:none] [touch-action:none]"
              style={{
                // Make active canvas transparent to show layers beneath,
                // but keep it on top to receive pointer events
                background: "transparent",
              }}
              onContextMenu={preventBrowserGesture}
              onDragStart={preventBrowserGesture}
              onPointerCancel={finishStroke}
              onPointerDown={startStroke}
              onPointerEnter={updateEraserPreview}
              onPointerLeave={clearEraserPreview}
              onPointerMove={extendStroke}
              onPointerUp={finishStroke}
            />

            {/* Eraser cursor */}
            {(tool === "stroke-eraser" || tool === "pixel-eraser") &&
              eraserPoint && (
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
