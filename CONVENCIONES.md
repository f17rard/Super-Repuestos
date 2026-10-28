# Convenciones de código — Super-Repuestos

Este documento define cómo escribimos código en este repo. Se dedujo del código que ya existe (`backend/main.py`, `frontend/`, `controlDeErrores.py`, el workflow de CI) para que lo nuevo se vea igual que lo actual.

Cada regla lleva una etiqueta:

- **[Vigente]**: ya se cumple en el repo; se mantiene.
- **[Nueva]**: no existe todavía o no es uniforme; desde ahora se aplica.

> Si una regla estorba, se discute en el PR y se actualiza este archivo. No se rompe en silencio.

---

## 1. Principios generales

1. **Una tarea, un cambio pequeño.** No mezclar refactors con features. Quien tiene una tarea (T2, T3, T4…) toca solo lo suyo. **[Vigente]**
2. **Todo se conecta con trazabilidad.** Los comentarios y docstrings mencionan la HU, la tarea (`T2`) o la regla de negocio (`RN1`) que implementan. **[Vigente]**
3. **Los ganchos se completan, no se reescriben.** Las funciones reservadas para otros compañeros (`mostrarSinStock`, `mostrarNoEncontrado`, `mostrarErrorInventario`) se rellenan sin modificar el resto del archivo. **[Vigente]**
4. **Cero secretos en el código.** Ver sección 9. **[Vigente en intención, ver nota en sección 9]**
5. **El código se lee en español.** Ver sección 3. **[Vigente]**
6. **Si el CI no pasa, no se integra.** **[Vigente]**

---

## 2. Estructura del repositorio

```
/
├── CONVENCIONES.md            ← este archivo
├── requirements.txt           ← solo delega: "-r backend/requirements.txt"
├── requirements-dev.txt       ← ruff, pytest, pytest-cov (herramientas de desarrollo)   [Nueva]
├── .gitignore
├── .github/workflows/         ← CI (DLCdeluxe_CI.yml)
├── backend/
│   ├── main.py                ← API FastAPI + sirve el frontend
│   ├── requirements.txt       ← dependencias del backend
│   ├── .env                   ← NO se versiona
│   └── .env.example           ← plantilla sin valores reales                            [Nueva]
├── frontend/
│   ├── index.html
│   ├── css/styles.css
│   └── js/app.js
├── tests/                     ← pruebas con pytest                                      [Nueva]
└── control_de_errores.py      ← excepciones y validaciones (hoy: controlDeErrores.py)   [Nueva]
```

Reglas:

- El frontend **nunca** habla con Supabase: solo llama a `/api/...`. **[Vigente]**
- Las dependencias del backend viven en `backend/requirements.txt`; el `requirements.txt` de la raíz solo las referencia. **[Vigente]**
- Las herramientas de desarrollo (`ruff`, `pytest`, `pytest-cov`) van en `requirements-dev.txt`, y el CI debe instalarlas (`pip install -r requirements.txt -r requirements-dev.txt`). **[Nueva]**
- Un archivo nuevo va en la carpeta de su capa (backend, frontend, tests). No se crean archivos sueltos en la raíz.

---

## 3. Idioma y nombres

### 3.1 Idioma

| Qué | Idioma |
|---|---|
| Nombres de funciones, variables, clases, IDs y clases CSS | Español |
| Comentarios, docstrings, mensajes de commit y de PR | Español |
| Textos que ve el usuario | Español, con tildes y signos de puntuación correctos |
| Palabras técnicas sin traducción natural (`id`, `stock`, `token`, `request`) | Se dejan en inglés |
| Variables de diseño CSS (`--primary-red`) | Inglés (tokens de diseño) **[Vigente]** |

En identificadores (código, parámetros de URL, claves JSON) **no se usan tildes ni ñ**: `anio`, no `año`; `descripcion`, no `descripción`. **[Vigente]**

### 3.2 Tabla de estilos

| Elemento | Estilo | Ejemplo del repo |
|---|---|---|
| Archivo Python | `snake_case`, todo minúscula | `main.py`, `control_de_errores.py` |
| Función Python | `snake_case`, verbo + sustantivo | `listar_marcas`, `buscar_repuestos`, `traer_todo` |
| Constante Python | `MAYUSCULAS_CON_GUION_BAJO` | `PAGINA`, `T_MARCAS` |
| Constantes de nombres de tabla | prefijo `T_` | `T_REPUESTOS`, `T_INVENTARIO` |
| Clase Python / excepción | `PascalCase`, prefijo `Error` | `ErrorInventario`, `ErrorBusquedaVacia` |
| Variable de entorno | `MAYUSCULAS`, prefijo por tema | `SUPABASE_URL`, `TABLA_MARCAS` |
| Función / variable JS | `camelCase` en español | `cargarMarcas`, `formatoPrecio` |
| Constante de configuración JS | `MAYUSCULAS` | `MONEDA` |
| ID HTML | `kebab-case` con prefijo de rol | `form-busqueda`, `btn-buscar`, `campo-marca`, `err-marca` |
| Clase CSS | `kebab-case` en español | `repuesto-cab`, `stock-ok`, `msg-campo` |
| Variable CSS | `--kebab-case` | `--primary-red`, `--dark-card` |
| Tabla / columna en BD | `snake_case`, tablas en plural | `repuestos`, `precio_base`, `vehiculo_id` |
| Endpoint | `/api/<recurso-en-plural>` en minúscula | `/api/marcas`, `/api/repuestos` |
| Parámetro de query / clave JSON | minúscula, `snake_case` | `marca`, `anio`, `precio_base` |

**Mayúsculas y minúsculas importan.** Linux (CI, servidores) distingue `Main.py` de `main.py`. El nombre del archivo, los comandos (`uvicorn main:app`) y los comentarios que lo mencionen deben coincidir letra por letra. **[Nueva]**

---

## 4. Python (backend)

### 4.1 Formato

- Python 3.12, sangría de **4 espacios**, comillas dobles `"`. **[Vigente]**
- Línea máxima recomendada: **100 caracteres**. **[Nueva]**
- Imports en tres bloques separados por una línea en blanco: biblioteca estándar, terceros, locales. Dentro de cada bloque, orden alfabético. **[Vigente]**
- Se valida con `ruff check .` antes de subir. Configuración sugerida (`pyproject.toml`): **[Nueva]**

```toml
[tool.ruff]
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "I"]
```

> Antes de activar reglas nuevas, correr `ruff check .` en local y corregir lo que salga.

### 4.2 Estructura de un módulo

1. Docstring de módulo en español: qué hace, esquema de BD, endpoints, HU/tareas.
2. Imports.
3. Configuración (constantes, variables de entorno).
4. Helpers.
5. Endpoints, agrupados por tarea con separador.
6. Montaje de archivos estáticos **siempre al final**, después de las rutas `/api`. **[Vigente]**

Separador de secciones (75 guiones):

```python
# ---------------------------------------------------------------------------
# T2: listas en cascada (marca > modelo > año)
# ---------------------------------------------------------------------------
```

### 4.3 Reglas de código

- **Type hints** en parámetros y retorno de endpoints y helpers: `-> list[str]`, `-> dict`. **[Vigente]**
- Validar parámetros con `Query(..., min_length=1)`. **[Vigente]**
- Los endpoints son delgados: validan, consultan, transforman y responden. La lógica reutilizable va en helpers (`traer_todo`, `escapar_like`). **[Vigente]**
- **Todo texto del usuario que entre a un filtro `like`/`ilike` pasa por `escapar_like()`.** **[Vigente]**
- Las consultas a Supabase se paginan con `traer_todo()` para no toparse con el límite de 1000 filas. **[Vigente]**
- Los nombres de tablas salen de constantes `T_*` (configurables por `.env`), nunca escritos a mano en la consulta. **[Vigente]**
- Se usa `logging` (`log = logging.getLogger("buscador")`). **Prohibido `print`.** **[Vigente]**
- Comentarios: explican el **porqué**, no el qué. Una referencia a regla de negocio vale oro: `# !inner => solo repuestos del vehículo elegido (RN1)`. **[Vigente]**
- Docstring en funciones solo cuando el nombre no basta para entender qué hacen. **[Vigente]**

### 4.4 Manejo de errores

- En el borde del endpoint se captura `Exception`, se registra con `log.exception(...)` y se responde con el error común `error_bd(exc)`. **[Vigente]**
- La respuesta de error tiene siempre esta forma (código estable para el frontend + mensaje legible):

```json
{
  "codigo": "BD_NO_DISPONIBLE",
  "mensaje": "No se pudo consultar el stock, intenta de nuevo más tarde"
}
```

- `codigo` en `MAYUSCULAS_CON_GUION_BAJO`; no cambia una vez publicado. El frontend decide con `codigo`, no con el texto del mensaje. **[Nueva]**
- Códigos HTTP: `422` validación, `503` base de datos o inventario caído, `404` solo si se pide un recurso por id que no existe. Una búsqueda sin coincidencias **no es error**: responde `200` con lista vacía. **[Vigente]**
- Nunca se devuelve al cliente el texto crudo de la excepción ni detalles internos. **[Vigente]**
- Las excepciones propias heredan de `ErrorInventario`, se llaman `Error<Causa>` y llevan el mensaje para el usuario. Las validaciones viven en funciones `validar_<cosa>` (`validar_busqueda`, `validar_cantidad`). **[Vigente]**

---

## 5. API REST

- Prefijo `/api`. Recursos en plural y en minúscula. Solo `GET` por ahora. **[Vigente]**
- Los filtros viajan por query string; los nombres de los filtros son iguales en frontend y backend (`marca`, `modelo`, `anio`, `repuesto`). **[Vigente]**
- Las listas simples (`/api/marcas`) devuelven un arreglo JSON de valores. Las respuestas con más contexto devuelven un objeto: `{ "total": n, "repuestos": [...] }`. **[Vigente]**
- Los montos viajan como número (`precio`), nunca como texto con símbolo; el formato de moneda lo pone el frontend. **[Vigente]**
- Si cambia el contrato (campos, nombres, códigos), se avisa en el PR y se actualizan el frontend y las pruebas en el mismo PR. **[Nueva]**

---

## 6. JavaScript (frontend)

### 6.1 Formato

- JavaScript moderno (ES2020+), sin frameworks ni librerías externas salvo acuerdo del equipo. **[Vigente]**
- Sangría de **2 espacios**, comillas dobles `"`, **punto y coma obligatorio**. **[Vigente]**
- `const` por defecto, `let` si hay reasignación. **Nunca `var`.** Comparar con `===`. **[Vigente]**
- Template literals para armar texto y HTML. **[Vigente]**
- Se valida con `node --check frontend/js/app.js` (lo hace el CI). **[Vigente]**

### 6.2 Estructura de `app.js`

1. Comentario de cabecera: qué habla con qué.
2. Helpers globales (`$`, `escapar`, `formatoPrecio`).
3. Llamada a la API.
4. Bloques por tarea con separador:

```js
/* ---------- T3: resultado de búsqueda ---------- */
```

5. Ganchos para otras tareas.
6. Flujo principal (eventos) y arranque (`cargarMarcas();`) al final.

### 6.3 Reglas de código

- Acceso al DOM con el helper `$("id")`. **[Vigente]**
- Funciones con lógica: `function` / `async function` con nombre. Flechas (`=>`) para helpers de una línea y callbacks. **[Vigente]**
- **Todo dato que venga del backend o del usuario y se inserte con `innerHTML` pasa por `escapar()`.** Para texto simple, preferir `textContent`. **[Vigente]**
- Toda llamada a la API pasa por la función `api(ruta, params)`; nadie usa `fetch` suelto. **[Vigente]**
- Las llamadas asíncronas usan `async/await` con `try / catch / finally`: el `finally` devuelve la interfaz a su estado normal (botón habilitado, estado limpio). **[Vigente]**
- Los errores técnicos van a `console.error(err)`; al usuario se le muestra un mensaje claro en el contenedor correspondiente (`#mensajes`, `.msg-campo`, `#estado`). **[Vigente]**
- El formato de dinero y fechas usa `Intl` con la configuración regional en una constante (`MONEDA`). No se arma a mano. **[Vigente]**
- Los mensajes de validación y de estado dicen qué hacer: "Selecciona una marca.", "Escribe el nombre del repuesto." **[Vigente]**
- No se agregan variables globales nuevas fuera de las constantes de configuración. **[Nueva]**

---

## 7. HTML

- `<!DOCTYPE html>`, `lang="es"`, `meta charset` y `viewport`. **[Vigente]**
- Sangría de 2 espacios; atributos en comillas dobles. **[Vigente]**
- Etiquetas semánticas: `header`, `main`, `section`, `article`, `form`, `table`. Nada de `div` cuando existe la etiqueta correcta. **[Vigente]**
- Cada campo lleva `<label for="...">` y un `<span class="msg-campo" id="err-...">` para su error. **[Vigente]**
- Los botones de envío son `type="submit"` dentro de un `<form>`; el formulario usa `novalidate` y validamos en JS. **[Vigente]**
- Accesibilidad: zonas que cambian dinámicamente llevan `aria-live="polite"`; los estados llevan `role="status"`. **[Vigente]**
- Los scripts se cargan al final con `defer`. **[Vigente]**
- Los bloques de cada tarea se separan con comentarios:

```html
<!-- ===== T3: Resultado de búsqueda ===== -->
```

---

## 8. CSS

- Sangría de 2 espacios. Una declaración por línea en reglas largas; reglas cortas pueden ir en una línea. **[Vigente]**
- **Los colores, radios y tamaños repetidos viven en variables dentro de `:root`.** Un color nuevo se agrega como variable; no se escribe un `#hex` suelto dentro de una regla. **[Nueva]** (hoy hay algunos `#fff` y `#aab1bc` sueltos; se migran cuando se toque esa regla).
- Clases en `kebab-case` y en español; no se estiliza por ID salvo contenedores únicos (`#resultados`, `#mensajes`). **[Vigente]**
- Secciones con banner y la tarea a la que pertenecen:

```css
/* =========================================
   T3: RESULTADOS
========================================= */
```

- Diseño responsivo con `@media (max-width: 640px)`; la versión móvil va al final del archivo. **[Vigente]**
- Elementos interactivos con altura mínima de **44 px** y estado `:focus-visible` visible. **[Vigente]**
- Se respeta `prefers-reduced-motion`. **[Vigente]**
- Estados de datos con clases semánticas (`stock-ok`, `stock-cero`, `invalido`), no con estilos en línea. **[Vigente]**

---

## 9. Seguridad y secretos

- **Nunca** escribir URLs de proyecto, llaves, contraseñas o tokens en el código. Todo sale de variables de entorno. **[Nueva, obligatoria]**
- `os.getenv("NOMBRE_DE_LA_VARIABLE")` recibe el **nombre** de la variable, no su valor:

```python
# Correcto
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")

# Incorrecto: el valor real quedó escrito como si fuera el nombre
url = os.getenv("https://xxxx.supabase.co")
```

- Los valores reales van en `backend/.env` (ignorado por git). La plantilla `backend/.env.example` lista solo los nombres: `SUPABASE_URL`, `SUPABASE_KEY`, `TABLA_*`. **[Nueva]**
- Si una llave se subió al repo por error, se rota en Supabase (cambiar el archivo no basta: queda en el historial de git).
- El CI usa credenciales ficticias y una BD simulada; las pruebas **nunca** tocan Supabase. **[Vigente]**
- El CI revisa dependencias con `pip-audit` y falla si hay un `.env` versionado. **[Vigente]**

---

## 10. Pruebas

- Herramienta: `pytest` con `pytest-cov`. Carpeta `tests/`. **[Vigente en CI; carpeta por crear]**
- Archivos `test_<modulo>.py`; funciones `test_<situacion>_<resultado_esperado>`:

```python
def test_busqueda_sin_coincidencias_devuelve_lista_vacia(): ...
def test_error_de_bd_responde_503_con_codigo(): ...
```

- La base de datos se simula (mock o doble). Una prueba que necesita internet o credenciales reales está mal escrita. **[Vigente]**
- Todo endpoint nuevo trae al menos una prueba del caso feliz y una del caso de error. **[Nueva]**
- Toda función `validar_*` trae una prueba por cada excepción que puede lanzar. **[Nueva]**
- El frontend se prueba manualmente en la rama `qa` (entorno `qa-manual` en GitHub Actions). **[Vigente]**

---

## 11. Git y flujo de ramas

### 11.1 Flujo

```
feature/…  ──PR──▶  qa  ──(pruebas automáticas + manuales)──PR──▶  main
```

1. Actualizar tu rama local con lo último antes de empezar.
2. Programar la feature en **su propia rama**.
3. Al terminar, abrir PR hacia `qa` y revisar que no afecte otras features.
4. Corregir cualquier desajuste en la misma rama.
5. En `qa` corren las pruebas automáticas y las manuales (aprobación en `qa-manual`).
6. Con todo probado e integrado, PR de `qa` hacia `main`.

**A `main` solo se llega desde `qa`** (el CI lo verifica). Nadie hace push directo a `qa` ni a `main`. **[Vigente]**

### 11.2 Nombres de rama **[Nueva]**

`<tipo>/<hu>-<descripcion-corta>` en minúscula y con guiones.

| Tipo | Uso | Ejemplo |
|---|---|---|
| `feature` | funcionalidad nueva | `feature/hu02-visualizacion` |
| `fix` | corrección de error | `fix/hu01-error-stock-vacio` |
| `docs` | documentación | `docs/convenciones` |
| `ci` | pipeline | `ci/instalar-ruff` |

### 11.3 Mensajes de commit **[Nueva]**

Formato: `tipo(ámbito): descripción en presente, en español, sin punto final`

```
feat(busqueda): agrega validación de campos obligatorios
fix(api): corrige el filtro por año en /api/repuestos
docs: agrega convenciones de código
ci: instala ruff antes del lint
```

Tipos: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`.
Ámbitos frecuentes: `busqueda`, `api`, `frontend`, `backend`, `ci`.
Un commit = un cambio con sentido. Nada de "cambios", "fix", "asdf".

### 11.4 Pull requests **[Nueva]**

- Título igual al commit principal.
- La descripción responde: **qué HU/tarea** implementa, **qué cambia**, **cómo probarlo** y, si toca la interfaz, una captura.
- Al menos **una persona revisa** antes de aprobar.
- El CI debe estar en verde. No se aprueban PRs con checks fallando.

---

## 12. Checklist antes de abrir un PR

- [ ] Mi cambio toca solo lo de mi tarea.
- [ ] Nombres en español, sin tildes ni ñ en identificadores.
- [ ] Sin `print`, sin `console.log` de depuración, sin código comentado.
- [ ] Ningún secreto en el código; `.env` fuera del commit.
- [ ] Todo dato insertado en HTML pasa por `escapar()`.
- [ ] Los mensajes de error siguen el formato `codigo` + `mensaje`.
- [ ] Corrí `ruff check .`, `pytest` y `node --check frontend/js/app.js` en local.
- [ ] Probé la pantalla a mano, también en ancho móvil.
- [ ] Rama y commits siguen la nomenclatura de la sección 11.
- [ ] Referencié la HU/tarea en el PR.
