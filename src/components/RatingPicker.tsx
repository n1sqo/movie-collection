export function RatingPicker({ value, onChange }: { value?: number; onChange: (rating: number | undefined) => void }) {
  return (
    <div class="rating-picker" role="radiogroup">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          role="radio"
          aria-checked={value === n}
          class={value === n ? 'active' : value !== undefined && n < value ? 'below' : ''}
          // Tapping the current rating again clears it.
          onClick={() => onChange(value === n ? undefined : n)}
        >
          {n}
        </button>
      ))}
    </div>
  )
}
