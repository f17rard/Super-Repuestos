import pytest
from fastapi.testclient import TestClient

from backend.main import app
from controlDeErrores import ErrorCantidadInvalida, validar_cantidad


def test_cantidad_valida():
    validar_cantidad(5)


def test_cantidad_invalida():
    with pytest.raises(ErrorCantidadInvalida):
        validar_cantidad(0)


def test_marcas_sin_bd_devuelve_503():
    r = TestClient(app).get("/api/marcas")
    assert r.status_code == 503