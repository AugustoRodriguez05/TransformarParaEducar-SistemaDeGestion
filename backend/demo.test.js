import { describe, it, expect } from 'vitest'
import { IMPORTES_DEMO, PERIODOS_DEMO, accionDemo, importeDemo, pagoDemo } from './demo.js'

describe('PERIODOS_DEMO', () => {
  it('va de agosto a noviembre de 2026', () => {
    expect(PERIODOS_DEMO).toEqual(['2026-08', '2026-09', '2026-10', '2026-11'])
  })
})

describe('importeDemo', () => {
  it('usa el importe del precio actual si el concepto tiene', () => {
    expect(importeDemo('cuota', '50000.00')).toBe(50000)
    expect(importeDemo('deporte', 0)).toBe(0)
  })

  it('sin precio, usa el importe de ejemplo de cada concepto', () => {
    expect(importeDemo('cuota', null)).toBe(42000)
    expect(importeDemo('comedor', undefined)).toBe(18000)
    expect(importeDemo('deporte', null)).toBe(6500)
    expect(importeDemo('transporte', null)).toBe(7000)
    expect(IMPORTES_DEMO).toEqual({ cuota: 42000, comedor: 18000, deporte: 6500, transporte: 7000 })
  })
})

describe('pagoDemo', () => {
  it('agosto y septiembre: comprobante por el total el día 8, cuota pagada', () => {
    expect(pagoDemo('2026-08', '55500.00')).toEqual({
      pago: { importe: 55500, fecha: '2026-08-08' }, estadoCuota: 'Pagada', itemsPagados: true,
    })
    expect(pagoDemo('2026-09', 61000).pago).toEqual({ importe: 61000, fecha: '2026-09-08' })
  })

  it('octubre: comprobante por la mitad, pago parcial', () => {
    expect(pagoDemo('2026-10', '55500.00')).toEqual({
      pago: { importe: 27750, fecha: '2026-10-08' }, estadoCuota: 'Pago parcial', itemsPagados: false,
    })
  })

  it('la mitad se redondea a centavos', () => {
    expect(pagoDemo('2026-10', '100.01').pago.importe).toBe(50.01)
  })

  it('noviembre: sin comprobante, queda pendiente', () => {
    expect(pagoDemo('2026-11', '55500.00')).toEqual({ pago: null, estadoCuota: 'Pendiente', itemsPagados: false })
  })

  it('una cuota en 0 no lleva comprobante', () => {
    expect(pagoDemo('2026-08', 0).pago).toBeNull()
  })
})

describe('accionDemo', () => {
  it('sin cuotas carga todo', () => {
    expect(accionDemo({ hayCuotas: false, hayComprobantes: false })).toBe('todo')
  })

  it('con cuotas y sin comprobantes carga solo los pagos', () => {
    expect(accionDemo({ hayCuotas: true, hayComprobantes: false })).toBe('pagos')
  })

  it('con algún comprobante no hace nada', () => {
    expect(accionDemo({ hayCuotas: true, hayComprobantes: true })).toBeNull()
  })
})
