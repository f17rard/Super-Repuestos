const $ = id => document.getElementById(id);
let controlador = null;   // cancela la búsqueda anterior si se lanza otra

/* ---------- Mensajes y estado ---------- */
function mostrarMensaje(texto, tipo = "info") {
  const p = document.createElement("p");
  p.className = `mensaje mensaje-${tipo}`;
  p.textContent = texto;
  $("mensajes").replaceChildren(p);
}

function setCargando(cargando) {
  $("btn-buscar").disabled = cargando;
  $("estado").textContent = cargando ? "Buscando…" : "";
}

/* ---------- Tarjeta de producto (CA2) ---------- */
function crearTarjeta(prod) {
  const art = document.createElement("article");
  art.className = "tarjeta-producto";

  if (prod.imagen) {                                    // A3
    const img = document.createElement("img");
    img.src = prod.imagen; img.alt = prod.nombre; img.loading = "lazy";
    img.addEventListener("error", () => img.remove());
    art.appendChild(img);
  }
  const h = document.createElement("h3"); h.textContent = prod.nombre;
  const m = document.createElement("p");  m.className = "marca";  m.textContent = prod.marca;
  const c = document.createElement("p");  c.className = "codigo"; c.textContent = `Código: ${prod.codigo}`;
  const b = document.createElement("button");
  b.type = "button"; b.className = "btn-detalle"; b.textContent = "Ver repuesto";
  b.addEventListener("click", () => abrirDetalle(prod.codigo));
  art.append(h, m, c, b);
  return art;
}

function abrirDetalle(codigo) {                          // CA5 (la pantalla es otra HU)
  console.log("Detalle del producto:", codigo);
}

/* ---------- Flujo principal ---------- */
async function ejecutarBusqueda() {
  const input = $("repuesto");
  const termino = input.value.trim();                    // texto ingresado
  $("resultados").replaceChildren();
  $("mensajes").replaceChildren();

  if (!termino) {                                        // A2 / CA4 / RN2: no se llama al backend
    $("err-repuesto").textContent = "Ingresa una palabra clave, código o descripción.";
    input.setAttribute("aria-invalid", "true");
    input.focus();
    return;
  }
  $("err-repuesto").textContent = "";
  input.removeAttribute("aria-invalid");

  controlador?.abort();
  controlador = new AbortController();
  setCargando(true);

  try {
    const lista = await buscarRepuestos(
      { q: termino, marca: $("marca").value, modelo: $("modelo").value, anio: $("anio").value },
      controlador.signal
    );

    if (lista.length === 0) {                            // A1 / CA3
      mostrarMensaje("No se encontraron resultados", "vacio");
      input.select();
    } else {
      $("resultados").replaceChildren(...lista.map(crearTarjeta));
    }
  } catch (err) {
    if (err.name === "AbortError") return;               // fue reemplazada por otra búsqueda
    mostrarMensaje("No se pudo consultar el catálogo. Intenta de nuevo.", "error");
  } finally {
    setCargando(false);
  }
}

$("repuesto").addEventListener("input", () => {
  $("err-repuesto").textContent = "";
  $("repuesto").removeAttribute("aria-invalid");
});