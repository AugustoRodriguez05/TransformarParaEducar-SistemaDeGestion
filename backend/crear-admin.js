// Crea un usuario administrador: npm run crear-admin -- <email> <contraseña> [nombre] [apellido]
// Sirve para arrancar con una base vacía (sin datos de ejemplo).
import bcrypt from 'bcryptjs';
import db, { initDb } from './db.js';
import {
  limpiar, primerError, validarEmail, validarNombrePersona, validarPasswordNueva
} from './validaciones.js';

const [emailArg, password, nombreArg = 'Administrador', apellidoArg = 'Sistema'] = process.argv.slice(2);
const email = limpiar(emailArg);
const nombre = limpiar(nombreArg);
const apellido = limpiar(apellidoArg);

async function crearAdmin() {
  if (!email || !password) {
    console.error('Uso: npm run crear-admin -- <email> <contraseña> [nombre] [apellido]');
    process.exitCode = 1;
    return;
  }

  const error = primerError(
    validarEmail(email),
    validarPasswordNueva(password),
    validarNombrePersona(nombre, 'nombre'),
    validarNombrePersona(apellido, 'apellido')
  );
  if (error) {
    console.error(error);
    process.exitCode = 1;
    return;
  }

  await initDb();

  if (await db.get('SELECT id FROM usuarios WHERE email = ?', email)) {
    console.error(`Ya existe un usuario con el email ${email}.`);
    process.exitCode = 1;
    return;
  }

  await db.run(
    'INSERT INTO usuarios (nombre, apellido, email, password, rol) VALUES (?, ?, ?, ?, ?)',
    [nombre, apellido, email, bcrypt.hashSync(password, 8), 'administrador']
  );
  console.log(`Administrador creado: ${email}`);
}

crearAdmin().catch((err) => {
  console.error('Error al crear el administrador', err);
  process.exitCode = 1;
});
