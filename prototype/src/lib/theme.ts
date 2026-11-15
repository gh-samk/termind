import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const t = document.documentElement.dataset.theme
    return t === 'dark' || t === 'light' ? t : systemTheme()
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('termind-theme', theme)
    } catch {
      /* privater Modus */
    }
  }, [theme])

  return { theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) }
}

/** Akzentfarbe der Instanz (Farbton in OKLCH). */
export function setAccentHue(h: number) {
  document.documentElement.style.setProperty('--accent-h', String(h))
}
