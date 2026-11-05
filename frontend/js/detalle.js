/* Detalle: información del repuesto y existencias por sucursal. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const MONEDA = { locale: "es-SV", codigo: "USD" };
  const escapar = (valor) => String(valor).replace(/[&<>"']/g, (caracter) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[caracter]));
  const formatoPrecio = new Intl.NumberFormat(MONEDA.locale, {
    style: "currency", currency: MONEDA.codigo
  });

  function mostrarEstado(texto, esError = false) {
    $("estado-detalle").textContent = texto;
    $("estado-detalle").classList.toggle("error", esError);
  }

  async function api(ruta) {
    const respuesta = await fetch(ruta);
    if (!respuesta.ok) {
      const error = new Error(`Error HTTP ${respuesta.status}`);
      error.status = respuesta.status;
      throw error;
    }
    return respuesta.json();
  }

  function mostrarSinImagen() {
    $("foto-principal").hidden = true;
    $("foto-principal").removeAttribute("src");
    $("sin-foto").hidden = false;
  }

  function pintarImagen(url, nombre) {
    if (!url) {
      mostrarSinImagen();
      return;
    }
    const imagen = $("foto-principal");
    imagen.addEventListener("error", mostrarSinImagen, { once: true });
    imagen.alt = nombre;
    $("sin-foto").hidden = true;
    imagen.hidden = false;
    imagen.src = url;
  }

  function pintarSucursales(sucursales = []) {
    const ordenadas = [...sucursales].sort((a, b) => b.stock - a.stock);
    $("filas-sucursales").innerHTML = ordenadas.length
      ? ordenadas.map((sucursal) => `
          <tr>
            <td>${escapar(sucursal.nombre)}</td>
            <td>${escapar(sucursal.direccion || "Dirección no registrada")}</td>
            <td class="${sucursal.stock > 0 ? "stock-ok" : "stock-cero"}">${sucursal.stock > 0 ? escapar(sucursal.stock) : "Agotado"}</td>
          </tr>`).join("")
      : '<tr><td colspan="3">Este repuesto no tiene sucursales registradas.</td></tr>';
  }

  async function cargarDisponibilidad(inventario = []) {
    const selector = $("sucursal-detalle");
    const estado = $("estado-sucursal-detalle");
    let sucursales = inventario;
    try {
      const registradas = await api("/api/sucursales");
      if (registradas.length) {
        const stockPorSucursal = new Map(inventario.map(({ id, stock }) => [id, stock]));
        sucursales = registradas.map((sucursal) => ({
          ...sucursal, stock: stockPorSucursal.get(sucursal.id) ?? 0
        }));
      }
    } catch (error) {
      console.error(error);
      estado.textContent = "No se pudo cargar la lista completa de sucursales.";
    }
    pintarSucursales(sucursales);
    const opciones = sucursales.filter(({ id }) => id != null);
    if (!opciones.length) return;
    selector.innerHTML = opciones.map(({ id, nombre }) =>
      `<option value="${escapar(id)}">${escapar(nombre)}</option>`).join("");
    const inicial = opciones.find(({ nombre }) => nombre === "Sucursal Central") ?? opciones[0];
    selector.value = String(inicial.id);
    selector.disabled = false;
    const mostrarStock = () => {
      const sucursal = opciones.find(({ id }) => String(id) === selector.value);
      estado.textContent = sucursal.stock > 0 ? `En stock: ${sucursal.stock}` : "Agotado";
      estado.classList.toggle("stock-cero", sucursal.stock <= 0);
    };
    selector.addEventListener("change", mostrarStock);
    mostrarStock();
  }

  async function cargarDetalle() {
    const identificador = new URLSearchParams(location.search).get("id");
    if (!identificador || !/^[1-9]\d*$/.test(identificador) || Number(identificador) > 2147483647) {
      mostrarEstado("El enlace no contiene un identificador de producto válido.", true);
      return;
    }
    $("producto-detalle").hidden = true;
    $("producto-detalle").setAttribute("aria-busy", "true");
    mostrarEstado("Cargando producto…");
    try {
      const producto = await api(`/api/repuestos/${encodeURIComponent(identificador)}`);
      $("nombre-producto").textContent = producto.nombre;
      $("descripcion-producto").textContent = producto.descripcion || "Sin descripción disponible.";
      $("precio-producto").textContent = formatoPrecio.format(producto.precio);
      pintarImagen(producto.imagen, producto.nombre);
      await cargarDisponibilidad(producto.sucursales);
      document.title = `${producto.nombre} | Super-Repuestos`;
      $("producto-detalle").hidden = false;
      mostrarEstado("");
    } catch (error) {
      console.error(error);
      mostrarEstado(
        error.status === 404
          ? "No se encontró el repuesto solicitado."
          : "No se pudo cargar el repuesto. Recarga la página para intentar de nuevo.",
        true
      );
    } finally {
      $("producto-detalle").setAttribute("aria-busy", "false");
    }
  }
  cargarDetalle();
})();
