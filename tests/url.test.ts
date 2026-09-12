import { describe, it, expect } from 'vitest';
import { buildCompanionUrl } from '../src/connection/url';

describe('buildCompanionUrl', () => {
  it('correctly constructs URL for local development', () => {
    const urlStr = buildCompanionUrl({
      origin: 'http://localhost:3000',
      pathname: '/',
      session: '7K9M4X',
      token: 'abcd1234efgh5678',
    });

    const url = new URL(urlStr);
    expect(url.origin).toBe('http://localhost:3000');
    expect(url.pathname).toBe('/');
    expect(url.searchParams.get('mode')).toBe('companion');
    expect(url.searchParams.get('session')).toBe('7K9M4X');
    expect(url.searchParams.get('token')).toBe('abcd1234efgh5678');
    expect(url.searchParams.has('signaling')).toBe(false);
  });

  it('correctly preserves GitHub Pages project path under /thequietbetweenstars/', () => {
    const urlStr = buildCompanionUrl({
      origin: 'https://jedix420.github.io',
      pathname: '/thequietbetweenstars/',
      basePath: '/thequietbetweenstars/',
      session: 'STAR42',
      token: 'token999',
    });

    const url = new URL(urlStr);
    expect(url.origin).toBe('https://jedix420.github.io');
    expect(url.pathname).toBe('/thequietbetweenstars/');
    expect(url.searchParams.get('mode')).toBe('companion');
    expect(url.searchParams.get('session')).toBe('STAR42');
    expect(url.searchParams.get('token')).toBe('token999');
  });

  it('strips index.html and avoids duplicate path segments', () => {
    const urlStr = buildCompanionUrl({
      origin: 'https://jedix420.github.io',
      pathname: '/thequietbetweenstars/thequietbetweenstars/index.html',
      basePath: '/thequietbetweenstars/',
      session: 'STAR42',
      token: 'token999',
    });

    const url = new URL(urlStr);
    expect(url.origin).toBe('https://jedix420.github.io');
    expect(url.pathname).toBe('/thequietbetweenstars/');
  });

  it('handles pathname without trailing slash correctly', () => {
    const urlStr = buildCompanionUrl({
      origin: 'https://jedix420.github.io',
      pathname: '/thequietbetweenstars',
      session: 'STAR42',
      token: 'token999',
    });

    const url = new URL(urlStr);
    expect(url.origin).toBe('https://jedix420.github.io');
    expect(url.pathname).toBe('/thequietbetweenstars/');
  });

  it('includes signaling query parameter when provided', () => {
    const urlStr = buildCompanionUrl({
      origin: 'https://jedix420.github.io',
      pathname: '/thequietbetweenstars/',
      session: 'STAR42',
      token: 'token999',
      signalingUrl: 'wss://custom-signaling.example.com/ws',
    });

    const url = new URL(urlStr);
    expect(url.searchParams.get('signaling')).toBe('wss://custom-signaling.example.com/ws');
  });
});
