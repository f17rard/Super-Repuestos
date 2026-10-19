"""
Backend del buscador de repuestos (HU-01: T2 buscador y T3 resultado de búsqueda).

El navegador ya NO habla con Supabase: llama a esta API, y esta API consulta
la base de datos con credenciales que viven solo en el servidor (.env).

Esquema de la base de datos:
  marcas      (id, nombre)
  modelos     (id, marca_id -> marcas.id, nombre)
  vehiculos   (id, modelo_id -> modelos.id, anio)
  repuestos   (id, nombre, descripcion, precio_base, vehiculo_id -> vehiculos.id)
  sucursales  (id, nombre, direccion)
  inventario  (id, repuesto_id -> repuestos.id, sucursal_id -> sucursales.id, stock)

Endpoints:
  GET /api/marcas
  GET /api/modelos?marca=
  GET /api/anios?marca=&modelo=
  GET /api/repuestos?marca=&modelo=&anio=&repuesto=&limite=
      Todos los filtros son opcionales. Sin ninguno devuelve el catálogo más relevante.

Además sirve la carpeta ../frontend, así la página y la API comparten origen.
"""
import logging
import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from supabase import Client, create_client

load_dotenv(Path(__file__).resolve().with_name(".env"))
log = logging.getLogger("buscador")

# ---------------------------------------------------------------------------
# Nombres de tablas. Si se nombran distinto, se pueden cambiar en .env
# ---------------------------------------------------------------------------
T_MARCAS = os.getenv("TABLA_MARCAS", "marcas")                  # id, nombre
T_MODELOS = os.getenv("TABLA_MODELOS", "modelos")               # id, marca_id, nombre
T_VEHICULOS = os.getenv("TABLA_VEHICULOS", "vehiculos")         # id, modelo_id, anio
T_REPUESTOS = os.getenv("TABLA_REPUESTOS", "repuestos")         # id, nombre, descripcion, precio_base, vehiculo_id
T_INVENTARIO = os.getenv("TABLA_INVENTARIO", "inventario")      # id, repuesto_id, sucursal_id, stock
T_SUCURSALES = os.getenv("TABLA_SUCURSALES", "sucursales")      # id, nombre, direccion

PAGINA = 1000  # filas por petición a Supabase (su límite por defecto)
LIMITE_RESULTADOS = 24  # repuestos que devuelve /api/repuestos si no se pide otro límite
MAX_FILAS_RELEVANCIA = 5000  # filas que se traen para ordenar por relevancia

app = FastAPI(title="API Buscador de repuestos")


# ---------------------------------------------------------------------------
# Conexión a Supabase
# ---------------------------------------------------------------------------
@lru_cache
def get_db() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    if not url or not key:
        raise RuntimeError("Faltan SUPABASE_URL o SUPABASE_KEY en el archivo .env")
    return create_client(url, key)


def error_bd(exc: Exception) -> HTTPException:
    """Error común cuando la base de datos o el inventario no responden.
    T6 (José Luis) puede refinar este mensaje y sus códigos."""
    log.exception("Fallo al consultar la base de datos: %s", exc)
    return HTTPException(
        status_code=503,
        detail={
            "codigo": "BD_NO_DISPONIBLE",
            "mensaje": "No se pudo consultar el stock, intenta de nuevo más tarde",
        },
    )


def traer_todo(construir_consulta, maximo: int | None = None) -> list[dict]:
    """Recorre las páginas de Supabase para no quedarse en el límite de 1000 filas.
    Con `maximo` se detiene al juntar esa cantidad de filas."""
    filas: list[dict] = []
    inicio = 0
    while True:
        lote = construir_consulta().range(inicio, inicio + PAGINA - 1).execute().data
        filas.extend(lote)
        if len(lote) < PAGINA:
            return filas
        if maximo is not None and len(filas) >= maximo:
            return filas[:maximo]
        inicio += PAGINA


def escapar_like(texto: str) -> str:
    """Evita que % y _ escritos por el usuario actúen como comodines."""
    return texto.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


# ---------------------------------------------------------------------------
# T2: listas en cascada (marca > modelo > año)
# ---------------------------------------------------------------------------
@app.get("/api/marcas")
def listar_marcas() -> list[str]:
    try:
        filas = traer_todo(lambda: get_db().table(T_MARCAS).select("nombre"))
    except Exception as exc:
        raise error_bd(exc)
    return sorted({f["nombre"] for f in filas})


@app.get("/api/modelos")
def listar_modelos(marca: str = Query(..., min_length=1)) -> list[str]:
    try:
        # modelos -> marcas (!inner filtra solo los modelos de la marca elegida)
        filas = traer_todo(
            lambda: get_db().table(T_MODELOS)
            .select(f"nombre, {T_MARCAS}!inner(nombre)")
            .eq(f"{T_MARCAS}.nombre", marca)
        )
    except Exception as exc:
        raise error_bd(exc)
    return sorted({f["nombre"] for f in filas})


@app.get("/api/anios")
def listar_anios(
    marca: str = Query(..., min_length=1),
    modelo: str = Query(..., min_length=1),
) -> list[int]:
    try:
        # vehiculos -> modelos -> marcas
        filas = traer_todo(
            lambda: get_db().table(T_VEHICULOS)
            .select(f"anio, {T_MODELOS}!inner(nombre, {T_MARCAS}!inner(nombre))")
            .eq(f"{T_MODELOS}.nombre", modelo)
            .eq(f"{T_MODELOS}.{T_MARCAS}.nombre", marca)
        )
    except Exception as exc:
        raise error_bd(exc)
    return sorted({f["anio"] for f in filas}, reverse=True)


# ---------------------------------------------------------------------------
# T2 + T3: búsqueda de repuestos con precio y stock por sucursal
# ---------------------------------------------------------------------------
def armar_seleccion(con_vehiculo: bool) -> str:
    """Columnas a pedir. El vehículo solo se une (!inner) si algún filtro lo usa (RN1)."""
    inventario = f"{T_INVENTARIO} ( stock, {T_SUCURSALES} ( nombre, direccion ) )"
    if not con_vehiculo:
        return f"id, nombre, descripcion, precio_base, {inventario}"
    return f"""
        id, nombre, descripcion, precio_base,
        {T_VEHICULOS}!inner (
            anio,
            {T_MODELOS}!inner ( nombre, {T_MARCAS}!inner ( nombre ) )
        ),
        {inventario}
    """


def puntuar_texto(nombre: str, palabras: list[str]) -> int:
    """Más puntos mientras más al inicio y más completa sea la coincidencia con el texto."""
    if not palabras:
        return 0
    nombre = nombre.lower()
    texto = " ".join(palabras)
    if nombre == texto:
        return 100
    if nombre.startswith(texto):
        return 80
    if f" {texto}" in nombre:
        return 60
    al_inicio = sum(1 for p in palabras if nombre.startswith(p) or f" {p}" in nombre)
    return 20 + 5 * al_inicio


def ordenar_por_relevancia(repuestos: list[dict], palabras: list[str]) -> list[dict]:
    """Primero la coincidencia con el texto, luego la disponibilidad real (RN3)."""

    def clave(r: dict) -> tuple:
        con_stock = sum(1 for s in r["sucursales"] if s["stock"] > 0)
        stock_total = sum(s["stock"] for s in r["sucursales"])
        puntos = puntuar_texto(r["nombre"], palabras)
        return (-puntos, -con_stock, -stock_total, r["nombre"].lower())

    return sorted(repuestos, key=clave)


@app.get("/api/repuestos")
def buscar_repuestos(
    marca: str | None = Query(None),
    modelo: str | None = Query(None),
    anio: int | None = Query(None),
    repuesto: str | None = Query(None, max_length=100),
    limite: int = Query(LIMITE_RESULTADOS, ge=1, le=100),
) -> dict:
    marca = (marca or "").strip() or None
    modelo = (modelo or "").strip() or None
    palabras = (repuesto or "").lower().split()
    con_vehiculo = bool(marca or modelo or anio is not None)
    seleccion = armar_seleccion(con_vehiculo)

    def construir_consulta():
        # order("id") da un orden estable al paginar
        consulta = get_db().table(T_REPUESTOS).select(seleccion).order("id")
        # Todas las palabras deben aparecer en el nombre: "filtro aceite" halla "Filtro de aceite"
        for palabra in palabras:
            consulta = consulta.ilike("nombre", f"%{escapar_like(palabra)}%")
        if anio is not None:
            consulta = consulta.eq(f"{T_VEHICULOS}.anio", anio)
        if modelo:
            consulta = consulta.eq(f"{T_VEHICULOS}.{T_MODELOS}.nombre", modelo)
        if marca:
            consulta = consulta.eq(f"{T_VEHICULOS}.{T_MODELOS}.{T_MARCAS}.nombre", marca)
        return consulta

    try:
        filas = traer_todo(construir_consulta, maximo=MAX_FILAS_RELEVANCIA)
    except Exception as exc:
        raise error_bd(exc)

    repuestos = [
        {
            "id": f["id"],
            "nombre": f["nombre"],
            "descripcion": f.get("descripcion"),
            "precio": f["precio_base"],  # precio del catálogo (RN2)
            "sucursales": [              # stock por sucursal (RN3)
                {
                    "nombre": (i.get(T_SUCURSALES) or {}).get("nombre", "Sucursal sin nombre"),
                    "direccion": (i.get(T_SUCURSALES) or {}).get("direccion"),
                    "stock": i.get("stock") or 0,
                }
                for i in (f.get(T_INVENTARIO) or [])
            ],
        }
        for f in filas
    ]
    repuestos = ordenar_por_relevancia(repuestos, palabras)
    # Lista vacía = no se encontró (el mensaje de T5 lo decide el frontend).
    # "total" cuenta todas las coincidencias; "repuestos" trae solo las más relevantes.
    return {"total": len(repuestos), "repuestos": repuestos[:limite]}


# ---------------------------------------------------------------------------
# Sirve la página (debe ir al final, después de las rutas /api)
# ---------------------------------------------------------------------------
FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")