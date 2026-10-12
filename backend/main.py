"""
Backend del buscador de repuestos (HU-01: T2 buscador y T3 resultado de búsqueda).

El navegador ya NO habla con Supabase: llama a esta API, y esta API consulta
la base de datos con credenciales que viven solo en el servidor (.env).

Endpoints:
  GET /api/marcas
  GET /api/modelos?marca=
  GET /api/anios?marca=&modelo=
  GET /api/repuestos?marca=&modelo=&anio=&repuesto=

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

load_dotenv()
log = logging.getLogger("buscador")

# ---------------------------------------------------------------------------
# Nombres de tablas. Si T1 (Machado) los nombra distinto, se cambian en .env
# ---------------------------------------------------------------------------
T_VEHICULOS = os.getenv("TABLA_VEHICULOS", "vehiculos")              # id, marca, modelo, anio
T_REPUESTOS = os.getenv("TABLA_REPUESTOS", "repuestos")              # id, nombre, precio
T_COMPAT = os.getenv("TABLA_COMPATIBILIDAD", "repuesto_vehiculo")    # repuesto_id, vehiculo_id
T_INVENTARIO = os.getenv("TABLA_INVENTARIO", "inventario")           # repuesto_id, sucursal_id, stock
T_SUCURSALES = os.getenv("TABLA_SUCURSALES", "sucursales")           # id, nombre

PAGINA = 1000  # filas por petición a Supabase (su límite por defecto)

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


def traer_todo(construir_consulta) -> list[dict]:
    """Recorre las páginas de Supabase para no quedarse en el límite de 1000 filas."""
    filas: list[dict] = []
    inicio = 0
    while True:
        lote = construir_consulta().range(inicio, inicio + PAGINA - 1).execute().data
        filas.extend(lote)
        if len(lote) < PAGINA:
            return filas
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
        filas = traer_todo(lambda: get_db().table(T_VEHICULOS).select("marca"))
    except Exception as exc:
        raise error_bd(exc)
    return sorted({f["marca"] for f in filas})


@app.get("/api/modelos")
def listar_modelos(marca: str = Query(..., min_length=1)) -> list[str]:
    try:
        filas = traer_todo(
            lambda: get_db().table(T_VEHICULOS).select("modelo").eq("marca", marca)
        )
    except Exception as exc:
        raise error_bd(exc)
    return sorted({f["modelo"] for f in filas})


@app.get("/api/anios")
def listar_anios(
    marca: str = Query(..., min_length=1),
    modelo: str = Query(..., min_length=1),
) -> list[int]:
    try:
        filas = traer_todo(
            lambda: get_db().table(T_VEHICULOS).select("anio")
            .eq("marca", marca).eq("modelo", modelo)
        )
    except Exception as exc:
        raise error_bd(exc)
    return sorted({f["anio"] for f in filas}, reverse=True)


# ---------------------------------------------------------------------------
# T2 + T3: búsqueda de repuestos con precio y stock por sucursal
# ---------------------------------------------------------------------------
@app.get("/api/repuestos")
def buscar_repuestos(
    marca: str = Query(..., min_length=1),
    modelo: str = Query(..., min_length=1),
    anio: int = Query(...),
    repuesto: str = Query(..., min_length=1),
) -> dict:
    texto = repuesto.strip()
    if not texto:
        raise HTTPException(status_code=422, detail="El nombre del repuesto es obligatorio")

    # !inner => solo repuestos compatibles con el vehículo elegido (RN1)
    seleccion = f"""
        id, nombre, precio,
        {T_COMPAT}!inner ( {T_VEHICULOS}!inner ( marca, modelo, anio ) ),
        {T_INVENTARIO} ( stock, {T_SUCURSALES} ( nombre ) )
    """
    base = f"{T_COMPAT}.{T_VEHICULOS}"

    try:
        filas = (
            get_db().table(T_REPUESTOS).select(seleccion)
            .ilike("nombre", f"%{escapar_like(texto)}%")
            .eq(f"{base}.marca", marca)
            .eq(f"{base}.modelo", modelo)
            .eq(f"{base}.anio", anio)
            .execute()
            .data
        )
    except Exception as exc:
        raise error_bd(exc)

    repuestos = [
        {
            "id": f["id"],
            "nombre": f["nombre"],
            "precio": f["precio"],  # precio del catálogo (RN2)
            "sucursales": [         # stock por sucursal (RN3)
                {
                    "nombre": (i.get(T_SUCURSALES) or {}).get("nombre", "Sucursal sin nombre"),
                    "stock": i.get("stock") or 0,
                }
                for i in (f.get(T_INVENTARIO) or [])
            ],
        }
        for f in filas
    ]
    # Lista vacía = no se encontró (el mensaje de T5 lo decide el frontend)
    return {"total": len(repuestos), "repuestos": repuestos}


# ---------------------------------------------------------------------------
# Sirve la página (debe ir al final, después de las rutas /api)
# ---------------------------------------------------------------------------
FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")