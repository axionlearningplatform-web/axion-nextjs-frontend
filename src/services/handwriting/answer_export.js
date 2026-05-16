import { renderPageToOCRCanvas } from "./render_submission"

const OCR_MIN_RENDERED_WIDTH = 1000
const OCR_MAX_RENDERED_SIDE = 1400
const OCR_EXPORT_MIME_TYPE = "image/webp"
const OCR_EXPORT_FALLBACK_MIME_TYPE = "image/png"
const OCR_EXPORT_QUALITY = 0.72

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
        return
      }
      try {
        const dataUrl = canvas.toDataURL(type, quality)
        const [header, encoded] = dataUrl.split(",")
        const mimeMatch = header.match(/data:(.*?);base64/)
        const binary = atob(encoded || "")
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
        resolve(new Blob([bytes], { type: mimeMatch?.[1] || type }))
      } catch (error) {
        reject(error)
      }
    }, type, quality)
  })
}

async function canvasToPreferredOCRBlob(canvas) {
  const blob = await canvasToBlob(canvas, OCR_EXPORT_MIME_TYPE, OCR_EXPORT_QUALITY)
  if (blob.type === OCR_EXPORT_MIME_TYPE) {
    return { blob, mimeType: OCR_EXPORT_MIME_TYPE, compression: "webp-lossy" }
  }

  const fallback = await canvasToBlob(canvas, OCR_EXPORT_FALLBACK_MIME_TYPE)
  return { blob: fallback, mimeType: OCR_EXPORT_FALLBACK_MIME_TYPE, compression: "png-fallback" }
}

function maybeDownloadOCRDebugImage(canvas, pageNumber) {
  if (typeof window === "undefined" || typeof document === "undefined") return
  if (window.localStorage?.getItem("axion:ocr-debug") !== "1") return

  const link = document.createElement("a")
  link.download = `ocr-debug-page-${pageNumber}-${Date.now()}.png`
  link.href = canvas.toDataURL("image/png")
  link.style.display = "none"
  document.body.appendChild(link)
  link.click()
  link.remove()
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
  const exportedPages = []
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index]
    const startedAt = performance.now()
    const { canvas, crop, scale: actualScale } = renderPageToOCRCanvas({
      page,
      width,
      height,
      minRenderedWidth: OCR_MIN_RENDERED_WIDTH,
      maxRenderedSide: OCR_MAX_RENDERED_SIDE,
    })
    maybeDownloadOCRDebugImage(canvas, index + 1)
    const { blob, mimeType, compression } = await canvasToPreferredOCRBlob(canvas)
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
      compression,
      byte_size: blob.size,
      render_ms: renderMs,
    }

    if (typeof console !== "undefined") {
      console.info(
        "OCR export page=%d strokes=%d full=%dx%d cropped=%dx%d rendered=%dx%d scale=%s coverage=%s%% mime=%s bytes=%dkb render=%dms",
        index + 1,
        strokeCount,
        width,
        height,
        crop.width,
        crop.height,
        canvas.width,
        canvas.height,
        actualScale.toFixed(2),
        (coverage * 100).toFixed(1),
        mimeType,
        Math.round(blob.size / 1024),
        renderMs
      )
    }

    exportedPages.push({
      page_number: index + 1,
      blob,
      mime_type: mimeType,
      filename: `handwriting-page-${index + 1}.${mimeType === "image/webp" ? "webp" : "png"}`,
      width: canvas.width,
      height: canvas.height,
      scale: actualScale,
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
