// Pruebas de extremo a extremo del inicio de sesión.
// Necesitan el sistema corriendo (npm run dev) y las credenciales del administrador
// en cypress.env.json (ver cypress.env.example.json).

describe('Inicio de sesión', () => {
  beforeEach(() => {
    cy.visit('/login')
  })

  it('entra al sistema con el usuario administrador', () => {
    cy.env(['ADMIN_EMAIL', 'ADMIN_PASSWORD'], { log: false }).then(({ ADMIN_EMAIL, ADMIN_PASSWORD }) => {
      cy.get('input[type="email"]').type(ADMIN_EMAIL)
      cy.get('input[type="password"]').type(ADMIN_PASSWORD, { log: false })
    })
    cy.contains('button', 'Ingresar').click()

    cy.location('pathname').should('eq', '/dashboard')
    cy.contains('button', 'Salir').should('be.visible')
    cy.get('nav.nav').within(() => {
      cy.contains('a', 'Alumnos').should('be.visible')
      cy.contains('a', 'Configuración').should('be.visible')
    })
  })

  it('muestra un error y no entra si la contraseña es incorrecta', () => {
    cy.env(['ADMIN_EMAIL'], { log: false }).then(({ ADMIN_EMAIL }) => {
      cy.get('input[type="email"]').type(ADMIN_EMAIL)
    })
    cy.get('input[type="password"]').type('contraseña-incorrecta', { log: false })
    cy.contains('button', 'Ingresar').click()

    cy.get('p.error').should('be.visible').and('have.text', 'Credenciales inválidas')
    cy.location('pathname').should('eq', '/login')
    cy.contains('button', 'Salir').should('not.exist')
  })

  it('no deja ingresar si los campos están vacíos', () => {
    cy.contains('button', 'Ingresar').click()

    // El navegador frena el envío porque los campos son obligatorios.
    cy.get('input[type="email"]').then(($input) => {
      expect($input[0].validity.valueMissing).to.be.true
    })
    cy.get('input[type="password"]').then(($input) => {
      expect($input[0].validity.valueMissing).to.be.true
    })
    cy.location('pathname').should('eq', '/login')
    cy.contains('button', 'Salir').should('not.exist')
  })
})
