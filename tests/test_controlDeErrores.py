import unittest

from controlDeErrores import (
    ErrorInventario,
    ErrorProductoSinStock,
    ErrorRepuestoNoEncontrado,
    ErrorStockInvalido,
    validar_repuesto_encontrado,
    validar_stock_disponible,
)


class ControlDisponibilidadTests(unittest.TestCase):
    def test_repuesto_no_encontrado_tiene_mensaje_estandar(self):
        with self.assertRaisesRegex(
            ErrorRepuestoNoEncontrado,
            "No se encontró el repuesto solicitado.",
        ) as error:
            validar_repuesto_encontrado(None)

        self.assertIsInstance(error.exception, ErrorInventario)

    def test_repuesto_encontrado_no_genera_error(self):
        repuesto = object()

        self.assertIsNone(validar_repuesto_encontrado(repuesto))

    def test_stock_cero_muestra_mensaje_de_sin_existencias(self):
        with self.assertRaisesRegex(
            ErrorProductoSinStock,
            "El repuesto no cuenta con existencias disponibles.",
        ) as error:
            validar_stock_disponible(0)

        self.assertIsInstance(error.exception, ErrorInventario)

    def test_stock_positivo_esta_disponible(self):
        self.assertIsNone(validar_stock_disponible(5))

    def test_stock_invalido_se_rechaza(self):
        for stock in (-1, 1.5, "2", True):
            with self.subTest(stock=stock):
                with self.assertRaises(ErrorStockInvalido):
                    validar_stock_disponible(stock)
