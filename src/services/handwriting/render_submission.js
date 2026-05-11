export function drawStroke(
  ctx,
  stroke,
  {
    clean = false,
    color = null,
    tool = null,
  } = {}
) {
  if (!stroke?.points?.length) return

  const strokeTool =
    tool || stroke.tool

  const strokeColor =
    color ||
    stroke.color ||
    "#e8d8c7"

  ctx.save()

  ctx.globalCompositeOperation =
    strokeTool === "pixel-eraser"
      ? "destination-out"
      : "source-over"

  ctx.strokeStyle = clean
    ? "#050505"
    : strokeColor

  ctx.lineWidth =
    stroke.width || 4.4

  ctx.lineCap = "round"
  ctx.lineJoin = "round"

  const points =
    stroke.points

  if (points.length === 1) {
    const point = points[0]

    ctx.beginPath()
    ctx.arc(
      point.x,
      point.y,
      ctx.lineWidth / 2,
      0,
      Math.PI * 2
    )
    ctx.fillStyle =
      ctx.strokeStyle
    ctx.fill()

    ctx.restore()
    return
  }

  ctx.beginPath()

  ctx.moveTo(
    points[0].x,
    points[0].y
  )

  for (
    let i = 1;
    i < points.length;
    i++
  ) {
    ctx.lineTo(
      points[i].x,
      points[i].y
    )
  }

  ctx.stroke()
  ctx.restore()
}

export function renderPageToCanvas({
  page,
  width,
  height,
  scale = 1,
  clean = false,
}) {
  const canvas =
    document.createElement(
      "canvas"
    )

  canvas.width =
    Math.round(width * scale)

  canvas.height =
    Math.round(height * scale)

  const ctx =
    canvas.getContext("2d")

  ctx.scale(scale, scale)

  ctx.fillStyle = clean
    ? "#ffffff"
    : "#191410"

  ctx.fillRect(
    0,
    0,
    width,
    height
  )

  ;(
    page.strokes || []
  ).forEach((stroke) =>
    drawStroke(ctx, stroke, {
      clean,
    })
  )

  return canvas
}