import { describe, it, expect } from 'vitest'
import {
  DIA_AVISO_DEUDA,
  ahoraEnArgentina,
  esDiaDeDeuda,
  esFinDeSemana,
  esUltimoDiaHabil,
  hoyEnArgentina,
  periodoDeFecha,
  ultimoDiaHabil,
} from './envios.js'

describe('hoyEnArgentina / ahoraEnArgentina', () => {
  it('usa la hora de la Argentina (UTC-3), no la del servidor', () => {
    // 1 de diciembre a las 02:00 UTC es todavía 30 de noviembre a las 23:00 en la Argentina.
    const instante = new Date('2026-12-01T02:00:00Z')
    expect(hoyEnArgentina(instante)).toBe('2026-11-30')
    expect(ahoraEnArgentina(instante)).toBe('2026-11-30 23:00:00')
  })
})

describe('periodoDeFecha', () => {
  it('devuelve AAAA-MM', () => {
    expect(periodoDeFecha('2026-03-15')).toBe('2026-03')
  })
})

describe('esFinDeSemana', () => {
  it('detecta sábados y domingos', () => {
    expect(esFinDeSemana('2026-11-07')).toBe(true) // sábado
    expect(esFinDeSemana('2026-11-08')).toBe(true) // domingo
    expect(esFinDeSemana('2026-11-09')).toBe(false) // lunes
    expect(esFinDeSemana('2026-11-13')).toBe(false) // viernes
  })
})

describe('ultimoDiaHabil', () => {
  it('es el último día del mes si cae en un día de semana', () => {
    expect(ultimoDiaHabil('2026-03')).toBe('2026-03-31') // martes
  })

  it('saltea el fin de semana', () => {
    expect(ultimoDiaHabil('2026-05')).toBe('2026-05-29') // el 30 es sábado y el 31 domingo
    expect(ultimoDiaHabil('2026-01')).toBe('2026-01-30') // el 31 es sábado
  })

  it('saltea los feriados', () => {
    expect(ultimoDiaHabil('2026-03', ['2026-03-31'])).toBe('2026-03-30')
    expect(ultimoDiaHabil('2026-05', ['2026-05-29', '2026-05-28'])).toBe('2026-05-27')
  })

  it('respeta febrero en años bisiestos y no bisiestos', () => {
    expect(ultimoDiaHabil('2028-02')).toBe('2028-02-29') // martes, año bisiesto
    expect(ultimoDiaHabil('2027-02')).toBe('2027-02-26') // el 28 es domingo
  })

  it('ignora feriados de otros meses', () => {
    expect(ultimoDiaHabil('2026-03', ['2026-04-30'])).toBe('2026-03-31')
  })
})

describe('esUltimoDiaHabil', () => {
  it('es verdadero solo el último día hábil', () => {
    expect(esUltimoDiaHabil('2026-05-29')).toBe(true)
    expect(esUltimoDiaHabil('2026-05-31')).toBe(false)
    expect(esUltimoDiaHabil('2026-05-28')).toBe(false)
  })

  it('tiene en cuenta los feriados', () => {
    expect(esUltimoDiaHabil('2026-03-31', ['2026-03-31'])).toBe(false)
    expect(esUltimoDiaHabil('2026-03-30', ['2026-03-31'])).toBe(true)
  })
})

describe('esDiaDeDeuda', () => {
  it('es verdadero solo el día 20', () => {
    expect(DIA_AVISO_DEUDA).toBe(20)
    expect(esDiaDeDeuda('2026-11-20')).toBe(true)
    expect(esDiaDeDeuda('2026-11-21')).toBe(false)
    expect(esDiaDeDeuda('2026-12-02')).toBe(false)
  })
})
