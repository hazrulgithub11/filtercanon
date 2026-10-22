/** Slider values in 0–1 range. Defaults approximate the Canon R6 reference look. */
export interface FilterParams {
  popStrength: number
  bgDarken: number
  bgCool: number
  skyDepth: number
  greens: number
  subjectBrightness: number
  subjectWarmth: number
  subjectSaturation: number
  clarity: number
  vignette: number
  edgeFeather: number
}

export const DEFAULT_PARAMS: FilterParams = {
  popStrength: 0.78,
  bgDarken: 0.48,
  bgCool: 0.58,
  skyDepth: 0.68,
  greens: 0.55,
  subjectBrightness: 0.32,
  subjectWarmth: 0.42,
  subjectSaturation: 0.38,
  clarity: 0.48,
  vignette: 0.58,
  edgeFeather: 0.42,
}

export const PARAM_META: {
  key: keyof FilterParams
  label: string
}[] = [
  { key: 'popStrength', label: 'Pop strength' },
  { key: 'bgDarken', label: 'Background darken' },
  { key: 'bgCool', label: 'Background cool' },
  { key: 'skyDepth', label: 'Sky depth' },
  { key: 'greens', label: 'Greens' },
  { key: 'subjectBrightness', label: 'Subject brightness' },
  { key: 'subjectWarmth', label: 'Subject warmth' },
  { key: 'subjectSaturation', label: 'Subject saturation' },
  { key: 'clarity', label: 'Clarity' },
  { key: 'vignette', label: 'Vignette' },
  { key: 'edgeFeather', label: 'Edge feather' },
]

export const PREVIEW_MAX = 1600
