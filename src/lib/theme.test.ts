import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, currentTheme, inkOn } from './theme'

describe('inkOn', () => {
  it('keeps dark ink on light accents and turns white on dark ones', () => {
    expect(inkOn('#f65a1a')).toBe('#0b0b0c') // ember, the default
    expect(inkOn('#d4a64a')).toBe('#0b0b0c')
    expect(inkOn('#5b3c88')).toBe('#ffffff') // the purple swatch
    expect(inkOn('#23405f')).toBe('#ffffff')
    expect(inkOn('#7d1f1a')).toBe('#ffffff')
  })
})

describe('currentTheme', () => {
  it('moves the old defaults to the Forge ones once, then keeps the gold swatch', () => {
    const old = currentTheme({ ...DEFAULT_THEME, accent: '#b8322a', highlight: '#d4a64a' })
    expect(old.highlight).toBe(DEFAULT_THEME.highlight)
    expect(old.accent).toBe(DEFAULT_THEME.accent)
    expect(currentTheme({ ...old, highlight: '#d4a64a' }).highlight).toBe('#d4a64a')
  })
})
