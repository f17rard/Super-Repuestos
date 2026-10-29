/* =====================================================================
   HU-04: Vista de productos (tarjetas con imagen, nombre, marca y precio)
   y paginación (CA3).

   Habla solo con NUESTRO backend: GET /api/productos?pagina=&por_pagina=
   Módulo AUTÓNOMO: esta página no carga app.js, y todo vive dentro de una
   función anónima, así que no declara variables globales ni choca con las de
   app.js (`$`, `escapar`, `formatoPrecio`, `api`) si algún día se cargan juntos.
   ===================================================================== */
(function () {
  "use strict";

  /* ---------- Configuración ---------- */
  const MONEDA = { locale: "es-SV", codigo: "USD" };
  const POR_PAGINA = 12; // CA3: con más de 12 productos se pagina
  const RUTA_DETALLE = "detalle.html"; // HU de detalle: debe leer el parámetro ?id=<id del producto>
  const VECINAS = 1; // páginas visibles a cada lado de la actual en la barra de paginación

  /* ---------- Helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const formatoPrecio = new Intl.NumberFormat(MONEDA.locale, { style: "currency", currency: MONEDA.codigo });
  const escapar = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Estado de la vista. cache guarda PROMESAS por página: la precarga y el clic comparten la misma petición.
  const estado = { pagina: 1, totalPaginas: 1, peticion: 0, cache: new Map() };

  /* ---------- Llamada a la API ---------- */
  async function api(ruta, params = {}) {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`/api/${ruta}${query ? "?" + query : ""}`);
    if (!res.ok) {
      const error = new Error(`Error ${res.status} en /api/${ruta}`);
      error.status = res.status;
      error.detalle = await res.json().catch(() => null);
      throw error;
    }
    return res.json();
  }

  // Una misma página se pide una sola vez; si falla, no se queda guardada y se puede reintentar
  function obtenerPagina(numero) {
    if (!estado.cache.has(numero)) {
      const promesa = api("productos", { pagina: numero, por_pagina: POR_PAGINA });
      estado.cache.set(numero, promesa);
      promesa.catch((err) => {
        estado.cache.delete(numero);
        console.error(err);
      });
    }
    return estado.cache.get(numero);
  }

  /* ---------- URL: la página vive en ?pagina=N (el botón "atrás" y los enlaces funcionan) ---------- */
  function leerPaginaDeUrl() {
    const numero = Number.parseInt(new URLSearchParams(window.location.search).get("pagina"), 10);
    return Number.isSafeInteger(numero) && numero >= 1 ? numero : 1;
  }

  const urlDePagina = (numero) =>
    numero <= 1 ? window.location.pathname : `${window.location.pathname}?pagina=${numero}`;

  /* ---------- Tarjetas (CA1, CA2) ---------- */
  function tarjetaProducto(p) {
    const tieneImagen = typeof p.imagen_url === "string" && /^https?:\/\//i.test(p.imagen_url);
    // alt vacío a propósito: el nombre ya está escrito junto a la foto y leerlo dos veces estorba
    const imagen = tieneImagen
      ? `<img src="${escapar(p.imagen_url)}" alt="" loading="lazy" decoding="async">`
      : "";
    const marca = p.marca ? escapar(p.marca) : "Marca no registrada";
    const precioValido = p.precio !== null && p.precio !== undefined && Number.isFinite(Number(p.precio));
    const precio = precioValido
      ? `<span class="precio">${formatoPrecio.format(Number(p.precio))}</span>`
      : `<span class="prod-sin-precio">Precio no disponible</span>`;
    // RN2: el enlace lleva el id de ESTE producto. La tarjeta entera es clicable (ver .prod-enlace::after)
    const destino = `${RUTA_DETALLE}?id=${encodeURIComponent(p.id)}`;
    return `
      <li class="prod-item">
        <article class="prod-tarjeta">
          <div class="prod-foto">${imagen}</div>
          <div class="prod-cuerpo">
            <h2 class="prod-nombre"><a class="prod-enlace" href="${escapar(destino)}">${escapar(p.nombre)}</a></h2>
            <p class="prod-marca"><span class="prod-marca-etq">Marca:</span> ${marca}</p>
            <div class="prod-pie">
              ${precio}
              <span class="prod-ver" aria-hidden="true">Ver detalle</span>
            </div>
          </div>
        </article>
      </li>`;
  }

  function pintarProductos(productos) {
    $("prod-rejilla").innerHTML = productos.map(tarjetaProducto).join("");
  }

  // Esqueletos con el tamaño de las tarjetas reales: la página no salta al cargar (RN3)
  function pintarEsqueleto() {
    const tarjeta = `
      <li class="prod-item" aria-hidden="true">
        <div class="prod-tarjeta">
          <div class="prod-foto esqueleto"></div>
          <div class="prod-cuerpo">
            <span class="esqueleto prod-esq-titulo"></span>
            <span class="esqueleto prod-esq-linea"></span>
            <span class="esqueleto prod-esq-precio"></span>
          </div>
        </div>
      </li>`;
    $("prod-rejilla").innerHTML = tarjeta.repeat(POR_PAGINA);
  }

  // Si una imagen no carga se quita, y el recuadro vacío muestra "Sin imagen" (regla :empty del CSS).
  // El evento error no burbujea, por eso se escucha en la fase de captura.
  $("prod-rejilla").addEventListener("error", (e) => {
    if (e.target.tagName === "IMG") e.target.remove();
  }, true);

  /* ---------- Resumen y avisos ---------- */
  function textoResumen({ total, pagina, por_pagina: porPagina }, mostrados) {
    if (total === 0) return "Sin productos";
    if (total <= porPagina) return `${total} ${total === 1 ? "producto" : "productos"}`;
    const desde = (pagina - 1) * porPagina + 1;
    return `Mostrando ${desde} a ${desde + mostrados - 1} de ${total} productos`;
  }

  function mostrarAviso(tipo, titulo, texto = "", conReintento = false) {
    $("prod-mensajes").innerHTML = `
      <div class="aviso aviso-${tipo}">
        <p class="aviso-titulo">${escapar(titulo)}</p>
        ${texto ? `<p class="aviso-texto">${escapar(texto)}</p>` : ""}
        ${conReintento ? `<p class="aviso-texto"><button type="button" class="boton" id="prod-reintentar">Reintentar</button></p>` : ""}
      </div>`;
  }

  // El frontend decide con el `codigo` del backend, no con el texto del mensaje
  function mostrarErrorCarga(err) {
    const codigo = err.detalle && err.detalle.detail && err.detalle.detail.codigo;
    if (codigo === "BD_NO_DISPONIBLE") {
      mostrarAviso("error", "No se pudo consultar el catálogo", "Intenta de nuevo en unos minutos.", true);
    } else {
      mostrarAviso("error", "No se pudieron cargar los productos", "Revisa tu conexión e intenta de nuevo.", true);
    }
  }

  /* ---------- Paginación (CA3) ---------- */
  // Primera, última y las cercanas a la actual; los huecos grandes se resumen con "…".
  // Un hueco de una sola página se rellena con esa página: mejor que un "…" que ahorra nada.
  function paginasVisibles(actual, total) {
    const mostrar = new Set([1, total]);
    for (let n = actual - VECINAS; n <= actual + VECINAS; n++) {
      if (n >= 1 && n <= total) mostrar.add(n);
    }
    const orden = [...mostrar].sort((a, b) => a - b);
    const salida = [];
    orden.forEach((n, i) => {
      if (i > 0) {
        const salto = n - orden[i - 1];
        if (salto === 2) salida.push(n - 1);
        else if (salto > 2) salida.push("…");
      }
      salida.push(n);
    });
    return salida;
  }

  function pintarPaginacion() {
    const { pagina, totalPaginas } = estado;
    const nav = $("prod-paginacion");
    if (totalPaginas <= 1) { // hasta 12 productos no hace falta paginar
      nav.hidden = true;
      nav.innerHTML = "";
      return;
    }
    const enlace = (numero, texto, etiqueta) =>
      `<a class="prod-pag-enlace" href="${escapar(urlDePagina(numero))}" data-pagina="${numero}" aria-label="${etiqueta}">${texto}</a>`;
    const inactivo = (texto) =>
      `<span class="prod-pag-enlace" aria-disabled="true">${texto}</span>`;

    const anterior = pagina > 1
      ? enlace(pagina - 1, "Anterior", "Ir a la página anterior")
      : inactivo("Anterior");
    const siguiente = pagina < totalPaginas
      ? enlace(pagina + 1, "Siguiente", "Ir a la página siguiente")
      : inactivo("Siguiente");

    const numeros = paginasVisibles(pagina, totalPaginas).map((n) => {
      if (n === "…") return `<li class="prod-pag-numero prod-pag-puntos" aria-hidden="true">…</li>`;
      if (n === pagina) {
        return `<li class="prod-pag-numero"><span class="prod-pag-enlace" aria-current="page" aria-label="Página ${n}, página actual">${n}</span></li>`;
      }
      return `<li class="prod-pag-numero">${enlace(n, n, `Ir a la página ${n}`)}</li>`;
    }).join("");

    // En pantallas angostas los números se ocultan y queda este texto entre Anterior y Siguiente
    nav.innerHTML = `
      <ul class="prod-pag-lista">
        <li>${anterior}</li>
        ${numeros}
        <li class="prod-pag-indicador">Página ${pagina} de ${totalPaginas}</li>
        <li>${siguiente}</li>
      </ul>`;
    nav.hidden = false;
  }

  function llevarAlListado() {
    const listado = $("prod-listado");
    const reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    listado.scrollIntoView({ behavior: reducir ? "auto" : "smooth", block: "start" });
    listado.focus({ preventScroll: true }); // el teclado no se queda en un enlace que ya no existe
  }

  /* ---------- Carga de una página ---------- */
  async function cargarPagina(numero, { desplazar = false } = {}) {
    const peticion = ++estado.peticion; // si llega tarde una respuesta vieja, se descarta
    estado.pagina = numero;
    $("prod-mensajes").innerHTML = "";
    $("prod-rejilla").setAttribute("aria-busy", "true");
    $("prod-resumen").textContent = "Cargando productos…";
    pintarEsqueleto();
    pintarPaginacion(); // la barra ya marca la página elegida mientras llegan los datos
    if (desplazar) llevarAlListado();

    try {
      const datos = await obtenerPagina(numero);
      if (peticion !== estado.peticion) return;

      // El backend acota la página (p. ej. ?pagina=99): la URL y el estado se corrigen
      estado.pagina = datos.pagina;
      estado.totalPaginas = datos.total_paginas;
      if (datos.pagina !== numero) window.history.replaceState(null, "", urlDePagina(datos.pagina));

      if (datos.productos.length === 0) {
        $("prod-rejilla").innerHTML = "";
        $("prod-resumen").textContent = textoResumen(datos, 0);
        mostrarAviso("vacio", "Aún no hay repuestos en el catálogo");
      } else {
        pintarProductos(datos.productos);
        $("prod-resumen").textContent = textoResumen(datos, datos.productos.length);
      }
      pintarPaginacion();

      // RN3: se adelanta la página siguiente para que "Siguiente" responda al instante
      if (datos.pagina < datos.total_paginas) obtenerPagina(datos.pagina + 1);
    } catch (err) {
      if (peticion !== estado.peticion) return;
      console.error(err);
      $("prod-rejilla").innerHTML = "";
      $("prod-resumen").textContent = "No se pudo cargar el listado";
      mostrarErrorCarga(err);
    } finally {
      if (peticion === estado.peticion) $("prod-rejilla").setAttribute("aria-busy", "false");
    }
  }

  // Acción de la persona: se agrega una entrada al historial para que "atrás" vuelva a la página anterior
  function irAPagina(numero) {
    if (numero === estado.pagina) return;
    window.history.pushState(null, "", urlDePagina(numero));
    cargarPagina(numero, { desplazar: true });
  }

  /* ---------- Eventos y arranque ---------- */
  $("prod-paginacion").addEventListener("click", (e) => {
    const enlace = e.target.closest("a[data-pagina]");
    if (!enlace) return;
    // Con Ctrl, Cmd, Shift o botón del medio el navegador abre el enlace en otra pestaña
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    irAPagina(Number(enlace.dataset.pagina));
  });

  $("prod-mensajes").addEventListener("click", (e) => {
    if (e.target.closest("#prod-reintentar")) cargarPagina(estado.pagina);
  });

  // Atrás y adelante del navegador: se muestra la página que dice la URL
  window.addEventListener("popstate", () => cargarPagina(leerPaginaDeUrl()));

  cargarPagina(leerPaginaDeUrl());
})();
