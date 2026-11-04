import { describe, expect, it } from 'vitest'
import { inkOn } from './theme'

describe('inkOn', () => {
  it('keeps dark ink on light accents and turns white on dark ones', () => {
    expect(inkOn('#f65a1a')).toBe('#0b0b0c') // ember, the default
    expect(inkOn('#d4a64a')).toBe('#0b0b0c')
    expect(inkOn('#5b3c88')).toBe('#ffffff') // the purple swatch
    expect(inkOn('#23405f')).toBe('#ffffff')
    expect(inkOn('#7d1f1a')).toBe('#ffffff')
  })
})
