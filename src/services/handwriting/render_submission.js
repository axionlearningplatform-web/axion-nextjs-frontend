import { getStroke } from "perfect-freehand"

const strokePathCache = new WeakMap()

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

function getStrokePath(stroke) {
  const cached = strokePathCache.get(stroke)
  if (cached && cached.pointCount === stroke.points.length && cached.width === stroke.width) {
    return cached.path
  }

  const outline = getStroke(
  stroke.points.map((point) => [
    point.x,
    point.y,
    point.pressure || 0.5,
  ]),
  {
    size: stroke.width,
    thinning: 0.42,
    smoothing: 0.28,
    streamline: 0.12,
    simulatePressure: false,
  }
)
  const path = new Path2D(getSvgPathFromStroke(outline))
  strokePathCache.set(stroke, {
    path,
    pointCount: stroke.points.length,
    width: stroke.width,
  })
  return path
}

export function drawStroke(ctx, stroke, { clean = false, color = null, tool = null } = {}) {
  if (!stroke?.points?.length) return
  const strokeTool = tool || stroke.tool
  const strokeColor = color || stroke.color || "#e8d8c7"

  if (stroke.points.length === 1) {
    const [point] = stroke.points
    ctx.save()
    ctx.globalCompositeOperation = strokeTool === "pixel-eraser" ? "destination-out" : "source-over"
    ctx.fillStyle = clean ? "#050505" : strokeColor
    ctx.beginPath()
    ctx.arc(point.x, point.y, Math.max((stroke.width || 4) / 2, 1.5), 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    return
  }

  const path = getStrokePath(stroke)
  ctx.save()
  ctx.globalCompositeOperation = strokeTool === "pixel-eraser" ? "destination-out" : "source-over"
  ctx.fillStyle = clean ? "#050505" : strokeColor
  ctx.fill(path)
  ctx.restore()
}

export function drawPageStrokes(ctx, strokes, { clean = false, height, pixelRatio = 1, width }) {
  const layer = document.createElement("canvas")
  layer.width = Math.round(width * pixelRatio)
  layer.height = Math.round(height * pixelRatio)
  const layerCtx = layer.getContext("2d")
  layerCtx.scale(pixelRatio, pixelRatio)
  ;(strokes || []).forEach((stroke) => drawStroke(layerCtx, stroke, { clean }))
  ctx.drawImage(layer, 0, 0, width, height)
}

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
