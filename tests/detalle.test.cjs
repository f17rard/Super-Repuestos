/* Detalle básico con DOM y API simulados, sin credenciales ni red. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

async function preparar(busqueda, estado = 200, producto = {}, sucursales = []) {
  const elementos = new Map();
  const consultas = [];
  function elemento(id) {
    if (!elementos.has(id)) elementos.set(id, {
      hidden: true, textContent: "", atributos: {}, eventos: {},
      classList: { toggle() {} },
      setAttribute(k, v) { this.atributos[k] = v; },
      removeAttribute(k) { delete this[k]; },
      addEventListener(k, v) { this.eventos[k] = v; }
    });
    return elementos.get(id);
  }
  const contexto = vm.createContext({
    document: { getElementById: elemento },
    location: { search: busqueda }, URLSearchParams, Intl,
    console: { error() {} },
    fetch: async (url) => {
      consultas.push(url);
      return {
        ok: estado === 200, status: estado,
        json: async () => url === "/api/sucursales" ? sucursales : producto
      };
    }
  });
  vm.runInContext(readFileSync(join(__dirname, "../frontend/js/detalle.js"), "utf8"), contexto);
  await new Promise(setImmediate);
  return { elemento, consultas };
}

test("carga únicamente el repuesto seleccionado y muestra su precio real", async () => {
  const { elemento, consultas } = await preparar("?id=42", 200, {
    id: 42, nombre: "Bujía", descripcion: "Descripción", precio: 0,
    imagen: "https://example.com/bujia.png"
  });
  assert.deepEqual(consultas, ["/api/repuestos/42", "/api/sucursales"]);
  assert.equal(elemento("nombre-producto").textContent, "Bujía");
  assert.equal(elemento("descripcion-producto").textContent, "Descripción");
  assert.match(elemento("precio-producto").textContent, /0[.,]00/);
  assert.equal(elemento("foto-principal").src, "https://example.com/bujia.png");
  assert.equal(elemento("producto-detalle").hidden, false);
  assert.equal(elemento("producto-detalle").atributos["aria-busy"], "false");
  elemento("foto-principal").eventos.error();
  assert.equal(elemento("sin-foto").hidden, false);
  assert.equal(elemento("foto-principal").hidden, true);
});

test("imagen y descripción ausentes tienen alternativa visible", async () => {
  const { elemento } = await preparar("?id=42", 200, { nombre: "Filtro", precio: 12.5 });
  assert.equal(elemento("sin-foto").hidden, false);
  assert.equal(elemento("descripcion-producto").textContent, "Sin descripción disponible.");
});

test("abre en Central y muestra Agotado para una sucursal sin inventario", async () => {
  const { elemento } = await preparar("?id=42", 200, {
    nombre: "Filtro", precio: 12.5, sucursales: [{ id: 1, stock: 5 }]
  }, [{ id: 2, nombre: "Sucursal Santa Tecla" }, { id: 1, nombre: "Sucursal Central" }]);
  const selector = elemento("sucursal-detalle");
  const estado = elemento("estado-sucursal-detalle");
  assert.equal(selector.value, "1");
  assert.equal(estado.textContent, "En stock: 5");
  selector.value = "2";
  selector.eventos.change();
  assert.equal(estado.textContent, "Agotado");
  assert.match(elemento("precio-producto").textContent, /12[.,]50/);
  assert.match(elemento("filas-sucursales").innerHTML, /Sucursal Santa Tecla/);
});

test("enlaces inválidos no consultan la API", async () => {
  for (const busqueda of ["", "?id=0", "?id=-1", "?id=texto", "?id=2147483648"]) {
    const { consultas, elemento } = await preparar(busqueda);
    assert.equal(consultas.length, 0);
    assert.match(elemento("estado-detalle").textContent, /identificador.*válido/);
    assert.equal(elemento("producto-detalle").hidden, true);
  }
});

test("errores 404 y 503 ocultan el producto y ofrecen mensajes claros", async () => {
  for (const estado of [404, 503]) {
    const { elemento } = await preparar("?id=42", estado);
    assert.match(elemento("estado-detalle").textContent,
      estado === 404 ? /No se encontró/ : /No se pudo cargar/);
    assert.equal(elemento("producto-detalle").hidden, true);
    assert.equal(elemento("producto-detalle").atributos["aria-busy"], "false");
  }
});

test("muestra las tres sucursales con existencias y Agotado, sin interpretar HTML", async () => {
  const { elemento } = await preparar("?id=42", 200, {
    nombre: "Filtro", precio: 12.5, sucursales: [
      { nombre: "San Salvador", direccion: "Centro", stock: 0 },
      { nombre: "Santa Tecla", direccion: "<script>dirección</script>", stock: 5 },
      { nombre: "Santa Ana", direccion: null, stock: 3 }
    ]
  });
  const html = elemento("filas-sucursales").innerHTML;
  assert.equal((html.match(/<tr>/g) || []).length, 3);
  assert.match(html, /San Salvador/);
  assert.match(html, /Santa Tecla/);
  assert.match(html, /Santa Ana/);
  assert.match(html, /Agotado/);
  assert.match(html, /Dirección no registrada/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.ok(html.indexOf("Santa Tecla") < html.indexOf("San Salvador"));
});

test("sin inventario muestra un mensaje en lugar de inventar sucursales", async () => {
  const { elemento } = await preparar("?id=42", 200, {
    nombre: "Filtro", precio: 12.5, sucursales: []
  });
  assert.match(elemento("filas-sucursales").innerHTML, /no tiene sucursales registradas/);
});
