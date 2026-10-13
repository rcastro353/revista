// REVISTA - API ESTABLE para Cloudflare Pages Functions (plan gratuito).
// Cloudflare SOLO lee y retransmite los CSV. El navegador hace los cálculos pesados.
// No convertir el CSV de productos a objetos aquí: causaba errores de límite de CPU.
const MASTER_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSfUCCUxmO720CspwHwfs5rkQZ-wk4N4AWYt1tCR0W0tWXy_eATreCAALWt0-dr2JZP4YS_Q-QW56EG/pub?gid=0&single=true&output=csv';
const ACTUALIZAR_CADA_MS = 30 * 60 * 1000; // Intenta refrescar cada 30 minutos.
const CONSERVAR_SEGUNDOS = 7 * 24 * 60 * 60; // Respaldo en caché, sujeto a expulsiones de Cloudflare.

function normalizar(valor) {
  return String(valor ?? '').trim().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
}
function si(valor) { return ['si', 'sí', 'yes', 'true', '1'].includes(normalizar(valor)); }

// Solo analiza el CSV maestro, que contiene unas pocas filas.
// Nunca se ejecuta con el CSV grande de productos.
function csvFilas(texto) {
  const filas = [];
  const input = String(texto).replace(/^\uFEFF/, '');
  let fila = [], campo = '', comillas = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (comillas && input[i + 1] === '"') { campo += '"'; i++; }
      else comillas = !comillas;
    } else if (c === ',' && !comillas) { fila.push(campo); campo = ''; }
    else if ((c === '\n' || c === '\r') && !comillas) {
      if (c === '\r' && input[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.some(v => v.trim())) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  fila.push(campo);
  if (fila.some(v => v.trim())) filas.push(fila);
  return filas;
}
function clientesActivos(texto) {
  const filas = csvFilas(texto);
  if (!filas.length) return [];
  const cabeceras = filas.shift().map(normalizar);
  const indice = nombre => cabeceras.indexOf(normalizar(nombre));
  const iActivo = indice('activo'), iSlug = indice('slug');
  const iNombre = indice('cliente'), iCatalogo = indice('catalogocsv');
  const iConfig = indice('confcsv');
  if ([iActivo, iSlug, iNombre, iCatalogo, iConfig].some(i => i < 0))
    throw new Error('El maestro no tiene las columnas requeridas.');
  return filas.map(fila => ({
    nombre: String(fila[iNombre] || '').trim(),
    slug: String(fila[iSlug] || '').trim(),
    activo: si(fila[iActivo]),
    catalogo: String(fila[iCatalogo] || '').trim(),
    config: String(fila[iConfig] || '').trim()
  })).filter(c => c.activo && c.slug && c.catalogo && c.config);
}
function validarCSV(enlace) {
  const u = new URL(String(enlace || '').trim());
  if (u.protocol !== 'https:' || u.hostname !== 'docs.google.com' ||
      !/^\/spreadsheets\/d\/e\/[^/]+\/pub$/.test(u.pathname) ||
      u.searchParams.get('output')?.toLowerCase() !== 'csv')
    throw new Error('Enlace de Google Sheets no válido.');
  return u.href;
}
function respuestaCliente(resp, estado) {
  return new Response(resp.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Revista-Estado': estado,
      'X-Revista-Fecha': resp.headers.get('X-Revista-Fecha') || ''
    }
  });
}

async function servirCSV(enlace, request, context) {
  const url = validarCSV(enlace);
  const clave = new Request(new URL('/__revista_guardado__?url=' + encodeURIComponent(url), request.url).toString());
  let guardada = null;
  try { guardada = await caches.default.match(clave); }
  catch (e) { console.warn('REVISTA: caché no accesible', String(e)); }
  if (guardada) {
    const fecha = Number(guardada.headers.get('X-Revista-Fecha'));
    if (fecha > 0 && Date.now() - fecha < ACTUALIZAR_CADA_MS)
      return respuestaCliente(guardada, 'CACHE');
  }

  try {
    // I/O remoto y streaming; no se lee ni convierte el CSV de productos en la función.
    const upstream = await fetch(url, {
      headers: { Accept: 'text/csv,text/plain;q=0.9,*/*;q=0.5' },
      signal: AbortSignal.timeout(15000)
    });
    if (!upstream.ok) throw new Error('Google Sheets HTTP ' + upstream.status);
    if ((upstream.headers.get('content-type') || '').toLowerCase().includes('text/html'))
      throw new Error('Google Sheets respondió HTML en vez de CSV.');

    const nueva = new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Cache-Control': 'public, max-age=' + CONSERVAR_SEGUNDOS,
        'X-Revista-Fecha': String(Date.now())
      }
    });
    // Copia en segundo plano: el visitante no espera a que termine de escribirse.
    if (context && typeof context.waitUntil === 'function') {
      context.waitUntil(caches.default.put(clave, nueva.clone()).catch(err => {
        console.warn('REVISTA: fallo guardando respaldo', String(err));
      }));
    }
    return respuestaCliente(nueva, 'ACTUALIZADO');
  } catch (error) {
    // Si Sheets está inaccesible, conservamos la última versión encontrada.
    if (guardada) {
      console.warn('REVISTA: usando respaldo', String(error));
      return respuestaCliente(guardada, 'RESPALDO');
    }
    throw error;
  }
}
function json(datos, status = 200) {
  return new Response(JSON.stringify(datos), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

export async function onRequestGet({ request, context }) {
  try {
    const params = new URL(request.url).searchParams;
    const archivo = params.get('archivo') || '';
    const slug = normalizar(params.get('cliente') || '');
    if (archivo && archivo !== 'catalogo' && archivo !== 'configuracion')
      return json({ error: 'Archivo solicitado no válido.' }, 400);

    const master = await servirCSV(MASTER_CSV, request, context);
    const clientes = clientesActivos(await master.text());
    if (!slug && !archivo) {
      return json({ clientes: clientes.map(c => ({ nombre: c.nombre, slug: c.slug })) });
    }
    if (!slug) return json({ error: 'Falta el identificador del cliente.' }, 400);
    const cliente = clientes.find(c => normalizar(c.slug) === slug);
    if (!cliente) return json({ error: 'Catálogo no encontrado o desactivado.' }, 404);
    if (!archivo) return json({
      error: 'Versión antigua del navegador. Recargá la página para actualizar REVISTA.'
    }, 409);
    const salida = await servirCSV(archivo === 'catalogo' ? cliente.catalogo : cliente.config, request, context);
    salida.headers.set('X-Revista-Cliente', encodeURIComponent(cliente.nombre));
    return salida;
  } catch (error) {
    console.error('REVISTA: fallo leyendo fuente', String(error));
    return json({ error: 'No se pudieron cargar los datos. Intentá de nuevo.' }, 502);
  }
}
