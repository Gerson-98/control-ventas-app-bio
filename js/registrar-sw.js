if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const registrar = () => {
      const esSubcarpeta = location.pathname.includes('/pages/');
      const rutaSW = esSubcarpeta ? '../sw.js' : './sw.js';
      const opciones = esSubcarpeta ? { scope: '../' } : { scope: './' };
      navigator.serviceWorker.register(rutaSW, opciones).catch(() => {});
    };
    // Se registra en tiempo de inactividad del navegador, no de inmediato:
    // así nunca compite con una navegación que el usuario haga justo al
    // terminar de cargar la página (ej. tocar "Entrar" muy rápido).
    if ('requestIdleCallback' in window) {
      requestIdleCallback(registrar, { timeout: 3000 });
    } else {
      setTimeout(registrar, 1000);
    }
  });
}
