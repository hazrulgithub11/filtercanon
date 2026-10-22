import {
  FilesetResolver,
  ImageSegmenter,
  type ImageSegmenterResult,
} from '@mediapipe/tasks-vision'

const WASM_ROOT =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm'

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite'

let segmenterPromise: Promise<ImageSegmenter> | null = null

async function createSegmenter(
  vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  delegate: 'GPU' | 'CPU',
) {
  return ImageSegmenter.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate,
    },
    runningMode: 'IMAGE',
    outputCategoryMask: false,
    outputConfidenceMasks: true,
  })
}

async function getSegmenter(): Promise<ImageSegmenter> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_ROOT)
      try {
        return await createSegmenter(vision, 'GPU')
      } catch {
        return await createSegmenter(vision, 'CPU')
      }
    })().catch((err) => {
      segmenterPromise = null
      throw err
    })
  }
  return segmenterPromise
}

/** Float person mask in [0,1], same dimensions as the source canvas. */
export type PersonMask = {
  data: Float32Array
  width: number
  height: number
  /** False when segmentation failed and a soft centre falloff was used. */
  fromSegmentation: boolean
}

function pickPersonMaskIndex(labels: string[], maskCount: number): number {
  const personIdx = labels.findIndex((l) => /person|human|selfie/i.test(l))
  if (personIdx >= 0 && personIdx < maskCount) return personIdx
  // Official selfie_segmenter often exposes a single person confidence mask at [0]
  // even though category docs list background=0 / person=1.
  if (maskCount === 1) return 0
  const bgIdx = labels.findIndex((l) => /background|bg/i.test(l))
  if (bgIdx === 0 && maskCount > 1) return 1
  return 0
}

function upsampleFloatMask(
  floats: Float32Array,
  mw: number,
  mh: number,
  width: number,
  height: number,
): Float32Array {
  const out = new Float32Array(width * height)
  if (mw === width && mh === height) {
    out.set(floats)
    return out
  }
  for (let y = 0; y < height; y++) {
    const sy = ((y + 0.5) * mh) / height - 0.5
    const y0 = Math.max(0, Math.floor(sy))
    const y1 = Math.min(mh - 1, y0 + 1)
    const fy = sy - y0
    for (let x = 0; x < width; x++) {
      const sx = ((x + 0.5) * mw) / width - 0.5
      const x0 = Math.max(0, Math.floor(sx))
      const x1 = Math.min(mw - 1, x0 + 1)
      const fx = sx - x0
      const v00 = floats[y0 * mw + x0]!
      const v10 = floats[y0 * mw + x1]!
      const v01 = floats[y1 * mw + x0]!
      const v11 = floats[y1 * mw + x1]!
      const v0 = v00 * (1 - fx) + v10 * fx
      const v1 = v01 * (1 - fx) + v11 * fx
      out[y * width + x] = v0 * (1 - fy) + v1 * fy
    }
  }
  return out
}

function extractPersonConfidence(
  result: ImageSegmenterResult,
  width: number,
  height: number,
  labels: string[],
): Float32Array | null {
  const masks = result.confidenceMasks
  if (!masks?.length) return null

  const idx = pickPersonMaskIndex(labels, masks.length)
  const personMask = masks[idx]!
  const floats = personMask.getAsFloat32Array()
  return upsampleFloatMask(
    floats,
    personMask.width,
    personMask.height,
    width,
    height,
  )
}

function centreFalloffMask(width: number, height: number): Float32Array {
  const out = new Float32Array(width * height)
  const cx = (width - 1) / 2
  const cy = (height - 1) / 2
  const maxR = Math.hypot(cx, cy)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = Math.hypot(x - cx, y - cy) / maxR
      // Soft subject-ish blob in the centre for fallback grading.
      out[y * width + x] = Math.max(0, 1 - d * 1.15) ** 1.6
    }
  }
  return out
}

/** Separable box blur on a float mask (in-place-ish via temp buffer). */
export function featherMask(
  mask: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  const r = Math.max(0, Math.round(radius))
  if (r === 0) return mask

  const tmp = new Float32Array(width * height)
  const out = new Float32Array(width * height)
  const span = r * 2 + 1

  // Horizontal
  for (let y = 0; y < height; y++) {
    let sum = 0
    for (let x = -r; x <= r; x++) {
      const xx = Math.min(width - 1, Math.max(0, x))
      sum += mask[y * width + xx]!
    }
    for (let x = 0; x < width; x++) {
      tmp[y * width + x] = sum / span
      const leave = Math.min(width - 1, Math.max(0, x - r))
      const enter = Math.min(width - 1, Math.max(0, x + r + 1))
      sum += mask[y * width + enter]! - mask[y * width + leave]!
    }
  }

  // Vertical
  for (let x = 0; x < width; x++) {
    let sum = 0
    for (let y = -r; y <= r; y++) {
      const yy = Math.min(height - 1, Math.max(0, y))
      sum += tmp[yy * width + x]!
    }
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / span
      const leave = Math.min(height - 1, Math.max(0, y - r))
      const enter = Math.min(height - 1, Math.max(0, y + r + 1))
      sum += tmp[enter * width + x]! - tmp[leave * width + x]!
    }
  }

  return out
}

/**
 * Run person segmentation on a canvas. On failure, returns a soft centre
 * falloff so grading still has a usable “subject” region.
 */
export async function segmentPerson(
  canvas: HTMLCanvasElement,
): Promise<PersonMask> {
  const { width, height } = canvas
  try {
    const segmenter = await getSegmenter()
    const labels = (() => {
      try {
        return segmenter.getLabels()
      } catch {
        return [] as string[]
      }
    })()
    const result = segmenter.segment(canvas)
    let data = extractPersonConfidence(result, width, height, labels)
    result.close()
    if (!data) throw new Error('Empty mask')

    // Sanity: if almost no person detected, treat as failure.
    let sum = 0
    for (let i = 0; i < data.length; i++) sum += data[i]!
    let mean = sum / data.length

    // If we may have picked the background channel, invert when mean is huge
    // and edges look empty (common when [0] is background in 2-mask models).
    if (mean > 0.75) {
      const inverted = new Float32Array(data.length)
      for (let i = 0; i < data.length; i++) inverted[i] = 1 - data[i]!
      let invSum = 0
      for (let i = 0; i < inverted.length; i++) invSum += inverted[i]!
      const invMean = invSum / inverted.length
      if (invMean > 0.02 && invMean < mean) {
        data = inverted
        mean = invMean
      }
    }

    if (mean < 0.02) throw new Error('No person detected')

    return { data, width, height, fromSegmentation: true }
  } catch {
    return {
      data: centreFalloffMask(width, height),
      width,
      height,
      fromSegmentation: false,
    }
  }
}

/** Upscale a mask to a new size with bilinear sampling. */
export function resizeMask(
  mask: PersonMask,
  width: number,
  height: number,
): PersonMask {
  if (mask.width === width && mask.height === height) return mask
  const src = mask.data
  const sw = mask.width
  const sh = mask.height
  const out = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    const sy = ((y + 0.5) * sh) / height - 0.5
    const y0 = Math.max(0, Math.floor(sy))
    const y1 = Math.min(sh - 1, y0 + 1)
    const fy = sy - y0
    for (let x = 0; x < width; x++) {
      const sx = ((x + 0.5) * sw) / width - 0.5
      const x0 = Math.max(0, Math.floor(sx))
      const x1 = Math.min(sw - 1, x0 + 1)
      const fx = sx - x0
      const v00 = src[y0 * sw + x0]!
      const v10 = src[y0 * sw + x1]!
      const v01 = src[y1 * sw + x0]!
      const v11 = src[y1 * sw + x1]!
      out[y * width + x] =
        (v00 * (1 - fx) + v10 * fx) * (1 - fy) +
        (v01 * (1 - fx) + v11 * fx) * fy
    }
  }
  return {
    data: out,
    width,
    height,
    fromSegmentation: mask.fromSegmentation,
  }
}
