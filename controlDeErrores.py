
#NOTA: Codigo semi al aire por el momento, cuando la funcion del seachbar ya este mas o menos lo editare de nuevo o7


class ErrorInventario(Exception):
    """Base para errores del inventario."""
    pass


class ErrorBusquedaVacia(ErrorInventario):
    pass


class ErrorFiltroVehiculoIncompleto(ErrorInventario):
    pass


class ErrorFiltroInvalido(ErrorInventario):
    pass


class ErrorOrdenInvalido(ErrorInventario):
    pass


class ErrorCantidadInvalida(ErrorInventario):
    pass


class ErrorCodigoDuplicado(ErrorInventario):
    pass


class ErrorPrecioInvalido(ErrorInventario):
    pass


def validar_busqueda(texto, filtros):
    if not texto and not filtros:
        raise ErrorBusquedaVacia("Ingrese un término de búsqueda o seleccione al menos un filtro.")

    vehiculo = filtros.get("vehiculo")
    if vehiculo:
        if not all([vehiculo.get("marca"), vehiculo.get("modelo"), vehiculo.get("anio")]):
            raise ErrorFiltroVehiculoIncompleto("Debe seleccionar marca, modelo y año.")

    categorias_validas = {
        "motor", "electrico", "frenos", "transmision", "suspension", "aire_acondicionado", "accesorios"
        }
    if filtros.get("categoria") and filtros["categoria"] not in categorias_validas:
        raise ErrorFiltroInvalido("Categoría no válida.")

    anio = vehiculo.get("anio") if vehiculo else None
    if anio is not None:
        if not str(anio).isdigit():
            raise ErrorFiltroInvalido("El año debe ser numérico.")
        if not (1980 <= int(anio) <= 2026):
            raise ErrorFiltroInvalido("Año fuera de rango.")


def validar_orden(orden):
    opciones = {"relevancia", "precio_asc", "precio_desc"}
    if orden not in opciones:
        raise ErrorOrdenInvalido("Opción de ordenamiento no válida.")


def validar_cantidad(cantidad):
    if not isinstance(cantidad, int) or cantidad <= 0:
        raise ErrorCantidadInvalida("La cantidad debe ser un entero mayor a 0.")
    if cantidad > 999:
        raise ErrorCantidadInvalida("La cantidad solicitada es demasiado alta.")


def validar_nuevo_producto(codigo, precio, repo):
    if repo.existe_codigo(codigo):
        raise ErrorCodigoDuplicado(f"El código {codigo} ya existe.")
    if not isinstance(precio, (int, float)) or precio <= 0:
        raise ErrorPrecioInvalido("El precio debe ser mayor a 0.")