// stroke_serializer.js — improved with pressure normalization, point thinning, velocity tracking
 
export function createStroke({ tool, color, width, points }) {
  return {
    id: crypto.randomUUID(),
    tool,
    color,
    width,
    points,
    _outline: null, // cached perfect-freehand outline, invalidated on commit
  }
}
 
export function createPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect()
 
  // CRITICAL: points must be in LOGICAL (CSS) pixel space, NOT physical pixel space.
  // The canvas ctx is already scaled by canvasScale via setTransform — so we must
  // NOT multiply by devicePixelRatio here. Raw CSS coords relative to the element.
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
 
  // Apple Pencil gives real pressure; mouse/touch needs simulation flag
  const isStylus = event.pointerType === "pen"
  let pressure
 
  if (isStylus) {
    pressure = Math.min(Math.max(event.pressure ?? 0.5, 0.08), 1.0)
  } else if (event.pressure > 0) {
    pressure = event.pressure
  } else {
    pressure = undefined
  }
 
  return {
    x,
    y,
    pressure,
    timestamp: Date.now(),
  }
}
 
// Minimum distance between points based on writing speed
// Prevents perfect-freehand from processing hundreds of near-identical points
export function shouldAddPoint(newPoint, lastPoint, velocityRef) {
  if (!lastPoint) return true
 
  const dx = newPoint.x - lastPoint.x
  const dy = newPoint.y - lastPoint.y
  const dist = Math.hypot(dx, dy)
 
  // Update velocity estimate
  if (velocityRef && newPoint.timestamp && lastPoint.timestamp) {
    const dt = Math.max(newPoint.timestamp - lastPoint.timestamp, 1)
    velocityRef.current = dist / dt
  }
 
  const vel = velocityRef?.current ?? 0
  // At high speed: only add point every 3px. At low speed: every 1.2px
  const minDist = vel > 1.2 ? 3.0 : 1.2
  return dist >= minDist
}
 
// Chaikin smoothing — applied once on stroke commit for clean final shape
export function chaikinSmooth(points, iterations = 2) {
  if (points.length < 3) return points
  let pts = points
  for (let i = 0; i < iterations; i++) {
    const smoothed = [pts[0]] // keep first point
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
    smoothed.push(pts[pts.length - 1]) // keep last point
    pts = smoothed
  }
  return pts
}
 
// ---------------------------------------------------------------------------
// Pixel eraser stroke splitting
// When a pixel-eraser stroke passes through an existing pen stroke, it can
// bisect it into two independent strokes. This keeps stroke-eraser smart —
// the two resulting segments are treated as separate strokes.
//
// Strategy: walk the stroke's points and find contiguous runs that are
// NOT covered by the eraser path. Each run becomes a new stroke.
// ---------------------------------------------------------------------------
export function splitStrokeByEraser(stroke, eraserPoints, eraserRadius) {
  if (!eraserPoints?.length || stroke.tool === "pixel-eraser") return null
 
  const points = stroke.points || []
  if (points.length < 2) return null
 
  // Mark each point as erased or not
  const erased = points.map((p) => {
    for (let i = 0; i < eraserPoints.length; i++) {
      const ep = eraserPoints[i]
      if (Math.hypot(p.x - ep.x, p.y - ep.y) <= eraserRadius) return true
      if (i > 0) {
        if (distanceToSegment(p, eraserPoints[i - 1], eraserPoints[i]) <= eraserRadius) return true
      }
    }
    return false
  })
 
  // Collect contiguous non-erased runs
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
 
  // If nothing was erased or only one segment remains identical, no split needed
  if (segments.length === 0) return [] // fully erased
  if (segments.length === 1 && segments[0].length === points.length) return null // unchanged
 
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
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y)
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy))
}

