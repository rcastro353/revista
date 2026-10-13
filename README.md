# REVISTA · Versión estable para Cloudflare Pages Free

## Qué estaba causando las caídas

La función anterior `functions/api/catalog.js` descargaba los CSV y, **en cada visita o cambio de categoría**, ejecutaba el procesamiento completo de productos: analizar CSV, convertir filas a objetos, normalizar columnas, generar categorías, filtrar descuentos y construir un JSON. Las métricas mostradas en Cloudflare indicaban 292 ejecuciones que excedieron el límite de CPU. El plan gratuito permite 10 ms por invocación.

## Qué hace esta versión

- **En Cloudflare:** `functions/api/catalog.js` se limita a consultar el CSV maestro pequeño, comprobar qué cliente está activo y *transmitir directamente* los CSV de productos/configuración, sin procesar el catálogo grande.
- **En el navegador:** `engine.js` analiza los CSV y genera las categorías, promociones, fotos, descuentos y paginación. Cambiar de categoría o de página ya **no provoca otra petición a la API** durante la vigencia de los datos.
- **Actualización:** intenta obtener datos nuevos cada 30 minutos, sin exigir que el visitante actualice a mano. La actualización se activa durante una visita.
- **Respaldo del servidor:** la función guarda CSV válidos en la caché de Cloudflare hasta 7 días (la red puede expulsarlos antes); si Google falla durante una actualización, sirve lo que todavía tenga guardado y lo identifica mediante la cabecera `X-Revista-Estado: RESPALDO`.
- **Respaldo del navegador:** conserva la última copia correcta por cliente hasta 24 horas, *si el navegador permite localStorage y hay espacio*. La página informa si está mostrando datos guardados por un fallo de conexión.
- **Reintentos:** ante errores temporales, el navegador hace un segundo intento. Ante errores 4xx (por ejemplo, catálogo inexistente), no insiste.
- **Sin cambios de negocio:** admite AppSheet EnumList (múltiples categorías), sección 🔥 Promociones independiente, descuento visible también en la categoría normal, tres fotos, primer archivo de imagen alternativo, WhatsApp por cliente y 50 productos por página.

**Importante:** el contrato interno de `/api/catalog` CAMBIA, y por eso `engine.js` y `functions/api/catalog.js` deben publicarse *juntos*. `/api/catalog` sin parámetros sigue mostrando la lista JSON de clientes; para consultar los CSV ahora se usan `/api/catalog?cliente=girlpower&archivo=catalogo` y `/api/catalog?cliente=girlpower&archivo=configuracion`. Ya no se usa `?cliente=girlpower&categoria=...` en la API; el navegador hace el filtrado.

## Archivos que deben reemplazarse

1. `/engine.js`
2. `/index.html` (incluye versión en URL de `engine.js` para evitar que los clientes carguen JS antiguo)
3. `/style.css` (solo añade el aviso discreto de datos de respaldo)
4. `/functions/api/catalog.js`

No hace falta editar el Excel, AppSheet ni sus enlaces CSV, y no se necesita Wrangler, una base de datos nueva, ni un plan de pago.

## Instalación recomendada: UN SOLO COMMIT (GitHub Desktop)

1. En GitHub, entrá a `https://github.com/rcastro353/revista` y usá **Code → Download ZIP** para guardar una copia del estado anterior.
2. En GitHub Desktop, cloná el repositorio `rcastro353/revista` si aún no lo tenés en tu computadora.
3. Descomprimí este paquete y copiá los cuatro archivos **respetando sus ubicaciones**, reemplazando los correspondientes en la carpeta del repositorio. `catalog.js` debe ir dentro de `functions/api/`.
4. Comprobá que GitHub Desktop muestre cuatro archivos modificados. Escribí `Evitar límite de CPU en REVISTA` y hacé **un solo Commit to main** y después **Push origin**.
5. Esperá a que Cloudflare → `revista-oti` → Implementaciones muestre **Success** en la publicación del nuevo commit.

### Si solo querés usar GitHub desde el navegador

Para no publicar versiones mezcladas durante la edición, trabajá primero en una **rama nueva** creada a partir de `main`. Subí/reemplazá los cuatro archivos en esa rama y luego hacé un *Pull Request* hacia `main`. La fusión publicará los cambios juntos. No conviene hacer cuatro commits separados directamente en `main` con el sitio en producción.

## Pruebas después de publicar

1. `https://revista-oti.pages.dev/` → aparecen Girl Power y Prueba.
2. `https://revista-oti.pages.dev/girlpower` → se abre el catálogo.
3. `https://revista-oti.pages.dev/girlpower?categoria=%F0%9F%94%A5%20Promociones` → aparecen promociones y descuento.
4. Abrí la categoría original de una promoción: se muestra el precio anterior tachado y el descuento.
5. Tocá la flecha de una foto: cambia de imagen; en la lista se descarga inicialmente solo la primera.
6. Verificá WhatsApp, categorías con varias asignaciones y paginación cuando haya más de 50 productos.
7. Abrí **Herramientas para desarrolladores → Red** y comprobá que un cambio de categoría no haga nuevas peticiones a `/api/catalog`.
8. En Cloudflare → Métricas, observá **errores NUEVOS** por CPU durante varias horas. Los errores históricos no desaparecen instantáneamente de la gráfica.

Para verificar la API ahora:
- Lista: `https://revista-oti.pages.dev/api/catalog`
- CSV productos: `https://revista-oti.pages.dev/api/catalog?cliente=girlpower&archivo=catalogo`
- Configuración: `https://revista-oti.pages.dev/api/catalog?cliente=girlpower&archivo=configuracion`

## Volver a la versión anterior

Si algo falla, restaurá los cuatro archivos de tu ZIP de respaldo **en un solo commit**, o revertí el commit de GitHub. Al volver a la versión anterior, la API y el motor deben regresar juntos.

## Limitaciones honestas

Ningún sitio que depende de Cloudflare, Google Sheets y la red puede garantizar disponibilidad absoluta. Esta arquitectura elimina de la función de Cloudflare el trabajo pesado identificado en las métricas, pero aún necesita que Google esté disponible en una primera visita sin respaldo. El almacenamiento del navegador puede estar deshabilitado o lleno; Cloudflare puede expulsar elementos de caché antes del tiempo indicado. Si el catálogo tiene información guardada de hace más de 30 minutos, se muestra una advertencia cuando se usa el respaldo.

**Verificación:** Se pasaron pruebas de lógica con datos simulados y simulación de caída del proveedor. No se ha desplegado en Cloudflare ni medido allí su consumo real de CPU: comprobalo en las métricas después de publicar.
