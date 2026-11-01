"""Regresión de búsqueda y categorías con un doble de Supabase, sin red."""

from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from backend import catalogo, main, repositorio


@pytest.fixture
def cliente(monkeypatch):
    # Incluso con credenciales presentes, ninguna prueba puede consultar Supabase.
    monkeypatch.setattr(repositorio, "get_db", Mock(side_effect=RuntimeError("BD simulada caída")))
    return TestClient(main.app)


def producto(identificador=1, stock=5, nombre="Filtro de aceite", categoria="motor"):
    return {
        "id": identificador,
        "nombre": nombre,
        "precio_base": 12.5,
        "categoria": categoria,
        "imagen_path": "motor/filtro aceite.png",
        repositorio.T_INVENTARIO: [
            {
                "stock": stock,
                repositorio.T_SUCURSALES: {"nombre": "Santa Tecla", "direccion": "Centro"},
            }
        ],
    }


def simular_inventario(monkeypatch, filas):
    consulta = Mock()
    consulta.select.return_value = consulta
    consulta.order.return_value = consulta
    consulta.range.return_value = consulta
    consulta.ilike.return_value = consulta
    consulta.eq.side_effect = lambda columna, valor: filtrar(columna, valor)
    seleccion = list(filas)

    def filtrar(columna, valor):
        nonlocal seleccion
        seleccion = [fila for fila in seleccion if fila.get(columna) == valor]
        return consulta

    consulta.execute.side_effect = lambda: SimpleNamespace(data=seleccion)
    base = Mock()
    base.table.return_value = consulta
    monkeypatch.setattr(repositorio, "get_db", lambda: base)
    return consulta


@pytest.mark.parametrize(
    "ruta",
    [
        "/api/marcas",
        "/api/modelos?marca=Toyota",
        "/api/anios?marca=Toyota&modelo=Corolla",
        "/api/repuestos?repuesto=filtro",
    ],
)
def test_inventario_caido_responde_503_sin_detalles_internos(cliente, ruta):
    respuesta = cliente.get(ruta)
    assert respuesta.status_code == 503
    assert respuesta.json() == {
        "detail": {
            "codigo": "BD_NO_DISPONIBLE",
            "mensaje": "No se pudo consultar el stock, intenta de nuevo más tarde",
        }
    }
    assert "BD simulada" not in respuesta.text


@pytest.mark.parametrize(
    "ruta",
    [
        "/api/modelos",
        "/api/anios?marca=Toyota",
        "/api/repuestos?anio=texto",
        "/api/repuestos?limite=0",
        "/api/repuestos?repuesto=" + "x" * 101,
    ],
)
def test_filtros_invalidos_responden_422_con_codigo(cliente, ruta):
    respuesta = cliente.get(ruta)
    assert respuesta.status_code == 422
    assert respuesta.json()["detail"]["codigo"] == "FILTROS_INVALIDOS"
    repositorio.get_db.assert_not_called()


def test_categoria_invalida_no_consulta_la_bd(cliente):
    respuesta = cliente.get("/api/repuestos?categoria=desconocida")
    assert respuesta.status_code == 422
    assert respuesta.json()["detail"]["codigo"] == "CATEGORIA_INVALIDA"
    repositorio.get_db.assert_not_called()


def test_busqueda_sin_coincidencias_es_respuesta_valida(cliente, monkeypatch):
    simular_inventario(monkeypatch, [])
    respuesta = cliente.get("/api/repuestos?repuesto=inexistente")
    assert respuesta.status_code == 200
    assert respuesta.json() == {"total": 0, "repuestos": []}


def test_busqueda_conserva_precio_y_stock_cero(cliente, monkeypatch):
    simular_inventario(monkeypatch, [producto(stock=0)])
    respuesta = cliente.get("/api/repuestos?repuesto=filtro")
    assert respuesta.status_code == 200
    repuesto = respuesta.json()["repuestos"][0]
    assert repuesto["precio"] == 12.5
    assert repuesto["sucursales"][0]["stock"] == 0


def test_categoria_solo_incluye_repuestos_propios_disponibles(cliente, monkeypatch):
    consulta = simular_inventario(
        monkeypatch,
        [
            producto(1, stock=0),
            producto(2, stock=3),
            producto(3, categoria="frenos"),
        ],
    )
    respuesta = cliente.get("/api/repuestos?categoria=motor")
    assert respuesta.status_code == 200
    assert respuesta.json()["total"] == 1
    assert respuesta.json()["repuestos"][0]["id"] == 2
    consulta.eq.assert_called_once_with("categoria", "motor")


def test_categoria_sin_stock_devuelve_lista_vacia(cliente, monkeypatch):
    simular_inventario(monkeypatch, [producto(stock=0)])
    assert cliente.get("/api/repuestos?categoria=motor").json() == {"total": 0, "repuestos": []}


def test_stock_corrupto_devuelve_503(cliente, monkeypatch):
    simular_inventario(monkeypatch, [producto(stock=-2)])
    respuesta = cliente.get("/api/repuestos")
    assert respuesta.status_code == 503
    assert respuesta.json()["detail"]["codigo"] == "STOCK_INVALIDO"


def test_datos_incompletos_devuelven_error_controlado(cliente, monkeypatch):
    simular_inventario(monkeypatch, [{"id": 1}])
    respuesta = cliente.get("/api/repuestos")
    assert respuesta.status_code == 503
    assert respuesta.json()["detail"]["codigo"] == "BD_NO_DISPONIBLE"


def test_catalogo_inicial_admite_filtros_vacios(cliente, monkeypatch):
    simular_inventario(monkeypatch, [producto()])
    assert cliente.get("/api/repuestos").status_code == 200


def test_busqueda_escapa_comodines_y_aplica_cada_palabra(cliente, monkeypatch):
    consulta = simular_inventario(monkeypatch, [])
    cliente.get("/api/repuestos", params={"repuesto": "filtro 50%_"})
    assert consulta.ilike.call_args_list[0].args == ("nombre", "%filtro%")
    assert consulta.ilike.call_args_list[1].args == ("nombre", "%50\\%\\_%")


def test_imagen_usa_configuracion_sin_exponer_la_clave(cliente, monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://catalogo.example")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "secreto-de-prueba")
    monkeypatch.setenv("SUPABASE_STORAGE_BUCKET", "repuestos_imagenes")
    simular_inventario(monkeypatch, [producto()])
    respuesta = cliente.get("/api/repuestos")
    assert respuesta.json()["repuestos"][0]["imagen"] == (
        "https://catalogo.example/storage/v1/object/public/repuestos_imagenes/motor/filtro%20aceite.png"
    )
    assert "secreto-de-prueba" not in respuesta.text


def test_listas_de_vehiculo_ordenan_y_quitan_duplicados(cliente, monkeypatch):
    simular_inventario(
        monkeypatch, [{"nombre": "Toyota"}, {"nombre": "Audi"}, {"nombre": "Toyota"}]
    )
    assert cliente.get("/api/marcas").json() == ["Audi", "Toyota"]


def test_precio_y_disponibilidad_no_cambian_orden_de_relevancia():
    exacto = {"nombre": "Filtro", "sucursales": [{"stock": 0}]}
    disponible = {"nombre": "Filtro de aceite", "sucursales": [{"stock": 10}]}
    assert catalogo.ordenar_por_relevancia([disponible, exacto], ["filtro"]) == [exacto, disponible]


def test_traer_todo_avanza_paginas_y_respeta_maximo(monkeypatch):
    monkeypatch.setattr(repositorio, "PAGINA", 2)
    consulta = Mock()
    consulta.range.return_value = consulta
    consulta.execute.side_effect = [SimpleNamespace(data=[1, 2]), SimpleNamespace(data=[3, 4])]
    assert repositorio.traer_todo(lambda: consulta, maximo=3) == [1, 2, 3]
    assert [llamada.args for llamada in consulta.range.call_args_list] == [(0, 1), (2, 3)]


def test_conexion_usa_service_role_del_entorno_sin_consultar_la_red(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://catalogo.example")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role-de-prueba")
    monkeypatch.setenv("SUPABASE_KEY", "clave-antigua-no-utilizada")
    crear = Mock()
    monkeypatch.setattr(repositorio, "create_client", crear)
    repositorio.get_db.cache_clear()
    try:
        assert repositorio.get_db() is crear.return_value
        crear.assert_called_once()
        assert crear.call_args.args == ("https://catalogo.example", "service-role-de-prueba")
        transporte = crear.call_args.kwargs["options"].httpx_client
        assert transporte is not None
        transporte.close()
    finally:
        repositorio.get_db.cache_clear()


def test_falta_de_service_role_no_usa_la_clave_antigua(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://catalogo.example")
    monkeypatch.setenv("SUPABASE_KEY", "clave-antigua-no-utilizada")
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    crear = Mock()
    monkeypatch.setattr(repositorio, "create_client", crear)
    repositorio.get_db.cache_clear()
    with pytest.raises(RuntimeError, match="SUPABASE_SERVICE_ROLE_KEY"):
        repositorio.get_db()
    crear.assert_not_called()


def test_imagen_ausente_conserva_null():
    assert repositorio.url_imagen(None) is None


def test_catalogo_y_detalle_conservado_se_sirven_desde_la_app(cliente):
    assert "Buscador de repuestos" in cliente.get("/").text
    assert cliente.get("/js/app.js").status_code == 200
    assert cliente.get("/pages/detalle.html").status_code == 200
    assert cliente.get("/js/detalle.js").status_code == 200
