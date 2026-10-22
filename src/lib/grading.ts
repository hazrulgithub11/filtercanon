import type { FilterParams } from './types'

function clamp(v: number, lo = 0, hi = 255): number {
  return v < lo ? lo : v > hi ? hi : v
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function saturateChannel(
  r: number,
  g: number,
  b: number,
  amount: number,
): [number, number, number] {
  const l = luminance(r, g, b)
  return [
    l + (r - l) * amount,
    l + (g - l) * amount,
    l + (b - l) * amount,
  ]
}

/** Soft sky-likeness: bright, blue-dominant, not green foliage. */
function skyWeight(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = luminance(r, g, b) / 255
  const blueDom = (b - Math.max(r, g)) / 255
  const sat = max === 0 ? 0 : (max - min) / max
  const bright = Math.max(0, (l - 0.35) / 0.55)
  const bluish = Math.max(0, blueDom * 2.2 + (b / 255 - 0.4) * 0.8)
  const notGreen = g > b + 15 ? 0 : 1
  return Math.min(1, bright * (0.35 + bluish) * (0.5 + sat * 0.5) * notGreen)
}

/** Green foliage / lawn weight. */
function greenWeight(r: number, g: number, b: number): number {
  const gDom = g - Math.max(r, b)
  if (gDom < 8) return 0
  const l = luminance(r, g, b) / 255
  const mid = 1 - Math.abs(l - 0.4) * 1.4
  return Math.min(1, Math.max(0, (gDom / 80) * mid))
}

export function gradeBackground(
  src: ImageData,
  params: FilterParams,
): ImageData {
  const { data, width, height } = src
  const out = new Uint8ClampedArray(data.length)
  const pop = params.popStrength
  const darken = params.bgDarken * pop
  const cool = params.bgCool * pop
  const sky = params.skyDepth * pop
  const greens = params.greens * pop
  const exposure = 1 - darken * 0.72

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i]!
    let g = data[i + 1]!
    let b = data[i + 2]!

    // Base underexposure + slight desaturation
    r *= exposure
    g *= exposure
    b *= exposure
    ;[r, g, b] = saturateChannel(r, g, b, 1 - darken * 0.28)

    // Cool teal cast
    r -= cool * 18
    g -= cool * 4
    b += cool * 22
    g += cool * 6

    const sw = skyWeight(data[i]!, data[i + 1]!, data[i + 2]!)
    if (sw > 0.01) {
      const k = sw * sky
      // Deep teal-blue sky, recovered (not crushed) highlights
      r -= k * 28
      g -= k * 6
      b += k * 18
      const l = luminance(r, g, b)
      if (l > 160) {
        const recover = ((l - 160) / 95) * k * 0.45
        r *= 1 - recover * 0.35
        g *= 1 - recover * 0.15
        b *= 1 - recover * 0.05
      }
    }

    const gw = greenWeight(data[i]!, data[i + 1]!, data[i + 2]!)
    if (gw > 0.01) {
      const k = gw * greens
      // Rich but darkened, cooler greens
      r *= 1 - k * 0.22
      g *= 1 - k * 0.12
      b *= 1 - k * 0.05
      r -= k * 8
      b += k * 10
      ;[r, g, b] = saturateChannel(r, g, b, 1 + k * 0.15)
    }

    out[i] = clamp(r)
    out[i + 1] = clamp(g)
    out[i + 2] = clamp(b)
    out[i + 3] = data[i + 3]!
  }

  return new ImageData(out, width, height)
}

export function gradeSubject(
  src: ImageData,
  params: FilterParams,
): ImageData {
  const { data, width, height } = src
  const out = new Uint8ClampedArray(data.length)
  const pop = params.popStrength
  const bright = params.subjectBrightness * pop
  const warm = params.subjectWarmth * pop
  const sat = params.subjectSaturation * pop
  const clarity = params.clarity * pop

  // Pass 1: brightness / warmth / saturation
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i]!
    let g = data[i + 1]!
    let b = data[i + 2]!

    const lift = 1 + bright * 0.55
    r = r * lift + bright * 12
    g = g * lift + bright * 8
    b = b * lift + bright * 2

    r += warm * 22
    g += warm * 10
    b -= warm * 16

    ;[r, g, b] = saturateChannel(r, g, b, 1 + sat * 0.85)

    out[i] = clamp(r)
    out[i + 1] = clamp(g)
    out[i + 2] = clamp(b)
    out[i + 3] = data[i + 3]!
  }

  // Pass 2: local contrast / clarity (unsharp via 3×3 box blur)
  if (clarity > 0.02) {
    const blurred = boxBlur3(out, width, height)
    const amount = clarity * 1.35
    for (let i = 0; i < out.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const v = out[i + c]! + (out[i + c]! - blurred[i + c]!) * amount
        out[i + c] = clamp(v)
      }
    }
  }

  return new ImageData(out, width, height)
}

function boxBlur3(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const tmp = new Float32Array(data.length)
  const out = new Float32Array(data.length)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0,
        g = 0,
        b = 0,
        n = 0
      for (let dx = -1; dx <= 1; dx++) {
        const xx = Math.min(width - 1, Math.max(0, x + dx))
        const i = (y * width + xx) * 4
        r += data[i]!
        g += data[i + 1]!
        b += data[i + 2]!
        n++
      }
      const o = (y * width + x) * 4
      tmp[o] = r / n
      tmp[o + 1] = g / n
      tmp[o + 2] = b / n
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0,
        g = 0,
        b = 0,
        n = 0
      for (let dy = -1; dy <= 1; dy++) {
        const yy = Math.min(height - 1, Math.max(0, y + dy))
        const i = (yy * width + x) * 4
        r += tmp[i]!
        g += tmp[i + 1]!
        b += tmp[i + 2]!
        n++
      }
      const o = (y * width + x) * 4
      out[o] = r / n
      out[o + 1] = g / n
      out[o + 2] = b / n
    }
  }

  const result = new Uint8ClampedArray(data.length)
  for (let i = 0; i < data.length; i += 4) {
    result[i] = out[i]!
    result[i + 1] = out[i + 1]!
    result[i + 2] = out[i + 2]!
    result[i + 3] = data[i + 3]!
  }
  return result
}

/**
 * Global grade used when segmentation fails: mild dual look + no person mask
 * (caller still blends with centre falloff).
 */
export function gradeFallbackGlobal(
  src: ImageData,
  params: FilterParams,
): ImageData {
  // Bias toward background look with a touch of subject warmth in the centre
  // handled by the centre mask in the blender.
  return gradeBackground(src, {
    ...params,
    bgDarken: params.bgDarken * 0.75,
    popStrength: params.popStrength * 0.85,
  })
}
