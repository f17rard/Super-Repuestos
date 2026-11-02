"""Reglas de búsqueda, disponibilidad por categoría y relevancia del catálogo.

No depende de HTTP ni del cliente de Supabase; usa el repositorio para obtener datos.
"""

from backend import repositorio
from backend.control_de_errores import ErrorRepuestoNoEncontrado, validar_categoria, validar_stock

LIMITE_RESULTADOS = 24
MAX_FILAS_RELEVANCIA = 5000


def stock_inventario(fila: dict) -> int:
    stock = fila.get("stock")
    # Un inventario sin dato de stock se presenta como no disponible.
    stock = 0 if stock is None else stock
    validar_stock(stock)
    return stock


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


def consultar_detalle(repuesto_id: int) -> dict:
    repuesto = repositorio.obtener_repuesto_por_id(repuesto_id)
    if repuesto is None:
        raise ErrorRepuestoNoEncontrado()
    for sucursal in repuesto["sucursales"]:
        sucursal["stock"] = stock_inventario(sucursal)
    return repuesto


def listar_marcas() -> list[str]:
    return repositorio.obtener_marcas()


def listar_modelos(marca: str) -> list[str]:
    return repositorio.obtener_modelos(marca)


def listar_anios(marca: str, modelo: str) -> list[int]:
    return repositorio.obtener_anios(marca, modelo)


def coincide_busqueda(pieza: dict, palabras: list[str]) -> bool:
    """Busca nombre, descripción o ID interno sin inventar un SKU."""
    if not palabras:
        return True
    codigo = str(pieza.get("codigo") or pieza.get("id") or "").casefold()
    if len(palabras) == 1 and palabras[0] == codigo:
        return True
    texto = f"{pieza.get('nombre') or ''} {pieza.get('descripcion') or ''}".casefold()
    return all(palabra in texto for palabra in palabras)


def normalizar_stock(repuestos: list[dict]) -> list[dict]:
    for pieza in repuestos:
        for sucursal in pieza["sucursales"]:
            sucursal["stock"] = stock_inventario(sucursal)
    return repuestos


def preparar_resultado(
    repuestos: list[dict], palabras: list[str], categoria: str | None, limite: int
) -> dict:
    repuestos = normalizar_stock(repuestos)
    repuestos = ordenar_por_relevancia(repuestos, palabras)
    return {"total": len(repuestos), "repuestos": repuestos[:limite]}


def buscar_repuestos(
    marca: str | None = None,
    modelo: str | None = None,
    anio: int | None = None,
    repuesto: str | None = None,
    categoria: str | None = None,
    limite: int = LIMITE_RESULTADOS,
) -> dict:
    marca = (marca or "").strip() or None
    modelo = (modelo or "").strip() or None
    categoria = (categoria or "").strip() or None
    validar_categoria(categoria)
    palabras = (repuesto or "").lower().split()
    con_vehiculo = bool(marca or modelo or anio is not None)
    maximo = MAX_FILAS_RELEVANCIA if (palabras or con_vehiculo or categoria) else limite
    repuestos = repositorio.obtener_repuestos(marca, modelo, anio, [], categoria, maximo)
    repuestos = [pieza for pieza in repuestos if coincide_busqueda(pieza, palabras)]
    return preparar_resultado(repuestos, palabras, categoria, limite)
