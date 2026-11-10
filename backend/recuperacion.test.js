import { describe, it, expect } from 'vitest'
import {
  MAX_INTENTOS_CODIGO,
  MINUTOS_VIGENCIA_CODIGO,
  validarCodigoRecuperacion,
  vencimientoCodigo,
} from './recuperacion.js'

const AHORA = new Date('2026-11-09T12:00:00Z')
const VIGENTE = { codigo: '012345', vence: '2026-11-09T12:10:00.000Z', usado: 0 }

describe('vencimientoCodigo', () => {
  it('vence 15 minutos después', () => {
    expect(MINUTOS_VIGENCIA_CODIGO).toBe(15)
    expect(vencimientoCodigo(AHORA)).toBe('2026-11-09T12:15:00.000Z')
  })
})

describe('validarCodigoRecuperacion', () => {
  it('acepta el código correcto, vigente y sin usar', () => {
    expect(validarCodigoRecuperacion({ ingresado: '012345', registro: VIGENTE, ahora: AHORA })).toEqual({ valido: true })
  })

  it('acepta el código con espacios alrededor', () => {
    expect(validarCodigoRecuperacion({ ingresado: ' 012345 ', registro: VIGENTE, ahora: AHORA }).valido).toBe(true)
  })

  it('rechaza sin código pendiente, sin contar intento', () => {
    expect(validarCodigoRecuperacion({ ingresado: '012345', registro: null, ahora: AHORA }))
      .toEqual({ valido: false, contarIntento: false, agotado: false })
  })

  it('rechaza un código ya usado', () => {
    const r = validarCodigoRecuperacion({ ingresado: '012345', registro: { ...VIGENTE, usado: 1 }, ahora: AHORA })
    expect(r.valido).toBe(false)
    expect(r.contarIntento).toBe(false)
  })

  it('rechaza un código vencido, también justo en el momento del vencimiento', () => {
    const vencido = { ...VIGENTE, vence: '2026-11-09T11:59:59.000Z' }
    expect(validarCodigoRecuperacion({ ingresado: '012345', registro: vencido, ahora: AHORA }).valido).toBe(false)
    const justo = { ...VIGENTE, vence: AHORA.toISOString() }
    expect(validarCodigoRecuperacion({ ingresado: '012345', registro: justo, ahora: AHORA }).valido).toBe(false)
  })

  it('un código equivocado cuenta como intento fallido', () => {
    expect(validarCodigoRecuperacion({ ingresado: '999999', registro: VIGENTE, intentos: 0, ahora: AHORA }))
      .toEqual({ valido: false, contarIntento: true, agotado: false })
  })

  it('formatos inválidos también cuentan como intento', () => {
    for (const ingresado of ['', '12345', '1234567', 'abcdef', null, undefined]) {
      const r = validarCodigoRecuperacion({ ingresado, registro: VIGENTE, ahora: AHORA })
      expect(r).toEqual({ valido: false, contarIntento: true, agotado: false })
    }
  })

  it('el quinto intento fallido agota el código', () => {
    expect(MAX_INTENTOS_CODIGO).toBe(5)
    expect(validarCodigoRecuperacion({ ingresado: '999999', registro: VIGENTE, intentos: 4, ahora: AHORA }))
      .toEqual({ valido: false, contarIntento: true, agotado: true })
  })

  it('con los intentos agotados rechaza aunque el código sea correcto', () => {
    expect(validarCodigoRecuperacion({ ingresado: '012345', registro: VIGENTE, intentos: 5, ahora: AHORA }))
      .toEqual({ valido: false, contarIntento: false, agotado: true })
  })
})
