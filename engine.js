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
    $('lema').textContent = 'Catálogo digital';
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
      const b = nodo('button', '', categoria === 'Ofertas' ? '🔥 Ofertas' : categoria);
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
    if (producto.foto) {
      const imagen = nodo('img', 'foto');
      imagen.src = producto.foto;
      imagen.alt = producto.nombre;
      imagen.decoding = 'async';
      imagen.loading = indice === 0 ? 'eager' : 'lazy';
      if (indice === 0) imagen.setAttribute('fetchpriority', 'high');
      imagen.onerror = () => {
        const falta = nodo('div', 'sin-foto', 'Fotografía no disponible');
        imagen.replaceWith(falta);
      };
      articulo.append(imagen);
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
    if (!datos.productos.length) principal.append(nodo('p', 'estado', 'No hay productos en esta categoría.'));
    datos.productos.forEach((p, i) => principal.append(dibujarProducto(p, i)));
    $('contador').textContent = `${datos.pagina} / ${datos.paginas}`;
    $('anterior').disabled = datos.pagina <= 1;
    $('siguiente').disabled = datos.pagina >= datos.paginas;
    nav.classList.remove('oculto');
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
