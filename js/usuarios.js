/**
 * usuarios.js — CRUD de usuarios del sistema (pages/usuarios.html).
 */

document.addEventListener('DOMContentLoaded', async () => {
  const sesion = Auth.requerirAdmin('../index.html', 'inicio.html');
  if (!sesion) return;

  document.getElementById('nombre-usuario-activo').textContent = sesion.nombre;
  document.getElementById('boton-salir').addEventListener('click', () => {
    Auth.logout();
    window.location.href = '../index.html';
  });

  const listaEl = document.getElementById('lista-usuarios');
  const estadoVacioEl = document.getElementById('estado-vacio');
  const fondoModal = document.getElementById('fondo-modal');
  const formUsuario = document.getElementById('form-usuario');
  const tituloModal = document.getElementById('titulo-modal');
  const errorUsuario = document.getElementById('error-usuario');
  const notaPassword = document.getElementById('nota-password');
  const campoActivoWrap = document.getElementById('campo-activo');

  const campoId = document.getElementById('usuario-id');
  const campoNombre = document.getElementById('usuario-nombre');
  const campoLogin = document.getElementById('usuario-login');
  const campoRol = document.getElementById('usuario-rol');
  const campoPassword = document.getElementById('usuario-password');
  const campoPasswordConfirmar = document.getElementById('usuario-password-confirmar');
  const campoActivo = document.getElementById('usuario-activo');

  // ---------- Datos del negocio (teléfono del recibo) ----------
  const campoTelefonoNegocio = document.getElementById('negocio-telefono');
  const botonGuardarNegocio = document.getElementById('boton-guardar-negocio');
  const errorNegocio = document.getElementById('error-negocio');
  const exitoNegocio = document.getElementById('exito-negocio');

  try {
    const ajustes = await DB.obtenerPorId(DB.STORES.AJUSTES, 1);
    campoTelefonoNegocio.value = ajustes && ajustes.telefonoNegocio ? ajustes.telefonoNegocio : '';
  } catch (err) {
    campoTelefonoNegocio.value = '';
  }

  botonGuardarNegocio.addEventListener('click', async () => {
    if (botonGuardarNegocio.disabled) return;
    botonGuardarNegocio.disabled = true;
    errorNegocio.classList.remove('visible');
    exitoNegocio.classList.add('oculto');
    try {
      await DB.actualizar(DB.STORES.AJUSTES, {
        id: 1,
        telefonoNegocio: campoTelefonoNegocio.value.trim(),
      });
      exitoNegocio.classList.remove('oculto');
    } catch (err) {
      errorNegocio.textContent = 'No se pudo guardar el teléfono.';
      errorNegocio.classList.add('visible');
    } finally {
      botonGuardarNegocio.disabled = false;
    }
  });

  document.getElementById('boton-nuevo-usuario').addEventListener('click', () => {
    abrirModal();
  });

  document.getElementById('boton-cancelar-modal').addEventListener('click', () => {
    cerrarModal();
  });

  document.getElementById('boton-cerrar-modal-x').addEventListener('click', () => {
    cerrarModal();
  });

  fondoModal.addEventListener('click', (e) => {
    if (e.target === fondoModal) cerrarModal();
  });

  formUsuario.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorUsuario.classList.remove('visible');

    const nombre = campoNombre.value.trim();
    const usuario = campoLogin.value.trim();
    const rol = campoRol.value;
    const password = campoPassword.value;
    const passwordConfirmar = campoPasswordConfirmar.value;

    if (!nombre) {
      mostrarErrorUsuario('El nombre es obligatorio.');
      return;
    }

    if (!usuario) {
      mostrarErrorUsuario('El usuario (login) es obligatorio.');
      return;
    }

    const idExistente = campoId.value ? Number(campoId.value) : null;

    // En creación la contraseña es obligatoria; en edición es opcional (vacía = no cambiar).
    const cambiandoPassword = password.length > 0 || passwordConfirmar.length > 0;

    if (!idExistente || cambiandoPassword) {
      if (!idExistente && !password) {
        mostrarErrorUsuario('La contraseña es obligatoria.');
        return;
      }
      if (cambiandoPassword && password.length < 4) {
        mostrarErrorUsuario('La contraseña debe tener al menos 4 caracteres.');
        return;
      }
      if (password !== passwordConfirmar) {
        mostrarErrorUsuario('Las contraseñas no coinciden.');
        return;
      }
    }

    const botonGuardar = formUsuario.querySelector('button[type="submit"]');
    if (botonGuardar.disabled) return;
    botonGuardar.disabled = true;

    try {
      if (idExistente) {
        const cambios = { nombre, usuario, rol, activo: campoActivo.checked };
        if (cambiandoPassword) cambios.password = password;
        await Auth.actualizarUsuario(idExistente, cambios);
      } else {
        await Auth.crearUsuario({ nombre, usuario, password, rol });
      }

      cerrarModal();
      await cargarUsuarios();
    } catch (err) {
      mostrarErrorUsuario(err.message || 'No se pudo guardar el usuario.');
    } finally {
      botonGuardar.disabled = false;
    }
  });

  function mostrarErrorUsuario(mensaje) {
    errorUsuario.textContent = mensaje;
    errorUsuario.classList.add('visible');
  }

  function abrirModal(usuario = null) {
    formUsuario.reset();
    errorUsuario.classList.remove('visible');

    if (usuario) {
      tituloModal.textContent = 'Editar usuario';
      campoId.value = usuario.id;
      campoNombre.value = usuario.nombre;
      campoLogin.value = usuario.usuario;
      campoRol.value = usuario.rol || 'cajero';
      campoPassword.value = '';
      campoPasswordConfirmar.value = '';
      campoActivo.checked = usuario.activo !== false;

      notaPassword.classList.remove('oculto');
      campoActivoWrap.classList.remove('oculto');
    } else {
      tituloModal.textContent = 'Nuevo usuario';
      campoId.value = '';
      campoRol.value = 'cajero';
      campoActivo.checked = true;

      notaPassword.classList.add('oculto');
      campoActivoWrap.classList.add('oculto');
    }

    fondoModal.classList.remove('oculto');
    campoNombre.focus();
  }

  function cerrarModal() {
    fondoModal.classList.add('oculto');
  }

  async function eliminarUsuario(id, nombre) {
    const sesionActual = Auth.obtenerSesion();

    if (sesionActual && sesionActual.id === id) {
      alert('No puedes eliminar tu propia cuenta mientras tienes la sesión iniciada.');
      return;
    }

    const usuarios = await Auth.listarUsuarios();
    const usuarioAEliminar = usuarios.find((u) => u.id === id);
    const activosRestantes = usuarios.filter(
      (u) => u.activo !== false && u.id !== id
    ).length;

    if (usuarioAEliminar && usuarioAEliminar.activo !== false && activosRestantes === 0) {
      alert('No puedes eliminar el último usuario activo. Debe quedar al menos uno para poder acceder a la app.');
      return;
    }

    const confirmado = window.confirm(`¿Eliminar al usuario "${nombre}"?`);
    if (!confirmado) return;

    await Auth.eliminarUsuario(id);
    await cargarUsuarios();
  }

  function etiquetaRol(rol) {
    return Auth.esAdministrador({ rol }) ? 'Administrador' : 'Cajero';
  }

  async function cargarUsuarios() {
    const usuarios = await Auth.listarUsuarios();
    usuarios.sort((a, b) => a.nombre.localeCompare(b.nombre));

    listaEl.innerHTML = '';

    if (usuarios.length === 0) {
      estadoVacioEl.classList.remove('oculto');
      return;
    }

    estadoVacioEl.classList.add('oculto');

    usuarios.forEach((usuario) => {
      const activo = usuario.activo !== false;
      const tarjeta = document.createElement('div');
      tarjeta.className = 'tarjeta-producto tarjeta-usuario';

      tarjeta.innerHTML = `
        <div class="tarjeta-producto__info">
          <p class="tarjeta-producto__nombre">${escaparHtml(usuario.nombre)}</p>
          <span class="tarjeta-producto__categoria">${escaparHtml(usuario.usuario)}</span>
          <div class="tarjeta-usuario__insignias">
            <span class="insignia-rol insignia-rol--${Auth.esAdministrador({ rol: usuario.rol }) ? 'duena' : 'empleado'}">${etiquetaRol(usuario.rol)}</span>
            <span class="insignia-estado ${activo ? 'insignia-estado--activo' : 'insignia-estado--inactivo'}">${activo ? 'Activo' : 'Inactivo'}</span>
          </div>
        </div>
        <div class="tarjeta-producto__acciones">
          <button class="boton-icono boton-editar" title="Editar">✏️</button>
          <button class="boton-icono boton-icono--eliminar boton-eliminar" title="Eliminar">🗑️</button>
        </div>
      `;

      tarjeta.querySelector('.boton-editar').addEventListener('click', () => abrirModal(usuario));
      tarjeta.querySelector('.boton-eliminar').addEventListener('click', () =>
        eliminarUsuario(usuario.id, usuario.nombre)
      );

      listaEl.appendChild(tarjeta);
    });
  }

  function escaparHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
  }

  await cargarUsuarios();
});
