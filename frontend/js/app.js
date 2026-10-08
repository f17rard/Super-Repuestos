/* =====================================================================
   El navegador solo habla con NUESTRO backend (/api/...).
   La conexión a Supabase vive en backend/Main.py.
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const MONEDA = { locale: "es-SV", codigo: "USD" };
const formatoPrecio = new Intl.NumberFormat(MONEDA.locale, { style: "currency", currency: MONEDA.codigo });
const escapar = (s) => String(s).replace(/[&<>"']/g, (c) =>
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

/* ---------- T2: listas en cascada (marca > modelo > año) ---------- */
async function cargarMarcas() {
  try {
    llenarLista($("marca"), await api("marcas"), "Selecciona una marca");
  } catch (err) {
    console.error(err);
    $("estado").textContent = "No se pudieron cargar las marcas.";
  }
}

async function cargarModelos(marca) {
  llenarLista($("modelo"), [], "Selecciona un modelo");
  llenarLista($("anio"), [], "Selecciona un año");
  if (!marca) return;
  try {
    llenarLista($("modelo"), await api("modelos", { marca }), "Selecciona un modelo");
  } catch (err) { console.error(err); }
}

async function cargarAnios(marca, modelo) {
  llenarLista($("anio"), [], "Selecciona un año");
  if (!marca || !modelo) return;
  try {
    llenarLista($("anio"), await api("anios", { marca, modelo }), "Selecciona un año");
  } catch (err) { console.error(err); }
}

$("marca").addEventListener("change", (e) => cargarModelos(e.target.value));
$("modelo").addEventListener("change", (e) => cargarAnios($("marca").value, e.target.value));

/* ---------- T2: validación de campos obligatorios ---------- */
function validar() {
  const reglas = [
    ["marca", "Selecciona una marca."],
    ["modelo", "Selecciona un modelo."],
    ["anio", "Selecciona un año."],
    ["repuesto", "Escribe el nombre del repuesto."]
  ];
  let valido = true;
  for (const [id, mensaje] of reglas) {
    const vacio = !$(id).value.trim();
    $("campo-" + id).classList.toggle("invalido", vacio);
    $("err-" + id).textContent = vacio ? mensaje : "";
    if (vacio) valido = false;
  }
  return valido;
}

/* ---------- T3: resultado de búsqueda ---------- */
function mostrarResultados(repuestos) {
  const total = repuestos.length;
  const tarjetas = repuestos.map((r) => {
    const filas = r.sucursales.map((s) => `
      <tr>
        <td>${escapar(s.nombre)}</td>
        <td class="num ${s.stock > 0 ? "stock-ok" : "stock-cero"}">${s.stock}</td>
      </tr>`).join("");
    return `
      <article class="repuesto">
        <div class="repuesto-cab">
          <h2>${escapar(r.nombre)}</h2>
          <span class="precio">${formatoPrecio.format(r.precio)}</span>
        </div>
        <table>
          <thead><tr><th>Sucursal</th><th class="num">Stock</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </article>`;
  }).join("");
  $("resultados").innerHTML =
    `<p class="resumen">${total} ${total === 1 ? "repuesto encontrado" : "repuestos encontrados"}</p>` + tarjetas;
}

function limpiarPantalla() {
  $("resultados").innerHTML = "";
  $("mensajes").innerHTML = "";
}

/* ---------- Ganchos para las tareas de otros compañeros ----------
   Cada función se llama en el momento correcto del flujo. Quien tenga la tarea
   solo debe completar su función, sin tocar el resto del archivo.            */
function mostrarSinStock(repuestos)   { /* T4 (Meneses): "Sin stock en ninguna sucursal" */ }
function mostrarNoEncontrado()        { /* T5 (Meneses): "No se encontró el repuesto que busca" */ }
function mostrarErrorInventario(err)  { /* T6 (José Luis): "No se pudo consultar el stock, intenta de nuevo más tarde" */ }

/* ---------- T2: flujo del botón "Buscar" ---------- */
$("form-busqueda").addEventListener("submit", async (e) => {
  e.preventDefault();
  limpiarPantalla();
  if (!validar()) return;

  const boton = $("btn-buscar");
  boton.disabled = true;
  $("estado").textContent = "Buscando…";

  try {
    const { repuestos } = await api("repuestos", {
      marca: $("marca").value,
      modelo: $("modelo").value,
      anio: $("anio").value,
      repuesto: $("repuesto").value.trim()
    });

    if (repuestos.length === 0) { mostrarNoEncontrado(); return; }

    mostrarResultados(repuestos); // T3

    const hayStock = repuestos.some((r) => r.sucursales.some((s) => s.stock > 0));
    if (!hayStock) mostrarSinStock(repuestos);
  } catch (err) {
    console.error(err);
    mostrarErrorInventario(err); // el backend responde 503 si la BD no responde
  } finally {
    boton.disabled = false;
    $("estado").textContent = "";
  }
});

cargarMarcas();
