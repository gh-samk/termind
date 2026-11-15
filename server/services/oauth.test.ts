import { describe, expect, it } from 'vitest'
import { _test } from './oauth'

const { validRedirect, redirectMatches } = _test

describe('OAuth redirect_uri', () => {
  it('erlaubt https, Loopback und App-Schemes', () => {
    expect(validRedirect('https://app.example.com/api/mcp/auth_callback')).toBe(true)
    expect(validRedirect('http://localhost:6274/oauth/callback')).toBe(true)
    expect(validRedirect('http://127.0.0.1:33418/cb')).toBe(true)
    expect(validRedirect('cursor://anysphere.cursor-retrieval/oauth/callback')).toBe(true)
  })
  it('lehnt gefährliche Adressen ab', () => {
    for (const u of ['http://evil.example/cb', 'javascript:alert(1)', 'data:text/html,x', 'https://app.example.com/cb#frag', 'https://user:pw@app.example.com/cb', 'file:///etc/passwd', 'nicht-mal-eine-url']) {
      expect(validRedirect(u), u).toBe(false)
    }
  })
  it('vergleicht exakt, bei Loopback ohne Port', () => {
    const reg = ['https://app.example.com/api/mcp/auth_callback', 'http://localhost:1234/cb']
    expect(redirectMatches(reg, 'https://app.example.com/api/mcp/auth_callback')).toBe(true)
    expect(redirectMatches(reg, 'https://app.example.com/api/mcp/auth_callback/x')).toBe(false)
    expect(redirectMatches(reg, 'https://app.example.com.evil.example/api/mcp/auth_callback')).toBe(false)
    expect(redirectMatches(reg, 'http://localhost:9999/cb')).toBe(true)
    expect(redirectMatches(reg, 'http://localhost:9999/anders')).toBe(false)
  })
})
