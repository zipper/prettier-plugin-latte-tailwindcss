import { describe, expect, it } from 'vitest'
import { parseArrayClass, serializeArrayClass } from '../src/array-class'

describe('parseArrayClass', () => {
  it('bare identifiers', () => {
    // TODO: implementovat po Fázi 7
    expect(parseArrayClass('btn, flex')).toEqual([])
  })
})
