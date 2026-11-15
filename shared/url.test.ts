import { describe, expect, it } from 'vitest'
import { locationSchema } from './schemas'
import { safeHttpUrl } from './url'

describe('safeHttpUrl', () => {
  it('lässt nur http(s) zu', () => {
    expect(safeHttpUrl('https://meet.example/a')).toBe('https://meet.example/a')
    expect(safeHttpUrl('http://x.de')).toBe('http://x.de')
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'ftp://x', 'meet.example', '', 'https://a b', 'https://x"onmouseover=1']) expect(safeHttpUrl(bad), bad).toBeNull()
  })
  it('Video-Orte müssen eine URL sein, Vorlagen mit {id} auch', () => {
    expect(locationSchema.safeParse({ kind: 'video', value: 'javascript:alert(1)' }).success).toBe(false)
    expect(locationSchema.safeParse({ kind: 'video', value: 'http://meet.example/a' }).success).toBe(false)
    expect(locationSchema.safeParse({ kind: 'video-template', value: 'https://meet.jit.si/{id}' }).success).toBe(true)
    expect(locationSchema.safeParse({ kind: 'onsite', value: 'Hauptstr. 1' }).success).toBe(true)
  })
})
