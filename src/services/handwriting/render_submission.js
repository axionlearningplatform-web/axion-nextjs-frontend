// render_submission.js — improved with outline caching, adaptive quality, taper, incremental rendering

import { getStroke } from "perfect-freehand"

// ---------------------------------------------------------------------------
// SVG path builder from perfect-freehand outline points
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Adaptive stroke options — fast writing = cheaper calculation
// Full quality applied on commit via getCommittedStrokeOptions
// ---------------------------------------------------------------------------
function estimateVelocity(points) {
  if (points.length < 4) return 0
  const recent = points.slice(-4)
  return Math.hypot(
    recent[recent.length - 1].x - recent[0].x,
    recent[recent.length - 1].y - recent[0].y
  ) / recent.length
}

function getActiveStrokeOptions(points, width) {
  const vel = estimateVelocity(points)
  const fast = vel > 18

  return {
    size: width,
    thinning: fast ? 0.3 : 0.618,
    smoothing: fast ? 0.35 : 0.72,
    streamline: fast ? 0.28 : 0.62,
    taperStart: fast ? 0 : 10,
    taperEnd: fast ? 0 : 16,
    capStart: true,
    capEnd: true,
    simulatePressure: false,
  }
}

function getCommittedStrokeOptions(width) {
  // Always full quality for committed (finished) strokes
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

// ---------------------------------------------------------------------------
// Stroke eraser highlight — draws a clean, thin outline around the stroke path
// No fill, no fat blob. Just a sleek glow outline showing what will be removed.
// ---------------------------------------------------------------------------
export function drawEraserHighlight(ctx, stroke) {
  if (!stroke?.points?.length) return

  const pts = stroke.points.map((p) => [p.x, p.y, p.pressure ?? 0.5])

  // Slightly wider outline to create the glow border
  const outerOutline = getStroke(pts, {
    ...getCommittedStrokeOptions(stroke.width + 6),
    thinning: 0,        // uniform width for clean outline ring
    taperStart: 0,
    taperEnd: 0,
  })
  const innerOutline = getStroke(pts, {
    ...getCommittedStrokeOptions(stroke.width + 1),
    thinning: 0,
    taperStart: 0,
    taperEnd: 0,
  })

  if (!outerOutline?.length) return

  ctx.save()

  // Glow layer
  ctx.globalAlpha = 0.18
  ctx.fillStyle = "#f6c8aa"
  const outerPath = new Path2D(getSvgPathFromStroke(outerOutline))
  ctx.fill(outerPath)

  // Cut out inner to create ring
  ctx.globalCompositeOperation = "destination-out"
  ctx.globalAlpha = 1
  const innerPath = new Path2D(getSvgPathFromStroke(innerOutline))
  ctx.fill(innerPath)

  ctx.globalCompositeOperation = "source-over"

  // Crisp amber border line
  ctx.globalAlpha = 0.7
  ctx.fillStyle = "#f6c8aa"
  const borderOutline = getStroke(pts, {
    ...getCommittedStrokeOptions(stroke.width + 2),
    thinning: 0,
    taperStart: 0,
    taperEnd: 0,
  })
  if (borderOutline?.length) {
    const borderPath = new Path2D(getSvgPathFromStroke(borderOutline))
    ctx.fill(borderPath)
    ctx.globalCompositeOperation = "destination-out"
    ctx.globalAlpha = 1
    ctx.fill(innerPath)
  }

  ctx.restore()
}
export function drawStroke(ctx, stroke, { clean = false, isActive = false } = {}) {
  if (!stroke?.points?.length) return

  const pts = stroke.points.map((p) => [p.x, p.y, p.pressure ?? 0.5])

  let outline
  if (isActive) {
    // Never cache active stroke — it changes every frame
    outline = getStroke(pts, getActiveStrokeOptions(stroke.points, stroke.width))
  } else {
    // Cache committed stroke outline — only recalculate if missing
    if (!stroke._outline) {
      stroke._outline = getStroke(pts, getCommittedStrokeOptions(stroke.width))
    }
    outline = stroke._outline
  }

  if (!outline?.length) return

  const path = new Path2D(getSvgPathFromStroke(outline))
  ctx.save()
  ctx.globalCompositeOperation =
    stroke.tool === "pixel-eraser" ? "destination-out" : "source-over"
  ctx.fillStyle = clean ? "#050505" : stroke.color || "#e8d8c7"
  ctx.fill(path)
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Draw all strokes for a page onto a given ctx
// Uses a persistent offscreen layer passed in — no allocation per call
// ---------------------------------------------------------------------------
export function drawPageStrokes(ctx, strokes, { clean = false, height, pixelRatio = 1, width }, offscreenLayer) {
  // Use provided offscreen layer if available, otherwise create one (fallback)
  const layer = offscreenLayer || (() => {
    const c = document.createElement("canvas")
    c.width = Math.round(width * pixelRatio)
    c.height = Math.round(height * pixelRatio)
    return c
  })()

  const layerCtx = layer.getContext("2d")
  layerCtx.clearRect(0, 0, layer.width, layer.height)
  layerCtx.save()
  layerCtx.scale(pixelRatio, pixelRatio)
  ;(strokes || []).forEach((stroke) => drawStroke(layerCtx, stroke, { clean }))
  layerCtx.restore()
  ctx.drawImage(layer, 0, 0, width, height)
}

// ---------------------------------------------------------------------------
// Blit a single committed stroke onto an existing canvas ctx
// Used by HandwritingCanvas to incrementally update committed canvas
// ---------------------------------------------------------------------------
export function blitStrokeToContext(ctx, stroke, { clean = false } = {}) {
  drawStroke(ctx, stroke, { clean, isActive: false })
}

// ---------------------------------------------------------------------------
// Draw just the active (in-progress) stroke with adaptive quality
// ---------------------------------------------------------------------------
export function drawActiveStroke(ctx, stroke, renderPoints) {
  if (!stroke || !renderPoints?.length) return
  const activeStroke = { ...stroke, points: renderPoints, _outline: null }
  drawStroke(ctx, activeStroke, { isActive: true })
}

// ---------------------------------------------------------------------------
// Render a page to an offscreen canvas — used for export
// ---------------------------------------------------------------------------
export function renderPageToCanvas({ page, width, height, scale = 1, clean = false }) {
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext("2d")
  ctx.scale(scale, scale)
  ctx.fillStyle = clean ? "#ffffff" : "#191410"
  ctx.fillRect(0, 0, width, height)

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

  drawPageStrokes(ctx, page.strokes || [], { clean, height, pixelRatio: scale, width })
  return canvas
}