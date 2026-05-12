// stroke_serializer.js
//
// Lightweight stroke utilities. The performance-critical functions
// (createPoint, shouldAddPoint, chaikinSmooth, splitStrokeByEraser)
// have been inlined directly into HandwritingCanvas to keep the hot
// path in one file and avoid import overhead on every pointer event.
//
// This module is kept for any external consumers (e.g. export pipeline,
// server-side replay) that need these utilities independently.

export function createStroke({ tool, color, width, points }) {
  return {
    id: crypto.randomUUID(),
    tool,
    color,
    width,
    points,
    _outline: null,
  }
}

export function createPoint(event, canvas) {
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

export function shouldAddPoint(newPoint, lastPoint, velocityRef) {
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

export function chaikinSmooth(points, iterations = 2) {
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

export function splitStrokeByEraser(stroke, eraserPoints, eraserRadius) {
  if (!eraserPoints?.length || stroke.tool === "pixel-eraser") return null
  const points = stroke.points || []
  if (points.length < 2) return null

  const erased = points.map((p) => {
    for (let i = 0; i < eraserPoints.length; i++) {
      const ep = eraserPoints[i]
      if (Math.hypot(p.x - ep.x, p.y - ep.y) <= eraserRadius) return true
      if (i > 0) {
        if (distanceToSegment(p, eraserPoints[i - 1], eraserPoints[i]) <= eraserRadius)
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

  if (segments.length === 0) return []
  if (segments.length === 1 && segments[0].length === points.length) return null

  return segments.map((pts) => ({
    ...stroke,
    id: crypto.randomUUID(),
    points: pts,
    _outline: null,
  }))
}

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