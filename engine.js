// REVISTA: una sola plantilla para todos los clientes.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const principal = $('principal');
  const nav = $('navegacion');
  const estado = { slug: '', categoria: '', pagina: 1 };
  let peticion = 0;

  function nodo(tag, clase, texto) {
    const el = document.createElement(tag);
    if (clase) el.className = clase;
    if (texto !== undefined) el.textContent = texto;
    return el;
  }

  function ubicacion() {
    const params = new URLSearchParams(location.search);
    const partes = location.pathname.split('/').filter(Boolean);
    return {
      slug: params.get('cliente') || partes[0] || '',
      categoria: params.get('categoria') || '',
      pagina: Math.max(1, Number.parseInt(params.get('pagina'), 10) || 1)
    };
  }

  function urlEstado(nuevo) {
    if (!nuevo.slug) return '/';
    const params = new URLSearchParams();
    if (nuevo.categoria) params.set('categoria', nuevo.categoria);
    if (nuevo.pagina > 1) params.set('pagina', String(nuevo.pagina));
    return '/' + encodeURIComponent(nuevo.slug) + (params.size ? '?' + params : '');
  }

  function navegar(actualizado) {
    Object.assign(estado, actualizado);
    history.pushState(null, '', urlEstado(estado));
    window.scrollTo({ top: 0, behavior: 'instant' });
    cargar();
  }

  function colorContraste(hex) {
    const h = hex.replace('#', '');
    const s = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const v = [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16) / 255);
    const brillo = v.map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
    return (brillo[0] * .2126 + brillo[1] * .7152 + brillo[2] * .0722) > .45 ? '#111111' : '#ffffff';
  }

  function aplicarMarca(cliente) {
    if (!cliente) return;
    const color = /^#[a-f\d]{3}(?:[a-f\d]{3})?$/i.test(cliente.color || '') ? cliente.color : '#77b6d4';
    document.documentElement.style.setProperty('--marca', color);
    document.documentElement.style.setProperty('--sobre-marca', colorContraste(color));
    $('tituloMarca').textContent = cliente.nombre || 'REVISTA';
    const lema = $('lema');
    lema.replaceChildren();
    // Contacto por cliente: el número viene de Configuracion > whatsapp.
    // El icono se dibuja con SVG local, sin dependencias ni descargas extra.
    const numeroWhatsApp = String(cliente.whatsapp || '').replace(/\D/g, '');
    if (/^\d{10,15}$/.test(numeroWhatsApp)) {
      const enlace = nodo('a', 'enlace-whatsapp');
      enlace.href = 'https://wa.me/' + numeroWhatsApp;
      enlace.target = '_blank';
      enlace.rel = 'noopener noreferrer';
      const telefonoVisible = /^505\d{8}$/.test(numeroWhatsApp)
        ? numeroWhatsApp.slice(3, 7) + ' ' + numeroWhatsApp.slice(7)
        : '+' + numeroWhatsApp;
      enlace.setAttribute('aria-label', 'Contactar a ' + (cliente.nombre || 'la tienda') + ' por WhatsApp: ' + telefonoVisible);
      enlace.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;gap:7px;color:#128c4a;font-weight:650;text-decoration:none;font-size:14px;min-height:34px;';
      const icono = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icono.setAttribute('viewBox', '0 0 24 24');
      icono.setAttribute('width', '19');
      icono.setAttribute('height', '19');
      icono.setAttribute('fill', 'none');
      icono.setAttribute('stroke', 'currentColor');
      icono.setAttribute('stroke-width', '1.9');
      icono.setAttribute('stroke-linecap', 'round');
      icono.setAttribute('stroke-linejoin', 'round');
      icono.setAttribute('aria-hidden', 'true');
      const burbuja = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      burbuja.setAttribute('d', 'M21 11.5a8.5 8.5 0 0 1-12.4 7.55L3 21l1.95-5.6A8.5 8.5 0 1 1 21 11.5Z');
      const telefono = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      telefono.setAttribute('d', 'M8.5 8.1c.3-.5.65-.4.9-.35l1.2 1.9c.13.2.12.42-.04.6l-.6.7a7 7 0 0 0 3.1 3.1l.7-.6a.5.5 0 0 1 .6-.04l1.9 1.2c.23.2.3.6-.2.9-.9.6-1.8.5-2.65.15a10.5 10.5 0 0 1-5.05-5.05c-.35-.85-.45-1.75.15-2.65Z');
      icono.append(burbuja, telefono);
      enlace.append(icono, document.createTextNode('WhatsApp: ' + telefonoVisible));
      lema.append(enlace);
    } else {
      lema.textContent = 'Catálogo digital';
    }
    document.title = (cliente.nombre || 'Catálogo') + ' · REVISTA';
    const logo = $('logo');
    if (cliente.logo) {
      logo.src = cliente.logo;
      logo.classList.remove('oculto');
      logo.onerror = () => logo.classList.add('oculto');
    } else logo.classList.add('oculto');
    if (cliente.favicon) {
      let favicon = document.querySelector('link[rel="icon"]');
      if (!favicon) { favicon = document.createElement('link'); favicon.rel = 'icon'; document.head.append(favicon); }
      favicon.href = cliente.favicon;
    }
  }

  function dinero(importe) {
    const t = String(importe ?? '').trim();
    if (!t) return 'Consultar precio';
    return /^C\$/i.test(t) ? t : 'C$ ' + t.replace(/^\$\s*/, '');
  }

  function categorias(datos) {
    const barra = nodo('div', 'categorias');
    barra.setAttribute('aria-label', 'Categorías');
    for (const categoria of datos.categorias) {
      const b = nodo('button', '', categoria === 'Promociones' ? '🔥 Promociones' : categoria);
      b.type = 'button';
      b.setAttribute('aria-current', String(categoria === datos.categoria));
      b.addEventListener('click', () => navegar({ categoria, pagina: 1 }));
      barra.append(b);
    }
    return barra;
  }

  function dibujarProducto(producto, indice) {
    const articulo = nodo('article', 'producto');
    articulo.append(nodo('h2', 'nombre', producto.nombre));
    // Una sola imagen grande por producto. Foto 2 y Foto 3 NO se descargan
    // hasta que el visitante toque una flecha o deslice horizontalmente.
    const fotos = [...new Set((Array.isArray(producto.fotos) && producto.fotos.length
      ? producto.fotos : [producto.foto]).filter(Boolean))];
    if (fotos.length) {
      const imagen = nodo('img', 'foto');
      imagen.src = fotos[0];
      imagen.alt = producto.nombre;
      imagen.decoding = 'async';
      imagen.loading = indice === 0 ? 'eager' : 'lazy';
      if (indice === 0) imagen.setAttribute('fetchpriority', 'high');

      if (fotos.length === 1) {
        imagen.onerror = () => imagen.replaceWith(nodo('div', 'sin-foto', 'Fotografía no disponible'));
        articulo.append(imagen);
      } else {
        const galeria = nodo('div', 'galeria-foto');
        let actual = 0;
        imagen.alt = `${producto.nombre}, foto 1 de ${fotos.length}`;
        const izquierda = nodo('button', 'flecha-foto flecha-izquierda', '‹');
        const derecha = nodo('button', 'flecha-foto flecha-derecha', '›');
        izquierda.type = derecha.type = 'button';
        izquierda.setAttribute('aria-label', 'Ver fotografía anterior');
        derecha.setAttribute('aria-label', 'Ver fotografía siguiente');
        izquierda.classList.add('oculto');
        imagen.onerror = () => galeria.classList.add('foto-fallida');

        function mostrarFoto(n) {
          if (n < 0 || n >= fotos.length || n === actual) return;
          actual = n;
          galeria.classList.remove('foto-fallida');
          // Cambiar src aquí evita la descarga anticipada de las otras fotos.
          imagen.src = fotos[actual];
          imagen.alt = `${producto.nombre}, foto ${actual + 1} de ${fotos.length}`;
          izquierda.classList.toggle('oculto', actual === 0);
          derecha.classList.toggle('oculto', actual === fotos.length - 1);
        }
        izquierda.addEventListener('click', () => mostrarFoto(actual - 1));
        derecha.addEventListener('click', () => mostrarFoto(actual + 1));
        let inicio = null;
        galeria.addEventListener('touchstart', e => {
          if (e.touches.length !== 1) return;
          inicio = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }, { passive: true });
        galeria.addEventListener('touchend', e => {
          if (!inicio || !e.changedTouches.length) return;
          const dx = e.changedTouches[0].clientX - inicio.x;
          const dy = e.changedTouches[0].clientY - inicio.y;
          inicio = null;
          // Ignora el desplazamiento vertical normal de la revista.
          if (Math.abs(dx) < 45 || Math.abs(dx) <= Math.abs(dy) * 1.4) return;
          mostrarFoto(actual + (dx < 0 ? 1 : -1));
        }, { passive: true });
        galeria.addEventListener('touchcancel', () => { inicio = null; }, { passive: true });
        galeria.append(imagen, izquierda, derecha);
        articulo.append(galeria);
      }
    } else articulo.append(nodo('div', 'sin-foto', 'Fotografía no disponible'));
    if (producto.precioDescuento) {
      articulo.append(nodo('p', 'precio-anterior', dinero(producto.precio)));
      articulo.append(nodo('p', 'precio precio-oferta', dinero(producto.precioDescuento)));
    } else articulo.append(nodo('p', 'precio', dinero(producto.precio)));
    return articulo;
  }

  function renderCatalogo(datos) {
    aplicarMarca(datos.cliente);
    estado.categoria = datos.categoria;
    estado.pagina = datos.pagina;
    const encabezado = nodo('div', 'intro contenido');
    encabezado.append(nodo('h1', '', datos.categoria || 'Catálogo'));
    encabezado.append(nodo('p', '', `${datos.total} productos · Página ${datos.pagina} de ${datos.paginas}`));
    principal.replaceChildren(categorias(datos), encabezado);
    if (!datos.productos.length) principal.append(nodo('p', 'estado', datos.categoria === 'Promociones' ? 'Por ahora no hay productos en promoción.' : 'No hay productos en esta categoría.'));
    datos.productos.forEach((p, i) => principal.append(dibujarProducto(p, i)));
    // La barra solo se muestra si existen al menos dos páginas (51+ productos).
    // En los extremos, ocultamos el botón que no tiene destino.
    const paginas = Number(datos.paginas) || 1;
    const pagina = Number(datos.pagina) || 1;
    $('contador').textContent = `${pagina} / ${paginas}`;
    $('anterior').disabled = pagina <= 1;
    $('siguiente').disabled = pagina >= paginas;
    $('anterior').classList.toggle('oculto', pagina <= 1);
    $('siguiente').classList.toggle('oculto', pagina >= paginas);
    nav.classList.toggle('oculto', paginas <= 1);
  }

  function renderClientes(clientes) {
    $('tituloMarca').textContent = 'REVISTA';
    $('lema').textContent = 'Elegí un catálogo';
    $('logo').classList.add('oculto');
    document.title = 'REVISTA · Catálogos';
    const cab = nodo('div', 'intro');
    cab.append(nodo('h1', '', 'Catálogos disponibles'));
    const lista = nodo('div', 'lista-clientes');
    for (const c of clientes) {
      const a = nodo('a', 'cliente', c.nombre + ' →');
      a.href = '/' + encodeURIComponent(c.slug);
      lista.append(a);
    }
    principal.replaceChildren(cab, lista);
    nav.classList.add('oculto');
  }

  async function cargar() {
    const actual = ++peticion;
    principal.replaceChildren(nodo('p', 'estado', 'Cargando catálogo…'));
    nav.classList.add('oculto');
    try {
      const q = new URLSearchParams();
      if (estado.slug) q.set('cliente', estado.slug);
      if (estado.categoria) q.set('categoria', estado.categoria);
      q.set('pagina', String(estado.pagina));
      const resp = await fetch('/api/catalog?' + q, { headers: { Accept: 'application/json' } });
      const datos = await resp.json();
      if (!resp.ok) throw new Error(datos.error || 'Error al cargar el catálogo');
      if (actual !== peticion) return;
      if (datos.clientes) renderClientes(datos.clientes);
      else renderCatalogo(datos);
    } catch (err) {
      if (actual !== peticion) return;
      principal.replaceChildren(nodo('div', 'error', 'No se pudo cargar: ' + err.message));
    }
  }

  $('anterior').addEventListener('click', () => { if (estado.pagina > 1) navegar({ pagina: estado.pagina - 1 }); });
  $('siguiente').addEventListener('click', () => navegar({ pagina: estado.pagina + 1 }));
  window.addEventListener('popstate', () => { Object.assign(estado, ubicacion()); cargar(); });
  Object.assign(estado, ubicacion());
  cargar();
})();
