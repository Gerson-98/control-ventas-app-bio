/**
 * venta.js — Pantalla de punto de venta (pages/venta.html).
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

  const avisoCajaCerradaEl = document.getElementById('aviso-caja-cerrada');
  const ventaLayoutEl = document.getElementById('venta-layout');

  // ---------- Candado de caja: no se puede vender sin una caja abierta ----------
  // Nota: 'cerrada' es booleano y los índices de IndexedDB no aceptan
  // booleanos como clave de búsqueda (DataError) — se filtra en memoria.
  const todasLasCajas = await DB.obtenerTodos(DB.STORES.CAJAS);
  const cajasAbiertas = todasLasCajas.filter((c) => !c.cerrada);
  const cajaActiva = cajasAbiertas.length
    ? cajasAbiertas.sort((a, b) => b.fechaApertura - a.fechaApertura)[0]
    : null;

  if (!cajaActiva) {
    avisoCajaCerradaEl.classList.remove('oculto');
    ventaLayoutEl.classList.add('oculto');
    return;
  }

  const buscadorVentaEl = document.getElementById('buscador-venta');
  const categoriasEl = document.getElementById('venta-categorias');
  const grillaEl = document.getElementById('venta-grilla');
  const estadoVacioProductosEl = document.getElementById('venta-estado-vacio');

  const carritoListaEl = document.getElementById('carrito-lista');
  const carritoVacioEl = document.getElementById('carrito-vacio');
  const carritoTotalMontoEl = document.getElementById('carrito-total-monto');
  const ventaErrorEl = document.getElementById('venta-error');
  const botonConfirmarEl = document.getElementById('boton-confirmar-venta');

  const chipsPago = Array.from(document.querySelectorAll('.chip-pago'));

  const fondoRecibo = document.getElementById('fondo-recibo');
  const reciboContenidoEl = document.getElementById('recibo-contenido');
  const reciboCanvas = document.getElementById('recibo-canvas');
  const botonCompartirRecibo = document.getElementById('boton-compartir-recibo');
  const botonImprimirDirecto = document.getElementById('boton-imprimir-directo');
  const botonNuevaVenta = document.getElementById('boton-nueva-venta');
  const enlaceDescargaRecibo = document.getElementById('enlace-descarga-recibo');
  let ultimaVentaParaRecibo = null;

  let productos = [];
  let categoriaActiva = 'Todos';
  let carrito = []; // { productoId, nombre, precio, cantidad, extra, nota }
  let metodoPago = null;
  let ultimoReciboBlob = null;
  let urlsFotosGrilla = [];
  let clientes = [];

  // ---------- Entrega: mostrador o domicilio ----------
  const chipsEntrega = Array.from(document.querySelectorAll('.chip-entrega'));
  const domicilioCamposEl = document.getElementById('domicilio-campos');
  const domicilioNombreEl = document.getElementById('domicilio-nombre');
  const domicilioTelefonoEl = document.getElementById('domicilio-telefono');
  const domicilioDireccionEl = document.getElementById('domicilio-direccion');
  const domicilioCostoEnvioEl = document.getElementById('domicilio-costo-envio');
  const domicilioTelefonoAlternoEl = document.getElementById('domicilio-telefono-alterno');
  const domicilioNotasEl = document.getElementById('domicilio-notas');
  let esDomicilio = false;

  // ---------- Cliente opcional ----------
  const ventaClienteSelectEl = document.getElementById('venta-cliente-select');
  const domicilioCamposClienteManualEl = document.getElementById('domicilio-campos-cliente-manual');
  const domicilioClienteInfoEl = document.getElementById('domicilio-cliente-info');
  const domicilioClienteInfoNombreEl = document.getElementById('domicilio-cliente-info-nombre');

  async function cargarClientes() {
    try {
      clientes = await DB.obtenerTodos(DB.STORES.CLIENTES);
      clientes.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    } catch (err) {
      clientes = [];
    }
    ventaClienteSelectEl.innerHTML = '<option value="">— Sin cliente —</option>';
    clientes.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = String(c.id);
      opt.textContent = c.nombre;
      ventaClienteSelectEl.appendChild(opt);
    });
  }

  // ---------- Modal rápido: nuevo cliente desde Vender ----------
  const fondoNuevoClienteEl = document.getElementById('fondo-nuevo-cliente');
  const nuevoClienteNombreEl = document.getElementById('nuevo-cliente-nombre');
  const nuevoClienteTelefonoEl = document.getElementById('nuevo-cliente-telefono');
  const nuevoClienteDireccionEl = document.getElementById('nuevo-cliente-direccion');
  const errorNuevoClienteEl = document.getElementById('error-nuevo-cliente');
  const botonNuevoClienteRapidoEl = document.getElementById('boton-nuevo-cliente-rapido');
  const botonCancelarNuevoClienteEl = document.getElementById('boton-cancelar-nuevo-cliente');
  const botonGuardarNuevoClienteEl = document.getElementById('boton-guardar-nuevo-cliente');

  botonNuevoClienteRapidoEl.addEventListener('click', () => {
    nuevoClienteNombreEl.value = '';
    nuevoClienteTelefonoEl.value = '';
    nuevoClienteDireccionEl.value = '';
    errorNuevoClienteEl.classList.remove('visible');
    fondoNuevoClienteEl.classList.remove('oculto');
    nuevoClienteNombreEl.focus();
  });

  botonCancelarNuevoClienteEl.addEventListener('click', () => {
    fondoNuevoClienteEl.classList.add('oculto');
  });

  document.getElementById('boton-cerrar-nuevo-cliente-x').addEventListener('click', () => {
    fondoNuevoClienteEl.classList.add('oculto');
  });

  fondoNuevoClienteEl.addEventListener('click', (e) => {
    if (e.target === fondoNuevoClienteEl) fondoNuevoClienteEl.classList.add('oculto');
  });

  botonGuardarNuevoClienteEl.addEventListener('click', async () => {
    const nombre = nuevoClienteNombreEl.value.trim();
    const telefono = nuevoClienteTelefonoEl.value.trim();
    const direccion = nuevoClienteDireccionEl.value.trim();

    if (!nombre || !telefono) {
      errorNuevoClienteEl.textContent = 'Ingresa al menos nombre y teléfono.';
      errorNuevoClienteEl.classList.add('visible');
      return;
    }

    const nuevoId = await DB.agregar(DB.STORES.CLIENTES, {
      nombre,
      telefono,
      telefonoAlterno: '',
      direccion,
      notas: '',
      creadoEn: Date.now(),
    });

    await cargarClientes();
    ventaClienteSelectEl.value = String(nuevoId);
    ventaClienteSelectEl.dispatchEvent(new Event('change'));
    fondoNuevoClienteEl.classList.add('oculto');
  });

  function obtenerClienteSeleccionado() {
    const idSeleccionado = ventaClienteSelectEl.value ? parseInt(ventaClienteSelectEl.value, 10) : null;
    if (!idSeleccionado) return null;
    return clientes.find((c) => c.id === idSeleccionado) || null;
  }

  // Con un cliente ya elegido no tiene sentido volver a pedirle nombre,
  // teléfono y dirección a mano: esos datos se toman del cliente y solo se
  // muestran los campos que de verdad varían venta a venta (envío, teléfono
  // alterno, nota de esa entrega en particular).
  function actualizarCamposDomicilioSegunCliente() {
    const cliente = obtenerClienteSeleccionado();

    if (cliente && esDomicilio) {
      domicilioNombreEl.value = cliente.nombre || '';
      domicilioTelefonoEl.value = cliente.telefono || '';
      domicilioDireccionEl.value = cliente.direccion || '';
      if (cliente.telefonoAlterno) domicilioTelefonoAlternoEl.value = cliente.telefonoAlterno;

      domicilioCamposClienteManualEl.classList.add('oculto');
      domicilioClienteInfoNombreEl.textContent = cliente.nombre;
      domicilioClienteInfoEl.classList.remove('oculto');
    } else {
      domicilioCamposClienteManualEl.classList.remove('oculto');
      domicilioClienteInfoEl.classList.add('oculto');
    }
  }

  ventaClienteSelectEl.addEventListener('change', () => {
    actualizarCamposDomicilioSegunCliente();
  });

  chipsEntrega.forEach((chip) => {
    chip.addEventListener('click', () => {
      esDomicilio = chip.dataset.tipo === 'domicilio';
      chipsEntrega.forEach((c) => c.classList.toggle('activo', c === chip));
      domicilioCamposEl.classList.toggle('oculto', !esDomicilio);
      actualizarCamposDomicilioSegunCliente();
      ocultarError();
    });
  });

  function obtenerCostoEnvio() {
    const valor = parseFloat(domicilioCostoEnvioEl.value);
    return isNaN(valor) || valor < 0 ? 0 : valor;
  }

  domicilioCostoEnvioEl.addEventListener('input', () => renderizarCarrito());

  // ---------- Formato ----------

  function formatearMoneda(monto) {
    return 'Q ' + monto.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Quita acentos para que buscar "bionico" también encuentre "Biónico".
  function normalizarTexto(texto) {
    return texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  }

  function escaparHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
  }

  // ---------- Carga de productos ----------

  async function cargarProductos() {
    const todos = await DB.obtenerTodos(DB.STORES.PRODUCTOS);
    productos = todos.filter((p) => p.activo !== false);
    productos.sort((a, b) => a.nombre.localeCompare(b.nombre));
    renderizarCategorias();
    renderizarGrilla();
  }

  function renderizarCategorias() {
    const categoriasSet = new Set();
    productos.forEach((p) => {
      if (p.categoria && p.categoria.trim()) categoriasSet.add(p.categoria.trim());
    });
    const categorias = ['Todos', ...Array.from(categoriasSet).sort((a, b) => a.localeCompare(b))];

    categoriasEl.innerHTML = '';
    categorias.forEach((cat) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip-categoria' + (cat === categoriaActiva ? ' activo' : '');
      chip.textContent = cat;
      chip.addEventListener('click', () => {
        categoriaActiva = cat;
        renderizarCategorias();
        renderizarGrilla();
      });
      categoriasEl.appendChild(chip);
    });
  }

  buscadorVentaEl.addEventListener('input', () => renderizarGrilla());

  function renderizarGrilla() {
    const porCategoria =
      categoriaActiva === 'Todos'
        ? productos
        : productos.filter((p) => (p.categoria || '').trim() === categoriaActiva);

    const busqueda = normalizarTexto(buscadorVentaEl.value.trim());
    const visibles = busqueda
      ? porCategoria.filter((p) => normalizarTexto(p.nombre).includes(busqueda))
      : porCategoria;

    // Se revocan las URLs de fotos del render anterior para no acumular memoria.
    urlsFotosGrilla.forEach((url) => URL.revokeObjectURL(url));
    urlsFotosGrilla = [];

    grillaEl.innerHTML = '';

    if (visibles.length === 0) {
      estadoVacioProductosEl.classList.remove('oculto');
      return;
    }
    estadoVacioProductosEl.classList.add('oculto');

    visibles.forEach((producto) => {
      const tarjeta = document.createElement('button');
      tarjeta.type = 'button';
      tarjeta.className = 'tarjeta-venta-producto';

      let fotoHtml = '';
      if (producto.imagenBlob) {
        const url = URL.createObjectURL(producto.imagenBlob);
        urlsFotosGrilla.push(url);
        fotoHtml = `<img src="${url}" class="tarjeta-venta-producto__foto" alt="" />`;
      }

      tarjeta.innerHTML = `
        ${fotoHtml}
        <span class="tarjeta-venta-producto__nombre">${escaparHtml(producto.nombre)}</span>
        <span class="tarjeta-venta-producto__precio">${formatearMoneda(producto.precio)}</span>
      `;
      tarjeta.addEventListener('click', () => agregarAlCarrito(producto));
      grillaEl.appendChild(tarjeta);
    });
  }

  // ---------- Carrito ----------

  function agregarAlCarrito(producto) {
    const linea = carrito.find((l) => l.productoId === producto.id);
    if (linea) {
      linea.cantidad += 1;
    } else {
      carrito.push({
        productoId: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        cantidad: 1,
        extra: 0,
        nota: '',
      });
    }
    renderizarCarrito();
  }

  // ---------- Modal de extra/nota por línea ----------
  const fondoExtraLineaEl = document.getElementById('fondo-extra-linea');
  const extraLineaTituloEl = document.getElementById('extra-linea-titulo');
  const extraLineaMontoEl = document.getElementById('extra-linea-monto');
  const extraLineaNotaEl = document.getElementById('extra-linea-nota');
  const botonGuardarExtraLineaEl = document.getElementById('boton-guardar-extra-linea');
  const botonCancelarExtraLineaEl = document.getElementById('boton-cancelar-extra-linea');
  let productoIdEditandoExtra = null;

  function abrirModalExtra(linea) {
    productoIdEditandoExtra = linea.productoId;
    extraLineaTituloEl.textContent = `Ajustar: ${linea.nombre}`;
    extraLineaMontoEl.value = linea.extra ? String(linea.extra) : '';
    extraLineaNotaEl.value = linea.nota || '';
    fondoExtraLineaEl.classList.remove('oculto');
  }

  function cerrarModalExtra() {
    fondoExtraLineaEl.classList.add('oculto');
    productoIdEditandoExtra = null;
  }

  botonCancelarExtraLineaEl.addEventListener('click', cerrarModalExtra);
  document.getElementById('boton-cerrar-extra-linea-x').addEventListener('click', cerrarModalExtra);
  fondoExtraLineaEl.addEventListener('click', (e) => {
    if (e.target === fondoExtraLineaEl) cerrarModalExtra();
  });

  botonGuardarExtraLineaEl.addEventListener('click', () => {
    if (productoIdEditandoExtra == null) return;
    const linea = carrito.find((l) => l.productoId === productoIdEditandoExtra);
    if (!linea) return;
    const valorExtra = parseFloat(extraLineaMontoEl.value);
    linea.extra = isNaN(valorExtra) || valorExtra < 0 ? 0 : valorExtra;
    linea.nota = extraLineaNotaEl.value.trim();
    cerrarModalExtra();
    renderizarCarrito();
  });

  function cambiarCantidad(productoId, delta) {
    const linea = carrito.find((l) => l.productoId === productoId);
    if (!linea) return;
    linea.cantidad += delta;
    if (linea.cantidad <= 0) {
      carrito = carrito.filter((l) => l.productoId !== productoId);
    }
    renderizarCarrito();
  }

  function eliminarLinea(productoId) {
    carrito = carrito.filter((l) => l.productoId !== productoId);
    renderizarCarrito();
  }

  function calcularSubtotalProductos() {
    return carrito.reduce((acc, l) => acc + (l.precio + (l.extra || 0)) * l.cantidad, 0);
  }

  function calcularTotal() {
    const envio = esDomicilio ? obtenerCostoEnvio() : 0;
    return calcularSubtotalProductos() + envio;
  }

  function renderizarCarrito() {
    carritoListaEl.innerHTML = '';

    if (carrito.length === 0) {
      carritoVacioEl.classList.remove('oculto');
    } else {
      carritoVacioEl.classList.add('oculto');

      carrito.forEach((linea) => {
        const extra = linea.extra || 0;
        const subtotal = (linea.precio + extra) * linea.cantidad;
        const extraHtml = extra > 0
          ? `<span class="carrito-linea__extra">+ ${formatearMoneda(extra)} extra</span>`
          : '';
        const notaHtml = linea.nota
          ? `<span class="carrito-linea__nota">${escaparHtml(linea.nota)}</span>`
          : '';
        const fila = document.createElement('div');
        fila.className = 'carrito-linea';
        fila.innerHTML = `
          <div class="carrito-linea__info">
            <span class="carrito-linea__nombre">${escaparHtml(linea.nombre)}</span>
            <span class="carrito-linea__precio">${formatearMoneda(linea.precio)} c/u</span>
            ${extraHtml}
            ${notaHtml}
          </div>
          <div class="carrito-linea__stepper">
            <button type="button" class="boton-stepper" data-accion="restar">−</button>
            <span class="carrito-linea__cantidad">${linea.cantidad}</span>
            <button type="button" class="boton-stepper" data-accion="sumar">+</button>
            <button type="button" class="boton-icono carrito-linea__extra-boton" title="Cargo extra / nota">✏️</button>
          </div>
          <span class="carrito-linea__subtotal">${formatearMoneda(subtotal)}</span>
          <button type="button" class="boton-icono boton-icono--eliminar carrito-linea__eliminar" title="Eliminar">🗑️</button>
        `;

        fila.querySelector('[data-accion="restar"]').addEventListener('click', () =>
          cambiarCantidad(linea.productoId, -1)
        );
        fila.querySelector('[data-accion="sumar"]').addEventListener('click', () =>
          cambiarCantidad(linea.productoId, 1)
        );
        fila.querySelector('.carrito-linea__eliminar').addEventListener('click', () =>
          eliminarLinea(linea.productoId)
        );
        fila.querySelector('.carrito-linea__extra-boton').addEventListener('click', () =>
          abrirModalExtra(linea)
        );

        carritoListaEl.appendChild(fila);
      });
    }

    carritoTotalMontoEl.textContent = formatearMoneda(calcularTotal());
    ocultarError();
  }

  function limpiarCamposDomicilio() {
    domicilioNombreEl.value = '';
    domicilioTelefonoEl.value = '';
    domicilioDireccionEl.value = '';
    domicilioCostoEnvioEl.value = '';
    domicilioTelefonoAlternoEl.value = '';
    domicilioNotasEl.value = '';
    esDomicilio = false;
    chipsEntrega.forEach((c) => c.classList.toggle('activo', c.dataset.tipo === 'mostrador'));
    domicilioCamposEl.classList.add('oculto');
    ventaClienteSelectEl.value = '';
    actualizarCamposDomicilioSegunCliente();
  }

  // ---------- Método de pago ----------

  chipsPago.forEach((chip) => {
    chip.addEventListener('click', () => {
      metodoPago = chip.dataset.metodo;
      chipsPago.forEach((c) => c.classList.toggle('activo', c === chip));
      ocultarError();
    });
  });

  function etiquetaMetodoPago(metodo) {
    switch (metodo) {
      case 'efectivo':
        return 'Efectivo';
      case 'tarjeta':
        return 'Tarjeta';
      case 'deposito':
        return 'Depósito';
      default:
        return '';
    }
  }

  function mostrarError(mensaje) {
    ventaErrorEl.textContent = mensaje;
    ventaErrorEl.classList.add('visible');
  }

  function ocultarError() {
    ventaErrorEl.classList.remove('visible');
  }

  // ---------- Confirmar venta ----------

  botonConfirmarEl.addEventListener('click', async () => {
    if (carrito.length === 0) {
      mostrarError('Agrega al menos un producto al carrito.');
      return;
    }
    if (!metodoPago) {
      mostrarError('Selecciona un método de pago.');
      return;
    }

    const nombreCliente = domicilioNombreEl.value.trim();
    const telefonoCliente = domicilioTelefonoEl.value.trim();
    const direccionCliente = domicilioDireccionEl.value.trim();
    const telefonoAlterno = domicilioTelefonoAlternoEl.value.trim();
    const notasEntrega = domicilioNotasEl.value.trim();
    const clienteId = ventaClienteSelectEl.value ? parseInt(ventaClienteSelectEl.value, 10) : null;

    if (esDomicilio && (!telefonoCliente || !direccionCliente)) {
      mostrarError('Para domicilio, ingresa al menos teléfono y dirección.');
      return;
    }

    botonConfirmarEl.disabled = true;

    try {
      const ventasExistentes = await DB.obtenerTodos(DB.STORES.VENTAS);
      const numeroRecibo =
        ventasExistentes.length === 0
          ? 1
          : Math.max(...ventasExistentes.map((v) => v.numeroRecibo || 0)) + 1;

      const costoEnvio = esDomicilio ? obtenerCostoEnvio() : 0;
      const total = calcularTotal();
      const fecha = Date.now();

      const ventaId = await DB.agregar(DB.STORES.VENTAS, {
        numeroRecibo,
        fecha,
        usuarioId: sesion.id,
        metodoPago,
        total,
        cajaId: cajaActiva.id,
        esDomicilio,
        costoEnvio,
        clienteId,
        clienteNombre: esDomicilio ? nombreCliente : '',
        clienteTelefono: esDomicilio ? telefonoCliente : '',
        clienteDireccion: esDomicilio ? direccionCliente : '',
        telefonoAlterno: esDomicilio ? telefonoAlterno : '',
        notasEntrega: esDomicilio ? notasEntrega : '',
      });

      for (const linea of carrito) {
        const extra = linea.extra || 0;
        await DB.agregar(DB.STORES.DETALLE_VENTA, {
          ventaId,
          productoId: linea.productoId,
          nombreProducto: linea.nombre,
          precioUnitario: linea.precio,
          cantidad: linea.cantidad,
          extra,
          nota: linea.nota || '',
          subtotal: (linea.precio + extra) * linea.cantidad,
        });
      }

      mostrarRecibo({
        numeroRecibo,
        fecha,
        cajero: sesion.nombre,
        metodoPago,
        lineas: carrito.slice(),
        subtotal: calcularSubtotalProductos(),
        costoEnvio,
        total,
        esDomicilio,
        clienteNombre: nombreCliente,
        clienteTelefono: telefonoCliente,
        clienteDireccion: direccionCliente,
        telefonoAlterno,
        notasEntrega,
      });

      carrito = [];
      metodoPago = null;
      chipsPago.forEach((c) => c.classList.remove('activo'));
      limpiarCamposDomicilio();
      renderizarCarrito();
    } catch (err) {
      mostrarError('No se pudo registrar la venta. Intenta de nuevo.');
    } finally {
      botonConfirmarEl.disabled = false;
    }
  });

  // ---------- Recibo ----------

  function mostrarRecibo(venta) {
    ultimaVentaParaRecibo = venta;
    const fechaTexto = new Date(venta.fecha).toLocaleString('es-GT', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    let filasHtml = '';
    venta.lineas.forEach((linea) => {
      const extra = linea.extra || 0;
      const subtotal = (linea.precio + extra) * linea.cantidad;
      const nombreConExtra = extra > 0
        ? `${escaparHtml(linea.nombre)} (+${formatearMoneda(extra)} extra c/u)`
        : escaparHtml(linea.nombre);
      const notaHtml = linea.nota
        ? `<div class="recibo-linea-nota"><em>${escaparHtml(linea.nota)}</em></div>`
        : '';
      filasHtml += `
        <div class="recibo-linea">
          <span>${linea.cantidad} × ${nombreConExtra}</span>
          <span>${formatearMoneda(subtotal)}</span>
        </div>
        ${notaHtml}
      `;
    });

    const envioHtml =
      venta.esDomicilio && venta.costoEnvio > 0
        ? `<div class="recibo-linea"><span>Envío a domicilio</span><span>${formatearMoneda(venta.costoEnvio)}</span></div>`
        : '';

    const domicilioHtml = venta.esDomicilio
      ? `
        <div class="recibo-domicilio">
          <strong>🛵 Entrega a domicilio</strong>
          ${venta.clienteNombre ? `<div>${escaparHtml(venta.clienteNombre)}</div>` : ''}
          <div>${escaparHtml(venta.clienteTelefono)}</div>
          <div>${escaparHtml(venta.clienteDireccion)}</div>
          ${venta.telefonoAlterno ? `<div>Tel. alterno: ${escaparHtml(venta.telefonoAlterno)}</div>` : ''}
          ${venta.notasEntrega ? `<div><em>${escaparHtml(venta.notasEntrega)}</em></div>` : ''}
        </div>
      `
      : '';

    reciboContenidoEl.innerHTML = `
      <h3 class="recibo-titulo">Frutería Los Biónicos</h3>
      <p class="recibo-meta">${fechaTexto}</p>
      <p class="recibo-meta">Recibo #${venta.numeroRecibo}</p>
      <p class="recibo-meta">Cajero: ${escaparHtml(venta.cajero)}</p>
      <hr class="recibo-separador" />
      <div class="recibo-lineas">${filasHtml}</div>
      ${envioHtml}
      <hr class="recibo-separador" />
      <div class="recibo-total">
        <span>Total</span>
        <span>${formatearMoneda(venta.total)}</span>
      </div>
      <p class="recibo-metodo">Método de pago: ${etiquetaMetodoPago(venta.metodoPago)}</p>
      ${domicilioHtml}
      <p class="recibo-gracias">¡Gracias por su compra!</p>
    `;

    dibujarReciboCanvas(venta);

    fondoRecibo.classList.remove('oculto');
  }

  function dibujarReciboCanvas(venta) {
    const ancho = 384;
    const margenX = 24;
    const alturaLinea = 24;
    const alturaNota = 16;
    const tieneEnvio = venta.esDomicilio && venta.costoEnvio > 0;
    let lineasDomicilio = venta.esDomicilio ? 3 : 0; // título + teléfono + dirección
    if (venta.esDomicilio && venta.telefonoAlterno) lineasDomicilio += 1;
    if (venta.esDomicilio && venta.notasEntrega) lineasDomicilio += 1;
    let alturaFija = 220; // encabezado + separadores + total + pie
    if (tieneEnvio) alturaFija += alturaLinea;
    if (venta.esDomicilio) alturaFija += lineasDomicilio * 18 + 20;
    const cantidadNotas = venta.lineas.filter((l) => l.nota).length;
    // Margen extra al final: sin esto, el corte automático de la impresora
    // cae encima del último texto en vez de dejarlo completo antes de cortar.
    const margenInferior = 70;
    const alto = alturaFija + venta.lineas.length * alturaLinea + cantidadNotas * alturaNota + margenInferior;

    // Se dibuja a 1.5x y se escala el contexto (no las coordenadas de abajo)
    // para que la imagen final tenga ~576px de ancho — la resolución
    // estándar de impresoras térmicas de 80mm a 203dpi — y se vea nítida
    // al imprimirse, en vez de pixelada.
    const escalaImpresion = 1.5;
    reciboCanvas.width = ancho * escalaImpresion;
    reciboCanvas.height = alto * escalaImpresion;

    const ctx = reciboCanvas.getContext('2d');
    ctx.scale(escalaImpresion, escalaImpresion);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ancho, alto);
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'top';

    let y = 20;

    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Frutería Los Biónicos', ancho / 2, y);
    y += 30;

    const fechaTexto = new Date(venta.fecha).toLocaleString('es-GT', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    ctx.font = '13px sans-serif';
    ctx.fillText(fechaTexto, ancho / 2, y);
    y += 20;
    ctx.fillText(`Recibo #${venta.numeroRecibo}`, ancho / 2, y);
    y += 20;
    ctx.fillText(`Cajero: ${venta.cajero}`, ancho / 2, y);
    y += 20;

    ctx.textAlign = 'left';
    ctx.strokeStyle = '#cccccc';
    ctx.beginPath();
    ctx.moveTo(margenX, y);
    ctx.lineTo(ancho - margenX, y);
    ctx.stroke();
    y += 14;

    ctx.font = '13px sans-serif';
    venta.lineas.forEach((linea) => {
      const extra = linea.extra || 0;
      const subtotal = (linea.precio + extra) * linea.cantidad;
      const precioTexto = extra > 0
        ? `${formatearMoneda(linea.precio)} +${formatearMoneda(extra)} extra`
        : formatearMoneda(linea.precio);
      const textoIzq = `${linea.cantidad} x ${linea.nombre} (${precioTexto})`;
      const textoDer = formatearMoneda(subtotal);
      ctx.textAlign = 'left';
      ctx.font = '13px sans-serif';
      ctx.fillText(recortarTexto(ctx, textoIzq, ancho - margenX * 2 - 70), margenX, y);
      ctx.textAlign = 'right';
      ctx.fillText(textoDer, ancho - margenX, y);
      y += alturaLinea;
      if (linea.nota) {
        ctx.textAlign = 'left';
        ctx.font = 'italic 11px sans-serif';
        ctx.fillText(recortarTexto(ctx, linea.nota, ancho - margenX * 2), margenX, y);
        y += alturaNota;
      }
    });

    if (tieneEnvio) {
      ctx.textAlign = 'left';
      ctx.fillText('Envío a domicilio', margenX, y);
      ctx.textAlign = 'right';
      ctx.fillText(formatearMoneda(venta.costoEnvio), ancho - margenX, y);
      y += alturaLinea;
    }

    ctx.textAlign = 'left';
    ctx.beginPath();
    ctx.moveTo(margenX, y);
    ctx.lineTo(ancho - margenX, y);
    ctx.stroke();
    y += 16;

    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Total', margenX, y);
    ctx.textAlign = 'right';
    ctx.fillText(formatearMoneda(venta.total), ancho - margenX, y);
    y += 30;

    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Método de pago: ${etiquetaMetodoPago(venta.metodoPago)}`, ancho / 2, y);
    y += 24;

    if (venta.esDomicilio) {
      ctx.textAlign = 'left';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('🛵 Entrega a domicilio', margenX, y);
      y += 18;
      ctx.font = '13px sans-serif';
      if (venta.clienteNombre) {
        ctx.fillText(venta.clienteNombre, margenX, y);
        y += 18;
      }
      ctx.fillText(venta.clienteTelefono, margenX, y);
      y += 18;
      ctx.fillText(recortarTexto(ctx, venta.clienteDireccion, ancho - margenX * 2), margenX, y);
      y += 18;
      if (venta.telefonoAlterno) {
        ctx.fillText(`Tel. alterno: ${venta.telefonoAlterno}`, margenX, y);
        y += 18;
      }
      if (venta.notasEntrega) {
        ctx.font = 'italic 13px sans-serif';
        ctx.fillText(recortarTexto(ctx, venta.notasEntrega, ancho - margenX * 2), margenX, y);
        y += 18;
      }
      y += 2;
    }

    ctx.font = 'italic 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('¡Gracias por su compra!', ancho / 2, y);

    // Las impresoras térmicas solo imprimen blanco o negro puro (sin grises).
    // Sin este paso, el suavizado (antialiasing) del texto queda en tonos
    // grises que la app de impresión convierte de forma inconsistente,
    // resultando en un ticket borroso o "pixelado". Aquí se convierte cada
    // píxel a blanco o negro puro antes de compartir la imagen.
    binarizarCanvas(reciboCanvas);
  }

  function binarizarCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const imagenDatos = ctx.getImageData(0, 0, width, height);
    const datos = imagenDatos.data;
    const umbral = 180;
    for (let i = 0; i < datos.length; i += 4) {
      const luminancia = 0.299 * datos[i] + 0.587 * datos[i + 1] + 0.114 * datos[i + 2];
      const valor = luminancia < umbral ? 0 : 255;
      datos[i] = valor;
      datos[i + 1] = valor;
      datos[i + 2] = valor;
    }
    ctx.putImageData(imagenDatos, 0, 0);
  }

  function recortarTexto(ctx, texto, maxAncho) {
    if (ctx.measureText(texto).width <= maxAncho) return texto;
    let recortado = texto;
    while (recortado.length > 0 && ctx.measureText(recortado + '…').width > maxAncho) {
      recortado = recortado.slice(0, -1);
    }
    return recortado + '…';
  }

  // ---------- Impresión directa vía app "Bluetooth Print" (esquema thermer://) ----------
  // La app se abre sola y recibe el recibo como texto nativo de impresora
  // (no como imagen), incrustado directo en la URL — sin servidor, 100%
  // offline. Esquema documentado en github.com/tussharmate/ios-thermer-custom-schema.
  // IMPORTANTE: la app recibe este contenido dentro de una URL
  // (thermer://?data=...), y ese tipo de enlaces entre apps de iOS tiene un
  // límite de tamaño bastante corto. Un recibo "normal" (una entrada de
  // texto por línea) fácilmente pasa ese límite y la URL llega truncada:
  // la impresora imprime solo hasta donde alcanzó y corta ahí mismo,
  // pareciendo un corte prematuro pero en realidad es una URL incompleta.
  // Por eso aquí se agrupan varias líneas dentro de una sola "entrada" de
  // texto usando saltos de línea (<br />), que la app también soporta:
  // mismo contenido, muchísimo menos texto de formato JSON de por medio.
  const SEPARADOR_RECIBO = '------------------------';

  function construirEntradasThermer(venta) {
    const entradas = [];
    const texto = (content, align = 0, bold = 0) => {
      const entrada = { type: 0, content };
      if (bold) entrada.bold = 1;
      if (align) entrada.align = align;
      entradas.push(entrada);
    };

    texto('Fruteria Los Bionicos', 1, 1);
    const fechaTexto = new Date(venta.fecha).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' });
    texto(`${fechaTexto}<br />Recibo #${venta.numeroRecibo}<br />Cajero: ${venta.cajero}`, 1);
    texto(SEPARADOR_RECIBO);

    const lineasProductos = venta.lineas.map((l) => {
      const extra = l.extra || 0;
      const subtotal = (l.precio + extra) * l.cantidad;
      let linea = `${l.cantidad} x ${l.nombre} .... ${formatearMoneda(subtotal)}`;
      if (extra > 0) linea += `<br />  (${formatearMoneda(l.precio)} + ${formatearMoneda(extra)} extra)`;
      if (l.nota) linea += `<br />  Nota: ${l.nota}`;
      return linea;
    });
    if (venta.esDomicilio && venta.costoEnvio > 0) {
      lineasProductos.push(`Envio a domicilio .... ${formatearMoneda(venta.costoEnvio)}`);
    }
    texto(lineasProductos.join('<br />'));
    texto(SEPARADOR_RECIBO);

    texto(`Total: ${formatearMoneda(venta.total)}`, 0, 1);
    texto(`Metodo de pago: ${etiquetaMetodoPago(venta.metodoPago)}`);

    if (venta.esDomicilio) {
      texto(SEPARADOR_RECIBO);
      const lineasDomicilio = ['Entrega a domicilio'];
      if (venta.clienteNombre) lineasDomicilio.push(venta.clienteNombre);
      lineasDomicilio.push(venta.clienteTelefono);
      lineasDomicilio.push(venta.clienteDireccion);
      if (venta.telefonoAlterno) lineasDomicilio.push(`Tel. alterno: ${venta.telefonoAlterno}`);
      if (venta.notasEntrega) lineasDomicilio.push(venta.notasEntrega);
      texto(lineasDomicilio.join('<br />'));
    }

    texto(SEPARADOR_RECIBO);
    texto('Gracias por su compra!<br /> <br /> ', 1);

    return entradas;
  }

  function imprimirConThermer(venta) {
    const entradas = construirEntradasThermer(venta);
    const objetoConClaves = {};
    entradas.forEach((entrada, indice) => {
      objetoConClaves[indice] = entrada;
    });
    const datosCodificados = encodeURIComponent(JSON.stringify(objetoConClaves));
    window.location.href = `thermer://?data=${datosCodificados}`;
  }

  botonImprimirDirecto.addEventListener('click', () => {
    if (!ultimaVentaParaRecibo) return;
    imprimirConThermer(ultimaVentaParaRecibo);
  });

  botonCompartirRecibo.addEventListener('click', async () => {
    enlaceDescargaRecibo.classList.add('oculto');

    reciboCanvas.toBlob(async (blob) => {
      if (!blob) return;
      ultimoReciboBlob = blob;

      const archivo = new File([blob], `recibo-${Date.now()}.png`, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [archivo] }) && navigator.share) {
        try {
          await navigator.share({ files: [archivo], title: 'Recibo Los Biónicos' });
          return;
        } catch (err) {
          // el usuario canceló o falló; caemos al método alternativo
        }
      }

      const dataUrl = reciboCanvas.toDataURL('image/png');
      enlaceDescargaRecibo.href = dataUrl;
      enlaceDescargaRecibo.download = `recibo-${Date.now()}.png`;
      enlaceDescargaRecibo.classList.remove('oculto');
    }, 'image/png');
  });

  botonNuevaVenta.addEventListener('click', () => {
    fondoRecibo.classList.add('oculto');
    enlaceDescargaRecibo.classList.add('oculto');
    reciboContenidoEl.innerHTML = '';
  });

  document.getElementById('boton-cerrar-recibo-x').addEventListener('click', () => {
    botonNuevaVenta.click();
  });

  fondoRecibo.addEventListener('click', (e) => {
    if (e.target === fondoRecibo) {
      fondoRecibo.classList.add('oculto');
    }
  });

  await cargarProductos();
  await cargarClientes();
  renderizarCarrito();
});
