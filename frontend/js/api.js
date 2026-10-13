/* ============================================================
   CAPA DE ACCESO A DATOS
   Cuando exista el backend, solo se edita este archivo.
   ============================================================ */

// TODO: definir la URL real del backend
const API_BASE_URL = "";

/*
  CONTRATO ESPERADO (a acordar con el equipo de backend):

  GET {API_BASE_URL}/repuestos?q=<texto>&marca=<m>&modelo=<m>&anio=<a>
    - q:      palabra clave, código o descripción (obligatorio)
    - marca, modelo, anio: opcionales
  Respuesta 200:
  {
    "total": 2,
    "resultados": [
      { "codigo": "0986494030",
        "nombre": "Pastillas de freno delanteras",
        "marca": "Bosch",
        "descripcion": "Pastillas de cerámica...",   // opcional
        "imagen": "https://.../pastillas.png" }      // opcional (null o "")
    ]
  }
  Sin coincidencias: 200 con "resultados": [] (no es un error).
*/

async function buscarRepuestos({ q, marca = "", modelo = "", anio = "" }, signal) {
  const params = new URLSearchParams({ q });
  if (marca)  params.set("marca", marca);
  if (modelo) params.set("modelo", modelo);
  if (anio)   params.set("anio", anio);

  const resp = await fetch(`${API_BASE_URL}/repuestos?${params}`, { signal });
  if (!resp.ok) throw new Error(`Error ${resp.status}`);

  const data = await resp.json();
  return Array.isArray(data.resultados) ? data.resultados : [];
}

// Opcional, para llenar los selects desde el backend (T2)
// async function obtenerMarcas() { ... }
// async function obtenerModelos(marca) { ... }
// async function obtenerAnios(marca, modelo) { ... }