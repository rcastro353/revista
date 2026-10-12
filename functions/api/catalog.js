// REVISTA - Cloudflare Pages Function
// El navegador solo consulta /api/catalog. Google Sheets se consulta desde Cloudflare.
const MASTER_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSfUCCUxmO720CspwHwfs5rkQZ-wk4N4AWYt1tCR0W0tWXy_eATreCAALWt0-dr2JZP4YS_Q-QW56EG/pub?gid=0&single=true&output=csv';
const CACHE_SEGUNDOS = 1800; // 30 minutos
const POR_PAGINA = 50;

function normalizar(valor) {
  return String(valor ?? '').trim().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
}

// Parser CSV compatible con comas, comillas y saltos de línea dentro de celdas.
function csvFilas(texto) {
  const filas = [];
  let fila = [], campo = '', entreComillas = false;
  const input = String(texto).replace(/^\uFEFF/, '');
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
    } else {
      campo += c;
    }
  }
  fila.push(campo);
  if (fila.some(v => v.trim() !== '')) filas.push(fila);
  return filas;
}

function csvObjetos(texto) {
  const filas = csvFilas(texto);
  if (!filas.length) return [];
  const nombres = filas.shift().map(normalizar);
  return filas.map(fila => Object.fromEntries(nombres.map((nombre, i) => [nombre, (fila[i] || '').trim()])));
}

function urlGooglePublica(enlace) {
  const url = new URL(String(enlace ?? '').trim());
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com' ||
      !/^\/spreadsheets\/d\/e\/[^/]+\/pub$/.test(url.pathname) ||
      url.searchParams.get('output')?.toLowerCase() !== 'csv') {
    throw new Error('La dirección del CSV no es una publicación válida de Google Sheets.');
  }
  return url.toString();
}

async function obtenerCSV(enlace, request) {
  const url = urlGooglePublica(enlace);
  // Clave interna de caché por CSV; no se expone a los visitantes.
  const clave = new Request(new URL('/__revista_cache__?csv=' + encodeURIComponent(url), request.url).toString());
  const cache = caches.default;
  let respuesta = await cache.match(clave);
  if (!respuesta) {
    const origen = await fetch(url, { headers: { Accept: 'text/csv,text/plain;q=0.9,*/*;q=0.5' } });
    if (!origen.ok) throw new Error('Google Sheets devolvió HTTP ' + origen.status + '. Comprueba que el CSV se pueda abrir en incógnito.');
    const texto = await origen.text();
    // Evita guardar por error una página HTML de inicio de sesión.
    if (/<html[\s>]/i.test(texto.slice(0, 500))) {
      throw new Error('Google Sheets devolvió HTML en vez de CSV. Verifica la publicación.');
    }
    respuesta = new Response(texto, {
      status: 200,
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'public, max-age=' + CACHE_SEGUNDOS }
    });
    await cache.put(clave, respuesta.clone());
  }
  return respuesta.text();
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

function configuracion(filas) {
  const conf = {};
  for (const fila of filas) {
    if (fila[0]) conf[normalizar(fila[0])] = (fila[1] || '').trim();
  }
  return {
    logo: urlImagen(conf['logo web'] || conf['logo']),
    favicon: urlImagen(conf['favicon']),
    color: formatoColor(conf['hex'] || conf['color'] || conf['color hex'])
  };
}

function si(valor) { return ['si', 'sí', 'yes', 'true', '1'].includes(normalizar(valor)); }
function precioExiste(valor) {
  const t = String(valor ?? '').trim();
  if (!t) return false;
  const n = Number(t.replace(/[^0-9.,-]/g, '').replace(/,/g, ''));
  return Number.isFinite(n) && n > 0;
}

function json(datos, status = 200) {
  return new Response(JSON.stringify(datos), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=30',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

export async function onRequestGet({ request }) {
  try {
    const params = new URL(request.url).searchParams;
    const clientes = csvObjetos(await obtenerCSV(MASTER_CSV, request))
      .filter(c => si(elegir(c, 'activo')) && elegir(c, 'slug') && elegir(c, 'catalogocsv') && elegir(c, 'confcsv'));
    const slug = normalizar(params.get('cliente') || '');
    if (!slug) {
      return json({ clientes: clientes.map(c => ({
        nombre: elegir(c, 'cliente'), slug: elegir(c, 'slug')
      })) });
    }
    const cliente = clientes.find(c => normalizar(elegir(c, 'slug')) === slug);
    if (!cliente) return json({ error: 'Catálogo no encontrado o desactivado.' }, 404);


    
const [csv, csvConfig] = await Promise.all([
  obtenerCSV(elegir(cliente, 'catalogocsv'), request)
    .catch(e => {
      throw new Error("CATÁLOGO: " + e.message);
    }),

  obtenerCSV(elegir(cliente, 'confcsv', 'configuracioncsv'), request)
    .catch(e => {
      throw new Error("CONFIGURACIÓN: " + e.message);
    })
]);

    const conf = configuracion(csvFilas(csvConfig));
    const catalogo = csvObjetos(csv).filter(p => elegir(p, 'Nombre del Producto') && elegir(p, 'Categoría'));
    const categorias = [...new Set(catalogo.map(p => elegir(p, 'Categoría')))]
      .sort((a, b) => a.localeCompare(b, 'es'));
    const hayOfertas = catalogo.some(p => si(elegir(p, 'Promoción')) && precioExiste(elegir(p, 'Precio Descuento')));

    let categoria = params.get('categoria') || (hayOfertas ? 'ofertas' : categorias[0] || '');
    let filtrados;
    if (normalizar(categoria) === 'ofertas' && hayOfertas) {
      categoria = 'Ofertas';
      filtrados = catalogo.filter(p => si(elegir(p, 'Promoción')) && precioExiste(elegir(p, 'Precio Descuento')));
    } else {
      const real = categorias.find(c => normalizar(c) === normalizar(categoria));
      categoria = real || categorias[0] || '';
      filtrados = catalogo.filter(p => elegir(p, 'Categoría') === categoria);
    }

    const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
    const num = Number.parseInt(params.get('pagina'), 10);
    const pagina = Math.min(paginas, Math.max(1, Number.isFinite(num) ? num : 1));
    const productos = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)
      .map(p => {
        const promocion = si(elegir(p, 'Promoción')) && precioExiste(elegir(p, 'Precio Descuento'));
        return {
          nombre: elegir(p, 'Nombre del Producto'),
          codigo: elegir(p, 'Código'),
          precio: elegir(p, 'Precio'),
          precioDescuento: promocion ? elegir(p, 'Precio Descuento') : '',
          foto: urlImagen(elegir(p, 'imagen 1 app')) || urlImagen(elegir(p, 'Foto 1'))
        };
      });
    return json({
      cliente: { nombre: elegir(cliente, 'Cliente'), slug: elegir(cliente, 'slug'), ...conf },
      categorias: [...(hayOfertas ? ['Ofertas'] : []), ...categorias],
      categoria, pagina, paginas, total: filtrados.length, productos
    });
  } catch (error) {
    console.error('REVISTA', error);
    return json({ error: 'No se pudieron leer los CSV. ' + (error?.message || 'Error desconocido') }, 502);
  }
}
