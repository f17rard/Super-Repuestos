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

/* ---------- Rediseño (HU-01): cinta de marcas y botón con imán ----------
   La cinta repite las marcas que ya trae /api/marcas (solo adorno, no hace peticiones).
   El imán mueve el botón hacia el puntero con transform, solo con ratón y sin "reduce motion". */
const MARCAS_MINIMAS_CINTA = 12;
const SEGUNDOS_POR_MARCA = 3;
const FUERZA_IMAN = 0.2;

function pintarCinta() {
  const marcas = [...$("marca").options].filter((o) => o.value).map((o) => o.text);
  if (!marcas.length) { $("cinta-marcas").innerHTML = ""; return; }
  let mitad = [...marcas];
  while (mitad.length < MARCAS_MINIMAS_CINTA) mitad = mitad.concat(marcas);
  const items = mitad.map((m) => `<span class="cinta-item">${escapar(m)}</span>`).join("");
  // Dos mitades iguales: la animación recorre -50% y el bucle no se nota
  $("cinta-marcas").innerHTML = `<div class="cinta-pista">${items}${items}</div>`;
  $("cinta-marcas").style.setProperty("--cinta-duracion", `${mitad.length * SEGUNDOS_POR_MARCA}s`);
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

/* ---------- Rediseño (HU-01): explorador de vehículo ----------
   Muestra como botones las opciones del siguiente campo vacío (marca, modelo o año)
   para elegir con un toque. Los selects siguen siendo la fuente de verdad: el
   explorador solo los lee y les dispara "change", así no cambia ningún flujo de T2. */
const PASOS_EXPLORADOR = [
  { id: "marca", etiqueta: "marca", titulo: "Elige la marca" },
  { id: "modelo", etiqueta: "modelo", titulo: "Elige el modelo" },
  { id: "anio", etiqueta: "año", titulo: "Elige el año" }
];
const ESQUELETOS_ATAJOS = 12;
const ESQUELETOS_RESULTADOS = 3;

function pintarExplorador(cargando = false) {
  const paso = PASOS_EXPLORADOR.find((p) => !$(p.id).value);
  $("ruta-vehiculo").innerHTML = PASOS_EXPLORADOR.filter((p) => $(p.id).value).map((p) => `
    <button type="button" class="ruta-paso" data-paso="${p.id}" aria-label="Cambiar ${p.etiqueta}: ${escapar($(p.id).value)}">
      ${escapar($(p.id).value)}
    </button>`).join("");

  if (!paso) {
    $("titulo-explorador").textContent = "Vehículo elegido";
    $("atajos").innerHTML = ""; // vehículo completo: solo queda la ruta elegida
    return;
  }

  $("titulo-explorador").textContent = paso.titulo;
  if (cargando) {
    $("atajos").innerHTML = `<span class="esqueleto atajo-esqueleto"></span>`.repeat(ESQUELETOS_ATAJOS);
    return;
  }

  const opciones = [...$(paso.id).options].filter((o) => o.value);
  $("atajos").innerHTML = opciones.length
    ? opciones.map((o) =>
        `<button type="button" class="atajo" data-paso="${paso.id}" data-valor="${escapar(o.value)}">${escapar(o.text)}</button>`
      ).join("")
    : `<p class="atajos-vacio">No hay opciones para mostrar por ahora.</p>`;
}

$("explorador").addEventListener("click", (e) => {
  const boton = e.target.closest("button[data-paso]");
  if (!boton) return;
  const eligiendo = boton.classList.contains("atajo");
  const select = $(boton.dataset.paso);
  select.value = eligiendo ? boton.dataset.valor : "";
  select.dispatchEvent(new Event("change"));
  // Con el año elegido el vehículo está completo: el cursor pasa al repuesto
  if (eligiendo && boton.dataset.paso === "anio") $("repuesto").focus();
});

/* ---------- T2: listas en cascada (marca > modelo > año) ---------- */
async function cargarMarcas() {
  pintarExplorador(true);
  try {
    llenarLista($("marca"), await api("marcas"), "Selecciona una marca");
  } catch (err) {
    console.error(err);
    $("estado").textContent = "No se pudieron cargar las marcas.";
  }
  pintarCinta();
  pintarExplorador();
}

async function cargarModelos(marca) {
  llenarLista($("modelo"), [], "Selecciona un modelo");
  llenarLista($("anio"), [], "Selecciona un año");
  if (!marca) { pintarExplorador(); return; }
  pintarExplorador(true);
  try {
    llenarLista($("modelo"), await api("modelos", { marca }), "Selecciona un modelo");
  } catch (err) { console.error(err); }
  pintarExplorador();
}

async function cargarAnios(marca, modelo) {
  llenarLista($("anio"), [], "Selecciona un año");
  if (!marca || !modelo) { pintarExplorador(); return; }
  pintarExplorador(true);
  try {
    llenarLista($("anio"), await api("anios", { marca, modelo }), "Selecciona un año");
  } catch (err) { console.error(err); }
  pintarExplorador();
}

$("marca").addEventListener("change", (e) => cargarModelos(e.target.value));
$("modelo").addEventListener("change", (e) => cargarAnios($("marca").value, e.target.value));
$("anio").addEventListener("change", () => pintarExplorador());

/* ---------- T3: resultado de búsqueda ---------- */
function mostrarEsqueleto(texto) {
  const fila = `
    <article class="repuesto" aria-hidden="true">
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
  if (!hayFiltros) {
    return total > mostrados ? `Repuestos más relevantes: ${mostrados} de ${total}` : "Repuestos más relevantes";
  }
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
    const tabla = sucursales.length
      ? `<table>
          <thead><tr><th>Sucursal</th><th class="num">Stock</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>`
      : `<p class="sucursal-vacia">Este repuesto no tiene sucursales registradas.</p>`;
    return `
      <article class="repuesto">
        <div class="repuesto-cab">
          <h2>${escapar(r.nombre)}</h2>
          ${r.descripcion ? `<p class="repuesto-desc">${escapar(r.descripcion)}</p>` : ""}
          <span class="precio">${formatoPrecio.format(r.precio)}</span>
          <span class="disponibilidad ${conStock > 0 ? "stock-ok" : "stock-cero"}">${disponibilidad}</span>
        </div>
        <div class="repuesto-detalle">${tabla}</div>
      </article>`;
  }).join("");
  $("resultados").innerHTML =
    `<p class="resumen">${textoResumen(repuestos.length, total, hayFiltros)}</p>` + filasRepuestos;
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

/* ---------- Ganchos para las tareas de otros compañeros ----------
   Cada función se llama en el momento correcto del flujo. Quien tenga la tarea
   solo debe completar su función, sin tocar el resto del archivo.            */
function mostrarSinStock(repuestos) {
  mostrarAviso("sin-stock", "Sin stock en ninguna sucursal", "Prueba con otro repuesto del mismo vehículo o consulta más tarde.");
}
function mostrarNoEncontrado() {
  mostrarAviso("vacio", "No se encontró el repuesto que busca", "Revisa la ortografía o escribe solo una palabra, por ejemplo «filtro».");
}
function mostrarErrorInventario(err) {
  mostrarAviso("error", "No se pudo consultar el stock, intenta de nuevo más tarde");
}

/* ---------- T2: flujo de búsqueda ----------
   Ningún filtro es obligatorio: se envía solo lo que la persona llenó. Sin filtros el
   backend devuelve el catálogo más relevante, y así se muestra al abrir la página. */
function leerFiltros() {
  const filtros = {
    marca: $("marca").value,
    modelo: $("modelo").value,
    anio: $("anio").value,
    repuesto: $("repuesto").value.trim()
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
      if (hayFiltros) mostrarNoEncontrado();
      else mostrarAviso("vacio", "Aún no hay repuestos en el catálogo");
      return;
    }

    mostrarResultados(repuestos, total, hayFiltros); // T3

    const hayStock = repuestos.some((r) => r.sucursales.some((s) => s.stock > 0));
    if (hayFiltros && !hayStock) mostrarSinStock(repuestos);
  } catch (err) {
    if (esPeticionVieja(numero)) return;
    console.error(err);
    $("resultados").innerHTML = "";
    mostrarErrorInventario(err); // el backend responde 503 si la BD no responde
  } finally {
    if (!esPeticionVieja(numero)) {
      boton.disabled = false;
      $("estado").textContent = "";
    }
  }
}

$("form-busqueda").addEventListener("submit", (e) => {
  e.preventDefault();
  buscarRepuestos();
});

activarIman($("btn-buscar"));
cargarMarcas();
buscarRepuestos();