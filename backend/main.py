"""Entrada FastAPI: rutas del catálogo, respuestas HTTP y archivos del frontend.

Las reglas de negocio viven en catalogo.py y las consultas a Supabase en repositorio.py.
Se conserva backend.main:app como punto de entrada local y en Vercel.
"""

import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi import Path as ParametroRuta

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from backend import catalogo
from backend.control_de_errores import ErrorInventario

log = logging.getLogger("buscador")
app = FastAPI(title="API Buscador de repuestos")


@app.exception_handler(ErrorInventario)
async def responder_error_inventario(request: Request, exc: ErrorInventario) -> JSONResponse:
    return JSONResponse(status_code=exc.estado_http, content={"detail": exc.detalle()})


@app.exception_handler(RequestValidationError)
async def responder_error_validacion(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "detail": {
                "codigo": "FILTROS_INVALIDOS",
                "mensaje": "Revisa los filtros de búsqueda e intenta de nuevo.",
            }
        },
    )


def error_bd(exc: Exception) -> ErrorInventario:
    """Registra el fallo técnico; CA4 solo expone un mensaje seguro al cliente."""
    log.exception("Fallo al consultar la base de datos: %s", exc)
    return ErrorInventario()


@app.get("/api/marcas")
def listar_marcas() -> list[str]:
    try:
        return catalogo.listar_marcas()
    except ErrorInventario:
        raise
    except Exception as exc:
        raise error_bd(exc)


@app.get("/api/modelos")
def listar_modelos(marca: str = Query(..., min_length=1)) -> list[str]:
    try:
        return catalogo.listar_modelos(marca)
    except ErrorInventario:
        raise
    except Exception as exc:
        raise error_bd(exc)


@app.get("/api/anios")
def listar_anios(
    marca: str = Query(..., min_length=1),
    modelo: str = Query(..., min_length=1),
) -> list[int]:
    try:
        return catalogo.listar_anios(marca, modelo)
    except ErrorInventario:
        raise
    except Exception as exc:
        raise error_bd(exc)


@app.get("/api/repuestos")
def buscar_repuestos(
    marca: str | None = Query(None),
    modelo: str | None = Query(None),
    anio: int | None = Query(None),
    repuesto: str | None = Query(None, max_length=100),
    categoria: str | None = Query(None),
    limite: int = Query(catalogo.LIMITE_RESULTADOS, ge=1, le=100),
) -> dict:
    try:
        return catalogo.buscar_repuestos(marca, modelo, anio, repuesto, categoria, limite)
    except ErrorInventario:
        raise
    except Exception as exc:
        raise error_bd(exc)


@app.get("/api/repuestos/{repuesto_id}")
def obtener_detalle(
    repuesto_id: int = ParametroRuta(..., ge=1, le=2147483647),
) -> dict:
    try:
        pieza = catalogo.obtener_detalle(repuesto_id)
    except ErrorInventario:
        raise
    except Exception as exc:
        raise error_bd(exc)

    if pieza is None:
        raise HTTPException(status_code=404, detail="Repuesto no encontrado")
    return pieza

    except ErrorInventario:
        raise
    except Exception as exc:
        raise error_bd(exc)


# Las rutas de la API se registran antes del frontend estático.
FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")
