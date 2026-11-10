import { describe, it, expect } from 'vitest'
import {
  DIA_VENCIMIENTO,
  IMPORTE_MAXIMO,
  TIPOS_CON_REFERENCIA,
  TIPOS_TARIFA,
  accionPrecio,
  calcularCuota,
  estadoSegunComprobantes,
  numeroFactura,
  numeroOrdenPago,
  tarifasPorConcepto,
  validarImporte,
  validarPeriodo,
  vencimientoDelPeriodo,
} from './cuotas.js'

const TARIFAS = {
  cuota: '50000.00',
  comedor: '15000.50',
  deporte: { 1: '8000.00', 2: 7500 },
  transporte: { 3: '12000.25' },
}

describe('validarPeriodo', () => {
  it('acepta un período AAAA-MM', () => {
    expect(validarPeriodo('2026-03')).toBeNull()
    expect(validarPeriodo('2026-12')).toBeNull()
  })

  it('pide el período cuando está vacío', () => {
    expect(validarPeriodo('')).toBe('Ingresá el período.')
    expect(validarPeriodo(undefined)).toBe('Ingresá el período.')
  })

  it('rechaza formatos y meses inválidos', () => {
    const ERROR = 'Período: usá el formato AAAA-MM, por ejemplo 2026-03.'
    expect(validarPeriodo('2026-13')).toBe(ERROR)
    expect(validarPeriodo('2026-00')).toBe(ERROR)
    expect(validarPeriodo('2026-3')).toBe(ERROR)
    expect(validarPeriodo('03-2026')).toBe(ERROR)
  })
})

describe('vencimientoDelPeriodo', () => {
  it('vence el día 10 del período', () => {
    expect(DIA_VENCIMIENTO).toBe(10)
    expect(vencimientoDelPeriodo('2026-03')).toBe('2026-03-10')
  })
})

describe('validarImporte', () => {
  it('acepta enteros, hasta 2 decimales y el cero', () => {
    expect(validarImporte('0')).toBeNull()
    expect(validarImporte(0)).toBeNull()
    expect(validarImporte('15000')).toBeNull()
    expect(validarImporte('15000.5')).toBeNull()
    expect(validarImporte(' 15000.50 ')).toBeNull()
  })

  it('pide el importe cuando está vacío', () => {
    expect(validarImporte('')).toBe('Ingresá el importe.')
    expect(validarImporte(undefined)).toBe('Ingresá el importe.')
    expect(validarImporte(null)).toBe('Ingresá el importe.')
  })

  it('rechaza negativos, más de 2 decimales y texto', () => {
    const ERROR = 'Importe: ingresá un número mayor o igual a 0, con hasta 2 decimales.'
    expect(validarImporte('-1')).toBe(ERROR)
    expect(validarImporte('10.123')).toBe(ERROR)
    expect(validarImporte('diez')).toBe(ERROR)
    expect(validarImporte('1,50')).toBe(ERROR)
  })

  it('rechaza importes que no entran en la base', () => {
    expect(validarImporte(String(IMPORTE_MAXIMO))).toBeNull()
    expect(validarImporte('10000000000')).toBe('Importe: el valor es demasiado grande.')
  })
})

describe('numeroFactura', () => {
  it('arma el número correlativo con 8 dígitos', () => {
    expect(numeroFactura(1)).toBe('F-00000001')
    expect(numeroFactura(1234)).toBe('F-00001234')
  })
})

describe('calcularCuota', () => {
  it('sin servicios: solo la cuota mensual', () => {
    expect(calcularCuota({ tarifas: TARIFAS })).toEqual({
      items: [{ concepto: 'cuota', referencia_id: null, descripcion: 'Cuota mensual', importe: 50000 }],
      total: 50000,
      faltantes: [],
    })
  })

  it('suma cuota, cada deporte, el recorrido y el comedor', () => {
    const { items, total, faltantes } = calcularCuota({
      tarifas: TARIFAS,
      deportes: [{ id: 1, nombre: 'Fútbol' }, { id: 2, nombre: 'Natación' }],
      recorrido: { id: 3, nombre: 'Recorrido 1 - Zona Norte' },
      comedor: true,
    })
    expect(items).toEqual([
      { concepto: 'cuota', referencia_id: null, descripcion: 'Cuota mensual', importe: 50000 },
      { concepto: 'deporte', referencia_id: 1, descripcion: 'Deporte: Fútbol', importe: 8000 },
      { concepto: 'deporte', referencia_id: 2, descripcion: 'Deporte: Natación', importe: 7500 },
      { concepto: 'transporte', referencia_id: 3, descripcion: 'Transporte: Recorrido 1 - Zona Norte', importe: 12000.25 },
      { concepto: 'comedor', referencia_id: null, descripcion: 'Comedor', importe: 15000.5 },
    ])
    expect(total).toBe(92500.75)
    expect(faltantes).toEqual([])
  })

  it('suma en centavos, sin errores de redondeo', () => {
    const { total } = calcularCuota({
      tarifas: { cuota: '0.10', comedor: '0.20', deporte: {}, transporte: {} },
      comedor: true,
    })
    expect(total).toBe(0.3)
  })

  it('una tarifa en 0 cuenta como cargada', () => {
    const { items, total, faltantes } = calcularCuota({ tarifas: { ...TARIFAS, cuota: '0' } })
    expect(items[0].importe).toBe(0)
    expect(total).toBe(0)
    expect(faltantes).toEqual([])
  })

  it('informa los conceptos sin tarifa y no los suma', () => {
    const { items, total, faltantes } = calcularCuota({
      tarifas: { cuota: null, comedor: undefined, deporte: { 1: '8000' }, transporte: {} },
      deportes: [{ id: 1, nombre: 'Fútbol' }, { id: 9, nombre: 'Vóley' }],
      recorrido: { id: 3, nombre: 'Recorrido 1 - Zona Norte' },
      comedor: true,
    })
    expect(faltantes).toEqual([
      'Cuota mensual',
      'Deporte: Vóley',
      'Transporte: Recorrido 1 - Zona Norte',
      'Comedor',
    ])
    expect(items).toEqual([{ concepto: 'deporte', referencia_id: 1, descripcion: 'Deporte: Fútbol', importe: 8000 }])
    expect(total).toBe(8000)
  })

  it('sin tarifas de deporte ni transporte cargadas', () => {
    const { faltantes } = calcularCuota({
      tarifas: { cuota: '1', comedor: '1' },
      deportes: [{ id: 1, nombre: 'Fútbol' }],
      recorrido: { id: 3, nombre: 'Recorrido 1' },
    })
    expect(faltantes).toEqual(['Deporte: Fútbol', 'Transporte: Recorrido 1'])
  })
})

describe('tarifasPorConcepto', () => {
  it('los tipos de tarifa son cuota, deporte, transporte y comedor', () => {
    expect(TIPOS_TARIFA).toEqual(['cuota', 'deporte', 'transporte', 'comedor'])
    expect(TIPOS_CON_REFERENCIA).toEqual(['deporte', 'transporte'])
  })

  it('agrupa las filas por concepto y referencia', () => {
    expect(tarifasPorConcepto([
      { tipo: 'cuota', referencia_id: null, importe: '50000.00' },
      { tipo: 'comedor', referencia_id: null, importe: '15000.00' },
      { tipo: 'deporte', referencia_id: 1, importe: '8000.00' },
      { tipo: 'transporte', referencia_id: 3, importe: '12000.00' },
    ])).toEqual({
      cuota: '50000.00',
      comedor: '15000.00',
      deporte: { 1: '8000.00' },
      transporte: { 3: '12000.00' },
    })
  })

  it('sin filas, no hay ninguna tarifa', () => {
    expect(tarifasPorConcepto([])).toEqual({ cuota: null, comedor: null, deporte: {}, transporte: {} })
  })
})

describe('numeroOrdenPago', () => {
  it('completa con ceros hasta 8 dígitos', () => {
    expect(numeroOrdenPago(1)).toBe('OP-00000001')
    expect(numeroOrdenPago(12345678)).toBe('OP-12345678')
  })
})

describe('estadoSegunComprobantes', () => {
  it('sin comprobantes no recalcula nada', () => {
    expect(estadoSegunComprobantes('1000.00', [])).toBeNull()
  })

  it('si la suma no llega al total, queda en pago parcial', () => {
    expect(estadoSegunComprobantes('1000.00', ['400.00', 599.99])).toEqual({ estadoCuota: 'Pago parcial', itemsPagados: false })
  })

  it('si la suma iguala el total, queda pagada con los ítems pagados', () => {
    expect(estadoSegunComprobantes('1000.00', ['400.00', 600])).toEqual({ estadoCuota: 'Pagada', itemsPagados: true })
  })

  it('si la suma supera el total, también queda pagada', () => {
    expect(estadoSegunComprobantes(1000, ['1500.50'])).toEqual({ estadoCuota: 'Pagada', itemsPagados: true })
  })

  it('suma en centavos, sin errores de redondeo', () => {
    // 0.1 + 0.2 en punto flotante da 0.30000000000000004
    expect(estadoSegunComprobantes('0.30', ['0.10', '0.20'])).toEqual({ estadoCuota: 'Pagada', itemsPagados: true })
  })
})

describe('accionPrecio', () => {
  it('sin precio vigente, lo crea', () => {
    expect(accionPrecio(null, '2026-08-01')).toBe('crear')
  })

  it('con fecha posterior a la del vigente, es un precio nuevo', () => {
    expect(accionPrecio('2026-08-01', '2026-08-02')).toBe('nuevo')
    expect(accionPrecio('2026-08-01', '2027-01-01')).toBe('nuevo')
  })

  it('con la misma fecha o una anterior, corrige el vigente', () => {
    expect(accionPrecio('2026-08-01', '2026-08-01')).toBe('corregir')
    expect(accionPrecio('2026-08-01', '2026-07-31')).toBe('corregir')
  })
})
