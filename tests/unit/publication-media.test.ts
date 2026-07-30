import { describe, expect, it } from 'vitest'
import { isCorporatePublicationCover } from '../../apps/api/src/publications/publications.dto'

describe('política de portadas corporativas', () => {
  it('accepts only same-origin publication media paths with supported raster formats', () => {
    expect(isCorporatePublicationCover('/media/publications/seguridad/boletin-29.webp')).toBe(true)
    expect(isCorporatePublicationCover('/media/publications/2026/portada_01.avif')).toBe(true)
    expect(isCorporatePublicationCover('/media/publications/portada.jpg')).toBe(true)
  })

  it.each([
    'https://cdn.example.test/cover.webp',
    '//cdn.example.test/cover.webp',
    'data:image/png;base64,AAAA',
    '/media/publications/../private.png',
    '/media/publications/script.svg',
    '/media/other/cover.webp',
    '/media/publications/cover.webp?token=secret',
    '',
  ])('rejects non-corporate or unsafe path %s', (path) => {
    expect(isCorporatePublicationCover(path)).toBe(false)
  })
})
