Historia 07

CONTEXTO: Se trabajan las categorías en frontend/js/app.js, el procesamiento y enlistado en backend/main.py, y la visualización en frontend/index.html, todos los demas archivos no se tocan, ya que involucran estilo, apis y tests.

HISTORIA DE USUARIO: 07 Catálogo por categorías
COMO: Mecánico
QUIERO: Explorar el catálogo por categorías de sistemas del vehículo
PARA: Encontrar repuestos sin conocer su nombre o código exacto.

DESCRIPCIÓN
El sistema permitirá explorar categorías de repuestos como frenos, motor, suspensión y eléctrico desde el catálogo principal.

PRECONDICIONES
El mecánico debe haber seleccionado el país.

Deben existir categorías registradas.

FLUJO PRINCIPAL
El mecánico ingresa al catálogo.
El sistema muestra las categorías disponibles.
El mecánico selecciona una categoría.
El sistema muestra los repuestos correspondientes.

FLUJOS ALTERNOS / EXCEPCIONES
A1: Si una categoría no tiene repuestos disponibles, muestra “Por el momento no hay repuestos disponibles en esta categoría” y permite volver a las categorías.

CRITERIOS DE ACEPTACIÓN
CA1: El catálogo muestra las categorías con nombre e icono.
CA2: Al seleccionar una categoría, muestra únicamente sus repuestos.
CA3: Si no hay repuestos disponibles, muestra el mensaje indicado y permite regresar.

REGLAS DE NEGOCIO
RN1: Cada repuesto debe pertenecer a una categoría.
RN2: Solo se muestran repuestos disponibles de la categoría seleccionada.

CAMPOS / UI
Campo Tipo Obligatorio
Categoría Tarjeta/Ícono Sí

Nombre Texto Sí
Repuestos Lista No

FUERA DE ALCANCE
Crear categorías.
Registrar repuestos.
Modificar el inventario.
Comprar repuestos.

DEPENDENCIAS
Catálogo de productos.
Categorías de repuestos.
Inventario.

PRIORIDAD / ESTIMACIÓN
Baja / 3 puntos

NIVEL: B (Verificar que lo construido no ocasione errores con la logica interna del backend principalmente).



