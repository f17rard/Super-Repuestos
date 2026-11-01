"""Errores y validaciones del catálogo actual (búsqueda, categorías e inventario)."""

CATEGORIAS_VALIDAS = frozenset(
    {
        "motor",
        "electrico",
        "frenos",
        "transmision",
        "suspension",
        "aire_acondicionado",
        "accesorios",
    }
)


class ErrorInventario(Exception):
    """Fallo del inventario sin exponer detalles internos al cliente (CA4)."""

    codigo = "BD_NO_DISPONIBLE"
    estado_http = 503
    mensaje = "No se pudo consultar el stock, intenta de nuevo más tarde"

    def __init__(self) -> None:
        super().__init__(self.mensaje)

    def detalle(self) -> dict[str, str]:
        return {"codigo": self.codigo, "mensaje": self.mensaje}


class ErrorFiltroInvalido(ErrorInventario):
    codigo = "CATEGORIA_INVALIDA"
    estado_http = 422
    mensaje = "Categoría no válida."


class ErrorStockInvalido(ErrorInventario):
    # Un dato corrupto del inventario no es un error de entrada del usuario.
    codigo = "STOCK_INVALIDO"


def validar_categoria(categoria: str | None) -> None:
    if categoria is not None and categoria not in CATEGORIAS_VALIDAS:
        raise ErrorFiltroInvalido()


def validar_stock(stock: int) -> None:
    """Cero es válido: el repuesto conserva su precio y se muestra sin stock (CA2)."""
    if isinstance(stock, bool) or not isinstance(stock, int) or stock < 0:
        raise ErrorStockInvalido()
