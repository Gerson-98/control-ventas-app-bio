/**
 * aviso-respaldo.js — Franja discreta que recuerda hacer el respaldo cuando
 * pasaron 7 días o más (o nunca se hizo). Se muestra en Vender y Caja, no
 * bloquea nada y se puede cerrar (vuelve a salir al día siguiente).
 * Solo el administrador puede hacer el respaldo; al cajero se le pide
 * avisar al administrador.
 */
(() => {
  const DIAS_LIMITE = 7;
  const UN_DIA_MS = 24 * 60 * 60 * 1000;
  const CLAVE_OCULTO = 'ventpro_aviso_respaldo_franja_oculto_hasta';

  function leer(clave) {
    try {
      return localStorage.getItem(clave);
    } catch (err) {
      return null;
    }
  }

  function motivo() {
    const ultimo = leer('ventpro_ultimo_respaldo');
    if (!ultimo) return 'Aún no hay respaldo de tus datos.';
    const dias = Math.floor((Date.now() - Number(ultimo)) / UN_DIA_MS);
    return dias >= DIAS_LIMITE ? `Último respaldo hace ${dias} días.` : null;
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (typeof Auth === 'undefined') return;
    const sesion = Auth.obtenerSesion();
    if (!sesion) return;

    const ocultoHasta = leer(CLAVE_OCULTO);
    if (ocultoHasta && Date.now() < Number(ocultoHasta)) return;

    const texto = motivo();
    if (!texto) return;

    const main = document.querySelector('main');
    if (!main) return;

    const esAdmin = Auth.esAdministrador(sesion);
    const franja = document.createElement('div');
    franja.setAttribute('role', 'status');
    franja.style.cssText =
      'display:flex;align-items:center;gap:10px;margin:0 0 12px;padding:6px 12px;' +
      'font-size:12px;border-radius:8px;background:rgba(0,0,0,.05);color:inherit;opacity:.85;';

    const mensaje = document.createElement('span');
    mensaje.style.flex = '1';
    mensaje.textContent = `☁️ ${texto} ${esAdmin ? '' : 'Avisa al administrador para hacerlo.'}`;
    franja.appendChild(mensaje);

    if (esAdmin) {
      const enlace = document.createElement('a');
      enlace.href = 'respaldo.html';
      enlace.textContent = 'Hacer respaldo';
      enlace.style.cssText = 'font-weight:700;text-decoration:underline;color:inherit;white-space:nowrap;';
      franja.appendChild(enlace);
    }

    const cerrar = document.createElement('button');
    cerrar.type = 'button';
    cerrar.setAttribute('aria-label', 'Cerrar aviso');
    cerrar.textContent = '✕';
    cerrar.style.cssText = 'background:none;border:0;cursor:pointer;color:inherit;font-size:13px;padding:2px 6px;';
    cerrar.addEventListener('click', () => {
      franja.remove();
      try {
        localStorage.setItem(CLAVE_OCULTO, String(Date.now() + UN_DIA_MS));
      } catch (err) {
        // sin almacenamiento: simplemente reaparecerá en la próxima visita
      }
    });
    franja.appendChild(cerrar);

    main.insertBefore(franja, main.firstChild);
  });
})();
