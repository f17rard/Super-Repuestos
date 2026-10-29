#NO SE DONDE TIENE QUE ESTAR ESTE ARCHIVO






"""
HU-04: Vista de productos (tarjetas con imagen, nombre, marca y precio) con paginación.

Módulo NUEVO e independiente. No importa nada de main.py (así no hay importaciones
circulares): main.py le entrega lo que necesita al llamar a `crear_router_productos(...)`.

Esquema que usa (el mismo de main.py, solo lectura):
  repuestos  (id, nombre, precio_base, imagen_path, vehiculo_id -> vehiculos.id)
  vehiculos  (id, modelo_id -> modelos.id)
  modelos    (id, marca_id -> marcas.id)
  marcas     (id, nombre)
  # La marca de un repuesto es la de su vehículo: repuestos > vehiculos > modelos > marcas.

Endpoint:
  GET /api/productos?pagina=1&por_pagina=12
      pagina      opcional, >= 1. Si pasa del final se devuelve la última página.
      por_pagina  opcional, de 1 a 48. Por defecto 12 (CA3: con más de 12 se pagina).
  Respuesta 200:
      {
        "total": 37, "pagina": 2, "por_pagina": 12, "total_paginas": 4,
        "productos": [
          {"id": 7, "nombre": "...", "marca": "Toyota", "precio": 25.5, "imagen_url": "https://..."}
        ]
      }
  Un catálogo vacío no es error: 200 con "total": 0 y "productos": [].
  Si la base de datos falla: 503 con {"codigo": "BD_NO_DISPONIBLE", "mensaje": "..."}.

Integración en backend/main.py (2 bloques; ver la entrega):
  1) junto a los imports:  from .productos import crear_router_productos  (con respaldo sin punto)
  2) antes del montaje de ../frontend:  app.include_router(crear_router_productos(...))
"""
import math
import os
from collections.abc import Callable
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Query

PRODUCTOS_POR_PAGINA = 12  # CA3: con más de 12 productos se pagina
MAX_POR_PAGINA = 48  # tope para que nadie pida el catálogo entero de una vez (RN3)
BUCKET_IMAGENES = os.getenv("BUCKET_IMAGENES", "repuestos_imagenes")  # mismo bucket que app.js


# ---------------------------------------------------------------------------
# Helpers (sin base de datos: se prueban solos)
# ---------------------------------------------------------------------------
def calcular_paginas(total: int, por_pagina: int) -> int:
    # Mínimo 1: un catálogo vacío se muestra como "página 1 de 1", nunca como "página 1 de 0"
    return max(1, math.ceil(total / por_pagina))


def acotar_pagina(pagina: int, total_paginas: int) -> int:
    return min(max(pagina, 1), total_paginas)


def url_imagen(ruta: str | None) -> str | None:
    """URL pública de la imagen en Supabase Storage; None si el repuesto no tiene imagen."""
    base = (os.getenv("SUPABASE_URL") or "").rstrip("/")
    if not ruta or not base:
        return None
    # Cada tramo se codifica por separado para conservar las "/" de las carpetas
    tramos = "/".join(quote(tramo, safe="") for tramo in ruta.split("/"))
    return f"{base}/storage/v1/object/public/{BUCKET_IMAGENES}/{tramos}"


def extraer_marca(fila: dict, t_vehiculos: str, t_modelos: str, t_marcas: str) -> str | None:
    # Sin !inner en la consulta, un repuesto sin vehículo llega con None en vez de desaparecer
    vehiculo = fila.get(t_vehiculos) or {}
    modelo = vehiculo.get(t_modelos) or {}
    return (modelo.get(t_marcas) or {}).get("nombre")


def armar_producto(fila: dict, t_vehiculos: str, t_modelos: str, t_marcas: str) -> dict:
    return {
        "id": fila["id"],
        "nombre": fila["nombre"],
        "marca": extraer_marca(fila, t_vehiculos, t_modelos, t_marcas),
        "precio": fila["precio_base"],  # número; el formato de moneda lo pone el frontend
        "imagen_url": url_imagen(fila.get("imagen_path")),
    }


# ---------------------------------------------------------------------------
# HU-04: listado de productos paginado
# ---------------------------------------------------------------------------
def crear_router_productos(
    *,
    get_db: Callable[[], Any],
    error_bd: Callable[[Exception], Exception],
    t_repuestos: str,
    t_vehiculos: str,
    t_modelos: str,
    t_marcas: str,
) -> APIRouter:
    """Recibe de main.py la conexión, el error común y los nombres de tablas (T_*)."""
    router = APIRouter()
    seleccion = (
        "id, nombre, precio_base, imagen_path, "
        f"{t_vehiculos} ( {t_modelos} ( {t_marcas} ( nombre ) ) )"
    )

    @router.get("/api/productos")
    def listar_productos(
        pagina: int = Query(1, ge=1),
        por_pagina: int = Query(PRODUCTOS_POR_PAGINA, ge=1, le=MAX_POR_PAGINA),
    ) -> dict:
        try:
            # Se cuenta primero para acotar la página pedida: ?pagina=99 devuelve la última
            # en vez de un error de rango de PostgREST. limit(1) evita traer filas de más.
            cuenta = get_db().table(t_repuestos).select("id", count="exact").limit(1).execute()
            total = cuenta.count
            if total is None:
                raise RuntimeError("Supabase no devolvió el total de repuestos")
            total_paginas = calcular_paginas(total, por_pagina)
            pagina = acotar_pagina(pagina, total_paginas)
            desde = (pagina - 1) * por_pagina

            # No se usa traer_todo(): aquí solo se pide la página que se va a mostrar.
            # nombre ordena de forma legible; id desempata para que ninguna fila se repita
            # ni se salte al pasar de una página a otra.
            filas = (
                get_db().table(t_repuestos)
                .select(seleccion)
                .order("nombre")
                .order("id")
                .range(desde, desde + por_pagina - 1)
                .execute()
                .data
            )
        except Exception as exc:
            raise error_bd(exc)

        return {
            "total": total,
            "pagina": pagina,
            "por_pagina": por_pagina,
            "total_paginas": total_paginas,
            "productos": [armar_producto(f, t_vehiculos, t_modelos, t_marcas) for f in filas],
        }

    return router
