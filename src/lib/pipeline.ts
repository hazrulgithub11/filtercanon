import { blendWithMask } from './blending'
import {
  gradeBackground,
  gradeFallbackGlobal,
  gradeSubject,
} from './grading'
import {
  canvasToJpegBlob,
  cloneImageData,
  getImageData,
  imageToCanvas,
  putImageData,
} from './image'
import {
  resizeMask,
  segmentPerson,
  type PersonMask,
} from './segmentation'
import type { FilterParams } from './types'

export type ProcessResult = {
  canvas: HTMLCanvasElement
  fromSegmentation: boolean
}

export async function prepareWorkingImage(
  source: HTMLImageElement | HTMLCanvasElement,
  maxEdge: number,
): Promise<{
  canvas: HTMLCanvasElement
  imageData: ImageData
  mask: PersonMask
}> {
  const canvas = imageToCanvas(source, maxEdge)
  const imageData = getImageData(canvas)
  const mask = await segmentPerson(canvas)
  return { canvas, imageData, mask }
}

export function applyFilter(
  imageData: ImageData,
  mask: PersonMask,
  params: FilterParams,
): ProcessResult {
  const sized =
    mask.width === imageData.width && mask.height === imageData.height
      ? mask
      : resizeMask(mask, imageData.width, imageData.height)

  let background: ImageData
  let subject: ImageData

  if (sized.fromSegmentation) {
    background = gradeBackground(imageData, params)
    subject = gradeSubject(imageData, params)
  } else {
    // Fallback: global bg-ish grade + warmer centre via subject grade blend
    background = gradeFallbackGlobal(imageData, params)
    subject = gradeSubject(cloneImageData(imageData), {
      ...params,
      subjectBrightness: params.subjectBrightness * 0.7,
      clarity: params.clarity * 0.5,
    })
  }

  const blended = blendWithMask(subject, background, sized, params)
  return {
    canvas: putImageData(blended),
    fromSegmentation: sized.fromSegmentation,
  }
}

export async function exportFullResolution(
  fullImage: HTMLImageElement,
  params: FilterParams,
): Promise<Blob> {
  const { imageData, mask } = await prepareWorkingImage(fullImage, Infinity)
  const { canvas } = applyFilter(imageData, mask, params)
  return canvasToJpegBlob(canvas, 0.92)
}
