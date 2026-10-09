/**
 * pin.js — Ventana para pedir el código de vendedor (4 dígitos).
 *
 * Pin.pedir(titulo) devuelve una promesa con { id, nombre } del usuario dueño
 * del código, o null si se cancela. Si todavía no hay ningún código
 * configurado en el sistema, no pregunta nada y devuelve al usuario con
 * sesión iniciada (así la app sigue funcionando mientras se crean los códigos).
 */
const Pin = (() => {
  const LONGITUD = 4;
  const MAX_FALLOS = 5;
  const ESPERA_MS = 30000;

  let enCurso = null;
  let fallos = 0;
  let bloqueadoHasta = 0;

  function pedir(titulo = 'Ingresa tu código') {
    // Si ya hay una ventana abierta (ej. doble toque), se comparte la misma.
    if (enCurso) return enCurso;

    const promesa = (async () => {
      let hayPins = false;
      try {
        hayPins = await Auth.hayPinsConfigurados();
      } catch (err) {
        hayPins = false;
      }
      if (!hayPins) {
        const sesion = Auth.obtenerSesion();
        return sesion ? { id: sesion.id, nombre: sesion.nombre } : null;
      }
      return mostrarVentana(titulo);
    })();

    const liberar = () => { enCurso = null; };
    promesa.then(liberar, liberar);
    enCurso = promesa;
    return promesa;
  }

  function mostrarVentana(titulo) {
    return new Promise((resolve) => {
      const fondo = document.createElement('div');
      fondo.className = 'fondo-modal pin-fondo';

      const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
      fondo.innerHTML = `
        <div class="tarjeta-modal pin-tarjeta" role="dialog" aria-modal="true">
          <button type="button" class="boton-cerrar-modal-x" aria-label="Cancelar">✕</button>
          <h3 class="pin-titulo"></h3>
          <p class="pin-ayuda">Escribe tu código de ${LONGITUD} números</p>
          <div class="pin-puntos">${'<span></span>'.repeat(LONGITUD)}</div>
          <div class="pin-mensaje" aria-live="polite"></div>
          <div class="pin-teclado">
            ${teclas
              .map((t) => (t === ''
                ? '<span></span>'
                : `<button type="button" class="pin-tecla" data-tecla="${t}">${t}</button>`))
              .join('')}
          </div>
        </div>`;
      fondo.querySelector('.pin-titulo').textContent = titulo;

      const puntos = Array.from(fondo.querySelectorAll('.pin-puntos span'));
      const mensajeEl = fondo.querySelector('.pin-mensaje');
      let digitos = '';
      let verificando = false;
      let cerrado = false;

      function pintar() {
        puntos.forEach((p, i) => p.classList.toggle('pin-punto--lleno', i < digitos.length));
      }

      function cerrar(resultado) {
        if (cerrado) return;
        cerrado = true;
        document.removeEventListener('keydown', alTeclear);
        fondo.remove();
        resolve(resultado);
      }

      async function comprobar() {
        if (Date.now() < bloqueadoHasta) {
          const seg = Math.ceil((bloqueadoHasta - Date.now()) / 1000);
          mensajeEl.textContent = `Demasiados intentos. Espera ${seg} segundos.`;
          digitos = '';
          pintar();
          return;
        }
        verificando = true;
        let usuario = null;
        try {
          usuario = await Auth.verificarPin(digitos);
        } catch (err) {
          usuario = null;
        }
        verificando = false;
        if (cerrado) return;

        if (usuario) {
          fallos = 0;
          cerrar(usuario);
          return;
        }
        fallos += 1;
        digitos = '';
        pintar();
        if (fallos >= MAX_FALLOS) {
          fallos = 0;
          bloqueadoHasta = Date.now() + ESPERA_MS;
          mensajeEl.textContent = 'Demasiados intentos. Espera 30 segundos.';
        } else {
          mensajeEl.textContent = 'Código incorrecto. Intenta de nuevo.';
        }
        fondo.querySelector('.pin-puntos').classList.add('pin-puntos--error');
        setTimeout(() => {
          const el = fondo.querySelector('.pin-puntos');
          if (el) el.classList.remove('pin-puntos--error');
        }, 400);
      }

      function presionar(tecla) {
        if (verificando || cerrado) return;
        mensajeEl.textContent = '';
        if (tecla === '⌫') {
          digitos = digitos.slice(0, -1);
        } else if (digitos.length < LONGITUD) {
          digitos += tecla;
        }
        pintar();
        if (digitos.length === LONGITUD) comprobar();
      }

      function alTeclear(e) {
        if (/^\d$/.test(e.key)) presionar(e.key);
        else if (e.key === 'Backspace') presionar('⌫');
        else if (e.key === 'Escape') cerrar(null);
      }

      fondo.querySelectorAll('.pin-tecla').forEach((b) => {
        b.addEventListener('click', () => presionar(b.dataset.tecla));
      });
      fondo.querySelector('.boton-cerrar-modal-x').addEventListener('click', () => cerrar(null));
      fondo.addEventListener('click', (e) => {
        if (e.target === fondo) cerrar(null);
      });
      document.addEventListener('keydown', alTeclear);

      document.body.appendChild(fondo);
    });
  }

  return { pedir };
})();
