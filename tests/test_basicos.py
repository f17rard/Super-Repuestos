import pytest
from fastapi.testclient import TestClient

from backend.main import app, condicion_or, terminos_de
from controlDeErrores import ErrorCantidadInvalida, validar_cantidad


def test_cantidad_valida():
    validar_cantidad(5)


def test_cantidad_invalida():
    with pytest.raises(ErrorCantidadInvalida):
        validar_cantidad(0)


def test_marcas_sin_bd_devuelve_503():
    r = TestClient(app).get("/api/marcas")
    assert r.status_code == 503

def test_separa_palabras():
    assert terminos_de("filtro aceite") == ["filtro", "aceite"]


def test_quita_caracteres_que_rompen_el_filtro():
    assert terminos_de('a,b(c)"d') == ["a", "b", "c", "d"]


def test_maximo_seis_terminos():
    assert len(terminos_de("a b c d e f g h")) == 6


def test_condicion_or_busca_en_los_campos():
    assert 'nombre.ilike."%filtro%"' in condicion_or("filtro")