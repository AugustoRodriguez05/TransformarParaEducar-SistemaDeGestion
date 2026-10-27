import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  MAX_DOMICILIO,
  MAX_ESPECIALIDAD,
  MAX_NOMBRE_CATALOGO,
  MIN_PASSWORD,
  NIVELES,
  limpiar,
  soloErrores,
  validarNombrePersona,
  validarDni,
  validarEmail,
  validarPasswordNueva,
  esFechaValida,
  validarFechaNacimiento,
  validarFecha,
  validarRangoHorario,
  validarNombreCatalogo,
  validarTelefono,
  validarDomicilio,
  validarEspecialidad,
  validarNivel,
} from './validaciones.js'

describe('limpiar', () => {
  it('devuelve texto vacío si el valor es undefined o null', () => {
    expect(limpiar(undefined)).toBe('')
    expect(limpiar(null)).toBe('')
  })

  it('quita los espacios del principio y del final', () => {
    expect(limpiar('  Juan Pérez  ')).toBe('Juan Pérez')
  })

  it('convierte números a texto', () => {
    expect(limpiar(12345678)).toBe('12345678')
  })
})

describe('soloErrores', () => {
  it('deja solo los campos que tienen error', () => {
    expect(soloErrores({ nombre: null, dni: 'Ingresá el DNI.', email: null }))
      .toEqual({ dni: 'Ingresá el DNI.' })
  })

  it('devuelve un objeto vacío si no hay errores', () => {
    expect(soloErrores({ nombre: null, dni: null })).toEqual({})
  })
})

describe('validarNombrePersona', () => {
  it('acepta nombres válidos', () => {
    expect(validarNombrePersona('Ana', 'nombre')).toBeNull()
    expect(validarNombrePersona('María José', 'nombre')).toBeNull()
    expect(validarNombrePersona('Peña', 'apellido')).toBeNull()
    expect(validarNombrePersona("O'Connor", 'apellido')).toBeNull()
  })

  it('pide el campo cuando está vacío, nombrando el campo', () => {
    expect(validarNombrePersona('', 'nombre')).toBe('Ingresá el nombre.')
    expect(validarNombrePersona(undefined, 'apellido')).toBe('Ingresá el apellido.')
  })

  it('rechaza números y símbolos', () => {
    expect(validarNombrePersona('Ana1', 'nombre')).toBe('Usá solo letras.')
    expect(validarNombrePersona('Juan-Carlos', 'nombre')).toBe('Usá solo letras.')
    expect(validarNombrePersona('Ana@', 'nombre')).toBe('Usá solo letras.')
  })

  it('rechaza un nombre que empieza con espacio', () => {
    expect(validarNombrePersona(' Ana', 'nombre')).toBe('Usá solo letras.')
  })

  it('rechaza un nombre de una sola letra (límite inferior)', () => {
    expect(validarNombrePersona('A', 'nombre')).toBe('Tiene que tener entre 2 y 50 letras.')
  })

  it('acepta exactamente 2 y 50 letras (límites)', () => {
    expect(validarNombrePersona('Al', 'nombre')).toBeNull()
    expect(validarNombrePersona('a'.repeat(50), 'nombre')).toBeNull()
  })

  it('rechaza más de 50 letras (límite superior)', () => {
    expect(validarNombrePersona('a'.repeat(51), 'nombre')).toBe('Tiene que tener entre 2 y 50 letras.')
  })
})

describe('validarDni', () => {
  it('acepta DNI de 7 y de 8 números', () => {
    expect(validarDni('1234567')).toBeNull()
    expect(validarDni('12345678')).toBeNull()
  })

  it('pide el DNI cuando está vacío', () => {
    expect(validarDni('')).toBe('Ingresá el DNI.')
    expect(validarDni(undefined)).toBe('Ingresá el DNI.')
  })

  it('rechaza un DNI demasiado corto (6 números)', () => {
    expect(validarDni('123456')).toBe('Ingresá 7 u 8 números, sin puntos.')
  })

  it('rechaza un DNI demasiado largo (9 números)', () => {
    expect(validarDni('123456789')).toBe('Ingresá 7 u 8 números, sin puntos.')
  })

  it('rechaza un DNI con letras', () => {
    expect(validarDni('1234567A')).toBe('Ingresá 7 u 8 números, sin puntos.')
    expect(validarDni('abcdefgh')).toBe('Ingresá 7 u 8 números, sin puntos.')
  })

  it('rechaza un DNI con puntos o espacios', () => {
    expect(validarDni('12.345.678')).toBe('Ingresá 7 u 8 números, sin puntos.')
    expect(validarDni('12 345 678')).toBe('Ingresá 7 u 8 números, sin puntos.')
  })
})

describe('validarEmail', () => {
  const ERROR_EMAIL = 'Ingresá un email válido, por ejemplo nombre@correo.com.'

  it('acepta emails válidos', () => {
    expect(validarEmail('nombre@correo.com')).toBeNull()
    expect(validarEmail('juan.perez@escuela.edu.ar')).toBeNull()
  })

  it('pide el email cuando está vacío', () => {
    expect(validarEmail('')).toBe('Ingresá el email.')
    expect(validarEmail(undefined)).toBe('Ingresá el email.')
  })

  it('rechaza un email sin @', () => {
    expect(validarEmail('nombrecorreo.com')).toBe(ERROR_EMAIL)
  })

  it('rechaza un email sin dominio o sin punto en el dominio', () => {
    expect(validarEmail('nombre@')).toBe(ERROR_EMAIL)
    expect(validarEmail('nombre@correo')).toBe(ERROR_EMAIL)
    expect(validarEmail('@correo.com')).toBe(ERROR_EMAIL)
  })

  it('rechaza un email con espacios', () => {
    expect(validarEmail('nom bre@correo.com')).toBe(ERROR_EMAIL)
  })

  it('acepta un email de 100 caracteres y rechaza uno de 101 (límite)', () => {
    const dominio = '@correo.com'
    expect(validarEmail('a'.repeat(100 - dominio.length) + dominio)).toBeNull()
    expect(validarEmail('a'.repeat(101 - dominio.length) + dominio)).toBe(ERROR_EMAIL)
  })
})

describe('validarPasswordNueva', () => {
  it('acepta una contraseña con el mínimo de caracteres o más', () => {
    expect(validarPasswordNueva('a'.repeat(MIN_PASSWORD))).toBeNull()
    expect(validarPasswordNueva('unaClaveLarga123')).toBeNull()
  })

  it('pide la contraseña cuando está vacía, es null o solo tiene espacios', () => {
    expect(validarPasswordNueva('')).toBe('Ingresá la contraseña.')
    expect(validarPasswordNueva(null)).toBe('Ingresá la contraseña.')
    expect(validarPasswordNueva(undefined)).toBe('Ingresá la contraseña.')
    expect(validarPasswordNueva('       ')).toBe('Ingresá la contraseña.')
  })

  it('rechaza una contraseña con un caracter menos que el mínimo (límite)', () => {
    expect(validarPasswordNueva('a'.repeat(MIN_PASSWORD - 1)))
      .toBe(`Usá al menos ${MIN_PASSWORD} caracteres.`)
  })
})

describe('esFechaValida', () => {
  it('acepta fechas reales en formato AAAA-MM-DD', () => {
    expect(esFechaValida('2026-03-15')).toBe(true)
    expect(esFechaValida('2026-12-31')).toBe(true)
  })

  it('acepta el 29 de febrero solo en años bisiestos', () => {
    expect(esFechaValida('2024-02-29')).toBe(true)
    expect(esFechaValida('2025-02-29')).toBe(false)
  })

  it('rechaza días que no existen en el calendario', () => {
    expect(esFechaValida('2026-02-31')).toBe(false)
    expect(esFechaValida('2026-04-31')).toBe(false)
    expect(esFechaValida('2026-13-01')).toBe(false)
    expect(esFechaValida('2026-00-10')).toBe(false)
  })

  it('rechaza otros formatos', () => {
    expect(esFechaValida('15/03/2026')).toBe(false)
    expect(esFechaValida('2026/03/15')).toBe(false)
    expect(esFechaValida('2026-3-5')).toBe(false)
  })

  it('rechaza valores vacíos', () => {
    expect(esFechaValida('')).toBe(false)
    expect(esFechaValida(undefined)).toBe(false)
    expect(esFechaValida(null)).toBe(false)
  })
})

describe('validarFechaNacimiento', () => {
  // Fijamos "hoy" en el 15/06/2026 para que las pruebas no dependan del día en que se corren.
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('acepta una fecha de nacimiento válida en el pasado', () => {
    expect(validarFechaNacimiento('2015-08-20')).toBeNull()
  })

  it('pide la fecha cuando está vacía', () => {
    expect(validarFechaNacimiento('')).toBe('Ingresá la fecha de nacimiento.')
  })

  it('rechaza una fecha que no existe', () => {
    expect(validarFechaNacimiento('2015-02-30')).toBe('Ingresá una fecha válida.')
  })

  it('acepta la fecha de hoy y rechaza la de mañana (límite)', () => {
    expect(validarFechaNacimiento('2026-06-15')).toBeNull()
    expect(validarFechaNacimiento('2026-06-16')).toBe('La fecha no puede ser posterior a hoy.')
  })

  it('acepta el 01/01/1900 y rechaza el día anterior (límite)', () => {
    expect(validarFechaNacimiento('1900-01-01')).toBeNull()
    expect(validarFechaNacimiento('1899-12-31')).toBe('La fecha no puede ser anterior a 1900.')
  })
})

describe('validarFecha', () => {
  it('acepta una fecha válida', () => {
    expect(validarFecha('2026-10-26')).toBeNull()
  })

  it('pide la fecha cuando está vacía', () => {
    expect(validarFecha('')).toBe('Ingresá la fecha.')
  })

  it('rechaza una fecha inexistente o mal escrita', () => {
    expect(validarFecha('2026-02-31')).toBe('Ingresá una fecha válida.')
    expect(validarFecha('26/10/2026')).toBe('Ingresá una fecha válida.')
  })
})

describe('validarRangoHorario', () => {
  it('acepta un rango donde el fin es posterior al inicio', () => {
    expect(validarRangoHorario('08:00', '09:30')).toBeNull()
  })

  it('acepta el rango más amplio del día (límites)', () => {
    expect(validarRangoHorario('00:00', '23:59')).toBeNull()
  })

  it('pide las dos horas cuando falta alguna', () => {
    expect(validarRangoHorario('', '09:00')).toBe('Ingresá la hora de inicio y la de fin.')
    expect(validarRangoHorario('08:00', undefined)).toBe('Ingresá la hora de inicio y la de fin.')
  })

  it('rechaza horas con formato inválido', () => {
    expect(validarRangoHorario('8:00', '09:00')).toBe('Ingresá la hora de inicio y la de fin.')
    expect(validarRangoHorario('08:00', '24:00')).toBe('Ingresá la hora de inicio y la de fin.')
    expect(validarRangoHorario('08:60', '09:00')).toBe('Ingresá la hora de inicio y la de fin.')
  })

  it('rechaza que la hora de fin sea igual a la de inicio', () => {
    expect(validarRangoHorario('10:00', '10:00'))
      .toBe('La hora de fin tiene que ser posterior a la de inicio.')
  })

  it('rechaza que la hora de fin sea anterior a la de inicio', () => {
    expect(validarRangoHorario('14:00', '13:59'))
      .toBe('La hora de fin tiene que ser posterior a la de inicio.')
  })
})

describe('validarNombreCatalogo', () => {
  it('acepta nombres con letras, números y símbolos', () => {
    expect(validarNombreCatalogo('1° A')).toBeNull()
    expect(validarNombreCatalogo('Matemática')).toBeNull()
  })

  it('pide el nombre cuando está vacío', () => {
    expect(validarNombreCatalogo('')).toBe('Ingresá el nombre.')
  })

  it('acepta el máximo de caracteres y rechaza uno más (límite)', () => {
    expect(validarNombreCatalogo('a'.repeat(MAX_NOMBRE_CATALOGO))).toBeNull()
    expect(validarNombreCatalogo('a'.repeat(MAX_NOMBRE_CATALOGO + 1)))
      .toBe(`Usá como máximo ${MAX_NOMBRE_CATALOGO} caracteres.`)
  })
})

describe('validarTelefono', () => {
  const ERROR_TELEFONO = 'Ingresá entre 7 y 15 números, sin espacios ni guiones (puede empezar con +).'

  it('acepta un teléfono con solo números', () => {
    expect(validarTelefono('1145678901')).toBeNull()
  })

  it('acepta un teléfono que empieza con +', () => {
    expect(validarTelefono('+5491145678901')).toBeNull()
  })

  it('acepta el campo vacío porque es opcional', () => {
    expect(validarTelefono('')).toBeNull()
    expect(validarTelefono(undefined)).toBeNull()
  })

  it('acepta 7 y 15 números (límites)', () => {
    expect(validarTelefono('1234567')).toBeNull()
    expect(validarTelefono('1'.repeat(15))).toBeNull()
    expect(validarTelefono('+' + '1'.repeat(15))).toBeNull()
  })

  it('rechaza 6 números (demasiado corto)', () => {
    expect(validarTelefono('123456')).toBe(ERROR_TELEFONO)
    expect(validarTelefono('+123456')).toBe(ERROR_TELEFONO)
  })

  it('rechaza 16 números (demasiado largo)', () => {
    expect(validarTelefono('1'.repeat(16))).toBe(ERROR_TELEFONO)
  })

  it('rechaza letras, espacios, guiones y paréntesis', () => {
    expect(validarTelefono('11456789AB')).toBe(ERROR_TELEFONO)
    expect(validarTelefono('11 4567 8901')).toBe(ERROR_TELEFONO)
    expect(validarTelefono('11-4567-8901')).toBe(ERROR_TELEFONO)
    expect(validarTelefono('(011)45678901')).toBe(ERROR_TELEFONO)
  })

  it('rechaza el + en otra posición o repetido', () => {
    expect(validarTelefono('11456+78901')).toBe(ERROR_TELEFONO)
    expect(validarTelefono('++541145678901')).toBe(ERROR_TELEFONO)
    expect(validarTelefono('+')).toBe(ERROR_TELEFONO)
  })
})

describe('validarDomicilio', () => {
  it('acepta un domicilio con letras, números y símbolos', () => {
    expect(validarDomicilio('Av. San Martín 1234, 2° B')).toBeNull()
  })

  it('acepta el campo vacío porque es opcional', () => {
    expect(validarDomicilio('')).toBeNull()
  })

  it('acepta el máximo de caracteres y rechaza uno más (límite)', () => {
    expect(validarDomicilio('a'.repeat(MAX_DOMICILIO))).toBeNull()
    expect(validarDomicilio('a'.repeat(MAX_DOMICILIO + 1)))
      .toBe(`Usá como máximo ${MAX_DOMICILIO} caracteres.`)
  })
})

describe('validarEspecialidad', () => {
  it('acepta una especialidad', () => {
    expect(validarEspecialidad('Educación Física')).toBeNull()
  })

  it('acepta el campo vacío porque es opcional', () => {
    expect(validarEspecialidad('')).toBeNull()
  })

  it('acepta el máximo de caracteres y rechaza uno más (límite)', () => {
    expect(validarEspecialidad('a'.repeat(MAX_ESPECIALIDAD))).toBeNull()
    expect(validarEspecialidad('a'.repeat(MAX_ESPECIALIDAD + 1)))
      .toBe(`Usá como máximo ${MAX_ESPECIALIDAD} caracteres.`)
  })
})

describe('validarNivel', () => {
  const ERROR_NIVEL = 'Elegí Inicial, Primario o Secundario.'

  it('los niveles posibles son Inicial, Primario y Secundario', () => {
    expect(NIVELES).toEqual(['Inicial', 'Primario', 'Secundario'])
  })

  it('acepta cada uno de los tres niveles', () => {
    expect(validarNivel('Inicial')).toBeNull()
    expect(validarNivel('Primario')).toBeNull()
    expect(validarNivel('Secundario')).toBeNull()
  })

  it('pide el nivel cuando está vacío', () => {
    expect(validarNivel('')).toBe('Seleccioná el nivel.')
    expect(validarNivel(undefined)).toBe('Seleccioná el nivel.')
  })

  it('rechaza un nivel que no está en la lista', () => {
    expect(validarNivel('Terciario')).toBe(ERROR_NIVEL)
  })

  it('rechaza el nivel escrito con otras mayúsculas o con espacios', () => {
    expect(validarNivel('primario')).toBe(ERROR_NIVEL)
    expect(validarNivel(' Primario')).toBe(ERROR_NIVEL)
  })
})
