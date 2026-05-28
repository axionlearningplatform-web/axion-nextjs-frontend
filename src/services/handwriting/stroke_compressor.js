const DEFAULT_WIDTH = 820
const DEFAULT_HEIGHT = 1060
const PEN_COLOR = "#e8d6c4"
const PEN_WIDTH = 4.4
const ERASER_WIDTH = 48
const RDP_EPSILON = 1.5

const TOOL_TO_FLAG = {
  pen: 0,
  "pixel-eraser": 1,
  "stroke-eraser": 2,
}

const FLAG_TO_TOOL = {
  0: "pen",
  1: "pixel-eraser",
  2: "stroke-eraser",
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function perpendicularDistance(point, start, end) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y)
  }
  return Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x) / Math.hypot(dx, dy)
}

function rdp(points, epsilon = RDP_EPSILON) {
  if (!Array.isArray(points) || points.length < 3) return points || []

  let maxDistance = 0
  let maxIndex = 0
  const end = points.length - 1
  for (let i = 1; i < end; i += 1) {
    const distance = perpendicularDistance(points[i], points[0], points[end])
    if (distance > maxDistance) {
      maxDistance = distance
      maxIndex = i
    }
  }

  if (maxDistance > epsilon) {
    const left = rdp(points.slice(0, maxIndex + 1), epsilon)
    const right = rdp(points.slice(maxIndex), epsilon)
    return [...left.slice(0, -1), ...right]
  }

  return [points[0], points[end]]
}

function bytesToBase64(bytes) {
  let binary = ""
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function compressToBase64(value) {
  if (typeof CompressionStream === "undefined") return null

  const stream = new CompressionStream("deflate")
  const writer = stream.writable.getWriter()
  await writer.write(new TextEncoder().encode(value))
  await writer.close()
  const compressed = await new Response(stream.readable).arrayBuffer()
  return bytesToBase64(new Uint8Array(compressed))
}

async function decompressFromBase64(value) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Compressed stroke data is not supported in this browser.")
  }

  const stream = new DecompressionStream("deflate")
  const writer = stream.writable.getWriter()
  await writer.write(base64ToBytes(value))
  await writer.close()
  return new Response(stream.readable).text()
}

function isLegacyStrokeData(payload) {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      payload.version === 1 &&
      Array.isArray(payload.pages)
  )
}

function compactStroke(stroke) {
  const points = rdp(stroke.points || [])
  const flatPoints = []
  points.forEach((point) => {
    flatPoints.push(
      Math.round(point.x || 0),
      Math.round(point.y || 0),
      clamp(Math.round((point.pressure ?? 0.5) * 255), 0, 255)
    )
  })

  const toolFlag = TOOL_TO_FLAG[stroke.tool] ?? 0
  const defaultWidth = toolFlag === 0 ? PEN_WIDTH : ERASER_WIDTH
  const width = Number(stroke.width)
  if (Number.isFinite(width) && Math.abs(width - defaultWidth) > 0.1) {
    return [toolFlag, flatPoints, Math.round(width * 10) / 10]
  }
  return [toolFlag, flatPoints]
}

function compactStrokeData(strokeData) {
  return {
    v: 2,
    w: Number(strokeData?.width) || DEFAULT_WIDTH,
    h: Number(strokeData?.height) || DEFAULT_HEIGHT,
    pages: (strokeData?.pages || []).map((page) =>
      (page?.strokes || [])
        .filter((stroke) => (stroke?.points || []).length > 0)
        .map(compactStroke)
    ),
  }
}

function expandStroke(compactStrokeValue, strokeIndex) {
  const [toolFlag = 0, flatPoints = [], storedWidth] = compactStrokeValue || []
  const tool = FLAG_TO_TOOL[toolFlag] || "pen"
  const points = []
  for (let i = 0; i < flatPoints.length; i += 3) {
    points.push({
      x: flatPoints[i] || 0,
      y: flatPoints[i + 1] || 0,
      pressure: clamp((flatPoints[i + 2] ?? 128) / 255, 0, 1),
    })
  }

  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `saved-stroke-${strokeIndex}-${Math.random().toString(36).slice(2)}`,
    tool,
    color: tool === "pen" ? PEN_COLOR : "rgba(0,0,0,1)",
    width: Number(storedWidth) || (tool === "pen" ? PEN_WIDTH : ERASER_WIDTH),
    points,
    _outline: null,
  }
}

function expandCompactStrokeData(compact) {
  return {
    version: 1,
    width: Number(compact?.w) || DEFAULT_WIDTH,
    height: Number(compact?.h) || DEFAULT_HEIGHT,
    pages: (compact?.pages || []).map((page, pageIndex) => ({
      page_number: pageIndex + 1,
      strokes: (page || []).map((stroke, strokeIndex) => expandStroke(stroke, strokeIndex)),
    })),
  }
}

export async function compressStrokeData(strokeData) {
  if (!strokeData || typeof strokeData !== "object") return strokeData
  if (strokeData.format && strokeData.data) return strokeData

  const compact = compactStrokeData(strokeData)
  const json = JSON.stringify(compact)
  const compressed = await compressToBase64(json)

  if (compressed) {
    return {
      format: "deflate-b64",
      data: compressed,
    }
  }

  return {
    format: "compact-json",
    data: json,
  }
}

export async function decompressStrokeData(payload) {
  if (!payload || typeof payload !== "object") return payload
  if (isLegacyStrokeData(payload)) return payload

  if (payload.format === "deflate-b64") {
    const json = await decompressFromBase64(payload.data || "")
    return expandCompactStrokeData(JSON.parse(json))
  }

  if (payload.format === "compact-json") {
    return expandCompactStrokeData(JSON.parse(payload.data || "{}"))
  }

  if (payload.v === 2) {
    return expandCompactStrokeData(payload)
  }

  return payload
}
