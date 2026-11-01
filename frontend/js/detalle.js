const $ = (id) => document.getElementById(id);
const precioFmt = new Intl.NumberFormat("es-SV", { style: "currency", currency: "USD" });
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
}[c]));

async function api(ruta, opciones = {}) {
  const respuesta = await fetch(ruta, opciones);
  if (!respuesta.ok) {
    const error = new Error(`La solicitud falló (${respuesta.status}).`);
    error.status = respuesta.status;
    throw error;
  }
  return respuesta.json();
}

const params = new URLSearchParams(location.search);
const repuestoId = params.get("id");
let productoActual = null;
let favorito = false;

function mostrarEstado(texto, error = false) {
  $("estado-detalle").textContent = texto;
  $("estado-detalle").classList.toggle("error", error);
}

function pintarGaleria(imagenes, nombre) {
  const lista = Array.isArray(imagenes) ? imagenes : [];
  $("miniaturas").innerHTML = "";
  if (!lista.length) {
    $("foto-principal").hidden = true;
    $("sin-foto").hidden = false;
    $("miniaturas").innerHTML = '<p class="texto-ayuda">Este producto todavía no tiene imágenes.</p>';
    return;
  }
  $("foto-principal").hidden = false;
  $("sin-foto").hidden = true;
  const seleccionar = (imagen, boton) => {
    $("foto-principal").src = imagen.url;
    $("foto-principal").alt = nombre;
    document.querySelectorAll(".miniatura").forEach(b => b.setAttribute("aria-pressed", String(b === boton)));
  };
  lista.forEach((imagen, indice) => {
    if (!imagen.url) return;
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "miniatura";
    boton.setAttribute("aria-label", `Ver imagen ${indice + 1} de ${lista.length}`);
    boton.setAttribute("aria-pressed", "false");
    const img = document.createElement("img");
    img.src = imagen.url;
    img.alt = `${nombre}, imagen ${indice + 1}`;
    img.loading = "lazy";
    boton.append(img);
    boton.addEventListener("click", () => seleccionar(imagen, boton));
    $("miniaturas").append(boton);
  });
  const primero = lista.find(x => x.url);
  const primerBoton = $("miniaturas").querySelector(".miniatura");
  if (primero && primerBoton) seleccionar(primero, primerBoton);
}

function pintarSucursales(sucursales = []) {
  $("filas-sucursales").innerHTML = sucursales.length ? sucursales.map(s => `
    <tr>
      <td>${esc(s.nombre)}</td>
      <td>${esc(s.direccion || "Dirección no registrada")}</td>
      <td class="${Number(s.stock) > 0 ? "stock-ok" : "stock-cero"}">${Number(s.stock) > 0 ? esc(s.stock) : "Agotado"}</td>
    </tr>`).join("") : '<tr><td colspan="3">No hay inventario registrado para este repuesto.</td></tr>';
}

function pintarOpiniones(datos = {}) {
  const opiniones = Array.isArray(datos.opiniones) ? datos.opiniones : [];
  const promedio = Number(datos.promedio || 0);
  $("promedio-opiniones").innerHTML = opiniones.length ? `${promedio.toFixed(1)}<span>/5</span>` : `—<span>/5</span>`;
  $("estrellas").textContent = opiniones.length
    ? "★".repeat(Math.round(promedio)) + "☆".repeat(5 - Math.round(promedio))
    : "☆☆☆☆☆";
  $("estrellas").setAttribute("aria-label", opiniones.length ? `Promedio ${promedio.toFixed(1)} de 5` : "Sin valoraciones");
  $("resumen-valoraciones").textContent = opiniones.length
    ? `${opiniones.length} ${opiniones.length === 1 ? "opinión" : "opiniones"}`
    : "Sin valoraciones todavía";
  $("lista-opiniones").innerHTML = opiniones.length ? opiniones.map(o => `
    <article class="opinion-card">
      <h3>${esc(o.nombre_usuario || "Mecánico")}</h3>
      <span class="estrellas" aria-label="${esc(o.puntuacion)} de 5">${"★".repeat(Number(o.puntuacion))}${"☆".repeat(5 - Number(o.puntuacion))}</span>
      <p>${esc(o.opinion)}</p>
    </article>`).join("") : '<p class="texto-ayuda">Sé el primero en valorar este repuesto.</p>';
}

async function cargarDetalle() {
  if (!repuestoId || !/^\d+$/.test(repuestoId)) {
    mostrarEstado("El enlace no contiene un identificador de producto válido.", true);
    return;
  }
  try {
    // El backend debe exponer este endpoint y devolver el formato indicado en README.
    const producto = await api(`/api/repuestos/${encodeURIComponent(repuestoId)}`);
    productoActual = producto;
    $("nombre-producto").textContent = producto.nombre;
    $("descripcion-producto").textContent = producto.descripcion || "No hay una descripción registrada para este repuesto.";
    $("precio-producto").textContent = precioFmt.format(Number(producto.precio || 0));
    pintarGaleria(producto.imagenes, producto.nombre);
    pintarSucursales(producto.sucursales);
    $("producto-detalle").hidden = false;
    $("opiniones").hidden = false;
    mostrarEstado("");
    await cargarOpiniones();
    await cargarEstadoFavorito();
  } catch (e) {
    console.error(e);
    mostrarEstado(e.status === 404 ? "No se encontró el repuesto solicitado." : "No se pudo cargar el detalle. Comprueba que el backend esté actualizado.", true);
  }
}

async function cargarOpiniones() {
  try {
    const datos = await api(`/api/repuestos/${encodeURIComponent(repuestoId)}/valoraciones`);
    pintarOpiniones(datos);
  } catch (e) {
    // El detalle sigue siendo útil si aún no se habilitó la API de opiniones.
    pintarOpiniones();
    $("estado-valoracion").textContent = "Las valoraciones estarán disponibles cuando se configure la autenticación.";
  }
}

async function cargarEstadoFavorito() {
  try {
    const datos = await api(`/api/favoritos/${encodeURIComponent(repuestoId)}`, {
      headers: encabezadosAuth()
    });
    favorito = Boolean(datos.favorito);
    pintarBotonFavorito();
  } catch {
    $("estado-favorito").textContent = "Inicia sesión para guardar favoritos. La autenticación debe conectarse al backend.";
  }
}

function encabezadosAuth() {
  // Integrar aquí el token de sesión real de Supabase Auth cuando el login del proyecto esté disponible.
  // No se inventa ni se guarda un token en el navegador.
  return { "Content-Type": "application/json" };
}

function pintarBotonFavorito() {
  $("btn-favorito").setAttribute("aria-pressed", String(favorito));
  $("btn-favorito").innerHTML = favorito
    ? '<span aria-hidden="true">♥</span> Quitar de favoritos'
    : '<span aria-hidden="true">♡</span> Agregar a favoritos';
}

$("btn-favorito").addEventListener("click", async () => {
  $("estado-favorito").textContent = "Para guardar favoritos de forma persistente, primero debe conectarse el inicio de sesión al backend.";
});

$("form-valoracion").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("estado-valoracion").textContent = "Para publicar opiniones, primero debe conectarse el inicio de sesión al backend.";
});

cargarDetalle();
