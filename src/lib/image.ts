import { PREVIEW_MAX } from './types'

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not load image'))
    }
    img.src = url
  })
}

function sourceSize(source: HTMLImageElement | HTMLCanvasElement): {
  w: number
  h: number
} {
  if (source instanceof HTMLImageElement) {
    return {
      w: source.naturalWidth || source.width,
      h: source.naturalHeight || source.height,
    }
  }
  return { w: source.width, h: source.height }
}

export function imageToCanvas(
  source: HTMLImageElement | HTMLCanvasElement,
  maxEdge = Infinity,
): HTMLCanvasElement {
  const { w: sw, h: sh } = sourceSize(source)
  const scale = Math.min(1, maxEdge / Math.max(sw, sh))
  const w = Math.max(1, Math.round(sw * scale))
  const h = Math.max(1, Math.round(sh * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, w, h)
  return canvas
}

export function toPreviewCanvas(img: HTMLImageElement): HTMLCanvasElement {
  return imageToCanvas(img, PREVIEW_MAX)
}

export function getImageData(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

export function putImageData(data: ImageData): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = data.width
  canvas.height = data.height
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(data, 0, 0)
  return canvas
}

export function cloneImageData(data: ImageData): ImageData {
  return new ImageData(
    new Uint8ClampedArray(data.data),
    data.width,
    data.height,
  )
}

export function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality = 0.92,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('JPEG encode failed'))
      },
      'image/jpeg',
      quality,
    )
  })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
