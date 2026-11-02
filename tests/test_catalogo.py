"""Las reglas del catálogo se prueban con un repositorio simulado, sin HTTP ni BD."""

from unittest.mock import Mock

import pytest

from backend import catalogo
from backend.control_de_errores import ErrorFiltroInvalido


def test_categoria_prioriza_stock_y_conserva_total_antes_de_limitar(monkeypatch):
    obtener = Mock(
        return_value=[
            {"id": 1, "nombre": "Filtro", "sucursales": [{"stock": None}]},
            {"id": 2, "nombre": "Filtro", "sucursales": [{"stock": 3}]},
        ]
    )
    monkeypatch.setattr(catalogo.repositorio, "obtener_repuestos", obtener)
    resultado = catalogo.buscar_repuestos(categoria=" motor ", limite=1)
    assert resultado["total"] == 2
    assert resultado["repuestos"][0]["id"] == 2
    obtener.assert_called_once_with(None, None, None, [], "motor", 5000)


def test_busqueda_general_conserva_stock_nulo_como_cero(monkeypatch):
    monkeypatch.setattr(
        catalogo.repositorio,
        "obtener_repuestos",
        Mock(
            return_value=[
                {"id": 1, "nombre": "Filtro", "sucursales": [{"stock": None}]},
            ]
        ),
    )
    resultado = catalogo.buscar_repuestos(repuesto=" FILTRO ")
    assert resultado["total"] == 1
    assert resultado["repuestos"][0]["sucursales"][0]["stock"] == 0


def test_categoria_invalida_no_consulta_repositorio(monkeypatch):
    obtener = Mock()
    monkeypatch.setattr(catalogo.repositorio, "obtener_repuestos", obtener)
    with pytest.raises(ErrorFiltroInvalido):
        catalogo.buscar_repuestos(categoria="inexistente")
    obtener.assert_not_called()


def test_busqueda_usa_descripcion_e_id_interno(monkeypatch):
    piezas = [
        {
            "id": 8,
            "nombre": "Filtro",
            "descripcion": "Aceite sintético",
            "sucursales": [{"stock": 2}],
        },
        {
            "id": 15,
            "nombre": "Pastillas",
            "descripcion": "Cerámica silenciosa",
            "sucursales": [{"stock": 2}],
        },
    ]
    obtener = Mock(return_value=piezas)
    monkeypatch.setattr(catalogo.repositorio, "obtener_repuestos", obtener)
    assert catalogo.buscar_repuestos(repuesto="silenciosa")["total"] == 1
    assert catalogo.buscar_repuestos(repuesto="15")["repuestos"][0]["id"] == 15
    assert obtener.call_args.args[3] == []


def test_detalle_sin_imagen_conserva_null(monkeypatch):
    pieza = {"id": 42, "nombre": "Pastillas", "imagen": None, "sucursales": [{"stock": 0}]}
    monkeypatch.setattr(catalogo.repositorio, "obtener_repuesto_por_id", Mock(return_value=pieza))
    detalle = catalogo.consultar_detalle(42)
    assert detalle["imagen"] is None
    assert detalle["sucursales"][0]["stock"] == 0
