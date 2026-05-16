import { renderPageToOCRCanvas } from "./render_submission"

const OCR_EXPORT_SCALE = 0.6
const OCR_EXPORT_MIME_TYPE = "image/png"

function canvasToBlob(canvas, type) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
        return
      }
      try {
        const dataUrl = canvas.toDataURL(type)
        const [header, encoded] = dataUrl.split(",")
        const mimeMatch = header.match(/data:(.*?);base64/)
        const binary = atob(encoded || "")
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
        resolve(new Blob([bytes], { type: mimeMatch?.[1] || type }))
      } catch (error) {
        reject(error)
      }
    }, type)
  })
}

function serialiseStroke(stroke) {
  return {
    id: stroke.id,
    tool: stroke.tool,
    color: stroke.color,
    width: stroke.width,
    points: (stroke.points || []).map((point) => ({
      x: point.x,
      y: point.y,
      pressure: point.pressure,
      timestamp: point.timestamp,
    })),
  }
}

export async function exportHandwrittenAnswer({ questionId, pages, width, height }) {
  const scale = OCR_EXPORT_SCALE
  const mimeType = OCR_EXPORT_MIME_TYPE

  const exportedPages = []
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index]
    const startedAt = performance.now()
    const { canvas, crop } = renderPageToOCRCanvas({ page, width, height, scale })
    const blob = await canvasToBlob(canvas, mimeType)
    const renderMs = Math.round(performance.now() - startedAt)
    const strokeCount = (page.strokes || []).length
    const coverage = crop.coverage || 0
    const diagnostics = {
      full_width: width,
      full_height: height,
      crop_x: crop.x,
      crop_y: crop.y,
      crop_width: crop.width,
      crop_height: crop.height,
      crop_ratio: Number(coverage.toFixed(4)),
      stroke_count: strokeCount,
      point_count: crop.point_count || 0,
      empty: Boolean(crop.empty),
      mime_type: mimeType,
      byte_size: blob.size,
      render_ms: renderMs,
    }

    if (typeof console !== "undefined") {
      console.info(
        "OCR export page=%d strokes=%d full=%dx%d cropped=%dx%d coverage=%s%% bytes=%dkb render=%dms",
        index + 1,
        strokeCount,
        width,
        height,
        crop.width,
        crop.height,
        (coverage * 100).toFixed(1),
        Math.round(blob.size / 1024),
        renderMs
      )
    }

    exportedPages.push({
      page_number: index + 1,
      blob,
      mime_type: mimeType,
      filename: `handwriting-page-${index + 1}.png`,
      width: canvas.width,
      height: canvas.height,
      scale,
      byte_size: blob.size,
      render_ms: renderMs,
      crop,
      diagnostics,
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  return {
    question_id: questionId,
    pages: exportedPages,
    stroke_data: {
      version: 1,
      width,
      height,
      pages: pages.map((page, index) => ({
        page_number: index + 1,
        strokes: (page.strokes || []).map(serialiseStroke),
      })),
    },
  }
}
