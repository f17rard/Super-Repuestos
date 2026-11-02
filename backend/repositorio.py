"""Acceso a Supabase y traducción de sus filas al contrato del catálogo (HU de búsqueda)."""

import os
import ssl
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote

import httpx
from dotenv import load_dotenv
from supabase import Client, ClientOptions, create_client

load_dotenv(Path(__file__).resolve().with_name(".env"))

# ---------------------------------------------------------------------------
# Nombres de tablas. Si se nombran distinto, se pueden cambiar en .env
# ---------------------------------------------------------------------------
T_MARCAS = os.getenv("TABLA_MARCAS", "marcas")  # id, nombre
T_MODELOS = os.getenv("TABLA_MODELOS", "modelos")  # id, marca_id, nombre
T_VEHICULOS = os.getenv("TABLA_VEHICULOS", "vehiculos")  # id, modelo_id, anio
T_REPUESTOS = os.getenv(
    "TABLA_REPUESTOS", "repuestos"
)  # id, nombre, descripcion, precio_base, categoria, vehiculo_id
T_INVENTARIO = os.getenv("TABLA_INVENTARIO", "inventario")  # id, repuesto_id, sucursal_id, stock
T_SUCURSALES = os.getenv("TABLA_SUCURSALES", "sucursales")  # id, nombre, direccion
T_CATEGORIAS = os.getenv("TABLA_CATEGORIAS", "categorias")

NOMBRES_CATEGORIAS = {
    "motor": "Motor",
    "electrico": "Eléctrico",
    "frenos": "Frenos",
    "transmision": "Transmisión",
    "suspension": "Suspensión",
    "aire_acondicionado": "Aire acondicionado",
    "accesorios": "Accesorios",
}

PAGINA = 1000  # filas por petición a Supabase (su límite por defecto)


@lru_cache
def get_db() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el archivo .env")
    # Incluye certificados de confianza del sistema (Windows), con validación TLS.
    return create_client(
        url,
        key,
        options=ClientOptions(httpx_client=httpx.Client(verify=ssl.create_default_context())),
    )


def url_imagen(ruta: str | None) -> str | None:
    """Construye la dirección pública desde el entorno, sin enviar claves al navegador."""
    if not ruta:
        return None
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    if not url:
        return None
    bucket = os.getenv("SUPABASE_STORAGE_BUCKET", "repuestos_imagenes")
    return f"{url}/storage/v1/object/public/{quote(bucket, safe='')}/{quote(ruta, safe='/')}"


def traer_todo(construir_consulta, maximo: int | None = None) -> list[dict]:
    """Recorre las páginas de Supabase para no quedarse en el límite de 1000 filas.
    Con `maximo` se detiene al juntar esa cantidad de filas."""
    tamano = min(PAGINA, maximo) if maximo else PAGINA
    filas: list[dict] = []
    inicio = 0
    while True:
        lote = construir_consulta().range(inicio, inicio + tamano - 1).execute().data
        filas.extend(lote)
        if len(lote) < tamano or (maximo is not None and len(filas) >= maximo):
            return filas[:maximo] if maximo is not None else filas
        inicio += tamano


def escapar_like(texto: str) -> str:
    """Evita que % y _ escritos por el usuario actúen como comodines."""
    return texto.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def armar_seleccion(con_vehiculo: bool) -> str:
    """Columnas a pedir. El vehículo solo se une (!inner) si algún filtro lo usa (RN1)."""
    inventario = f"{T_INVENTARIO} ( stock, {T_SUCURSALES} ( nombre, direccion ) )"
    if not con_vehiculo:
        return f"id, nombre, descripcion, precio_base, imagen_path, {inventario}"
    return f"""
        id, nombre, descripcion, precio_base, imagen_path,
        {T_VEHICULOS}!inner (
            anio,
            {T_MODELOS}!inner ( nombre, {T_MARCAS}!inner ( nombre ) )
        ),
        {inventario}
    """


def obtener_repuesto_por_id(repuesto_id: int) -> dict | None:
    """Consulta por identidad, sin depender de los filtros del listado."""
    filas = (
        get_db()
        .table(T_REPUESTOS)
        .select(armar_seleccion(con_vehiculo=False))
        .eq("id", repuesto_id)
        .limit(1)
        .execute()
        .data
    )
    if not filas:
        return None
    fila = filas[0]
    return {
        "id": fila["id"],
        "nombre": fila["nombre"],
        "descripcion": fila.get("descripcion"),
        "precio": fila["precio_base"],
        "imagen": url_imagen(fila.get("imagen_path")),
        "sucursales": [
            {
                "nombre": (inventario.get(T_SUCURSALES) or {}).get("nombre", "Sucursal sin nombre"),
                "direccion": (inventario.get(T_SUCURSALES) or {}).get("direccion"),
                "stock": inventario.get("stock"),
            }
            for inventario in (fila.get(T_INVENTARIO) or [])
        ],
    }


def obtener_marcas() -> list[str]:
    filas = traer_todo(lambda: get_db().table(T_MARCAS).select("nombre"))
    return sorted({f["nombre"] for f in filas})


def obtener_modelos(marca: str) -> list[str]:
    filas = traer_todo(
        lambda: (
            get_db()
            .table(T_MODELOS)
            .select(f"nombre, {T_MARCAS}!inner(nombre)")
            .eq(f"{T_MARCAS}.nombre", marca)
        )
    )
    return sorted({f["nombre"] for f in filas})


def obtener_anios(marca: str, modelo: str) -> list[int]:
    filas = traer_todo(
        lambda: (
            get_db()
            .table(T_VEHICULOS)
            .select(f"anio, {T_MODELOS}!inner(nombre, {T_MARCAS}!inner(nombre))")
            .eq(f"{T_MODELOS}.nombre", modelo)
            .eq(f"{T_MODELOS}.{T_MARCAS}.nombre", marca)
        )
    )
    return sorted({f["anio"] for f in filas}, reverse=True)

def obtener_id_categoria(categoria: str) -> int | None:
    nombre = NOMBRES_CATEGORIAS[categoria]

    respuesta = (
        get_db()
        .table(T_CATEGORIAS)
        .select("id")
        .eq("nombre", nombre)
        .limit(1)
        .execute()
    )

    if not respuesta.data:
        return None

    return respuesta.data[0]["id"]

def obtener_id_categoria(categoria: str) -> int | None:
    filas = (
        get_db()
        .table(T_CATEGORIAS)
        .select("id")
        .eq("nombre", NOMBRES_CATEGORIAS[categoria])
        .limit(1)
        .execute()
        .data
    )
    return filas[0]["id"] if filas else None


def obtener_repuestos(
    marca: str | None,
    modelo: str | None,
    anio: int | None,
    palabras: list[str],
    categoria: str | None,
    maximo: int,
) -> list[dict]:
    con_vehiculo = bool(marca or modelo or anio is not None)
    seleccion = armar_seleccion(con_vehiculo)
    id_categoria = obtener_id_categoria(categoria) if categoria else None
    if categoria and id_categoria is None:
        # Una categoría ausente no debe devolver todo el catálogo.
        return []

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
        if categoria:
            consulta = consulta.eq("categoria_id", id_categoria)
        return consulta

    filas = traer_todo(construir_consulta, maximo=maximo)
    return [
        {
            "id": fila["id"],
            "nombre": fila["nombre"],
            "descripcion": fila.get("descripcion"),
            "imagen": url_imagen(fila.get("imagen_path")),
            "precio": fila["precio_base"],
            "sucursales": [
                {
                    "nombre": (inventario.get(T_SUCURSALES) or {}).get(
                        "nombre", "Sucursal sin nombre"
                    ),
                    "direccion": (inventario.get(T_SUCURSALES) or {}).get("direccion"),
                    "stock": inventario.get("stock"),
                }
                for inventario in (fila.get(T_INVENTARIO) or [])
            ],
        }
        for fila in filas
    ]
