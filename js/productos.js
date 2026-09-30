/**
 * productos.js — CRUD del catálogo de productos (pages/productos.html).
 */

document.addEventListener('DOMContentLoaded', async () => {
  const sesion = Auth.requerirSesion('../index.html');
  if (!sesion) return;

  document.getElementById('nombre-usuario-activo').textContent = sesion.nombre;
  if (!Auth.esAdministrador(sesion)) {
    const navUsuarios = document.getElementById('nav-usuarios');
    if (navUsuarios) navUsuarios.remove();
  }
  document.getElementById('boton-salir').addEventListener('click', () => {
    Auth.logout();
    window.location.href = '../index.html';
  });

  const listaEl = document.getElementById('lista-productos');
  const estadoVacioEl = document.getElementById('estado-vacio');
  const estadoVacioTextoEl = document.getElementById('estado-vacio-texto');
  const buscadorEl = document.getElementById('buscador-productos');
  const fondoModal = document.getElementById('fondo-modal');
  const formProducto = document.getElementById('form-producto');
  const tituloModal = document.getElementById('titulo-modal');
  const errorProducto = document.getElementById('error-producto');

  const campoId = document.getElementById('producto-id');
  const campoNombre = document.getElementById('producto-nombre');
  const campoPrecio = document.getElementById('producto-precio');
  const campoCategoria = document.getElementById('producto-categoria');
  const campoCategoriaSelect = document.getElementById('producto-categoria-select');
  const botonNuevaCategoria = document.getElementById('boton-nueva-categoria');
  const campoFotoCamara = document.getElementById('producto-foto-camara');
  const campoFotoGaleria = document.getElementById('producto-foto-galeria');
  const botonTomarFoto = document.getElementById('boton-tomar-foto');
  const botonElegirGaleria = document.getElementById('boton-elegir-galeria');
  const fotoPreview = document.getElementById('producto-foto-preview');
  const botonQuitarFoto = document.getElementById('boton-quitar-foto');
  const campoCostoWrap = document.getElementById('campo-costo-wrap');
  const campoCosto = document.getElementById('producto-costo');

  // El costo (para calcular ganancias) es información sensible: solo el
  // administrador la ve y la edita; el cajero ni siquiera ve el campo.
  const esAdmin = Auth.esAdministrador(sesion);
  if (esAdmin) campoCostoWrap.classList.remove('oculto');

  // Blob temporal seleccionado en el formulario (File o Blob), hasta guardar.
  let blobFotoSeleccionada = null;
  // URL activa del <img> de preview del formulario, para poder revocarla.
  let urlPreviewModalActiva = null;
  // URLs activas de las miniaturas de la lista, para revocarlas en cada render.
  let urlsListaActivas = [];
  // Array completo de productos ya cargados de la base de datos, para filtrar
  // por texto de búsqueda en memoria sin volver a consultar IndexedDB.
  let todosLosProductos = [];

  buscadorEl.addEventListener('input', () => {
    renderizarLista(filtrarPorBusqueda(todosLosProductos, buscadorEl.value));
  });

  // Quita acentos para que buscar "bionico" también encuentre "Biónico".
  function normalizarTexto(texto) {
    return texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  }

  function filtrarPorBusqueda(productos, texto) {
    const busqueda = normalizarTexto(texto.trim());
    if (!busqueda) return productos;
    return productos.filter((p) => normalizarTexto(p.nombre).includes(busqueda));
  }

  document.getElementById('boton-nuevo-producto').addEventListener('click', () => {
    abrirModal();
  });

  document.getElementById('boton-cancelar-modal').addEventListener('click', () => {
    cerrarModal();
  });

  document.getElementById('boton-cerrar-modal-x').addEventListener('click', () => {
    cerrarModal();
  });

  function manejarSeleccionArchivo(inputEl) {
    const archivo = inputEl.files && inputEl.files[0];
    if (!archivo) return;

    blobFotoSeleccionada = archivo;
    mostrarPreviewModal(archivo);
  }

  botonTomarFoto.addEventListener('click', () => campoFotoCamara.click());
  botonElegirGaleria.addEventListener('click', () => campoFotoGaleria.click());

  campoFotoCamara.addEventListener('change', () => manejarSeleccionArchivo(campoFotoCamara));
  campoFotoGaleria.addEventListener('change', () => manejarSeleccionArchivo(campoFotoGaleria));

  botonQuitarFoto.addEventListener('click', () => {
    blobFotoSeleccionada = null;
    campoFotoCamara.value = '';
    campoFotoGaleria.value = '';
    ocultarPreviewModal();
  });

  function mostrarPreviewModal(blob) {
    if (urlPreviewModalActiva) {
      URL.revokeObjectURL(urlPreviewModalActiva);
    }
    urlPreviewModalActiva = URL.createObjectURL(blob);
    fotoPreview.src = urlPreviewModalActiva;
    fotoPreview.classList.remove('oculto');
    botonQuitarFoto.classList.remove('oculto');
  }

  function ocultarPreviewModal() {
    if (urlPreviewModalActiva) {
      URL.revokeObjectURL(urlPreviewModalActiva);
      urlPreviewModalActiva = null;
    }
    fotoPreview.src = '';
    fotoPreview.classList.add('oculto');
    botonQuitarFoto.classList.add('oculto');
  }

  fondoModal.addEventListener('click', (e) => {
    if (e.target === fondoModal) cerrarModal();
  });

  formProducto.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorProducto.classList.remove('visible');

    const nombre = campoNombre.value.trim();
    const precio = parseFloat(campoPrecio.value);
    const categoria = campoCategoria.value.trim();

    if (!nombre) {
      mostrarErrorProducto('El nombre es obligatorio.');
      return;
    }

    if (isNaN(precio) || precio < 0) {
      mostrarErrorProducto('El precio debe ser un número válido.');
      return;
    }

    const idExistente = campoId.value ? Number(campoId.value) : null;

    let costo = null;
    if (esAdmin) {
      const costoIngresado = parseFloat(campoCosto.value);
      costo = isNaN(costoIngresado) || costoIngresado < 0 ? null : costoIngresado;
    }

    const botonGuardar = formProducto.querySelector('button[type="submit"]');
    if (botonGuardar.disabled) return;
    botonGuardar.disabled = true;

    try {
      if (idExistente) {
        const producto = await DB.obtenerPorId(DB.STORES.PRODUCTOS, idExistente);
        producto.nombre = nombre;
        producto.precio = precio;
        producto.categoria = categoria || '';
        delete producto.imagenBlob;
        if (blobFotoSeleccionada) {
          producto.imagenBlob = blobFotoSeleccionada;
        }
        // El cajero no ve/edita el costo: si no es admin, se conserva el que ya había.
        if (esAdmin) producto.costo = costo;
        await DB.actualizar(DB.STORES.PRODUCTOS, producto);
      } else {
        const nuevoProducto = {
          nombre,
          precio,
          categoria: categoria || '',
          activo: true,
          creadoEn: Date.now(),
        };
        if (blobFotoSeleccionada) {
          nuevoProducto.imagenBlob = blobFotoSeleccionada;
        }
        if (esAdmin) nuevoProducto.costo = costo;
        await DB.agregar(DB.STORES.PRODUCTOS, nuevoProducto);
      }

      cerrarModal();
      await cargarProductos();
    } catch (err) {
      mostrarErrorProducto('No se pudo guardar el producto.');
    } finally {
      botonGuardar.disabled = false;
    }
  });

  function mostrarErrorProducto(mensaje) {
    errorProducto.textContent = mensaje;
    errorProducto.classList.add('visible');
  }

  function abrirModal(producto = null) {
    formProducto.reset();
    errorProducto.classList.remove('visible');
    blobFotoSeleccionada = null;
    ocultarPreviewModal();
    seleccionarCategoriaEnSelect(producto ? producto.categoria || '' : '');

    if (producto) {
      tituloModal.textContent = 'Editar producto';
      campoId.value = producto.id;
      campoNombre.value = producto.nombre;
      campoPrecio.value = producto.precio;
      if (esAdmin) {
        campoCosto.value = producto.costo != null ? producto.costo : '';
      }

      if (producto.imagenBlob) {
        blobFotoSeleccionada = producto.imagenBlob;
        mostrarPreviewModal(producto.imagenBlob);
      }
    } else {
      tituloModal.textContent = 'Nuevo producto';
      campoId.value = '';
    }

    fondoModal.classList.remove('oculto');
    campoNombre.focus();
  }

  function cerrarModal() {
    fondoModal.classList.add('oculto');
    ocultarPreviewModal();
    blobFotoSeleccionada = null;
    campoFotoCamara.value = '';
    campoFotoGaleria.value = '';
  }

  function formatearPrecio(precio) {
    return 'Q ' + precio.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async function eliminarProducto(id, nombre) {
    const confirmado = window.confirm(`¿Eliminar "${nombre}" del catálogo?`);
    if (!confirmado) return;

    await DB.eliminar(DB.STORES.PRODUCTOS, id);
    await cargarProductos();
  }

  async function cargarProductos() {
    const productos = await DB.obtenerTodos(DB.STORES.PRODUCTOS);
    productos.sort((a, b) => a.nombre.localeCompare(b.nombre));
    todosLosProductos = productos;
    actualizarDatalistCategorias(todosLosProductos);
    renderizarLista(filtrarPorBusqueda(todosLosProductos, buscadorEl.value));
  }

  function obtenerCategoriasExistentes(productos) {
    return Array.from(
      new Set(
        productos
          .map((p) => (p.categoria || '').trim())
          .filter((c) => c.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b, 'es'));
  }

  function actualizarDatalistCategorias(productos) {
    const categoriaActual = campoCategoria.value;
    const categorias = obtenerCategoriasExistentes(productos);

    campoCategoriaSelect.innerHTML =
      '<option value="">— Sin categoría —</option>' +
      categorias.map((c) => `<option value="${escaparHtml(c)}">${escaparHtml(c)}</option>`).join('');

    seleccionarCategoriaEnSelect(categoriaActual);
  }

  function seleccionarCategoriaEnSelect(categoria) {
    const existe = Array.from(campoCategoriaSelect.options).some((o) => o.value === categoria);
    if (categoria && !existe) {
      const opcion = document.createElement('option');
      opcion.value = categoria;
      opcion.textContent = categoria;
      campoCategoriaSelect.appendChild(opcion);
    }
    campoCategoriaSelect.value = categoria || '';
    campoCategoria.value = categoria || '';
  }

  campoCategoriaSelect.addEventListener('change', () => {
    campoCategoria.value = campoCategoriaSelect.value;
  });

  botonNuevaCategoria.addEventListener('click', () => {
    const nueva = window.prompt('Nombre de la nueva categoría:');
    if (nueva === null) return;
    const limpia = nueva.trim();
    if (!limpia) return;
    seleccionarCategoriaEnSelect(limpia);
  });

  function renderizarLista(productos) {
    // Revocar las miniaturas del render anterior antes de crear nuevas.
    urlsListaActivas.forEach((url) => URL.revokeObjectURL(url));
    urlsListaActivas = [];

    listaEl.innerHTML = '';

    const hayBusqueda = buscadorEl.value.trim().length > 0;

    if (productos.length === 0) {
      if (hayBusqueda) {
        estadoVacioTextoEl.innerHTML = `No se encontraron productos que coincidan con «${escaparHtml(buscadorEl.value.trim())}».`;
      } else {
        estadoVacioTextoEl.innerHTML = 'Todavía no has agregado productos.<br />Toca "Nuevo producto" para empezar.';
      }
      estadoVacioEl.classList.remove('oculto');
      return;
    }

    estadoVacioEl.classList.add('oculto');

    productos.forEach((producto) => {
      const tarjeta = document.createElement('div');
      tarjeta.className = 'tarjeta-producto';

      let htmlMiniatura;
      if (producto.imagenBlob) {
        const urlMiniatura = URL.createObjectURL(producto.imagenBlob);
        urlsListaActivas.push(urlMiniatura);
        htmlMiniatura = `<img class="tarjeta-producto__miniatura" src="${urlMiniatura}" alt="" />`;
      } else {
        htmlMiniatura = `<span class="tarjeta-producto__miniatura tarjeta-producto__miniatura--vacia">📦</span>`;
      }

      tarjeta.innerHTML = `
        ${htmlMiniatura}
        <div class="tarjeta-producto__info">
          <p class="tarjeta-producto__nombre">${escaparHtml(producto.nombre)}</p>
          ${producto.categoria ? `<span class="tarjeta-producto__categoria">${escaparHtml(producto.categoria)}</span>` : ''}
          <span class="tarjeta-producto__precio">${formatearPrecio(producto.precio)}</span>
        </div>
        <div class="tarjeta-producto__acciones">
          <button class="boton-icono boton-editar" title="Editar">✏️</button>
          <button class="boton-icono boton-icono--eliminar boton-eliminar" title="Eliminar">🗑️</button>
        </div>
      `;

      tarjeta.querySelector('.boton-editar').addEventListener('click', () => abrirModal(producto));
      tarjeta.querySelector('.boton-eliminar').addEventListener('click', () =>
        eliminarProducto(producto.id, producto.nombre)
      );

      listaEl.appendChild(tarjeta);
    });
  }

  function escaparHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
  }

  await cargarProductos();
});
