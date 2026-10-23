export function RatingPicker({ value, onChange }: { value?: number; onChange: (rating: number) => void }) {
  return (
    <div class="rating-picker" role="radiogroup">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          role="radio"
          aria-checked={value === n}
          class={value === n ? 'active' : value !== undefined && n < value ? 'below' : ''}
          onClick={() => onChange(n)}
        >
          {n}
        </button>
      ))}
    </div>
  )
}
