# Estado actual del catálogo

El catálogo permite consultar repuestos por nombre, filtros opcionales de vehículo y categorías. Muestra precio y existencias por sucursal. El filtro resuelve el nombre en `categorias` y consulta `repuestos.categoria_id`. Como en el ajuste reciente de main, las categorías conservan los repuestos agotados con su precio; la disponibilidad influye en el orden de los resultados.

## Ejecución y configuración

Desde la raíz del proyecto, instalar las dependencias con `pip install -r requirements.txt -r requirements-dev.txt` e iniciar con `uvicorn backend.main:app --reload`.

Los valores reales se configuran en `backend/.env` o en el entorno de Vercel. La conexión utiliza `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`; esta última se utiliza exclusivamente en el servidor. El repositorio carga el archivo de entorno y conserva la validación HTTPS con certificados del sistema.

El campo `imagen` de la API entrega una dirección pública completa o `null`. El servidor la construye con `SUPABASE_URL`, la ruta de imagen del repuesto y `SUPABASE_STORAGE_BUCKET` (opcional; por defecto `repuestos_imagenes`). No hace falta agregar la variable del bucket si el entorno ya utiliza ese nombre.

## Archivos conservados para implementación futura

Las tarjetas enlazan a `frontend/pages/detalle.html?id=...`. El detalle utiliza `GET /api/repuestos/{id}` y muestra nombre, descripción, imagen, precio base y una tabla de stock por sucursal. La página está conectada a `../css/detalle.css` y `../js/detalle.js`, con retorno mediante `../index.html`. La tabla incluye las sucursales del inventario del repuesto, ordenadas por existencias, con «Agotado» cuando el stock es cero. El selector de sucursal permanece pendiente. Los controles de favoritos y valoraciones siguen ocultos; no se consultan rutas de esas funciones. Identificadores inválidos, productos inexistentes y fallos de carga tienen mensajes propios.

`backend/migrations/002_detalle_repuestos.sql` se conserva como antecedente de esa implementación. La limpieza no ejecuta ni revierte migraciones. Antes de utilizarla debe comprobarse el esquema existente y su relación con las historias aprobadas.

La selección de país, autenticación, fabricante, sucursal preferida, precios por sucursal y paginación siguen pendientes. El detalle básico no completa por sí solo HU03 ni HU04.

## Responsabilidades del backend

- `backend/main.py`: punto de entrada `backend.main:app`, rutas HTTP, traducción de errores y frontend estático.
- `backend/catalogo.py`: normalización de filtros, validación de existencias, disponibilidad por categoría, relevancia y límites de resultados.
- `backend/repositorio.py`: configuración del entorno, cliente de Supabase, consultas paginadas, relaciones y traducción de filas al formato del catálogo.
- `backend/control_de_errores.py`: errores y validaciones compartidos.

Las rutas y las respuestas públicas se conservan. Para ejecutar localmente se utiliza el mismo comando de inicio.

## Verificación local

- `ruff check .`
- `pytest --cov=backend --cov-report=term-missing`
- `node --check frontend/js/app.js`
- `node --check frontend/js/detalle.js`
- `node --test tests/frontend.test.cjs tests/detalle.test.cjs`

Las pruebas simulan el inventario y no utilizan la base de datos real. Las pruebas de JavaScript simulan el DOM; la revisión visual en navegador se realiza por separado.

