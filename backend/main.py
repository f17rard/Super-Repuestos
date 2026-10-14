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
  GET /api/repuestos?marca=&modelo=&anio=&repuesto=

Además sirve la carpeta ../frontend, así la página y la API comparten origen.
"""
import logging
import os
import re
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

app = FastAPI(title="API Buscador de repuestos")


# ---------------------------------------------------------------------------
# Conexión a Supabase
# ---------------------------------------------------------------------------
@lru_cache
def get_db() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    if not url or not key:
        raise RuntimeError("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el archivo .env")
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
# Búsqueda por palabra clave, código o descripción (reemplaza busqueda T2 +T3)
# ---------------------------------------------------------------------------
# Columnas donde se busca el texto. Cuando exista la columna del código del
# repuesto, se agrega aquí:  CAMPOS_BUSQUEDA=nombre,descripcion,codigo
CAMPOS_BUSQUEDA = [c.strip() for c in os.getenv("CAMPOS_BUSQUEDA", "nombre,descripcion").split(",") if c.strip()]
PESO_CAMPO = {"nombre": 3, "codigo": 3, "descripcion": 1}  # para ordenar por relevancia
MAX_TERMINOS = 6


def terminos_de(texto: str) -> list[str]:
    """Divide el texto en palabras. Quita caracteres que rompen el filtro or() de PostgREST."""
    limpio = re.sub(r'[,()"\\]', " ", texto)
    return limpio.split()[:MAX_TERMINOS]


def condicion_or(termino: str) -> str:
    """'campo1.ilike."%t%",campo2.ilike."%t%"' -> la palabra aparece en ALGUNO de los campos."""
    t = termino.replace("%", "\\\\%").replace("_", "\\\\_")  # % y _ literales
    return ",".join(f'{campo}.ilike."%{t}%"' for campo in CAMPOS_BUSQUEDA)


def relevancia(fila: dict, terminos: list[str]) -> int:
    puntos = 0
    for t in (x.lower() for x in terminos):
        for campo in CAMPOS_BUSQUEDA:
            if t in str(fila.get(campo) or "").lower():
                puntos += PESO_CAMPO.get(campo, 1)
    return puntos


@app.get("/api/repuestos")
def buscar_repuestos(
    repuesto: str = Query("", description="Palabra clave, código o descripción"),
    marca: str | None = Query(None),
    modelo: str | None = Query(None),
    anio: int | None = Query(None),
) -> dict:
    terminos = terminos_de(repuesto)
    hay_vehiculo = bool(marca or modelo or anio)

    if not terminos and not hay_vehiculo:
        raise HTTPException(status_code=422, detail="Escribe un repuesto o selecciona un vehículo")

    # !inner solo si se filtra por vehículo (RN1); sin filtro, no se descartan repuestos
    inner = "!inner" if hay_vehiculo else ""
    extras = "".join(f", {c}" for c in CAMPOS_BUSQUEDA if c not in ("nombre", "descripcion"))
    seleccion = f"""
        id, nombre, descripcion, precio_base{extras},
        {T_VEHICULOS}{inner} (
            anio,
            {T_MODELOS}{inner} ( nombre, {T_MARCAS}{inner} ( nombre ) )
        ),
        {T_INVENTARIO} ( stock, {T_SUCURSALES} ( nombre, direccion ) )
    """

    try:
        consulta = get_db().table(T_REPUESTOS).select(seleccion)
        for t in terminos:                  # cada palabra debe aparecer (AND)...
            consulta = consulta.or_(condicion_or(t))  # ...en nombre, código o descripción (OR)
        if anio:
            consulta = consulta.eq(f"{T_VEHICULOS}.anio", anio)
        if modelo:
            consulta = consulta.eq(f"{T_VEHICULOS}.{T_MODELOS}.nombre", modelo)
        if marca:
            consulta = consulta.eq(f"{T_VEHICULOS}.{T_MODELOS}.{T_MARCAS}.nombre", marca)
        filas = consulta.execute().data
    except Exception as exc:
        raise error_bd(exc)

    filas.sort(key=lambda f: relevancia(f, terminos), reverse=True)

    repuestos = [
        {
            "id": f["id"],
            "nombre": f["nombre"],
            "codigo": f.get("codigo"),
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
    return {"total": len(repuestos), "repuestos": repuestos}
# ---------------------------------------------------------------------------
# Sirve la página (debe ir al final, después de las rutas /api)
# ---------------------------------------------------------------------------
FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")