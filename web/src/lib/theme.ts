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
  }, [theme])

  // Ohne eigene Wahl dem Gerät folgen, damit Anzeige und Umschalter stimmen
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      try {
        if (localStorage.getItem('termind-theme')) return
      } catch {
        /* privater Modus */
      }
      setTheme(mq.matches ? 'dark' : 'light')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Nur eine bewusste Wahl wird gespeichert; Basis ist das tatsächlich gesetzte Schema
  const toggle = () => {
    const cur = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
    const next: Theme = cur === 'dark' ? 'light' : 'dark'
    try {
      localStorage.setItem('termind-theme', next)
    } catch {
      /* privater Modus */
    }
    document.documentElement.dataset.theme = next
    setTheme(next)
  }

  return { theme, toggle }
}

/** Akzentfarbe der Instanz (Farbton in OKLCH). */
export function setAccentHue(h: number) {
  document.documentElement.style.setProperty('--accent-h', String(h))
}
