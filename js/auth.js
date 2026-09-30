/**
 * auth.js — Hash de contraseñas, login/logout y sesión activa.
 * Todo corre localmente en el navegador; no hay validación contra servidor.
 *
 * Nota: el hash usa una implementación de SHA-256 en JS puro (ver sha256.js)
 * en vez de `crypto.subtle.digest`. La app se instala típicamente accediendo
 * por la IP local (http://192.168.x.x) para poder abrirla desde Safari en el
 * iPad, y `crypto.subtle` solo existe en "contextos seguros" (https o
 * localhost) — en ese http normal queda `undefined` y rompería el login.
 * `crypto.getRandomValues` sí funciona siempre, por eso se sigue usando.
 */

const SESSION_KEY = 'ventpro_sesion';
// Se usa localStorage (no sessionStorage): en un "Add to Home Screen" de iOS,
// el sistema puede cerrar el proceso de la app en segundo plano para ahorrar
// memoria, y sessionStorage se pierde con eso — obligando a iniciar sesión
// de nuevo a los pocos minutos. localStorage sobrevive a eso.

function generarSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password, salt) {
  return sha256Hex(salt + password);
}

async function crearHashConSalt(password) {
  const salt = generarSalt();
  const hash = await hashPassword(password, salt);
  return { salt, hash };
}

async function verificarPassword(password, salt, hashGuardado) {
  const hash = await hashPassword(password, salt);
  return hash === hashGuardado;
}

const Auth = {
  async crearUsuario({ nombre, usuario, password, rol }) {
    const usuarioExistente = await DB.obtenerUnoPorIndice(
      DB.STORES.USUARIOS,
      'usuario',
      usuario
    );
    if (usuarioExistente) {
      throw new Error('Ese nombre de usuario ya existe.');
    }

    const { salt, hash } = await crearHashConSalt(password);

    const nuevoUsuario = {
      nombre,
      usuario,
      passwordSalt: salt,
      passwordHash: hash,
      rol: rol || 'cajero',
      activo: true,
      creadoEn: Date.now(),
    };

    const id = await DB.agregar(DB.STORES.USUARIOS, nuevoUsuario);
    return { id, ...nuevoUsuario };
  },

  async actualizarUsuario(id, cambios) {
    const usuarioActual = await DB.obtenerPorId(DB.STORES.USUARIOS, id);
    if (!usuarioActual) throw new Error('Usuario no encontrado.');

    if (cambios.password) {
      const { salt, hash } = await crearHashConSalt(cambios.password);
      usuarioActual.passwordSalt = salt;
      usuarioActual.passwordHash = hash;
      delete cambios.password;
    }

    Object.assign(usuarioActual, cambios);
    await DB.actualizar(DB.STORES.USUARIOS, usuarioActual);
    return usuarioActual;
  },

  async eliminarUsuario(id) {
    return DB.eliminar(DB.STORES.USUARIOS, id);
  },

  async listarUsuarios() {
    return DB.obtenerTodos(DB.STORES.USUARIOS);
  },

  async existeAlgunUsuario() {
    const total = await DB.contar(DB.STORES.USUARIOS);
    return total > 0;
  },

  async login(usuario, password) {
    const usuarioEncontrado = await DB.obtenerUnoPorIndice(
      DB.STORES.USUARIOS,
      'usuario',
      usuario
    );

    if (!usuarioEncontrado || !usuarioEncontrado.activo) {
      throw new Error('Usuario o contraseña incorrectos.');
    }

    const esValido = await verificarPassword(
      password,
      usuarioEncontrado.passwordSalt,
      usuarioEncontrado.passwordHash
    );

    if (!esValido) {
      throw new Error('Usuario o contraseña incorrectos.');
    }

    const sesion = {
      id: usuarioEncontrado.id,
      nombre: usuarioEncontrado.nombre,
      usuario: usuarioEncontrado.usuario,
      rol: usuarioEncontrado.rol,
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(sesion));
    return sesion;
  },

  logout() {
    localStorage.removeItem(SESSION_KEY);
  },

  obtenerSesion() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (err) {
      // Si el valor guardado llegara a corromperse, esto se llama al
      // inicio de CADA página de la app — sin este try/catch, un solo
      // valor inválido rompería la app entera en todas las pantallas en
      // vez de simplemente pedir iniciar sesión de nuevo.
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
  },

  requerirSesion(redirectA = 'index.html') {
    const sesion = this.obtenerSesion();
    if (!sesion) {
      window.location.href = redirectA;
      return null;
    }
    return sesion;
  },

  // 'dueña' se acepta como alias histórico de 'administrador' (cuentas
  // creadas antes de que existieran roles separados).
  esAdministrador(sesion) {
    return !!sesion && (sesion.rol === 'administrador' || sesion.rol === 'dueña');
  },

  // Igual que requerirSesion, pero además exige rol administrador.
  // rutaSinPermiso es a dónde mandar a un cajero que intente entrar.
  requerirAdmin(redirectA = 'index.html', rutaSinPermiso = 'inicio.html') {
    const sesion = this.requerirSesion(redirectA);
    if (!sesion) return null;
    if (!this.esAdministrador(sesion)) {
      window.location.href = rutaSinPermiso;
      return null;
    }
    return sesion;
  },
};

window.Auth = Auth;
