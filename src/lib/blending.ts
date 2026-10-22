import type { FilterParams } from './types'
import { featherMask, type PersonMask } from './segmentation'

function clamp(v: number, lo = 0, hi = 255): number {
  return v < lo ? lo : v > hi ? hi : v
}

/**
 * Blend subject-graded and background-graded images with a feathered person
 * mask, then apply a soft vignette (stronger on background).
 */
export function blendWithMask(
  subject: ImageData,
  background: ImageData,
  mask: PersonMask,
  params: FilterParams,
): ImageData {
  const { width, height } = subject
  const featherPx = params.edgeFeather * Math.min(width, height) * 0.045
  const soft = featherMask(mask.data, width, height, featherPx)

  const out = new Uint8ClampedArray(subject.data.length)
  const sd = subject.data
  const bd = background.data
  const vig = params.vignette * params.popStrength
  const cx = (width - 1) / 2
  const cy = (height - 1) / 2
  const maxR = Math.hypot(cx, cy)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const m = Math.min(1, Math.max(0, soft[y * width + x]!))
      const inv = 1 - m

      let r = sd[i]! * m + bd[i]! * inv
      let g = sd[i + 1]! * m + bd[i + 1]! * inv
      let b = sd[i + 2]! * m + bd[i + 2]! * inv

      if (vig > 0.01) {
        const d = Math.hypot(x - cx, y - cy) / maxR
        // Soft power curve; stronger off-subject
        const edge = Math.max(0, d - 0.25) / 0.75
        const amount = edge * edge * vig * (0.45 + inv * 0.7)
        const factor = 1 - amount * 0.85
        r *= factor
        g *= factor
        b *= factor
      }

      out[i] = clamp(r)
      out[i + 1] = clamp(g)
      out[i + 2] = clamp(b)
      out[i + 3] = 255
    }
  }

  return new ImageData(out, width, height)
}
