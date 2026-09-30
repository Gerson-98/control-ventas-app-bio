/**
 * db.js — Apertura de IndexedDB y helpers CRUD genéricos.
 * Un solo módulo controla el esquema; todas las páginas importan de aquí.
 */

const DB_NAME = 'VentProDB';
const DB_VERSION = 4;

const STORES = {
  USUARIOS: 'usuarios',
  PRODUCTOS: 'productos',
  VENTAS: 'ventas',
  DETALLE_VENTA: 'detalle_venta',
  CAJAS: 'cajas',
  GASTOS: 'gastos',
  CLIENTES: 'clientes',
};

let dbPromise = null;

function abrirDB() {
  // Se cachea la PROMESA (no el resultado ya resuelto): si varias llamadas
  // llegan antes de que termine de abrir la conexión —muy común, ya que
  // casi cada página dispara varias peticiones en paralelo al cargar—,
  // todas deben compartir la misma apertura en vez de crear conexiones
  // duplicadas a la base de datos.
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORES.USUARIOS)) {
        const usuarios = db.createObjectStore(STORES.USUARIOS, {
          keyPath: 'id',
          autoIncrement: true,
        });
        usuarios.createIndex('usuario', 'usuario', { unique: true });
      }

      if (!db.objectStoreNames.contains(STORES.PRODUCTOS)) {
        const productos = db.createObjectStore(STORES.PRODUCTOS, {
          keyPath: 'id',
          autoIncrement: true,
        });
        productos.createIndex('categoria', 'categoria', { unique: false });
        productos.createIndex('activo', 'activo', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.VENTAS)) {
        const ventas = db.createObjectStore(STORES.VENTAS, {
          keyPath: 'id',
          autoIncrement: true,
        });
        ventas.createIndex('numeroRecibo', 'numeroRecibo', { unique: true });
        ventas.createIndex('fecha', 'fecha', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.DETALLE_VENTA)) {
        const detalle = db.createObjectStore(STORES.DETALLE_VENTA, {
          keyPath: 'id',
          autoIncrement: true,
        });
        detalle.createIndex('ventaId', 'ventaId', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.CAJAS)) {
        // Turno de caja: se abre con un monto inicial y se cierra al
        // terminar el día, contando el efectivo real en el cajón.
        // { id, usuarioId, fechaApertura, montoInicial,
        //   fechaCierre, montoContado, cerrada }
        const cajas = db.createObjectStore(STORES.CAJAS, {
          keyPath: 'id',
          autoIncrement: true,
        });
        cajas.createIndex('cerrada', 'cerrada', { unique: false });
        cajas.createIndex('fechaApertura', 'fechaApertura', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.GASTOS)) {
        // Movimientos de caja fuera de una venta: egresos (compra de
        // insumos, pago a repartidor) o ingresos de otra índole (aporte de
        // capital, cobro de algo externo, etc.)
        // { id, fecha, usuarioId, cajaId, descripcion, monto, tipo }
        // tipo: 'gasto' | 'ingreso' — los registros viejos sin este campo
        // se tratan como 'gasto' (así se guardaban antes de este cambio).
        const gastos = db.createObjectStore(STORES.GASTOS, {
          keyPath: 'id',
          autoIncrement: true,
        });
        gastos.createIndex('fecha', 'fecha', { unique: false });
        gastos.createIndex('cajaId', 'cajaId', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.CLIENTES)) {
        // Cliente opcional para asociar a una venta (mostrador o domicilio).
        // { id, nombre, telefono, telefonoAlterno, direccion, notas, creadoEn }
        const clientes = db.createObjectStore(STORES.CLIENTES, {
          keyPath: 'id',
          autoIncrement: true,
        });
        clientes.createIndex('nombre', 'nombre', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      // Si falla, se limpia la promesa cacheada: de lo contrario, un fallo
      // pasajero (ej. el usuario negó el permiso una vez) dejaría a la app
      // rechazando la conexión para siempre, incluso en intentos futuros.
      dbPromise = null;
      reject(event.target.error);
    };
  });

  return dbPromise;
}

function promesaDeRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const DB = {
  STORES,

  agregar(storeName, objeto) {
    return abrirDB().then((db) => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.add(objeto);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    });
  },

  actualizar(storeName, objeto) {
    return abrirDB().then((db) => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.put(objeto);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    });
  },

  eliminar(storeName, id) {
    return abrirDB().then((db) => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    });
  },

  obtenerPorId(storeName, id) {
    return abrirDB().then((db) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      return promesaDeRequest(store.get(id));
    });
  },

  obtenerTodos(storeName) {
    return abrirDB().then((db) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      return promesaDeRequest(store.getAll());
    });
  },

  obtenerPorIndice(storeName, indexName, valor) {
    return abrirDB().then((db) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      return promesaDeRequest(index.getAll(valor));
    });
  },

  obtenerUnoPorIndice(storeName, indexName, valor) {
    return abrirDB().then((db) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      return promesaDeRequest(index.get(valor));
    });
  },

  contar(storeName) {
    return abrirDB().then((db) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      return promesaDeRequest(store.count());
    });
  },
};

window.DB = DB;
