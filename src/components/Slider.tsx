type Props = {
  label: string
  value: number
  onChange: (v: number) => void
  disabled?: boolean
}

export function Slider({ label, value, onChange, disabled }: Props) {
  const pct = Math.round(value * 100)
  return (
    <label className={`slider ${disabled ? 'slider--disabled' : ''}`}>
      <span className="slider__meta">
        <span className="slider__label">{label}</span>
        <span className="slider__value">{pct}</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={pct}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
      />
    </label>
  )
}
