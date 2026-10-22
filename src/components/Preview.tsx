import { useRef, useState } from 'react'

type Props = {
  filteredUrl: string | null
  originalUrl: string | null
  busy?: boolean
  status?: string | null
}

export function Preview({ filteredUrl, originalUrl, busy, status }: Props) {
  const [holding, setHolding] = useState(false)
  const holdTimer = useRef<number | null>(null)

  const startHold = () => {
    if (holdTimer.current) window.clearTimeout(holdTimer.current)
    holdTimer.current = window.setTimeout(() => setHolding(true), 80)
  }

  const endHold = () => {
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
    setHolding(false)
  }

  const showOriginal = holding && originalUrl
  const display = showOriginal ? originalUrl : filteredUrl

  return (
    <div
      className={`preview ${busy ? 'preview--busy' : ''}`}
      onPointerDown={startHold}
      onPointerUp={endHold}
      onPointerLeave={endHold}
      onPointerCancel={endHold}
      onContextMenu={(e) => e.preventDefault()}
    >
      {display ? (
        <img
          src={display}
          alt={showOriginal ? 'Original photo' : 'Filtered preview'}
          draggable={false}
        />
      ) : (
        <div className="preview__empty">
          <p>Pick a photo to pop the subject.</p>
        </div>
      )}
      {status && <p className="preview__status">{status}</p>}
      {filteredUrl && (
        <p className="preview__hint">
          {showOriginal ? 'Original' : 'Hold to compare'}
        </p>
      )}
    </div>
  )
}
