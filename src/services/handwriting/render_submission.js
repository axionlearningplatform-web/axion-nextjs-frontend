// render_submission.js
//
// This module is now COMMIT-ONLY — it handles:
//   • Drawing finished (committed) strokes with perfect-freehand
//   • Eraser highlight rendering
//   • Export / renderPageToCanvas
//
// Active stroke rendering has been moved entirely to HandwritingCanvas
// using raw quadratic bezier paths (no perfect-freehand) for zero latency.
// perfect-freehand is called exactly once per stroke, at pointerup.

import { getStroke } from "perfect-freehand"

// ─────────────────────────────────────────────────────────────────────────────
// SVG path builder
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// Stroke options — committed quality only (active uses raw bezier now)
// ─────────────────────────────────────────────────────────────────────────────
function getCommittedStrokeOptions(width) {
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
// Outline cache — computed once per stroke, stored on stroke._outline
// ─────────────────────────────────────────────────────────────────────────────
function getOrBuildOutline(stroke) {
  if (!stroke._outline) {
    const pts = stroke.points.map((p) => [p.x, p.y, p.pressure ?? 0.5])
    stroke._outline = getStroke(pts, getCommittedStrokeOptions(stroke.width))
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

  const path = new Path2D(getSvgPathFromStroke(outline))
  ctx.save()
  ctx.globalCompositeOperation =
    stroke.tool === "pixel-eraser" ? "destination-out" : "source-over"
  ctx.fillStyle = clean ? "#050505" : stroke.color || "#e8d8c7"
  ctx.fill(path)
  ctx.restore()
}

// ─────────────────────────────────────────────────────────────────────────────
// Stroke eraser highlight — thin amber ring, no fill blob
// ─────────────────────────────────────────────────────────────────────────────
export function drawEraserHighlight(ctx, stroke) {
  if (!stroke?.points?.length) return
  const pts = stroke.points.map((p) => [p.x, p.y, p.pressure ?? 0.5])

  const makeOutline = (extra) =>
    getStroke(pts, {
      ...getCommittedStrokeOptions(stroke.width + extra),
      thinning: 0,
      taperStart: 0,
      taperEnd: 0,
    })

  const outer = makeOutline(7)
  const inner = makeOutline(1)
  if (!outer?.length) return

  ctx.save()

  // Diffuse glow
  ctx.globalAlpha = 0.15
  ctx.fillStyle = "#f6c8aa"
  ctx.fill(new Path2D(getSvgPathFromStroke(outer)))

  // Punch out centre to make ring
  ctx.globalCompositeOperation = "destination-out"
  ctx.globalAlpha = 1
  const innerPath = new Path2D(getSvgPathFromStroke(inner))
  ctx.fill(innerPath)

  // Crisp amber border line
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
// Draw all strokes for a page — used for full committed-canvas redraws
// ─────────────────────────────────────────────────────────────────────────────
export function drawPageStrokes(ctx, strokes, { clean = false } = {}) {
  ;(strokes || []).forEach((stroke) => drawStroke(ctx, stroke, { clean }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Blit a single committed stroke — used after finishStroke for instant commit
// ─────────────────────────────────────────────────────────────────────────────
export function blitStrokeToContext(ctx, stroke, { clean = false } = {}) {
  drawStroke(ctx, stroke, { clean })
}

// ─────────────────────────────────────────────────────────────────────────────
// Export: render a page to an offscreen canvas for AI marking
// ─────────────────────────────────────────────────────────────────────────────
export function renderPageToCanvas({ page, width, height, scale = 1, clean = false }) {
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext("2d")
  ctx.scale(scale, scale)

  // Background
  ctx.fillStyle = clean ? "#ffffff" : "#191410"
  ctx.fillRect(0, 0, width, height)

  // Ruled lines (skipped for clean export)
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
// drawActiveStroke — kept for any external callers but no longer used internally.
// Active stroke rendering now lives entirely in HandwritingCanvas as raw bezier.
// ─────────────────────────────────────────────────────────────────────────────
export function drawActiveStroke() {
  // Intentionally empty — see HandwritingCanvas drawRawActivePenStroke
}