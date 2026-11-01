/* =====================================================================
   El navegador solo habla con NUESTRO backend (/api/...).
   La conexión a Supabase vive en backend/main.py.
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
  const boton = (valor, etiqueta) => {
    const activa = ($("categorias").dataset.activa || "") === valor;
    return `<button type="button" class="cat-boton${activa ? " activa" : ""}" data-cat="${valor}" aria-pressed="${activa}">${etiqueta}</button>`;
  };
  $("categorias").innerHTML =
    boton("", "Todas") + CATEGORIAS.map((c) => boton(c.valor, c.etiqueta)).join("");
}

$("categorias").addEventListener("click", (e) => {
  const btn = e.target.closest(".cat-boton");
  if (!btn) return;
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
          ${r.descripcion ? `<p class="repuesto-desc">${escapar(r.descripcion)}</p>` : ""}
          <span class="precio">${formatoPrecio.format(r.precio)}</span>
          <span class="disponibilidad ${conStock > 0 ? "stock-ok" : "stock-cero"}">${disponibilidad}</span>
        </div>
        <div class="repuesto-detalle">${detalle}</div>
      </article>`;
  }).join("");
  $("resultados").innerHTML =
    `<p class="resumen">${textoResumen(repuestos.length, total, hayFiltros)}</p>` + filasRepuestos;
  $("resultados").querySelectorAll(".repuesto-foto img").forEach((imagen) => {
    function mostrarSinImagen() {
      const texto = document.createElement("span");
      texto.className = "sin-imagen";
      texto.textContent = "Sin imagen";
      imagen.replaceWith(texto);
    }
    imagen.addEventListener("error", mostrarSinImagen, { once: true });
    if (imagen.complete && imagen.naturalWidth === 0) mostrarSinImagen();
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
  mostrarAviso("vacio", "No se encontró el repuesto que busca", "Revisa la ortografía o escribe solo una palabra, por ejemplo «filtro».");
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

async function buscarRepuestos() {
  limpiarPantalla();
  const filtros = leerFiltros();
  const hayFiltros = Object.keys(filtros).length > 0;
  const numero = Number($("resultados").dataset.peticion || 0) + 1;
  $("resultados").dataset.peticion = String(numero);

  const boton = $("btn-buscar");
  boton.disabled = true;
  $("estado").textContent = "Buscando…";
  mostrarEsqueleto(hayFiltros ? "Buscando repuestos…" : "Cargando el catálogo…");

  try {
    const { total, repuestos } = await api("repuestos", filtros);
    if (esPeticionVieja(numero)) return;
    $("resultados").innerHTML = ""; // quita el esqueleto de carga

    if (repuestos.length === 0) {
      if (filtros.categoria) {
        mostrarAviso("vacio", "Por el momento no hay repuestos disponibles en esta categoría", "Selecciona «Todas» para quitar el filtro de categoría.");
      } else if (hayFiltros) mostrarNoEncontrado();
      else mostrarAviso("vacio", "Aún no hay repuestos en el catálogo");
      return;
    }

    mostrarResultados(repuestos, total, hayFiltros); // T3

    const hayStock = repuestos.some((r) => r.sucursales.some((s) => s.stock > 0));
    if (hayFiltros && !hayStock) mostrarSinStock();
  } catch (err) {
    if (esPeticionVieja(numero)) return;
    console.error(err);
    $("resultados").innerHTML = "";
    mostrarErrorBusqueda(err);
  } finally {
    if (!esPeticionVieja(numero)) {
      boton.disabled = false;
      $("estado").textContent = "";
    }
  }
}

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
