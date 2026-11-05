/* Regresiones del catálogo con DOM y API simulados; no requieren navegador ni red. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function crearElemento() {
  return {
    value: "", innerHTML: "", textContent: "", disabled: false,
    dataset: {}, options: [], eventos: {}, atributos: {},
    addEventListener(tipo, manejar) { this.eventos[tipo] = manejar; },
    setAttribute(nombre, valor) { this.atributos[nombre] = valor; },
    getAttribute(nombre) { return this.atributos[nombre] ?? null; },
    removeAttribute(nombre) { delete this.atributos[nombre]; },
    querySelectorAll() { return []; },
    focus() { this.enfocado = true; }
  };
}

async function prepararCatalogo(esMovil = false) {
  const elementos = new Map();
  const elemento = (id) => {
    if (!elementos.has(id)) elementos.set(id, crearElemento());
    return elementos.get(id);
  };
  const contexto = vm.createContext({
    document: { getElementById: elemento, createElement: crearElemento },
    window: { matchMedia: (consulta) => ({ matches: esMovil && consulta === "(max-width: 768px)" }) },
    console: { error() {} }, URLSearchParams, Intl,
    fetch: async (url) => ({
      ok: true,
      json: async () => url.startsWith("/api/repuestos") ? { total: 0, repuestos: [] } : []
    })
  });
  vm.runInContext(readFileSync(join(__dirname, "../frontend/js/app.js"), "utf8"), contexto);
  await new Promise(setImmediate);
  return { contexto, elemento };
}

function respuesta(datos, estado = 200) {
  return { ok: estado === 200, status: estado, json: async () => datos };
}

test("reintentar sucursales habilita el filtro después de un fallo temporal", async () => {
  const { contexto, elemento } = await prepararCatalogo();
  const reintentar = elemento("reintentar-sucursales");
  contexto.fetch = async () => respuesta({}, 503);
  await reintentar.eventos.click();
  assert.equal(elemento("sucursal").disabled, true);
  assert.equal(reintentar.hidden, false);

  contexto.fetch = async () => respuesta([{ id: 1, nombre: "Sucursal Central" }]);
  await reintentar.eventos.click();
  assert.equal(elemento("sucursal").disabled, false);
  assert.match(elemento("sucursal").innerHTML, /value="1">Sucursal Central/);
  assert.equal(elemento("err-sucursal").textContent, "");
  assert.equal(reintentar.hidden, true);
});

test("limpiar filtros restablece el catálogo y descarta los modelos pendientes", async () => {
  const { contexto, elemento } = await prepararCatalogo();
  const consultas = [];
  let resolverModelos;
  contexto.fetch = async (url) => {
    consultas.push(url);
    if (url.startsWith("/api/modelos")) {
      return new Promise((resolve) => { resolverModelos = resolve; });
    }
    return respuesta({ total: 0, repuestos: [] });
  };
  elemento("marca").value = "Mazda";
  elemento("repuesto").value = "Filtro";
  elemento("sucursal").value = "1";
  elemento("categorias").dataset.activa = "motor";
  const pendiente = contexto.cargarModelos("Mazda");

  await elemento("limpiar-filtros").eventos.click();
  resolverModelos(respuesta(["Mazda 3"]));
  await pendiente;

  assert.equal(elemento("marca").value, "");
  assert.equal(elemento("repuesto").value, "");
  assert.equal(elemento("sucursal").value, "");
  assert.equal(elemento("categorias").dataset.activa, "");
  assert.equal(elemento("modelo").disabled, true);
  assert.equal(elemento("anio").disabled, true);
  assert.equal(consultas.at(-1), "/api/repuestos?pagina=1&limite=10");
});

test("el menú móvil aplica la categoría y se cierra devolviendo el foco", async () => {
  const { contexto, elemento } = await prepararCatalogo(true);
  const boton = elemento("categorias-toggle");
  const consultas = [];
  contexto.fetch = async (url) => {
    consultas.push(url);
    return respuesta({ total: 0, repuestos: [] });
  };

  boton.eventos.click();
  assert.equal(boton.getAttribute("aria-expanded"), "true");
  elemento("categorias").eventos.click({ target: { closest: () => ({ dataset: { cat: "motor" } }) } });
  assert.equal(boton.getAttribute("aria-expanded"), "false");
  assert.equal(elemento("categorias-etiqueta").textContent, "Categorías · Motor");
  assert.equal(boton.enfocado, true);
  assert.deepEqual(consultas, ["/api/repuestos?categoria=motor&pagina=1&limite=10"]);

  boton.eventos.click();
  elemento("categorias").eventos.keydown({ key: "Escape" });
  assert.equal(boton.getAttribute("aria-expanded"), "false");
});

test("el catálogo pagina de diez en diez y reinicia al buscar", async () => {
  const { contexto, elemento } = await prepararCatalogo();
  const piezas = Array.from({ length: 21 }, (_, i) => ({
    id: i + 1, nombre: `Repuesto ${i + 1}`, precio: 5, sucursales: []
  }));
  contexto.fetch = async (url) => {
    const params = new URLSearchParams(url.split("?")[1]);
    const pagina = Number(params.get("pagina"));
    assert.equal(params.get("limite"), "10");
    const resultados = params.has("repuesto") ? piezas.slice(0, 10) : piezas;
    return respuesta({ total: resultados.length, pagina,
      repuestos: resultados.slice((pagina - 1) * 10, pagina * 10) });
  };
  const idsVisibles = () => Array.from(
    elemento("resultados").innerHTML.matchAll(/detalle\.html\?id=(\d+)/g),
    (enlace) => Number(enlace[1])
  );
  const siguiente = elemento("pagina-siguiente");
  const anterior = elemento("pagina-anterior");
  assert.equal(elemento("paginacion").hidden, true);
  await contexto.buscarRepuestos();
  assert.equal(anterior.disabled, true);
  assert.equal(siguiente.disabled, false);
  assert.equal(elemento("paginacion").hidden, false);
  const ids = idsVisibles();
  assert.equal(ids.length, 10);
  elemento("repuesto").value = "Repuesto";
  await siguiente.eventos.click();
  assert.equal(elemento("pagina-actual").textContent, "Página 2 de 3");
  ids.push(...idsVisibles());
  await siguiente.eventos.click();
  assert.equal(siguiente.disabled, true);
  ids.push(...idsVisibles());
  assert.deepEqual(ids, piezas.map((pieza) => pieza.id));
  await anterior.eventos.click();
  assert.equal(elemento("pagina-actual").textContent, "Página 2 de 3");
  await contexto.buscarRepuestos();
  assert.equal(elemento("paginacion").hidden, true);
  assert.deepEqual(idsVisibles(), ids.slice(0, 10));
});

function diferida() {
  let resolver;
  const promesa = new Promise((resolve) => { resolver = resolve; });
  return { promesa, resolver };
}

test("buscar sin criterios pide un término sin consultar ni borrar el catálogo", async () => {
  const { contexto, elemento } = await prepararCatalogo();
  let consultas = 0;
  contexto.fetch = async () => { consultas++; };
  elemento("resultados").innerHTML = "Catálogo existente";
  elemento("form-busqueda").eventos.submit({ preventDefault() {} });
  assert.equal(consultas, 0);
  assert.equal(elemento("resultados").innerHTML, "Catálogo existente");
  assert.match(elemento("err-repuesto").textContent, /Escribe/);
  assert.equal(elemento("repuesto").atributos["aria-invalid"], "true");
});

test("cada tarjeta enlaza al identificador de su propio repuesto", async () => {
  const { contexto, elemento } = await prepararCatalogo();
  contexto.fetch = async () => respuesta({ total: 2, repuestos: [
    { id: 42, nombre: "Bujía", precio: 5, sucursales: [] },
    { id: 73, nombre: "Filtro", precio: 12, sucursales: [] }
  ] });
  await contexto.buscarRepuestos();
  const html = elemento("resultados").innerHTML;
  assert.match(html, /href="pages\/detalle\.html\?id=42" aria-label="Ver detalle de Bujía"/);
  assert.match(html, /href="pages\/detalle\.html\?id=73" aria-label="Ver detalle de Filtro"/);
});

test("una respuesta antigua de modelos no reemplaza la marca actual", async () => {
  const { contexto, elemento } = await prepararCatalogo();
  const antigua = diferida();
  contexto.fetch = (url) => url.includes("Toyota")
    ? antigua.promesa : Promise.resolve(respuesta(["Civic"]));
  const pendiente = contexto.cargarModelos("Toyota");
  await contexto.cargarModelos("Honda");
  antigua.resolver(respuesta(["Corolla"]));
  await pendiente;
  assert.match(elemento("modelo").innerHTML, /Civic/);
  assert.doesNotMatch(elemento("modelo").innerHTML, /Corolla/);
});

test("cambiar de marca descarta los años que aún estaban cargando", async () => {
  const { contexto, elemento } = await prepararCatalogo();
  const antigua = diferida();
  contexto.fetch = (url) => url.startsWith("/api/anios")
    ? antigua.promesa : Promise.resolve(respuesta(["Civic"]));
  const pendiente = contexto.cargarAnios("Toyota", "Corolla");
  await contexto.cargarModelos("Honda");
  antigua.resolver(respuesta([2020]));
  await pendiente;
  assert.equal(elemento("anio").disabled, true);
  assert.doesNotMatch(elemento("anio").innerHTML, /2020/);
});

test("un fallo al cargar modelos explica cómo reintentar", async () => {
  const { contexto, elemento } = await prepararCatalogo();
  contexto.fetch = async () => { throw new Error("Sin conexión"); };
  await contexto.cargarModelos("Toyota");
  assert.match(elemento("err-modelo").textContent, /Vuelve a seleccionar la marca/);
  assert.equal(elemento("modelo").disabled, true);
});

test("categoría vacía muestra su mensaje y permite quitar el filtro", async () => {
  const { contexto, elemento } = await prepararCatalogo();
  elemento("categorias").dataset.activa = "motor";
  await contexto.buscarRepuestos();
  assert.match(elemento("mensajes").innerHTML, /Por el momento no hay repuestos disponibles en esta categoría/);
  assert.match(elemento("categorias").innerHTML, /Todas/);
  assert.equal(elemento("btn-buscar").disabled, false);
});

test("validación de filtros no se presenta como inventario caído", async () => {
  const { contexto, elemento } = await prepararCatalogo();
  contexto.fetch = async () => respuesta({ detail: { codigo: "FILTROS_INVALIDOS" } }, 422);
  await contexto.buscarRepuestos();
  assert.match(elemento("mensajes").innerHTML, /Revisa los filtros/);
  assert.doesNotMatch(elemento("mensajes").innerHTML, /No se pudo consultar el stock/);
  assert.equal(elemento("btn-buscar").disabled, false);
});

test("inventario caído muestra el mensaje de CA4 y libera la búsqueda", async () => {
  const { contexto, elemento } = await prepararCatalogo();
  contexto.fetch = async () => respuesta({ detail: { codigo: "BD_NO_DISPONIBLE" } }, 503);
  await contexto.buscarRepuestos();
  assert.match(elemento("mensajes").innerHTML, /No se pudo consultar el stock, intenta de nuevo más tarde/);
  assert.equal(elemento("btn-buscar").disabled, false);
  assert.equal(elemento("estado").textContent, "");
});

test("precio y stock cero se mantienen visibles y los datos se escapan", async () => {
  const { contexto, elemento } = await prepararCatalogo();
  elemento("repuesto").value = "filtro";
  contexto.fetch = async () => respuesta({ total: 1, hay_stock: false, repuestos: [{
    nombre: "<script>pieza</script>", precio: 12.5, imagen: null,
    sucursales: [{ nombre: "Santa Tecla", stock: 0 }]
  }] });
  await contexto.buscarRepuestos();
  assert.match(elemento("resultados").innerHTML, /12[.,]50/);
  assert.match(elemento("resultados").innerHTML, /&lt;script&gt;/);
  assert.doesNotMatch(elemento("resultados").innerHTML, /<script>/);
  assert.match(elemento("resultados").innerHTML, /Sin imagen/);
  assert.match(elemento("mensajes").innerHTML, /Sin stock en ninguna sucursal/);
});

test("fabricante real, ID interno y detalle se muestran sin imagen", async () => {
  const { contexto, elemento } = await prepararCatalogo();
  elemento("repuesto").value = "filtro";
  contexto.fetch = async () => respuesta({ total: 1, repuestos: [{
    id: 12, nombre: "Filtro", fabricante: "Bosch", precio: 12.5,
    imagen: null, sucursales: []
  }] });
  await contexto.buscarRepuestos();
  assert.match(elemento("resultados").innerHTML, /Bosch/);
  assert.match(elemento("resultados").innerHTML, /ID interno: 12/);
  assert.match(elemento("resultados").innerHTML, /pages\/detalle.html\?id=12/);
  assert.match(elemento("resultados").innerHTML, /Sin imagen/);
});

test("una búsqueda antigua no reemplaza el resultado más reciente", async () => {
  const { contexto, elemento } = await prepararCatalogo();
  const antigua = diferida();
  contexto.fetch = () => antigua.promesa;
  elemento("repuesto").value = "filtro";
  const pendiente = contexto.buscarRepuestos();
  contexto.fetch = async () => respuesta({ total: 0, repuestos: [] });
  elemento("repuesto").value = "inexistente";
  await contexto.buscarRepuestos();
  antigua.resolver(respuesta({ total: 1, repuestos: [{
    nombre: "Filtro antiguo", precio: 5, sucursales: []
  }] }));
  await pendiente;
  assert.match(elemento("mensajes").innerHTML, /No se encontraron resultados/);
  assert.doesNotMatch(elemento("resultados").innerHTML, /Filtro antiguo/);
});
