import { useCallback, useEffect, useRef, useState } from 'react'
import { Controls } from './components/Controls'
import { Preview } from './components/Preview'
import { downloadBlob, loadImageFromFile } from './lib/image'
import {
  applyFilter,
  exportFullResolution,
  prepareWorkingImage,
} from './lib/pipeline'
import type { PersonMask } from './lib/segmentation'
import { DEFAULT_PARAMS, PREVIEW_MAX, type FilterParams } from './lib/types'
import './App.css'

type Working = {
  fullImage: HTMLImageElement
  previewData: ImageData
  mask: PersonMask
  originalUrl: string
}

export default function App() {
  const [params, setParams] = useState<FilterParams>(DEFAULT_PARAMS)
  const [working, setWorking] = useState<Working | null>(null)
  const [filteredUrl, setFilteredUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [segNote, setSegNote] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const urlRef = useRef<string | null>(null)
  const renderGen = useRef(0)

  const revokeFiltered = () => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
  }

  const renderPreview = useCallback(
    (data: ImageData, mask: PersonMask, p: FilterParams) => {
      const gen = ++renderGen.current
      // Yield so UI stays responsive while grading large previews
      requestAnimationFrame(() => {
        if (gen !== renderGen.current) return
        const { canvas, fromSegmentation } = applyFilter(data, mask, p)
        canvas.toBlob(
          (blob) => {
            if (!blob || gen !== renderGen.current) return
            revokeFiltered()
            const url = URL.createObjectURL(blob)
            urlRef.current = url
            setFilteredUrl(url)
            setSegNote(
              fromSegmentation
                ? null
                : 'Segmentation unavailable — using global grade + centre vignette',
            )
            setBusy(false)
            setStatus(null)
          },
          'image/jpeg',
          0.88,
        )
      })
    },
    [],
  )

  useEffect(() => {
    if (!working) return
    setBusy(true)
    setStatus('Grading…')
    const t = window.setTimeout(() => {
      renderPreview(working.previewData, working.mask, params)
    }, 40)
    return () => window.clearTimeout(t)
  }, [params, working, renderPreview])

  useEffect(() => {
    return () => {
      revokeFiltered()
    }
  }, [])

  const onPick = async (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return
    setBusy(true)
    setStatus('Loading MediaPipe + segmenting…')
    setSegNote(null)
    try {
      if (working?.originalUrl) URL.revokeObjectURL(working.originalUrl)
      const fullImage = await loadImageFromFile(file)
      const { imageData, mask } = await prepareWorkingImage(
        fullImage,
        PREVIEW_MAX,
      )
      const originalCanvas = document.createElement('canvas')
      originalCanvas.width = imageData.width
      originalCanvas.height = imageData.height
      originalCanvas.getContext('2d')!.putImageData(imageData, 0, 0)
      const originalUrl = await new Promise<string>((resolve, reject) => {
        originalCanvas.toBlob(
          (b) =>
            b
              ? resolve(URL.createObjectURL(b))
              : reject(new Error('preview encode failed')),
          'image/jpeg',
          0.9,
        )
      })
      setWorking({
        fullImage,
        previewData: imageData,
        mask,
        originalUrl,
      })
      setParams({ ...DEFAULT_PARAMS })
    } catch (err) {
      console.error(err)
      setStatus('Could not process that photo')
      setBusy(false)
    }
  }

  const onExport = async () => {
    if (!working) return
    setExporting(true)
    setStatus('Exporting full resolution…')
    try {
      const blob = await exportFullResolution(working.fullImage, params)
      const stamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, 19)
      downloadBlob(blob, `filtercanon-${stamp}.jpg`)
      setStatus(null)
    } catch (err) {
      console.error(err)
      setStatus('Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="brand__mark">FilterCanon</span>
          <span className="brand__tag">subject pop-out</span>
        </div>
        <div className="top__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => fileRef.current?.click()}
          >
            {working ? 'Replace' : 'Pick photo'}
          </button>
          <button
            type="button"
            className="btn btn--accent"
            disabled={!working || exporting || busy}
            onClick={onExport}
          >
            {exporting ? 'Exporting…' : 'Export JPG'}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            void onPick(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </header>

      <main className="stage">
        <Preview
          filteredUrl={filteredUrl}
          originalUrl={working?.originalUrl ?? null}
          busy={busy || exporting}
          status={status ?? segNote}
        />
      </main>

      <Controls
        params={params}
        onChange={setParams}
        onReset={() => setParams({ ...DEFAULT_PARAMS })}
        disabled={!working}
      />
    </div>
  )
}
