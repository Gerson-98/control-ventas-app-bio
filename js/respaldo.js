/**
 * respaldo.js — Exportar/importar un respaldo completo de la base de datos
 * (pages/respaldo.html). Solo accesible para administradores: el archivo
 * incluye datos sensibles (hashes de contraseñas de usuarios).
 */

// Orden en el que se exportan/importan los stores. Al importar se respeta
// este orden para mantener prolijas las relaciones entre stores (aunque
// IndexedDB no impone claves foráneas).
const ORDEN_STORES = ['usuarios', 'productos', 'clientes', 'bancos', 'cajas', 'ventas', 'detalle_venta', 'gastos'];
// Stores que todo respaldo debe traer; 'bancos' se agregó después, así que los
// respaldos anteriores sin ese store siguen siendo válidos.
const STORES_REQUERIDOS = ['usuarios', 'productos', 'clientes', 'cajas', 'ventas', 'detalle_venta', 'gastos'];

document.addEventListener('DOMContentLoaded', async () => {
  const sesion = Auth.requerirAdmin('../index.html', 'inicio.html');
  if (!sesion) return;

  document.getElementById('nombre-usuario-activo').textContent = sesion.nombre;
  document.getElementById('boton-salir').addEventListener('click', () => {
    Auth.logout();
    window.location.href = '../index.html';
  });

  const resumenRespaldo = document.getElementById('resumen-respaldo');
  const mensajeExportar = document.getElementById('mensaje-exportar');
  const botonExportar = document.getElementById('boton-exportar');

  const mensajeImportar = document.getElementById('mensaje-importar');
  const campoArchivo = document.getElementById('archivo-respaldo');
  const botonImportar = document.getElementById('boton-importar');

  await cargarResumen();

  campoArchivo.addEventListener('change', () => {
    botonImportar.disabled = !campoArchivo.files || campoArchivo.files.length === 0;
    ocultarMensaje(mensajeImportar);
  });

  botonExportar.addEventListener('click', async () => {
    ocultarMensaje(mensajeExportar);
    botonExportar.disabled = true;
    try {
      await exportarRespaldo();
      mostrarMensaje(mensajeExportar, 'Respaldo descargado. Guárdalo en un lugar seguro (correo, Drive, etc.).', false);
    } catch (err) {
      console.error(err);
      mostrarMensaje(mensajeExportar, 'No se pudo generar el respaldo.', true);
    } finally {
      botonExportar.disabled = false;
    }
  });

  botonImportar.addEventListener('click', async () => {
    ocultarMensaje(mensajeImportar);
    const archivo = campoArchivo.files && campoArchivo.files[0];
    if (!archivo) return;

    const confirmado = window.confirm(
      'Esto va a BORRAR todos los datos actuales de la app (usuarios, ' +
      'productos, clientes, bancos, ventas, cajas y gastos) y los va a reemplazar por los ' +
      'del archivo elegido. Esta acción no se puede deshacer.\n\n' +
      '¿Seguro que quieres continuar?'
    );
    if (!confirmado) return;

    botonImportar.disabled = true;
    try {
      const texto = await archivo.text();
      let json;
      try {
        json = JSON.parse(texto);
      } catch (err) {
        mostrarMensaje(mensajeImportar, 'Este archivo no parece un respaldo válido de Los Biónicos (JSON inválido).', true);
        return;
      }

      if (!validarFormatoRespaldo(json)) {
        mostrarMensaje(mensajeImportar, 'Este archivo no parece un respaldo válido de Los Biónicos.', true);
        return;
      }

      await restaurarRespaldo(json);

      mostrarMensaje(
        mensajeImportar,
        'Respaldo restaurado con éxito. Cierra sesión y vuelve a entrar (o recarga la app) para ver los datos actualizados.',
        false
      );
      campoArchivo.value = '';
      await cargarResumen();
    } catch (err) {
      console.error(err);
      mostrarMensaje(mensajeImportar, 'Ocurrió un error al restaurar el respaldo. Es posible que los datos hayan quedado a medio importar.', true);
    } finally {
      botonImportar.disabled = !campoArchivo.files || campoArchivo.files.length === 0;
    }
  });

  async function cargarResumen() {
    try {
      const conteos = await Promise.all(ORDEN_STORES.map((store) => DB.obtenerTodos(store)));
      const etiquetas = {
        usuarios: 'usuarios',
        productos: 'productos',
        clientes: 'clientes',
        bancos: 'bancos',
        ventas: 'ventas',
        detalle_venta: 'renglones de detalle de venta',
        cajas: 'cajas',
        gastos: 'gastos',
      };
      const partes = ORDEN_STORES.map((store, i) => `${conteos[i].length} ${etiquetas[store]}`);
      resumenRespaldo.textContent = partes.join(', ') + '.';
    } catch (err) {
      console.error(err);
      resumenRespaldo.textContent = 'No se pudo calcular el resumen de datos.';
    }
  }
});

/**
 * Convierte un Blob a una cadena dataURL (base64) usando FileReader.
 */
function blobADataUrl(blob) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = () => reject(lector.error);
    lector.readAsDataURL(blob);
  });
}

/**
 * Lee todos los stores, convierte los Blobs de productos a base64 y arma
 * el objeto JSON del respaldo, dispara la descarga y limpia la URL temporal.
 */
async function exportarRespaldo() {
  const datos = {};

  for (const store of ORDEN_STORES) {
    const registros = await DB.obtenerTodos(store);

    if (store === 'productos') {
      // No mutar los objetos originales de IndexedDB: se trabaja sobre copias.
      const registrosSerializables = [];
      for (const producto of registros) {
        const copia = { ...producto };
        if (copia.imagenBlob) {
          copia.imagenBlob = await blobADataUrl(copia.imagenBlob);
          copia.imagenBlobEsBase64 = true;
        }
        registrosSerializables.push(copia);
      }
      datos[store] = registrosSerializables;
    } else {
      datos[store] = registros;
    }
  }

  const respaldo = {
    app: 'Los Biónicos',
    version: 1,
    fechaExportacion: Date.now(),
    datos,
  };

  const blob = new Blob([JSON.stringify(respaldo, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `respaldo-los-bionicos-${nombreFechaHoy()}.json`;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);

  URL.revokeObjectURL(url);

  localStorage.setItem('ventpro_ultimo_respaldo', String(Date.now()));
}

function nombreFechaHoy() {
  const ahora = new Date();
  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/**
 * Valida que el JSON cargado tenga la forma mínima esperada de un respaldo.
 */
function validarFormatoRespaldo(json) {
  if (!json || typeof json !== 'object') return false;
  if (!json.datos || typeof json.datos !== 'object') return false;
  return STORES_REQUERIDOS.every((store) => Array.isArray(json.datos[store]));
}

/**
 * Borra todo el contenido actual de cada store e inserta en su lugar los
 * registros del respaldo, conservando sus ids originales (usa DB.actualizar,
 * que hace store.put y respeta la key explícita aunque el store sea
 * autoIncrement).
 */
async function restaurarRespaldo(json) {
  for (const store of ORDEN_STORES) {
    // 1. Vaciar el store actual.
    const actuales = await DB.obtenerTodos(store);
    for (const registro of actuales) {
      await DB.eliminar(store, registro.id);
    }

    // 2. Insertar los registros del respaldo, conservando su id original.
    const registrosRespaldo = json.datos[store] || [];
    for (const registro of registrosRespaldo) {
      const copia = { ...registro };

      if (store === 'productos' && copia.imagenBlob && copia.imagenBlobEsBase64) {
        try {
          const respuesta = await fetch(copia.imagenBlob);
          copia.imagenBlob = await respuesta.blob();
        } catch (err) {
          console.error('No se pudo convertir la imagen del producto', copia.id, err);
          copia.imagenBlob = null;
        }
        delete copia.imagenBlobEsBase64;
      }

      await DB.actualizar(store, copia);
    }
  }
}

function mostrarMensaje(elemento, texto, esError) {
  elemento.textContent = texto;
  elemento.classList.add('visible');
  elemento.classList.toggle('mensaje-exito', !esError);
  elemento.classList.toggle('mensaje-error', esError !== false);
}

function ocultarMensaje(elemento) {
  elemento.textContent = '';
  elemento.classList.remove('visible');
}
