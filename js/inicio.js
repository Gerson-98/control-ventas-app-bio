/**
 * inicio.js — Pantalla de inicio con botones grandes (pages/inicio.html).
 */

document.addEventListener('DOMContentLoaded', async () => {
  const sesion = Auth.requerirSesion('../index.html');
  if (!sesion) return;

  document.getElementById('nombre-usuario-activo').textContent = sesion.nombre;

  if (typeof VERSION_SW !== 'undefined') {
    document.getElementById('inicio-version').textContent = `Versión ${VERSION_SW}`;
  }

  if (Auth.esAdministrador(sesion)) {
    document.getElementById('boton-inicio-respaldo').classList.remove('oculto');
    document.getElementById('boton-inicio-usuarios').classList.remove('oculto');
    mostrarAvisoRespaldoSiHaceFalta();
    Auth.hayPinsConfigurados()
      .then((hay) => {
        if (!hay) document.getElementById('aviso-codigos').classList.remove('oculto');
      })
      .catch(() => {});
  }

  document.getElementById('boton-salir').addEventListener('click', () => {
    Auth.logout();
    window.location.href = '../index.html';
  });

  await cargarResumenHoy();
});

function mostrarAvisoRespaldoSiHaceFalta() {
  const DIAS_LIMITE = 7;
  const avisoEl = document.getElementById('aviso-respaldo');
  const textoEl = document.getElementById('aviso-respaldo-texto');
  const botonCerrarEl = document.getElementById('boton-cerrar-aviso-respaldo');
  const ultimoRespaldoTexto = localStorage.getItem('ventpro_ultimo_respaldo');

  const ocultoHastaTexto = localStorage.getItem('ventpro_aviso_respaldo_oculto_hasta');
  if (ocultoHastaTexto && Date.now() < Number(ocultoHastaTexto)) {
    return;
  }

  let debeMostrarse = false;
  if (!ultimoRespaldoTexto) {
    textoEl.textContent = 'Todavía no has hecho ningún respaldo de tus datos. Hazlo cada semana para no perder tu información.';
    debeMostrarse = true;
  } else {
    const diasDesdeRespaldo = Math.floor((Date.now() - Number(ultimoRespaldoTexto)) / (1000 * 60 * 60 * 24));
    if (diasDesdeRespaldo >= DIAS_LIMITE) {
      textoEl.textContent = `Tu último respaldo fue hace ${diasDesdeRespaldo} días. Es buena idea hacer uno nuevo.`;
      debeMostrarse = true;
    }
  }

  if (!debeMostrarse) return;

  avisoEl.classList.remove('oculto');
  botonCerrarEl.addEventListener('click', () => {
    avisoEl.classList.add('oculto');
    const unDiaEnMs = 24 * 60 * 60 * 1000;
    localStorage.setItem('ventpro_aviso_respaldo_oculto_hasta', String(Date.now() + unDiaEnMs));
  });
}

function formatearMoneda(monto) {
  return 'Q ' + monto.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function cargarResumenHoy() {
  const fechaEl = document.getElementById('resumen-fecha-hoy');
  fechaEl.textContent = new Date().toLocaleDateString('es-GT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  try {
    const todasLasCajas = await DB.obtenerTodos(DB.STORES.CAJAS);
    const hayAbierta = todasLasCajas.some((c) => !c.cerrada);
    const estadoCajaEl = document.getElementById('resumen-estado-caja');
    estadoCajaEl.textContent = hayAbierta ? '🟢 Abierta' : '🔒 Cerrada';
    estadoCajaEl.classList.toggle('resumen-hoy-inicio__valor--ok', hayAbierta);
    estadoCajaEl.classList.toggle('resumen-hoy-inicio__valor--alerta', !hayAbierta);

    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);
    const finHoy = new Date();
    finHoy.setHours(23, 59, 59, 999);

    const todasLasVentas = await DB.obtenerTodos(DB.STORES.VENTAS);
    const ventasHoy = todasLasVentas.filter(
      (v) => !v.cancelada && v.fecha >= inicioHoy.getTime() && v.fecha <= finHoy.getTime()
    );
    const totalHoy = ventasHoy.reduce((acc, v) => acc + (v.total || 0), 0);
    document.getElementById('resumen-ventas-hoy').textContent = formatearMoneda(totalHoy);
  } catch (err) {
    console.error(err);
  }
}
