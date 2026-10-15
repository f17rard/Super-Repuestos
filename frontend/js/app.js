/* =====================================================================
   El navegador solo habla con NUESTRO backend (/api/...).
   La conexión a Supabase vive en backend/main.py.
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const MONEDA = { locale: "es-SV", codigo: "USD" };
const formatoPrecio = new Intl.NumberFormat(MONEDA.locale, { style: "currency", currency: MONEDA.codigo });
const escapar = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Minúsculas y sin tildes, para comparar texto sin que "suspensión" y "suspension" difieran
const normalizar = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const MAX_TERMINOS = 6; // mismo límite que el backend (terminos_de)

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

/* ---------- Listas en cascada (marca > modelo > año) ---------- */
async function cargarMarcas() {
  try {
    llenarLista($("marca"), await api("marcas"), "Selecciona");
  } catch (err) {
    console.error(err);
    $("estado").textContent = "No se pudieron cargar las marcas.";
  }
}

async function cargarModelos(marca) {
  llenarLista($("modelo"), [], "Selecciona");
  llenarLista($("anio"), [], "Selecciona");
  if (!marca) return;
  try {
    llenarLista($("modelo"), await api("modelos", { marca }), "Selecciona");
  } catch (err) { console.error(err); }
}

async function cargarAnios(marca, modelo) {
  llenarLista($("anio"), [], "Selecciona");
  if (!marca || !modelo) return;
  try {
    llenarLista($("anio"), await api("anios", { marca, modelo }), "Selecciona");
  } catch (err) { console.error(err); }
}

$("marca").addEventListener("change", (e) => cargarModelos(e.target.value));
$("modelo").addEventListener("change", (e) => cargarAnios($("marca").value, e.target.value));

/* =====================================================================
   BÚSQUEDA POR TEXTO (palabra clave, código o descripción)
   ===================================================================== */

/* Divide el texto en palabras, igual que terminos_de() del backend */
function terminosDe(texto) {
  return texto.replace(/[,()"\\]/g, " ").split(/\s+/).filter(Boolean).slice(0, MAX_TERMINOS);
}

/* Un repuesto coincide si CADA palabra aparece en nombre, código o descripción.
   Es el mismo criterio del backend (AND entre palabras, OR entre campos) y
   garantiza que solo se muestren resultados que contienen lo escrito. */
function coincide(repuesto, terminos) {
  const campos = normalizar([repuesto.nombre, repuesto.codigo, repuesto.descripcion].join(" "));
  return terminos.every((t) => campos.includes(normalizar(t)));
}

/* Marca con <mark> las palabras buscadas (el texto se escapa antes de insertarlo) */
function resaltar(texto, terminos) {
  const base = String(texto ?? "");
  if (!terminos.length) return escapar(base);
  const patron = terminos.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return base.split(new RegExp(`(${patron})`, "gi"))
    .map((trozo, i) => (i % 2 ? `<mark>${escapar(trozo)}</mark>` : escapar(trozo)))
    .join("");
}

/* ---------- Validación: texto o vehículo (completo); ninguno es obligatorio por separado ---------- */
function limpiarValidacion() {
  $("msg-busqueda").textContent = "";
  $("campo-repuesto").classList.remove("invalido");
  ["marca", "modelo", "anio"].forEach((id) => $("campo-" + id).classList.remove("invalido"));
}

function validar() {
  limpiarValidacion();
  const texto = $("repuesto").value.trim();
  const campos = ["marca", "modelo", "anio"];
  const faltan = campos.filter((id) => !$(id).value);
  const hayVehiculo = faltan.length < campos.length;

  if (!texto && !hayVehiculo) {
    $("msg-busqueda").textContent = "Escribe un repuesto o selecciona un vehículo.";
    $("campo-repuesto").classList.add("invalido");
    return false;
  }
  if (hayVehiculo && faltan.length) {
    $("msg-busqueda").textContent = "Para buscar por vehículo selecciona marca, modelo y año.";
    faltan.forEach((id) => $("campo-" + id).classList.add("invalido"));
    return false;
  }
  return true;
}

$("form-busqueda").addEventListener("input", limpiarValidacion);
$("form-busqueda").addEventListener("change", limpiarValidacion);

/* =====================================================================
   RESULTADOS: tarjetas, filtros laterales y orden (todo en el navegador)
   ===================================================================== */
let busqueda = { texto: "", terminos: [], vehiculo: null, repuestos: [] };
const filtros = { disp: new Set(), suc: new Set() };

const ORDENES = {
  relevancia: null, // el backend ya devuelve los resultados ordenados por relevancia
  precio_asc: (a, b) => a.precio - b.precio,
  precio_desc: (a, b) => b.precio - a.precio
};

const stockTotal = (r) => r.sucursales.reduce((n, s) => n + s.stock, 0);

function pasaFiltros(r) {
  const total = stockTotal(r);
  if (filtros.disp.size) {
    const ok = (filtros.disp.has("disponible") && total > 0) ||
               (filtros.disp.has("agotado") && total === 0);
    if (!ok) return false;
  }
  if (filtros.suc.size) {
    const ok = r.sucursales.some((s) => filtros.suc.has(s.nombre) && s.stock > 0);
    if (!ok) return false;
  }
  return true;
}

function tarjeta(r, terminos, vehiculo) {
  const total = stockTotal(r);
  const filas = r.sucursales.map((s) => `
      <li>
        <span>${escapar(s.nombre)}</span>
        <span class="${s.stock > 0 ? "stock-ok" : "stock-cero"}">${s.stock}</span>
      </li>`).join("") || `<li class="vacio">Sin inventario registrado</li>`;
  // Si el backend llega a enviar la imagen, se usa; si no, queda el marcador "Sin imagen"
  const imagen = r.imagen_url || r.imagen;
  const media = imagen
    ? `<img src="${escapar(imagen)}" alt="${escapar(r.nombre)}" loading="lazy">`
    : `<i class="fa-solid fa-gear" aria-hidden="true"></i><span>Sin imagen</span>`;

  return `
    <article class="product-card">
      ${vehiculo ? `<span class="badge-compatible">Compatible</span>` : ""}
      <div class="card-img-wrap">${media}</div>
      <div class="card-body">
        <h3 class="product-name">${resaltar(r.nombre, terminos)}</h3>
        ${vehiculo ? `<p class="product-compatibility">${escapar(`${vehiculo.marca} ${vehiculo.modelo} ${vehiculo.anio}`)}</p>` : ""}
        ${r.descripcion ? `<p class="product-desc">${resaltar(r.descripcion, terminos)}</p>` : ""}
        ${r.codigo ? `<span class="product-code">Código: ${resaltar(r.codigo, terminos)}</span>` : ""}
        <div class="card-footer">
          <span class="price">${formatoPrecio.format(r.precio)}</span>
          <span class="stock-pill ${total > 0 ? "ok" : "cero"}">${total > 0 ? `${total} en stock` : "Agotado"}</span>
        </div>
        <details class="sucursales">
          <summary>Stock por sucursal</summary>
          <ul>${filas}</ul>
        </details>
      </div>
    </article>`;
}

function pintarEncabezado() {
  const { texto, vehiculo } = busqueda;
  $("titulo-resultados").textContent = texto
    ? `Resultados para "${texto}"`
    : `Repuestos para ${vehiculo.marca} ${vehiculo.modelo} ${vehiculo.anio}`;
}

/* Vuelve a dibujar solo las tarjetas (al cambiar filtros u orden) */
function pintarTarjetas() {
  const { repuestos, terminos, vehiculo } = busqueda;
  const visibles = repuestos.filter(pasaFiltros);
  const orden = ORDENES[$("orden").value];
  if (orden) visibles.sort(orden);

  const total = repuestos.length;
  let conteo = visibles.length === total
    ? `${total} ${total === 1 ? "producto encontrado" : "productos encontrados"}`
    : `${visibles.length} de ${total} productos`;
  if (vehiculo) conteo += ` · ${vehiculo.marca} ${vehiculo.modelo} ${vehiculo.anio}`;
  $("conteo").textContent = conteo;

  $("resultados").innerHTML = visibles.length
    ? visibles.map((r) => tarjeta(r, terminos, vehiculo)).join("")
    : `<p class="sin-coincidencias">Ningún resultado cumple los filtros seleccionados.</p>`;
}

/* Dibuja la barra lateral una vez por búsqueda, con conteos reales de los resultados */
function pintarFiltros() {
  const { repuestos } = busqueda;
  const disponibles = repuestos.filter((r) => stockTotal(r) > 0).length;

  const porSucursal = new Map();
  for (const r of repuestos) {
    const conStock = new Set(r.sucursales.filter((s) => s.stock > 0).map((s) => s.nombre));
    for (const nombre of conStock) porSucursal.set(nombre, (porSucursal.get(nombre) || 0) + 1);
  }

  const opcion = (grupo, valor, texto, n) =>
    `<label><input type="checkbox" data-grupo="${grupo}" data-valor="${escapar(valor)}"> ${escapar(texto)} (${n})</label>`;

  $("grupos-filtros").innerHTML = `
    <div class="filter-group">
      <h4>Disponibilidad</h4>
      ${opcion("disp", "disponible", "Disponible", disponibles)}
      ${opcion("disp", "agotado", "Agotado", repuestos.length - disponibles)}
    </div>` + (porSucursal.size ? `
    <div class="filter-group">
      <h4>Con stock en</h4>
      ${[...porSucursal].sort((a, b) => a[0].localeCompare(b[0]))
        .map(([nombre, n]) => opcion("suc", nombre, nombre, n)).join("")}
    </div>` : "");
  $("filtros").hidden = false;
}

$("grupos-filtros").addEventListener("change", (e) => {
  const { grupo, valor } = e.target.dataset;
  if (!grupo) return;
  if (e.target.checked) filtros[grupo].add(valor);
  else filtros[grupo].delete(valor);
  pintarTarjetas();
});

$("limpiar-filtros").addEventListener("click", () => {
  filtros.disp.clear();
  filtros.suc.clear();
  $("grupos-filtros").querySelectorAll("input").forEach((i) => { i.checked = false; });
  pintarTarjetas();
});

$("orden").addEventListener("change", pintarTarjetas);

function limpiarPantalla() {
  $("resultados").innerHTML = "";
  $("mensajes").innerHTML = "";
  $("titulo-resultados").textContent = "";
  $("conteo").textContent = "";
  $("filtros").hidden = true;
  $("caja-orden").hidden = true;
}

/* ---------- Ganchos para las tareas de otros compañeros ----------
   Cada función se llama en el momento correcto del flujo. Quien tenga la tarea
   solo debe completar su función, sin tocar el resto del archivo.            */
function mostrarSinStock(repuestos)   { /* T4 (Meneses): "Sin stock en ninguna sucursal" */ }
function mostrarNoEncontrado()        { /* T5 (Meneses): "No se encontró el repuesto que busca" */ }
function mostrarErrorInventario(err)  { /* T6 (José Luis): "No se pudo consultar el stock, intenta de nuevo más tarde" */ }

/* ---------- Atajos de categoría: llenan el buscador y ejecutan la búsqueda ---------- */
function marcarCategoria(texto) {
  document.querySelectorAll(".category-item").forEach((boton) => {
    const activo = Boolean(texto) && normalizar(boton.dataset.q) === normalizar(texto);
    boton.classList.toggle("active", activo);
    boton.setAttribute("aria-pressed", String(activo));
  });
}

$("categorias").addEventListener("click", (e) => {
  const boton = e.target.closest(".category-item");
  if (!boton) return;
  $("repuesto").value = boton.dataset.q;
  $("form-busqueda").requestSubmit();
});

/* ---------- Flujo del botón "Buscar" (también Enter en el campo de texto) ---------- */
function setCargando(cargando) {
  $("btn-buscar").disabled = cargando;
  $("btn-buscar-vehiculo").disabled = cargando;
  $("estado").textContent = cargando ? "Buscando…" : "";
}

$("form-busqueda").addEventListener("submit", async (e) => {
  e.preventDefault();
  limpiarPantalla();
  if (!validar()) return;

  const texto = $("repuesto").value.trim();
  const marca = $("marca").value;
  const vehiculo = marca ? { marca, modelo: $("modelo").value, anio: $("anio").value } : null;

  // Solo se envía lo que el mecánico llenó
  const params = {};
  if (texto) params.repuesto = texto;
  if (vehiculo) Object.assign(params, vehiculo);

  marcarCategoria(texto);
  setCargando(true);

  try {
    const { repuestos } = await api("repuestos", params);

    // Solo coincidencias con lo escrito (el backend ya filtra; aquí se garantiza)
    const terminos = terminosDe(texto);
    const coinciden = repuestos.filter((r) => coincide(r, terminos));

    busqueda = { texto, terminos, vehiculo, repuestos: coinciden };
    filtros.disp.clear();
    filtros.suc.clear();
    $("orden").value = "relevancia";
    $("zona-resultados").hidden = false;
    pintarEncabezado();

    if (coinciden.length === 0) {
      $("conteo").textContent = "0 productos encontrados";
      mostrarNoEncontrado();
      return;
    }

    pintarFiltros();
    $("caja-orden").hidden = false;
    pintarTarjetas();

    const hayStock = coinciden.some((r) => r.sucursales.some((s) => s.stock > 0));
    if (!hayStock) mostrarSinStock(coinciden);

    const reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    $("zona-resultados").scrollIntoView({ behavior: reducir ? "auto" : "smooth", block: "start" });
  } catch (err) {
    console.error(err);
    $("zona-resultados").hidden = false; // para que se vea el mensaje de T6
    mostrarErrorInventario(err); // el backend responde 503 si la BD no responde
  } finally {
    setCargando(false);
  }
});

cargarMarcas();