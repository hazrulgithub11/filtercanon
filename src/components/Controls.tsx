import { PARAM_META, type FilterParams } from '../lib/types'
import { Slider } from './Slider'

type Props = {
  params: FilterParams
  onChange: (next: FilterParams) => void
  onReset: () => void
  disabled?: boolean
}

export function Controls({ params, onChange, onReset, disabled }: Props) {
  return (
    <section className="controls" aria-label="Filter controls">
      <div className="controls__head">
        <h2>Grade</h2>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onReset}
          disabled={disabled}
        >
          Reset
        </button>
      </div>
      <div className="controls__list">
        {PARAM_META.map(({ key, label }) => (
          <Slider
            key={key}
            label={label}
            value={params[key]}
            onChange={(v) => onChange({ ...params, [key]: v })}
            disabled={disabled}
          />
        ))}
      </div>
    </section>
  )
}
