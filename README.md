# FilterCanon

Phone-first, single-user web app that applies a **subject pop-out** photo look (darker cooler background, brighter warmer subjects) — inspired by Canon EOS R6 couple edits. Everything runs in the browser: no server, no API keys.

## Stack

- React + Vite + TypeScript
- [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter) `ImageSegmenter` (selfie model) for person masks
- Canvas 2D grading + mask blend

## Pipeline

1. Pick a photo (`image/*`)
2. Segment person → upscale / feather the mask
3. Grade background (darken, cool teal sky, rich darkened greens, vignette) and subject (brightness, warmth, saturation, clarity)
4. Blend with the mask
5. Edit on a ≤1600px preview; **Export JPG** re-segments and grades full resolution

If segmentation fails, a global grade + soft centre falloff is used instead.

## Develop

```bash
npm install
npm run dev
```

```bash
npm run build
```

## Notes

- First run downloads MediaPipe WASM (jsDelivr) and the selfie segmenter model (Google Cloud Storage).
- Best results with a clearly framed person; couples and single portraits both work with the selfie model.
