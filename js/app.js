/**
 * app.js — Lógica de la pantalla de login (index.html).
 * Si no existe ningún usuario todavía, muestra el formulario de
 * "crear cuenta de dueña" en lugar del login normal.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const formLogin = document.getElementById('form-login');
  const formSetup = document.getElementById('form-setup');
  const errorLogin = document.getElementById('error-login');
  const errorSetup = document.getElementById('error-setup');
  const tituloApp = document.getElementById('titulo-app');
  const subtituloApp = document.getElementById('subtitulo-app');

  // Si ya hay una sesión activa, entra directo.
  if (Auth.obtenerSesion()) {
    window.location.href = 'pages/inicio.html';
    return;
  }

  const hayUsuarios = await Auth.existeAlgunUsuario();

  if (hayUsuarios) {
    formLogin.classList.remove('oculto');
    formSetup.classList.add('oculto');
  } else {
    formLogin.classList.add('oculto');
    formSetup.classList.remove('oculto');
    tituloApp.textContent = 'Bienvenida';
    subtituloApp.textContent = 'Crea la cuenta principal para empezar';
  }

  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    ocultarError(errorLogin);

    const usuario = document.getElementById('login-usuario').value.trim();
    const password = document.getElementById('login-password').value;

    try {
      await Auth.login(usuario, password);
      window.location.href = 'pages/inicio.html';
    } catch (err) {
      mostrarError(errorLogin, err.message);
    }
  });

  formSetup.addEventListener('submit', async (e) => {
    e.preventDefault();
    ocultarError(errorSetup);

    const nombre = document.getElementById('setup-nombre').value.trim();
    const usuario = document.getElementById('setup-usuario').value.trim();
    const password = document.getElementById('setup-password').value;
    const passwordConfirma = document.getElementById('setup-password-confirma').value;

    if (password.length < 4) {
      mostrarError(errorSetup, 'La contraseña debe tener al menos 4 caracteres.');
      return;
    }

    if (password !== passwordConfirma) {
      mostrarError(errorSetup, 'Las contraseñas no coinciden.');
      return;
    }

    const botonSetup = formSetup.querySelector('button[type="submit"]');
    if (botonSetup && botonSetup.disabled) return;
    if (botonSetup) botonSetup.disabled = true;

    try {
      await Auth.crearUsuario({ nombre, usuario, password, rol: 'administrador' });
      await Auth.login(usuario, password);
      window.location.href = 'pages/inicio.html';
    } catch (err) {
      mostrarError(errorSetup, err.message);
      if (botonSetup) botonSetup.disabled = false;
    }
  });

  function mostrarError(elemento, mensaje) {
    elemento.textContent = mensaje;
    elemento.classList.add('visible');
  }

  function ocultarError(elemento) {
    elemento.textContent = '';
    elemento.classList.remove('visible');
  }
});
