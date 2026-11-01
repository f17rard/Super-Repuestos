"""Validaciones usadas por el catálogo actual, sin conexión al inventario real."""

import pytest

from backend.control_de_errores import (
    CATEGORIAS_VALIDAS,
    ErrorFiltroInvalido,
    ErrorStockInvalido,
    validar_categoria,
    validar_stock,
)


@pytest.mark.parametrize("categoria", [None, *sorted(CATEGORIAS_VALIDAS)])
def test_categoria_del_catalogo_es_valida(categoria):
    validar_categoria(categoria)


def test_categoria_desconocida_tiene_codigo_estable():
    with pytest.raises(ErrorFiltroInvalido) as error:
        validar_categoria("desconocida")
    assert error.value.estado_http == 422
    assert error.value.detalle() == {
        "codigo": "CATEGORIA_INVALIDA",
        "mensaje": "Categoría no válida.",
    }


@pytest.mark.parametrize("stock", [0, 5])
def test_stock_cero_o_positivo_no_es_error(stock):
    validar_stock(stock)


@pytest.mark.parametrize("stock", [-1, 1.5, "2", True, False, None])
def test_stock_invalido_es_fallo_del_inventario(stock):
    with pytest.raises(ErrorStockInvalido) as error:
        validar_stock(stock)
    assert error.value.estado_http == 503
    assert error.value.detalle()["codigo"] == "STOCK_INVALIDO"
