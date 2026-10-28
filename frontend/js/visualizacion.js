/* =====================================================================
   VISUALIZACIÓN (HU-01/HU02): nombre + marca, imagen o "sin imagen",
   mensaje "No se encontraron resultados" y aviso de búsqueda vacía.

   Módulo AUTÓNOMO: no toca funciones ni variables globales de app.js.
   Solo expone un objeto: window.Visualizacion
     - enriquecer(repuestos, { marca })  -> añade imagen y marca a las tarjetas
     - sinResultados()                   -> "No se encontraron resultados"
     - avisarTerminoVacio()              -> pide escribir un término
     - limpiar()                         -> quita sus mensajes

   Todo vive dentro de una función anónima: no choca con `$`, `escapar`, etc.
   ===================================================================== */
(function () {
  "use strict";

  const ID = { resultados: "resultados", mensajes: "mensajes", termino: "repuesto" };

  const TEXTO = {
    sinResultados: "No se encontraron resultados",
    sinResultadosAyuda: "Revisa la ortografía o prueba con otra palabra del repuesto.",
    pedirTermino: "Escribe el nombre del repuesto que buscas.",
    pedirTerminoAyuda: "El campo de búsqueda no puede estar vacío.",
    sinImagen: "Sin imagen",
    marca: "Marca"
  };

  /* ---------- utilidades ---------- */
  // Solo acepta http(s) (o rutas relativas); cualquier otra cosa cuenta como "sin imagen".
  function urlSegura(valor) {
    if (typeof valor !== "string" || !valor.trim()) return null;
    try {
      const u = new URL(valor.trim(), window.location.href);
      return (u.protocol === "http:" || u.protocol === "https:") ? u.href : null;
    } catch (_) {
      return null;
    }
  }

  function crearElemento(etiqueta, clase, texto) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto !== undefined) nodo.textContent = texto; // textContent: nunca interpreta HTML
    return nodo;
  }

  /* ---------- imagen / sin imagen ---------- */
  function crearSinImagen() {
    const caja = crearElemento("div", "vz-sin-imagen");
    caja.setAttribute("role", "img");
    caja.setAttribute("aria-label", TEXTO.sinImagen);
    caja.innerHTML =
      '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false">' +
      '<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M21 16l-5-5-8 8"/>' +
      "</g></svg>";
    caja.appendChild(crearElemento("span", "", TEXTO.sinImagen));
    return caja;
  }

  function crearMedia(nombre, imagen) {
    const contenedor = crearElemento("div", "vz-media");
    const url = urlSegura(imagen);
    if (!url) {
      contenedor.appendChild(crearSinImagen());
      return contenedor;
    }
    const img = document.createElement("img");
    img.src = url;
    img.alt = nombre || "";
    img.loading = "lazy";
    img.decoding = "async";
    // Si la URL existe pero la imagen no carga, se trata igual que "sin imagen".
    img.addEventListener("error", () => contenedor.replaceChildren(crearSinImagen()), { once: true });
    contenedor.appendChild(img);
    return contenedor;
  }

  /* ---------- tarjetas: nombre + marca + imagen ----------
     Se ejecuta DESPUÉS de mostrarResultados() y solo agrega elementos a cada
     tarjeta (.repuesto). No reemplaza ni borra nada de lo que pinta T3.      */
  function enriquecer(repuestos, opciones) {
    const contenedor = document.getElementById(ID.resultados);
    if (!contenedor || !Array.isArray(repuestos)) return;

    const tarjetas = contenedor.querySelectorAll(".repuesto");
    const marcaSeleccionada = (opciones && opciones.marca) || "";

    repuestos.forEach((r, i) => {
      const tarjeta = tarjetas[i];
      const cabecera = tarjeta && tarjeta.querySelector(".repuesto-cab");
      if (!cabecera || tarjeta.dataset.vz) return; // ya procesada o sin cabecera
      tarjeta.dataset.vz = "1";

      const info = crearElemento("div", "vz-info");
      const titulo = cabecera.querySelector("h2");
      if (titulo) info.appendChild(titulo); // mueve el nombre existente (no lo duplica)

      const marca = r.marca || marcaSeleccionada;
      if (marca) {
        const linea = crearElemento("p", "vz-marca");
        linea.appendChild(crearElemento("span", "vz-marca-etq", TEXTO.marca + ":"));
        linea.appendChild(document.createTextNode(" " + marca));
        info.appendChild(linea);
      }

      cabecera.classList.add("vz-cab");
      cabecera.insertBefore(info, cabecera.firstChild);
      cabecera.insertBefore(crearMedia(r.nombre, r.imagen || r.imagen_url), cabecera.firstChild);
    });
  }

  /* ---------- mensajes (viven en #mensajes sin pisar los de otros) ---------- */
  function limpiar(clase) {
    const zona = document.getElementById(ID.mensajes);
    if (!zona) return;
    const selector = ".vz-mensaje" + (clase ? "." + clase : "");
    zona.querySelectorAll(selector).forEach((n) => n.remove());
  }

  function mostrarMensaje(clase, rol, titulo, ayuda) {
    const zona = document.getElementById(ID.mensajes);
    if (!zona) return;
    limpiar(); // solo quita mensajes propios (.vz-mensaje), no los de T4/T6
    const caja = crearElemento("div", "vz-mensaje " + clase);
    caja.setAttribute("role", rol);
    caja.appendChild(crearElemento("strong", "", titulo));
    if (ayuda) caja.appendChild(crearElemento("p", "", ayuda));
    zona.appendChild(caja);
  }

  function sinResultados() {
    mostrarMensaje("vz-vacio", "status", TEXTO.sinResultados, TEXTO.sinResultadosAyuda);
  }

  // Devuelve true si el término estaba vacío (y mostró el aviso).
  function avisarTerminoVacio() {
    const campo = document.getElementById(ID.termino);
    if (!campo || campo.value.trim()) return false;
    mostrarMensaje("vz-termino", "alert", TEXTO.pedirTermino, TEXTO.pedirTerminoAyuda);
    campo.focus();
    return true;
  }

  // El aviso desaparece apenas la persona empieza a escribir.
  const campoTermino = document.getElementById(ID.termino);
  if (campoTermino) campoTermino.addEventListener("input", () => limpiar("vz-termino"));

  window.Visualizacion = { enriquecer, sinResultados, avisarTerminoVacio, limpiar };
})();
