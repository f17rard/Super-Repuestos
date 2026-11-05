/* =====================================================================
   El navegador solo habla con NUESTRO backend (/api/...).
   La conexión a Supabase vive en backend/main.py.
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const MONEDA = { locale: "es-SV", codigo: "USD" };
const formatoPrecio = new Intl.NumberFormat(MONEDA.locale, { style: "currency", currency: MONEDA.codigo });
const escapar = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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

function llenarLista(select, valores, textoInicial) {
  select.innerHTML = `<option value="">${textoInicial}</option>` +
    valores.map((v) => `<option value="${escapar(v)}">${escapar(v)}</option>`).join("");
  select.disabled = valores.length === 0;
}

/* ---------- Rediseño (HU-01): cinta de marcas estática y botón con imán ----------
   La cinta lista las marcas que ya trae /api/marcas (solo adorno, sin animación).
   El imán mueve el botón hacia el puntero con transform, solo con ratón y sin "reduce motion". */
const FUERZA_IMAN = 0.2;

function pintarCinta() {
  const marcas = [...$("marca").options].filter((o) => o.value).map((o) => o.text);
  if (!marcas.length) { $("cinta-marcas").innerHTML = ""; return; }
  const items = marcas.map((m) => `<span class="cinta-item">${escapar(m)}</span>`).join("");
  $("cinta-marcas").innerHTML = `<div class="cinta-pista">${items}</div>`;
}

function activarIman(boton) {
  const permitido = window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
  if (!permitido.matches) return;
  boton.addEventListener("pointermove", (e) => {
    const caja = boton.getBoundingClientRect();
    boton.style.setProperty("--iman-x", `${(e.clientX - caja.left - caja.width / 2) * FUERZA_IMAN}px`);
    boton.style.setProperty("--iman-y", `${(e.clientY - caja.top - caja.height / 2) * FUERZA_IMAN}px`);
  });
  boton.addEventListener("pointerleave", () => {
    boton.style.removeProperty("--iman-x");
    boton.style.removeProperty("--iman-y");
  });
}

/* ---------- T2: listas en cascada (marca > modelo > año) ---------- */
async function cargarMarcas() {
  try {
    llenarLista($("marca"), await api("marcas"), "Selecciona una marca");
  } catch (err) {
    console.error(err);
    $("err-marca").textContent = "No se pudieron cargar las marcas. Recarga la página para reintentar.";
  }
  pintarCinta();
}

async function cargarModelos(marca) {
  const numero = Number($("modelo").dataset.peticion || 0) + 1;
  $("modelo").dataset.peticion = String(numero);
  // Invalida también cualquier carga de años del vehículo anterior.
  $("anio").dataset.peticion = String(Number($("anio").dataset.peticion || 0) + 1);
  $("err-modelo").textContent = "";
  $("err-anio").textContent = "";
  llenarLista($("modelo"), [], "Selecciona un modelo");
  llenarLista($("anio"), [], "Selecciona un año");
  if (!marca) return;
  try {
    const modelos = await api("modelos", { marca });
    if (Number($("modelo").dataset.peticion) !== numero) return;
    llenarLista($("modelo"), modelos, "Selecciona un modelo");
  } catch (err) {
    if (Number($("modelo").dataset.peticion) !== numero) return;
    console.error(err);
    $("err-modelo").textContent = "No se pudieron cargar los modelos. Vuelve a seleccionar la marca.";
  }
}

async function cargarAnios(marca, modelo) {
  const numero = Number($("anio").dataset.peticion || 0) + 1;
  $("anio").dataset.peticion = String(numero);
  $("err-anio").textContent = "";
  llenarLista($("anio"), [], "Selecciona un año");
  if (!marca || !modelo) return;
  try {
    const anios = await api("anios", { marca, modelo });
    if (Number($("anio").dataset.peticion) !== numero) return;
    llenarLista($("anio"), anios, "Selecciona un año");
  } catch (err) {
    if (Number($("anio").dataset.peticion) !== numero) return;
    console.error(err);
    $("err-anio").textContent = "No se pudieron cargar los años. Vuelve a seleccionar el modelo.";
  }
}

$("marca").addEventListener("change", (e) => cargarModelos(e.target.value));
$("modelo").addEventListener("change", (e) => cargarAnios($("marca").value, e.target.value));

/* ---------- T3: resultado de búsqueda ---------- */
const ESQUELETOS_RESULTADOS = 3;
const REPUESTOS_POR_PAGINA = 10;
let filtrosActuales = {};
let paginaActual = 1;
let totalPaginas = 0;

/* ---------- Filtros por categoría ----------
   Los valores coinciden con las categorías válidas del backend (motor, electrico, …). */
const CATEGORIAS = [
  { valor: "motor", etiqueta: "Motor" },
  { valor: "electrico", etiqueta: "Eléctrico" },
  { valor: "frenos", etiqueta: "Frenos" },
  { valor: "transmision", etiqueta: "Transmisión" },
  { valor: "suspension", etiqueta: "Suspensión" },
  { valor: "aire_acondicionado", etiqueta: "Aire acondicionado" },
  { valor: "accesorios", etiqueta: "Accesorios" }
];

function pintarCategorias() {
  const valorActivo = $("categorias").dataset.activa || "";
  const etiqueta = CATEGORIAS.find((categoria) => categoria.valor === valorActivo)?.etiqueta;
  $("categorias-etiqueta").textContent = `Categorías · ${etiqueta || "Todas"}`;
  const boton = (valor, etiqueta) => {
    const activa = valorActivo === valor;
    return `<button type="button" class="cat-boton${activa ? " activa" : ""}" data-cat="${valor}" aria-pressed="${activa}">${etiqueta}</button>`;
  };
  $("categorias").innerHTML =
    boton("", "Todas") + CATEGORIAS.map((c) => boton(c.valor, c.etiqueta)).join("");
}

$("categorias-toggle").addEventListener("click", () => {
  const boton = $("categorias-toggle");
  boton.setAttribute("aria-expanded", String(boton.getAttribute("aria-expanded") !== "true"));
});

function cerrarCategorias() {
  const boton = $("categorias-toggle");
  if (boton.getAttribute("aria-expanded") !== "true") return;
  boton.setAttribute("aria-expanded", "false");
  if (window.matchMedia("(max-width: 768px)").matches) boton.focus();
}

for (const id of ["categorias-toggle", "categorias"]) {
  $(id).addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") cerrarCategorias();
  });
}

$("categorias").addEventListener("click", (e) => {
  const btn = e.target.closest(".cat-boton");
  if (!btn) return;
  cerrarCategorias();
  if (($("categorias").dataset.activa || "") === btn.dataset.cat) return;
  $("categorias").dataset.activa = btn.dataset.cat;
  pintarCategorias();
  buscarRepuestos();
});

function mostrarEsqueleto(texto) {
  const fila = `
    <article class="repuesto" aria-hidden="true">
      <div class="repuesto-foto"></div>
      <div class="repuesto-cab">
        <span class="esqueleto esq-titulo"></span>
        <span class="esqueleto esq-precio"></span>
      </div>
      <div class="repuesto-detalle">
        <span class="esqueleto esq-linea"></span>
        <span class="esqueleto esq-linea"></span>
      </div>
    </article>`;
  $("resultados").innerHTML = `<p class="resumen">${escapar(texto)}</p>` + fila.repeat(ESQUELETOS_RESULTADOS);
}

function textoResumen(mostrados, total, hayFiltros) {
  if (!hayFiltros) return "Catálogo de repuestos";
  if (total > mostrados) return `Mostrando ${mostrados} de ${total} repuestos, los más relevantes primero`;
  return `${total} ${total === 1 ? "repuesto encontrado" : "repuestos encontrados"}`;
}

function sucursalesOrdenadas(repuesto) {
  return [...(repuesto.sucursales || [])].sort((a, b) => b.stock - a.stock);
}

function filasSucursal(sucursales) {
  return sucursales.map((s) => `<tr><td><span class="sucursal-nombre">${escapar(s.nombre)}</span>
    ${s.direccion ? `<span class="sucursal-direccion">${escapar(s.direccion)}</span>` : ""}</td>
    <td class="num ${s.stock > 0 ? "stock-ok" : "stock-cero"}">${escapar(s.stock)}</td></tr>`).join("");
}

function detalleSucursales(sucursales) {
  if (!sucursales.length) return '<p class="sucursal-vacia">Este repuesto no tiene sucursales registradas.</p>';
  const conStock = sucursales.filter((s) => s.stock > 0).length;
  return `<details class="sucursales"><summary><span>Stock por sucursal (${conStock}/${sucursales.length} con stock)</span>
    <span class="sucursales-flecha" aria-hidden="true"></span></summary>
    <table><thead><tr><th>Sucursal</th><th class="num">Stock</th></tr></thead>
    <tbody>${filasSucursal(sucursales)}</tbody></table></details>`;
}

function imagenRepuesto(repuesto) {
  return repuesto.imagen
    ? `<img src="${escapar(repuesto.imagen)}" alt="${escapar(repuesto.nombre)}" loading="lazy">`
    : '<span class="sin-imagen">Sin imagen</span>';
}

function enlaceDetalle(repuesto) {
  const id = String(repuesto.id ?? "");
  if (!/^\d+$/.test(id) || Number(id) <= 0) return "";
  return `<a class="boton enlace-detalle" href="/pages/detalle.html?id=${encodeURIComponent(id)}">Ver detalle</a>`;
}

function informacionRepuesto(repuesto, sucursales) {
  const conStock = sucursales.filter((s) => s.stock > 0).length;
  const disponibilidad = conStock
    ? `En stock en ${conStock} de ${sucursales.length} ${sucursales.length === 1 ? "sucursal" : "sucursales"}`
    : "Sin stock";
  const fabricante = repuesto.marca_fabricante || repuesto.fabricante || "Fabricante no registrado";
  const codigo = repuesto.codigo ? `Código: ${repuesto.codigo}` : `ID interno: ${repuesto.id ?? "No disponible"}`;
  return `<h2>${escapar(repuesto.nombre)}</h2><p class="repuesto-marca">${escapar(fabricante)}</p>
    <p class="repuesto-codigo">${escapar(codigo)}</p>
    ${repuesto.descripcion ? `<p class="repuesto-desc">${escapar(repuesto.descripcion)}</p>` : ""}
    <span class="precio">${formatoPrecio.format(Number(repuesto.precio) || 0)}</span>
    <span class="disponibilidad ${conStock ? "stock-ok" : "stock-cero"}">${disponibilidad}</span>
    ${enlaceDetalle(repuesto)}`;
}

function tarjetaRepuesto(repuesto) {
  const sucursales = sucursalesOrdenadas(repuesto);
  return `<article class="repuesto"><div class="repuesto-foto">${imagenRepuesto(repuesto)}</div>
    <div class="repuesto-cab">${informacionRepuesto(repuesto, sucursales)}</div>
    <div class="repuesto-detalle">${detalleSucursales(sucursales)}</div></article>`;
}

function vigilarImagen(imagen) {
  function mostrarSinImagen() {
    const texto = document.createElement("span");
    texto.className = "sin-imagen";
    texto.textContent = "Sin imagen";
    imagen.replaceWith(texto);
  }
  imagen.addEventListener("error", mostrarSinImagen, { once: true });
  if (imagen.complete && imagen.naturalWidth === 0) mostrarSinImagen();
}

function mostrarResultados(repuestos, total, hayFiltros) {
  const filasRepuestos = repuestos.map((r) => {
    // Primero las sucursales con más stock: el mecánico ve de inmediato dónde está la pieza
    const sucursales = [...r.sucursales].sort((a, b) => b.stock - a.stock);
    const conStock = sucursales.filter((s) => s.stock > 0).length;
    const disponibilidad = conStock > 0
      ? `En stock en ${conStock} de ${sucursales.length} ${sucursales.length === 1 ? "sucursal" : "sucursales"}`
      : "Sin stock";
    const filas = sucursales.map((s) => `
      <tr>
        <td>
          <span class="sucursal-nombre">${escapar(s.nombre)}</span>
          ${s.direccion ? `<span class="sucursal-direccion">${escapar(s.direccion)}</span>` : ""}
        </td>
        <td class="num ${s.stock > 0 ? "stock-ok" : "stock-cero"}">${escapar(s.stock)}</td>
      </tr>`).join("");
    // Compacto por defecto: una sola línea de resumen; la tabla se despliega al hacer clic
    const detalle = sucursales.length
      ? `<details class="sucursales">
          <summary>
            <span>Stock por sucursal (${conStock}/${sucursales.length} con stock)</span>
            <span class="sucursales-flecha" aria-hidden="true"></span>
          </summary>
          <table>
            <thead><tr><th>Sucursal</th><th class="num">Stock</th></tr></thead>
            <tbody>${filas}</tbody>
          </table>
        </details>`
      : `<p class="sucursal-vacia">Este repuesto no tiene sucursales registradas.</p>`;
    return `
      <article class="repuesto">
        <div class="repuesto-foto">${r.imagen
          ? `<img src="${escapar(r.imagen)}" alt="${escapar(r.nombre)}" loading="lazy">`
          : '<span class="sin-imagen">Sin imagen</span>'}</div>
        <div class="repuesto-cab">
          <h2>${escapar(r.nombre)}</h2>
          ${r.marca_fabricante || r.fabricante ? `<p class="repuesto-marca">${escapar(r.marca_fabricante || r.fabricante)}</p>` : ""}
          <p class="repuesto-codigo">${escapar(r.codigo ? `Código: ${r.codigo}` : `ID interno: ${r.id}`)}</p>
          ${r.descripcion ? `<p class="repuesto-desc">${escapar(r.descripcion)}</p>` : ""}
          <span class="precio">${formatoPrecio.format(r.precio)}</span>
          <a class="ver-detalle" href="pages/detalle.html?id=${encodeURIComponent(String(r.id))}" aria-label="Ver detalle de ${escapar(r.nombre)}">Ver detalle</a>
          <span class="disponibilidad ${conStock > 0 ? "stock-ok" : "stock-cero"}">${disponibilidad}</span>
        </div>
        <div class="repuesto-detalle">${detalle}</div>
      </article>`;
  }).join("");
  $("resultados").innerHTML =
    `<p class="resumen">${textoResumen(repuestos.length, total, hayFiltros)}</p>` + filasRepuestos;

  $("resultados").querySelectorAll(".repuesto-foto img").forEach((imagen) => {
    vigilarImagen(imagen);
  });
}

function limpiarPantalla() {
  $("resultados").innerHTML = "";
  $("mensajes").innerHTML = "";
}

/* ---------- T4, T5 y T6: avisos ---------- */
function mostrarAviso(tipo, titulo, texto = "") {
  $("mensajes").innerHTML = `
    <div class="aviso aviso-${tipo}">
      <p class="aviso-titulo">${escapar(titulo)}</p>
      ${texto ? `<p class="aviso-texto">${escapar(texto)}</p>` : ""}
    </div>`;
}

/* ---------- Estados del catálogo (CA2, CA3 y CA4) ---------- */
function mostrarSinStock() {
  mostrarAviso("sin-stock", "Sin stock en ninguna sucursal", "Prueba con otro repuesto del mismo vehículo o consulta más tarde.");
}
function mostrarNoEncontrado() {
  mostrarAviso("vacio", "No se encontraron resultados", "Revisa la ortografía o escribe solo una palabra, por ejemplo «filtro».");
}
function mostrarErrorInventario() {
  mostrarAviso("error", "No se pudo consultar el stock, intenta de nuevo más tarde");
}

function mostrarErrorBusqueda(err) {
  const codigo = err.detalle?.detail?.codigo;
  if (codigo === "CATEGORIA_INVALIDA" || codigo === "FILTROS_INVALIDOS" || err.status === 422) {
    mostrarAviso("error", "Revisa los filtros de búsqueda e intenta de nuevo.");
    return;
  }
  mostrarErrorInventario();
}

/* ---------- T2: flujo de búsqueda ----------
   Ningún filtro es obligatorio: se envía solo lo que la persona llenó. Sin filtros el
   backend devuelve el catálogo más relevante, y así se muestra al abrir la página. */
function leerFiltros() {
  const filtros = {
    marca: $("marca").value,
    modelo: $("modelo").value,
    anio: $("anio").value,
    repuesto: $("repuesto").value.trim(),
    categoria: $("categorias").dataset.activa || ""
  };
  return Object.fromEntries(Object.entries(filtros).filter(([, valor]) => valor));
}

// El número de petición vive en el DOM: si llega tarde una respuesta vieja, se descarta
const esPeticionVieja = (numero) => Number($("resultados").dataset.peticion) !== numero;

function actualizarPaginacion(cargando) {
  $("paginacion").hidden = totalPaginas <= 1;
  $("pagina-actual").textContent = `Página ${paginaActual} de ${totalPaginas}`;
  $("pagina-anterior").disabled = cargando || paginaActual <= 1;
  $("pagina-siguiente").disabled = cargando || paginaActual >= totalPaginas;
}

async function buscarRepuestos(pagina = 1, navegando = false) {
  if (!navegando) {
    limpiarPantalla();
    totalPaginas = 0;
  }
  const filtros = navegando ? filtrosActuales : leerFiltros();
  const hayFiltros = Object.keys(filtros).length > 0;
  const numero = Number($("resultados").dataset.peticion || 0) + 1;
  $("resultados").dataset.peticion = String(numero);

  const boton = $("btn-buscar");
  boton.disabled = true;
  actualizarPaginacion(true);
  $("estado").textContent = "Buscando…";
  if (!navegando) mostrarEsqueleto(hayFiltros ? "Buscando repuestos…" : "Cargando el catálogo…");

  try {
    const datos = await api("repuestos", { ...filtros, pagina, limite: REPUESTOS_POR_PAGINA });
    if (esPeticionVieja(numero)) return;
    const { total, repuestos, hay_stock: hayStock } = datos;
    filtrosActuales = filtros;
    paginaActual = datos.pagina ?? pagina;
    totalPaginas = Math.ceil(total / REPUESTOS_POR_PAGINA);
    limpiarPantalla();

    if (repuestos.length === 0) {
      if (filtros.categoria) {
        mostrarAviso("vacio", "Por el momento no hay repuestos disponibles en esta categoría", "Selecciona «Todas» para quitar el filtro de categoría.");
      } else if (hayFiltros) mostrarNoEncontrado();
      else mostrarAviso("vacio", "Aún no hay repuestos en el catálogo");
      return;
    }

    mostrarResultados(repuestos, total, hayFiltros); // T3

    if (hayFiltros && hayStock === false) mostrarSinStock();
    if (navegando) $("resultados").focus();
  } catch (err) {
    if (esPeticionVieja(numero)) return;
    console.error(err);
    if (!navegando) $("resultados").innerHTML = "";
    mostrarErrorBusqueda(err);
  } finally {
    if (!esPeticionVieja(numero)) {
      boton.disabled = false;
      actualizarPaginacion(false);
      $("estado").textContent = "";
    }
  }
}

$("pagina-anterior").addEventListener("click", () => buscarRepuestos(paginaActual - 1, true));
$("pagina-siguiente").addEventListener("click", () => buscarRepuestos(paginaActual + 1, true));

$("form-busqueda").addEventListener("submit", (e) => {
  e.preventDefault();
  if (Object.keys(leerFiltros()).length === 0) {
    $("err-repuesto").textContent = "Escribe el nombre del repuesto o selecciona un filtro.";
    $("repuesto").setAttribute("aria-invalid", "true");
    $("repuesto").focus();
    return;
  }
  $("err-repuesto").textContent = "";
  $("repuesto").removeAttribute("aria-invalid");
  buscarRepuestos();
});

$("repuesto").addEventListener("input", () => {
  $("err-repuesto").textContent = "";
  $("repuesto").removeAttribute("aria-invalid");
});

activarIman($("btn-buscar"));
pintarCategorias();
cargarMarcas();
buscarRepuestos();
