// render_submission.js — v3
//
// Commit-only renderer. All active stroke rendering has moved to
// HandwritingCanvas (inkCanvas append model). This module handles:
//   • Drawing finished strokes (perfect-freehand quality)
//   • Eraser highlights
//   • Export / renderPageToCanvas for AI marking
//
// perfect-freehand is called at most once per stroke (result is cached
// on stroke._outline). Undo/redo never recomputes old strokes.

import { getStroke } from "perfect-freehand"

// ─────────────────────────────────────────────────────────────────────────────
// SVG path builder
// ─────────────────────────────────────────────────────────────────────────────
function getSvgPathFromStroke(points) {
  if (!points.length) return ""
  const d = points.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length]
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
      return acc
    },
    ["M", ...points[0], "Q"]
  )
  d.push("Z")
  return d.join(" ")
}

// ─────────────────────────────────────────────────────────────────────────────
// Stroke options — high quality, used only at commit time
// ─────────────────────────────────────────────────────────────────────────────
function getStrokeOptions(width) {
  return {
    size: width,
    thinning: 0.618,
    smoothing: 0.72,
    streamline: 0.62,
    taperStart: 12,
    taperEnd: 18,
    capStart: true,
    capEnd: true,
    simulatePressure: false,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Outline cache — built once per stroke, stored on stroke._outline
// ─────────────────────────────────────────────────────────────────────────────
function getOrBuildOutline(stroke) {
  if (!stroke._outline) {
    const pts = stroke.points.map((p) => [p.x, p.y, p.pressure ?? 0.5])
    stroke._outline = getStroke(pts, getStrokeOptions(stroke.width))
  }
  return stroke._outline
}

// ─────────────────────────────────────────────────────────────────────────────
// Draw a single committed stroke
// ─────────────────────────────────────────────────────────────────────────────
export function drawStroke(ctx, stroke, { clean = false } = {}) {
  if (!stroke?.points?.length) return
  const outline = getOrBuildOutline(stroke)
  if (!outline?.length) return

  ctx.save()
  ctx.globalCompositeOperation =
    stroke.tool === "pixel-eraser" ? "destination-out" : "source-over"
  ctx.fillStyle = clean ? "#050505" : stroke.color || "#e8d8c7"
  ctx.fill(new Path2D(getSvgPathFromStroke(outline)))
  ctx.restore()
}

// ─────────────────────────────────────────────────────────────────────────────
// Stroke eraser highlight — amber ring, no fill blob
// ─────────────────────────────────────────────────────────────────────────────
export function drawEraserHighlight(ctx, stroke) {
  if (!stroke?.points?.length) return
  const pts = stroke.points.map((p) => [p.x, p.y, p.pressure ?? 0.5])

  const makeOutline = (extra) =>
    getStroke(pts, {
      ...getStrokeOptions(stroke.width + extra),
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
  ctx.fill(new Path2D(getSvgPathFromStroke(outer)))
  ctx.globalCompositeOperation = "destination-out"
  ctx.globalAlpha = 1
  const innerPath = new Path2D(getSvgPathFromStroke(inner))
  ctx.fill(innerPath)
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

// ─────────────────────────────────────────────────────────────────────────────
// Draw all strokes for a page
// ─────────────────────────────────────────────────────────────────────────────
export function drawPageStrokes(ctx, strokes, { clean = false } = {}) {
  ;(strokes || []).forEach((stroke) => drawStroke(ctx, stroke, { clean }))
}

// ─────────────────────────────────────────────────────────────────────────────
// OCR export renderer — intentionally plain line art for vision token efficiency
// ─────────────────────────────────────────────────────────────────────────────
const OCR_PADDING = 52
const OCR_STROKE_WIDTH = 4
const OCR_MAX_RENDERED_SIDE = 900

function validStrokePoints(stroke) {
  return (stroke?.points || []).filter(
    (point) => Number.isFinite(point?.x) && Number.isFinite(point?.y)
  )
}

export function getPageStrokeBounds(page, width, height, { padding = OCR_PADDING } = {}) {
  const strokes = page?.strokes || []
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let pointCount = 0

  strokes.forEach((stroke) => {
    validStrokePoints(stroke).forEach((point) => {
      minX = Math.min(minX, point.x)
      minY = Math.min(minY, point.y)
      maxX = Math.max(maxX, point.x)
      maxY = Math.max(maxY, point.y)
      pointCount += 1
    })
  })

  if (!pointCount || !Number.isFinite(minX) || !Number.isFinite(minY)) {
    return {
      x: 0,
      y: 0,
      width,
      height,
      empty: true,
      point_count: pointCount,
      coverage: 1,
    }
  }

  const strokeMargin = padding + OCR_STROKE_WIDTH * 2
  const x = Math.max(0, Math.floor(minX - strokeMargin))
  const y = Math.max(0, Math.floor(minY - strokeMargin))
  const right = Math.min(width, Math.ceil(maxX + strokeMargin))
  const bottom = Math.min(height, Math.ceil(maxY + strokeMargin))
  const cropWidth = Math.max(1, right - x)
  const cropHeight = Math.max(1, bottom - y)

  return {
    x,
    y,
    width: cropWidth,
    height: cropHeight,
    empty: false,
    point_count: pointCount,
    coverage: (cropWidth * cropHeight) / Math.max(1, width * height),
  }
}

function drawOCRStroke(ctx, stroke) {
  const points = validStrokePoints(stroke)
  if (!points.length) return

  ctx.save()
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  ctx.lineWidth = stroke.tool === "pixel-eraser" ? OCR_STROKE_WIDTH * 2.4 : OCR_STROKE_WIDTH
  ctx.strokeStyle = stroke.tool === "pixel-eraser" ? "#ffffff" : "#000000"
  ctx.globalCompositeOperation = "source-over"

  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  if (points.length === 1) {
    ctx.lineTo(points[0].x + 0.01, points[0].y + 0.01)
  } else {
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i].x, points[i].y)
    }
  }
  ctx.stroke()
  ctx.restore()
}

export function drawPageStrokesForOCR(ctx, strokes) {
  ;(strokes || []).forEach((stroke) => drawOCRStroke(ctx, stroke))
}

export function renderPageToOCRCanvas({
  page,
  width,
  height,
  scale = 0.6,
  padding = OCR_PADDING,
  maxRenderedSide = OCR_MAX_RENDERED_SIDE,
} = {}) {
  const crop = getPageStrokeBounds(page, width, height, { padding })
  const boundedScale = Math.min(
    scale,
    maxRenderedSide / Math.max(1, crop.width),
    maxRenderedSide / Math.max(1, crop.height)
  )
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(crop.width * boundedScale))
  canvas.height = Math.max(1, Math.round(crop.height * boundedScale))
  const ctx = canvas.getContext("2d", { alpha: false })

  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.scale(boundedScale, boundedScale)
  ctx.translate(-crop.x, -crop.y)
  drawPageStrokesForOCR(ctx, page?.strokes || [])

  return { canvas, crop, scale: boundedScale }
}

// ─────────────────────────────────────────────────────────────────────────────
// Export: render page to offscreen canvas for AI marking
// ─────────────────────────────────────────────────────────────────────────────
export function renderPageToCanvas({
  page,
  width,
  height,
  scale = 1,
  clean = false,
}) {
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext("2d")
  ctx.scale(scale, scale)

  // Background
  ctx.fillStyle = clean ? "#ffffff" : "#191410"
  ctx.fillRect(0, 0, width, height)

  // Ruled lines (skipped for clean/AI export)
  if (!clean) {
    ctx.strokeStyle = "rgba(232, 216, 199, 0.08)"
    ctx.lineWidth = 1
    for (let y = 72; y < height; y += 34) {
      ctx.beginPath()
      ctx.moveTo(40, y)
      ctx.lineTo(width - 40, y)
      ctx.stroke()
    }
  }

  drawPageStrokes(ctx, page.strokes || [], { clean })
  return canvas
}

// ─────────────────────────────────────────────────────────────────────────────
// Kept for API compatibility — active stroke now uses inkCanvas append model
// ─────────────────────────────────────────────────────────────────────────────
export function drawActiveStroke() {
  // Intentionally empty.
  // Active strokes are rendered in HandwritingCanvas via append-only inkCanvas.
}

// Alias for internal callers
export { drawStroke as blitStrokeToContext }
