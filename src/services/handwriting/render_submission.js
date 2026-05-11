import { getStroke } from "perfect-freehand"

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

export function drawStroke(ctx, stroke, { clean = false } = {}) {
  if (!stroke?.points?.length) return

  const outline = getStroke(
    stroke.points.map((point) => [point.x, point.y, point.pressure || 0.5]),
    {
      size: stroke.width,
      thinning: 0.55,
      smoothing: 0.58,
      streamline: 0.45,
      simulatePressure: false,
    }
  )

  const path = new Path2D(getSvgPathFromStroke(outline))
  ctx.save()
  ctx.globalCompositeOperation = "source-over"
  ctx.fillStyle = clean ? "#050505" : stroke.color || "#e8d8c7"
  ctx.fill(path)
  ctx.restore()
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

  ;(page.strokes || []).forEach((stroke) => drawStroke(ctx, stroke, { clean }))
  return canvas
}
