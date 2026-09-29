/**
 * reportes.js — Reportes de ventas sin gráficas (pages/reportes.html).
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

  const cuerpoTablaEl = document.getElementById('cuerpo-tabla-reportes');
  const estadoVacioEl = document.getElementById('estado-vacio-reportes');
  const tablaEnvoltorioEl = document.querySelector('.tabla-reportes-envoltorio');
  const pestanas = document.querySelectorAll('.pestana-periodo');
  const tituloPeriodoTablaEl = document.getElementById('titulo-periodo-tabla');
  const inputFiltroDia = document.getElementById('filtro-fecha-dia');
  const inputFiltroSemana = document.getElementById('filtro-fecha-semana');
  const inputFiltroMes = document.getElementById('filtro-fecha-mes');
  const selectFiltroAnio = document.getElementById('filtro-fecha-anio');
  const divFiltroRango = document.getElementById('filtro-rango-fechas');
  const inputRangoDesde = document.getElementById('filtro-rango-desde');
  const inputRangoHasta = document.getElementById('filtro-rango-hasta');

  const etiquetasMetodoPago = {
    efectivo: 'Efectivo',
    tarjeta: 'Tarjeta',
    deposito: 'Depósito',
  };

  const cacheUsuarios = new Map();

  const esAdmin = Auth.esAdministrador(sesion);
  if (esAdmin) {
    document.getElementById('tarjeta-semana').classList.remove('oculto');
    document.getElementById('tarjeta-mes').classList.remove('oculto');
    document.getElementById('tarjeta-ganancia').classList.remove('oculto');
    document.querySelectorAll('.pestana-periodo').forEach((b) => b.classList.remove('oculto'));
  }

  let periodoActual = 'dia';
  let todasLasVentas = [];
  let todoElDetalle = [];
  let mapaCostoPorProducto = new Map();

  // Valores elegidos en los controles de filtro específico (se recuerdan
  // aunque el usuario cambie de pestaña y vuelva).
  let fechaDiaSeleccionada = null; // Date
  let fechaSemanaSeleccionada = null; // Date (cualquier día dentro de la semana)
  let mesSeleccionado = null; // { anio, mes(0-11) }
  let anioSeleccionado = null; // number
  let rangoDesdeSeleccionado = null; // Date
  let rangoHastaSeleccionado = null; // Date

  function formatearPrecio(precio) {
    return 'Q ' + precio.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function inicioDeHoy() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function finDeHoy() {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  }

  function inicioDeSemana() {
    // Semana calendario lunes-domingo.
    const d = inicioDeHoy();
    const diaSemana = d.getDay(); // 0=domingo, 1=lunes, ... 6=sábado
    const diff = diaSemana === 0 ? 6 : diaSemana - 1; // días desde el lunes
    d.setDate(d.getDate() - diff);
    return d;
  }

  function finDeSemana() {
    const inicio = inicioDeSemana();
    const d = new Date(inicio);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  function inicioDeMes() {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function finDeMes() {
    const d = new Date();
    d.setMonth(d.getMonth() + 1, 0); // último día del mes actual
    d.setHours(23, 59, 59, 999);
    return d;
  }

  // --- Helpers para filtros de periodo específico (parametrizados) ---

  function inicioDeDia(fecha) {
    const d = new Date(fecha);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function finDeDia(fecha) {
    const d = new Date(fecha);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  function inicioDeSemanaDesde(fecha) {
    const d = inicioDeDia(fecha);
    const diaSemana = d.getDay(); // 0=domingo, 1=lunes, ... 6=sábado
    const diff = diaSemana === 0 ? 6 : diaSemana - 1; // días desde el lunes
    d.setDate(d.getDate() - diff);
    return d;
  }

  function finDeSemanaDesde(fecha) {
    const inicio = inicioDeSemanaDesde(fecha);
    const d = new Date(inicio);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  function inicioDeMesDesde(anio, mes) {
    const d = new Date(anio, mes, 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function finDeMesDesde(anio, mes) {
    const d = new Date(anio, mes + 1, 0);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  function inicioDeAnio(anio) {
    const d = new Date(anio, 0, 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function finDeAnio(anio) {
    const d = new Date(anio, 11, 31);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  // Parsea un valor "yyyy-mm-dd" de <input type="date"> como fecha LOCAL
  // (evita el corrimiento de un día que causa `new Date('yyyy-mm-dd')`,
  // que interpreta el string como UTC).
  function parsearFechaLocal(valor) {
    const [anio, mes, dia] = valor.split('-').map(Number);
    return new Date(anio, mes - 1, dia);
  }

  const nombresMes = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];

  function formatearFechaCorta(fecha) {
    return fecha.toLocaleDateString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  let ventasActivas = [];

  function filtrarPorRango(ventas, inicio, fin) {
    const inicioMs = inicio.getTime();
    const finMs = fin.getTime();
    return ventas.filter((v) => v.fecha >= inicioMs && v.fecha <= finMs);
  }

  function sumarTotales(ventas) {
    return ventas.reduce((acc, v) => acc + (v.total || 0), 0);
  }

  function actualizarTarjetasResumen() {
    const ventasHoy = filtrarPorRango(ventasActivas, inicioDeHoy(), finDeHoy());
    const ventasSemana = filtrarPorRango(ventasActivas, inicioDeSemana(), finDeSemana());
    const ventasMes = filtrarPorRango(ventasActivas, inicioDeMes(), finDeMes());

    document.getElementById('resumen-hoy-total').textContent = formatearPrecio(sumarTotales(ventasHoy));
    document.getElementById('resumen-hoy-cantidad').textContent = `${ventasHoy.length} venta${ventasHoy.length === 1 ? '' : 's'}`;

    document.getElementById('resumen-semana-total').textContent = formatearPrecio(sumarTotales(ventasSemana));
    document.getElementById('resumen-semana-cantidad').textContent = `${ventasSemana.length} venta${ventasSemana.length === 1 ? '' : 's'}`;

    document.getElementById('resumen-mes-total').textContent = formatearPrecio(sumarTotales(ventasMes));
    document.getElementById('resumen-mes-cantidad').textContent = `${ventasMes.length} venta${ventasMes.length === 1 ? '' : 's'}`;
  }

  function actualizarResumenMetodosPago() {
    const ventasHoy = filtrarPorRango(ventasActivas, inicioDeHoy(), finDeHoy());
    const porMetodo = { efectivo: 0, tarjeta: 0, deposito: 0 };
    ventasHoy.forEach((v) => {
      if (porMetodo[v.metodoPago] !== undefined) porMetodo[v.metodoPago] += v.total || 0;
    });
    document.getElementById('resumen-efectivo-total').textContent = formatearPrecio(porMetodo.efectivo);
    document.getElementById('resumen-tarjeta-total').textContent = formatearPrecio(porMetodo.tarjeta);
    document.getElementById('resumen-deposito-total').textContent = formatearPrecio(porMetodo.deposito);
  }

  function calcularGananciaDelPeriodo() {
    const ventasPeriodo = obtenerVentasDelPeriodo();
    const idsVentas = new Set(ventasPeriodo.map((v) => v.id));
    let ganancia = 0;
    todoElDetalle.forEach((linea) => {
      if (!idsVentas.has(linea.ventaId)) return;
      const costoUnitario = mapaCostoPorProducto.get(linea.productoId);
      const ingresoLinea = linea.subtotal || 0;
      // Si el producto no tiene costo registrado, no se puede saber su
      // ganancia real — se cuenta como 0 de costo (ganancia = todo el ingreso)
      // en vez de inventar un número; el administrador puede completar los
      // costos en Productos para que esta cifra sea exacta.
      const costoLinea = costoUnitario != null ? costoUnitario * (linea.cantidad || 0) : 0;
      ganancia += ingresoLinea - costoLinea;
    });

    // El cobro de envío a domicilio es ingreso casi puro (no hay costo de
    // producto asociado), así que también cuenta como ganancia.
    ventasPeriodo.forEach((v) => {
      if (v.esDomicilio && v.costoEnvio) ganancia += v.costoEnvio;
    });
    return ganancia;
  }

  function actualizarTarjetaGanancia() {
    if (!esAdmin) return;
    document.getElementById('resumen-ganancia-total').textContent = formatearPrecio(calcularGananciaDelPeriodo());
  }

  // Devuelve { inicio, fin, etiqueta } según el filtro específico elegido
  // (periodoActual). Este rango es el que aplica a la TABLA y a la
  // GANANCIA del periodo — las tarjetas de resumen de arriba (Hoy/Semana/Mes)
  // siempre usan el día/semana/mes actual real, sin importar este filtro.
  function obtenerRangoFiltroActual() {
    if (periodoActual === 'dia') {
      return { inicio: inicioDeHoy(), fin: finDeHoy(), etiqueta: 'de hoy' };
    }
    if (periodoActual === 'dia-especifico') {
      const fecha = fechaDiaSeleccionada || new Date();
      return {
        inicio: inicioDeDia(fecha),
        fin: finDeDia(fecha),
        etiqueta: `del ${formatearFechaCorta(fecha)}`,
      };
    }
    if (periodoActual === 'semana-especifica') {
      const fecha = fechaSemanaSeleccionada || new Date();
      const inicio = inicioDeSemanaDesde(fecha);
      const fin = finDeSemanaDesde(fecha);
      return {
        inicio,
        fin,
        etiqueta: `de la semana del ${formatearFechaCorta(inicio)} al ${formatearFechaCorta(fin)}`,
      };
    }
    if (periodoActual === 'mes-especifico') {
      const { anio, mes } = mesSeleccionado || { anio: new Date().getFullYear(), mes: new Date().getMonth() };
      return {
        inicio: inicioDeMesDesde(anio, mes),
        fin: finDeMesDesde(anio, mes),
        etiqueta: `de ${nombresMes[mes]} ${anio}`,
      };
    }
    if (periodoActual === 'anio-especifico') {
      const anio = anioSeleccionado || new Date().getFullYear();
      return { inicio: inicioDeAnio(anio), fin: finDeAnio(anio), etiqueta: `del año ${anio}` };
    }
    if (periodoActual === 'rango') {
      const desde = rangoDesdeSeleccionado || inicioDeHoy();
      const hasta = rangoHastaSeleccionado || finDeHoy();
      return {
        inicio: inicioDeDia(desde),
        fin: finDeDia(hasta),
        etiqueta: `del ${formatearFechaCorta(desde)} al ${formatearFechaCorta(hasta)}`,
      };
    }
    // Fallback: hoy.
    return { inicio: inicioDeHoy(), fin: finDeHoy(), etiqueta: 'de hoy' };
  }

  function obtenerVentasDelPeriodo() {
    const { inicio, fin } = obtenerRangoFiltroActual();
    return filtrarPorRango(ventasActivas, inicio, fin);
  }

  function obtenerVentasDelPeriodoParaTabla() {
    const { inicio, fin } = obtenerRangoFiltroActual();
    return filtrarPorRango(todasLasVentas, inicio, fin);
  }

  function actualizarTituloPeriodoTabla() {
    const { etiqueta } = obtenerRangoFiltroActual();
    tituloPeriodoTablaEl.textContent = `Ventas ${etiqueta}`;
  }

  async function obtenerNombreCajero(usuarioId) {
    if (cacheUsuarios.has(usuarioId)) {
      return cacheUsuarios.get(usuarioId);
    }
    const usuario = await DB.obtenerPorId(DB.STORES.USUARIOS, usuarioId);
    const nombre = usuario ? usuario.nombre : 'Desconocido';
    cacheUsuarios.set(usuarioId, nombre);
    return nombre;
  }

  function escaparHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
  }

  async function cancelarVenta(venta) {
    const confirmacion = window.confirm(
      `¿Cancelar la venta N° ${venta.numeroRecibo} por ${formatearPrecio(venta.total || 0)}?\nEsta acción no se puede deshacer.`
    );
    if (!confirmacion) return;

    const motivo = window.prompt('Motivo de la cancelación (opcional):', '') || '';

    const ventaActualizada = {
      ...venta,
      cancelada: true,
      fechaCancelacion: Date.now(),
      motivoCancelacion: motivo,
      canceladaPor: sesion.nombre,
    };

    await DB.actualizar(DB.STORES.VENTAS, ventaActualizada);

    const indice = todasLasVentas.findIndex((v) => v.id === venta.id);
    if (indice !== -1) todasLasVentas[indice] = ventaActualizada;
    ventasActivas = todasLasVentas.filter((v) => !v.cancelada);

    actualizarTarjetasResumen();
    actualizarResumenMetodosPago();
    if (esAdmin) actualizarTarjetaGanancia();
    await renderizarTabla();
  }

  async function renderizarTabla() {
    const ventasPeriodo = obtenerVentasDelPeriodoParaTabla().slice().sort((a, b) => b.fecha - a.fecha);

    cuerpoTablaEl.innerHTML = '';

    if (ventasPeriodo.length === 0) {
      estadoVacioEl.classList.remove('oculto');
      tablaEnvoltorioEl.classList.add('oculto');
      return;
    }

    estadoVacioEl.classList.add('oculto');
    tablaEnvoltorioEl.classList.remove('oculto');

    for (const venta of ventasPeriodo) {
      const nombreCajero = await obtenerNombreCajero(venta.usuarioId);
      const fechaFormateada = new Date(venta.fecha).toLocaleString('es-GT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const etiquetaMetodo = etiquetasMetodoPago[venta.metodoPago] ||
        (venta.metodoPago ? venta.metodoPago.charAt(0).toUpperCase() + venta.metodoPago.slice(1) : '—');
      const etiquetaEntrega = venta.esDomicilio ? '🛵 Domicilio' : '🏬 Mostrador';
      const etiquetaCliente = venta.clienteNombre && venta.clienteNombre.trim() !== ''
        ? escaparHtml(venta.clienteNombre)
        : '—';

      const fila = document.createElement('tr');
      if (venta.cancelada) fila.classList.add('fila-venta-cancelada');

      let celdaAccion;
      if (venta.cancelada) {
        const motivoTexto = venta.motivoCancelacion ? ` — ${venta.motivoCancelacion}` : '';
        const tituloTexto = `Cancelada por ${venta.canceladaPor || 'desconocido'}${motivoTexto}`;
        celdaAccion = `<span class="etiqueta-venta-cancelada" title="${escaparHtml(tituloTexto)}">Cancelada</span>`;
      } else {
        celdaAccion = `<button type="button" class="boton-cancelar-venta" data-venta-id="${venta.id}">🗑️ Cancelar</button>`;
      }

      fila.innerHTML = `
        <td>${venta.numeroRecibo}</td>
        <td>${fechaFormateada}</td>
        <td>${escaparHtml(nombreCajero)}</td>
        <td>${etiquetaMetodo}</td>
        <td>${etiquetaEntrega}</td>
        <td>${etiquetaCliente}</td>
        <td>${formatearPrecio(venta.total || 0)}</td>
        <td>${celdaAccion}</td>
      `;

      if (!venta.cancelada) {
        const boton = fila.querySelector('.boton-cancelar-venta');
        boton.addEventListener('click', () => cancelarVenta(venta));
      }

      cuerpoTablaEl.appendChild(fila);
    }
  }

  function mostrarControlDeFiltro() {
    inputFiltroDia.classList.add('oculto');
    inputFiltroSemana.classList.add('oculto');
    inputFiltroMes.classList.add('oculto');
    selectFiltroAnio.classList.add('oculto');
    divFiltroRango.classList.add('oculto');

    if (periodoActual === 'dia-especifico') inputFiltroDia.classList.remove('oculto');
    if (periodoActual === 'semana-especifica') inputFiltroSemana.classList.remove('oculto');
    if (periodoActual === 'mes-especifico') inputFiltroMes.classList.remove('oculto');
    if (periodoActual === 'anio-especifico') selectFiltroAnio.classList.remove('oculto');
    if (periodoActual === 'rango') divFiltroRango.classList.remove('oculto');
  }

  async function refrescarVistaFiltrada() {
    actualizarTituloPeriodoTabla();
    await renderizarTabla();
    if (esAdmin) actualizarTarjetaGanancia();
  }

  pestanas.forEach((boton) => {
    boton.addEventListener('click', () => {
      pestanas.forEach((b) => b.classList.remove('activo'));
      boton.classList.add('activo');
      periodoActual = boton.dataset.periodo;
      mostrarControlDeFiltro();
      refrescarVistaFiltrada();
    });
  });

  inputFiltroDia.addEventListener('change', () => {
    if (!inputFiltroDia.value) return;
    fechaDiaSeleccionada = parsearFechaLocal(inputFiltroDia.value);
    refrescarVistaFiltrada();
  });

  inputFiltroSemana.addEventListener('change', () => {
    if (!inputFiltroSemana.value) return;
    fechaSemanaSeleccionada = parsearFechaLocal(inputFiltroSemana.value);
    refrescarVistaFiltrada();
  });

  inputFiltroMes.addEventListener('change', () => {
    if (!inputFiltroMes.value) return;
    const [anio, mes] = inputFiltroMes.value.split('-').map(Number);
    mesSeleccionado = { anio, mes: mes - 1 };
    refrescarVistaFiltrada();
  });

  inputRangoDesde.addEventListener('change', () => {
    if (!inputRangoDesde.value) return;
    rangoDesdeSeleccionado = parsearFechaLocal(inputRangoDesde.value);
    if (rangoHastaSeleccionado && rangoDesdeSeleccionado > rangoHastaSeleccionado) {
      rangoHastaSeleccionado = rangoDesdeSeleccionado;
      inputRangoHasta.value = inputRangoDesde.value;
    }
    refrescarVistaFiltrada();
  });

  inputRangoHasta.addEventListener('change', () => {
    if (!inputRangoHasta.value) return;
    rangoHastaSeleccionado = parsearFechaLocal(inputRangoHasta.value);
    if (rangoDesdeSeleccionado && rangoHastaSeleccionado < rangoDesdeSeleccionado) {
      rangoDesdeSeleccionado = rangoHastaSeleccionado;
      inputRangoDesde.value = inputRangoHasta.value;
    }
    refrescarVistaFiltrada();
  });

  selectFiltroAnio.addEventListener('change', () => {
    anioSeleccionado = Number(selectFiltroAnio.value);
    refrescarVistaFiltrada();
  });

  function inicializarControlesDeFiltro() {
    const hoy = new Date();
    const isoHoy = hoy.toISOString ? new Date(hoy.getTime() - hoy.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : '';

    fechaDiaSeleccionada = hoy;
    fechaSemanaSeleccionada = hoy;
    mesSeleccionado = { anio: hoy.getFullYear(), mes: hoy.getMonth() };
    anioSeleccionado = hoy.getFullYear();

    inputFiltroDia.value = isoHoy;
    inputFiltroSemana.value = isoHoy;
    rangoDesdeSeleccionado = hoy;
    rangoHastaSeleccionado = hoy;
    inputRangoDesde.value = isoHoy;
    inputRangoHasta.value = isoHoy;
    const mesTexto = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    inputFiltroMes.value = mesTexto;

    // Años con al menos una venta registrada, más el año actual real.
    const anioActualReal = new Date().getFullYear();
    const anios = new Set([anioActualReal]);
    todasLasVentas.forEach((v) => anios.add(new Date(v.fecha).getFullYear()));
    const aniosOrdenados = Array.from(anios).sort((a, b) => b - a);

    selectFiltroAnio.innerHTML = '';
    aniosOrdenados.forEach((anio) => {
      const opcion = document.createElement('option');
      opcion.value = String(anio);
      opcion.textContent = String(anio);
      selectFiltroAnio.appendChild(opcion);
    });
    selectFiltroAnio.value = String(anioActualReal);

    mostrarControlDeFiltro();
  }

  async function cargarDatos() {
    todasLasVentas = await DB.obtenerTodos(DB.STORES.VENTAS);
    ventasActivas = todasLasVentas.filter((v) => !v.cancelada);
    actualizarTarjetasResumen();
    actualizarResumenMetodosPago();

    inicializarControlesDeFiltro();
    actualizarTituloPeriodoTabla();

    if (esAdmin) {
      const [detalle, productos] = await Promise.all([
        DB.obtenerTodos(DB.STORES.DETALLE_VENTA),
        DB.obtenerTodos(DB.STORES.PRODUCTOS),
      ]);
      todoElDetalle = detalle;
      mapaCostoPorProducto = new Map(productos.map((p) => [p.id, p.costo != null ? p.costo : null]));
      actualizarTarjetaGanancia();
    }

    await renderizarTabla();
  }

  await cargarDatos();
});
