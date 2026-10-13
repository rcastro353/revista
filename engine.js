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

  // Procesamiento local: evita que Cloudflare supere 10 ms de CPU.
  const REFRESCAR_MS = 30 * 60 * 1000;
  const RESERVA_MS = 24 * 60 * 60 * 1000;
  const POR_PAGINA = 50;
  const PROMOCIONES = '🔥 Promociones';
  const datosLocales = new Map();

  function normalizar(valor) {
    return String(valor ?? '').trim().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
  }
  // Misma interpretación de CSV que la función anterior: admite comillas, comas
  // internas, múltiples líneas dentro de una celda y BOM.
  function csvFilas(texto) {
    const filas = [];
    const input = String(texto).replace(/^\uFEFF/, '');
    let fila = [], campo = '', entreComillas = false;
    for (let i = 0; i < input.length; i++) {
      const c = input[i];
      if (c === '"') {
        if (entreComillas && input[i + 1] === '"') { campo += '"'; i++; }
        else entreComillas = !entreComillas;
      } else if (c === ',' && !entreComillas) {
        fila.push(campo); campo = '';
      } else if ((c === '\n' || c === '\r') && !entreComillas) {
        if (c === '\r' && input[i + 1] === '\n') i++;
        fila.push(campo); campo = '';
        if (fila.some(v => v.trim() !== '')) filas.push(fila);
        fila = [];
      } else campo += c;
    }
    fila.push(campo);
    if (fila.some(v => v.trim() !== '')) filas.push(fila);
    return filas;
  }
  function csvObjetos(texto) {
    const filas = csvFilas(texto);
    if (!filas.length) return [];
    const nombres = filas.shift().map(normalizar);
    return filas.map(fila => Object.fromEntries(
      nombres.map((nombre, i) => [nombre, String(fila[i] || '').trim()])
    ));
  }
  function elegir(obj, ...claves) {
    for (const clave of claves) {
      const valor = obj[normalizar(clave)];
      if (valor !== undefined && valor !== '') return valor;
    }
    return '';
  }
  function urlImagen(valor) {
    const cadena = String(valor || '').trim();
    try {
      const u = new URL(cadena);
      return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : '';
    } catch { return ''; }
  }
  function formatoColor(valor) {
    const v = String(valor ?? '').trim().replace(/^#/, '');
    return /^[a-f0-9]{6}$/i.test(v) || /^[a-f0-9]{3}$/i.test(v) ? '#' + v : '#77b6d4';
  }
  function numeroWhatsApp(valor) {
    const digitos = String(valor ?? '').replace(/\D/g, '');
    if (/^\d{8}$/.test(digitos)) return '505' + digitos;
    if (/^\d{10,15}$/.test(digitos)) return digitos;
    return '';
  }
  function configuracion(filas) {
    const conf = {};
    for (const fila of filas) {
      if (fila[0]) conf[normalizar(fila[0])] = String(fila[1] || '').trim();
    }
    return {
      logo: urlImagen(conf['logo web'] || conf.logo),
      favicon: urlImagen(conf.favicon),
      color: formatoColor(conf.hex || conf.color || conf['color hex']),
      whatsapp: numeroWhatsApp(conf.whatsapp || conf['telefono whatsapp'])
    };
  }
  function si(valor) { return ['si', 'sí', 'yes', 'true', '1'].includes(normalizar(valor)); }
  function precioExiste(valor) {
    const t = String(valor ?? '').trim();
    if (!t) return false;
    const n = Number(t.replace(/[^0-9.,-]/g, '').replace(/,/g, ''));
    return Number.isFinite(n) && n > 0;
  }
  const esPestanaPromociones = valor => {
    const clave = normalizar(valor).replace(/^🔥\s*/, '');
    return clave === 'promociones' || clave === 'ofertas';
  };

  function construirDatos(slug, textoCatalogo, textoConfig, fecha = Date.now()) {
    if (/^\s*<(?:!doctype|html)/i.test(textoCatalogo)) throw new Error('Google devolvió HTML, no CSV.');
    const filas = csvFilas(textoCatalogo);
    const cabeceras = (filas[0] || []).map(normalizar);
    if (!cabeceras.includes('nombre del producto') || !cabeceras.includes('categoria'))
      throw new Error('El catálogo no tiene las columnas de producto y categoría.');
    const productos = csvObjetos(textoCatalogo)
      .filter(p => elegir(p, 'Nombre del Producto') && elegir(p, 'Categoría'))
      .map(p => {
        const categorias = [...new Map(
          elegir(p, 'Categoría').split(',').map(c => c.trim()).filter(Boolean)
            .map(c => [normalizar(c), c])
        ).values()];
        return {
          nombre: elegir(p, 'Nombre del Producto'),
          codigo: elegir(p, 'Código'),
          precio: elegir(p, 'Precio'),
          descuento: elegir(p, 'Precio Descuento'),
          promocion: si(elegir(p, 'Promoción')) && precioExiste(elegir(p, 'Precio Descuento')),
          categorias, claves: categorias.map(normalizar),
          fotos: [
            urlImagen(elegir(p, 'imagen 1 app')) || urlImagen(elegir(p, 'Foto 1')),
            urlImagen(elegir(p, 'imagen 2 app')),
            urlImagen(elegir(p, 'imagen 3 app'))
          ].filter((url, i, todas) => url && todas.indexOf(url) === i)
        };
      });
    const mapaCategorias = new Map();
    for (const p of productos) {
      for (const nombre of p.categorias) {
        const clave = normalizar(nombre);
        if (!mapaCategorias.has(clave)) mapaCategorias.set(clave, nombre);
      }
    }
    const categorias = [...mapaCategorias.values()]
      .filter(c => !esPestanaPromociones(c))
      .sort((a, b) => a.localeCompare(b, 'es'));
    return {
      slug, fecha, productos, categorias,
      conf: configuracion(csvFilas(textoConfig)),
      aviso: ''
    };
  }

  function datosPagina(base, categoriaSolicitada, paginaSolicitada) {
    let categoria = categoriaSolicitada || base.categorias[0] || PROMOCIONES;
    let filtrados;
    if (esPestanaPromociones(categoria)) {
      categoria = PROMOCIONES;
      filtrados = base.productos.filter(p => p.promocion);
    } else {
      const real = base.categorias.find(c => normalizar(c) === normalizar(categoria));
      categoria = real || base.categorias[0] || PROMOCIONES;
      filtrados = base.productos.filter(p => p.claves.includes(normalizar(categoria)));
    }
    const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
    const pagina = Math.min(paginas, Math.max(1, Number.parseInt(paginaSolicitada, 10) || 1));
    const productos = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)
      .map(p => ({
        nombre: p.nombre, codigo: p.codigo, precio: p.precio,
        precioDescuento: p.promocion ? p.descuento : '',
        foto: p.fotos[0] || '', fotos: p.fotos
      }));
    return {
      cliente: { nombre: base.nombre || base.slug, slug: base.slug, ...base.conf },
      categorias: [PROMOCIONES, ...base.categorias],
      categoria, pagina, paginas, total: filtrados.length, productos
    };
  }

  const esperar = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function solicitar(url, formato = 'text') {
    for (let intento = 0; intento < 2; intento++) {
      try {
        const controlador = new AbortController();
        const tiempo = setTimeout(() => controlador.abort(), 22000);
        let resp;
        try { resp = await fetch(url, { headers: { Accept: formato === 'json' ? 'application/json' : 'text/csv' }, signal: controlador.signal }); }
        finally { clearTimeout(tiempo); }
        if (!resp.ok) {
          const error = new Error('Servidor HTTP ' + resp.status);
          error.noReintentar = resp.status >= 400 && resp.status < 500;
          throw error;
        }
        const texto = await resp.text();
        let nombre = '';
        try { nombre = decodeURIComponent(resp.headers.get('X-Revista-Cliente') || ''); } catch {}
        return { valor: formato === 'json' ? JSON.parse(texto) : texto,
          nombre,
          respaldo: resp.headers.get('X-Revista-Estado') === 'RESPALDO',
          fechaOrigen: Number(resp.headers.get('X-Revista-Fecha')) || 0 };
      } catch (error) {
        if (intento === 1 || error.noReintentar) throw error;
        await esperar(1100);
      }
    }
  }
  function almacenamientoClave(slug) { return 'revista-estable-v1:' + slug; }
  function guardarRespaldo(slug, csv, config, nombre) {
    try { localStorage.setItem(almacenamientoClave(slug), JSON.stringify({ fecha: Date.now(), csv, config, nombre })); }
    catch { /* Algunos navegadores bloquean el almacenamiento o tienen poco espacio. */ }
  }
  function recuperarRespaldo(slug) {
    try {
      const texto = localStorage.getItem(almacenamientoClave(slug));
      if (!texto) return null;
      const guardado = JSON.parse(texto);
      if (!(guardado.fecha > 0) || Date.now() - guardado.fecha > RESERVA_MS) return null;
      const base = construirDatos(slug, guardado.csv, guardado.config, guardado.fecha);
      base.nombre = guardado.nombre || slug;
      return base;
    } catch { return null; }
  }
  async function obtenerDatos(slug) {
    const existente = datosLocales.get(slug);
    if (existente && ((Date.now() - existente.fecha < REFRESCAR_MS) ||
        (existente.proximoIntento && Date.now() < existente.proximoIntento))) return existente;
    try {
      const q = encodeURIComponent(slug);
      const [catalogo, conf] = await Promise.all([
        solicitar('/api/catalog?cliente=' + q + '&archivo=catalogo'),
        solicitar('/api/catalog?cliente=' + q + '&archivo=configuracion')
      ]);
      const fechaOrigen = Math.min(catalogo.fechaOrigen || Date.now(), conf.fechaOrigen || Date.now());
      const base = construirDatos(slug, catalogo.valor, conf.valor, fechaOrigen);
      base.nombre = catalogo.nombre || conf.nombre || slug;
      // Si alguna fuente viene del respaldo del servidor, se marca como desactualizada.
      if (catalogo.respaldo || conf.respaldo) {
        base.aviso = 'Mostrando datos guardados; puede haber cambios recientes sin actualizar.';
        base.proximoIntento = Date.now() + 2 * 60 * 1000;
      } else guardarRespaldo(slug, catalogo.valor, conf.valor, base.nombre);
      datosLocales.set(slug, base);
      return base;
    } catch (error) {
      const respaldo = existente || recuperarRespaldo(slug);
      if (respaldo) {
        respaldo.aviso = 'Mostrando la última versión guardada por un problema temporal de conexión.';
        respaldo.proximoIntento = Date.now() + 2 * 60 * 1000;
        datosLocales.set(slug, respaldo);
        return respaldo;
      }
      throw error;
    }
  }

  function mostrarAviso(aviso) {
    if (!aviso) return;
    const p = nodo('p', 'aviso-cache', aviso);
    principal.prepend(p);
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
      if (!estado.slug) {
        try {
          const respuesta = await solicitar('/api/catalog', 'json');
          if (!respuesta.valor || !Array.isArray(respuesta.valor.clientes))
            throw new Error('La lista de clientes no tiene el formato esperado.');
          try { localStorage.setItem('revista-lista-v1', JSON.stringify({
            fecha: Date.now(), clientes: respuesta.valor.clientes
          })); } catch {}
          if (actual === peticion) renderClientes(respuesta.valor.clientes);
        } catch (error) {
          let respaldo = null;
          try {
            const guardado = JSON.parse(localStorage.getItem('revista-lista-v1') || 'null');
            if (guardado && Date.now() - guardado.fecha < RESERVA_MS) respaldo = guardado.clientes;
          } catch {}
          if (!respaldo) throw error;
          if (actual === peticion) {
            renderClientes(respaldo);
            mostrarAviso('Lista de catálogos guardada temporalmente: puede estar desactualizada.');
          }
        }
        return;
      }
      const base = await obtenerDatos(estado.slug);
      if (actual !== peticion) return;
      renderCatalogo(datosPagina(base, estado.categoria, estado.pagina));
      mostrarAviso(base.aviso);
    } catch (error) {
      if (actual !== peticion) return;
      principal.replaceChildren(nodo('div', 'error',
        'No se pudo cargar el catálogo. ' + (error.message || 'Error de conexión') +
        '. Volvé a intentarlo en unos momentos.'));
    }
  }

  $('anterior').addEventListener('click', () => { if (estado.pagina > 1) navegar({ pagina: estado.pagina - 1 }); });
  $('siguiente').addEventListener('click', () => navegar({ pagina: estado.pagina + 1 }));
  window.addEventListener('popstate', () => { Object.assign(estado, ubicacion()); cargar(); });
  Object.assign(estado, ubicacion());
  cargar();
})();
