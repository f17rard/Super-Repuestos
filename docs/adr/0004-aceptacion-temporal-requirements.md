# ADR 04 · Aceptación temporal de la organización actual de los archivos `requirements`

| Campo | Valor |
|---|---|
| **Número** | 04 |
| **Estado** | Aceptada (temporal, con revisión pendiente) |
| **Fecha** | 22 de octubre de 2026 |
| **Tipo** | Deuda técnica aceptada ("lo que se acepta") |
| **Proyecto** | Super-Repuestos |
| **Área afectada** | Gestión de dependencias, instalación local y CI |

---

## 1. Título del ADR

**Aceptación temporal de la organización actual de los archivos `requirements`.**

---

## 2. Contexto (qué nos llevó a dejarlo así)

### 2.1 Situación actual

Hoy el repositorio tiene **dos** archivos de dependencias:

| Archivo | Contenido | Propósito |
|---|---|---|
| `backend/requirements.txt` | Las dependencias reales del backend: `fastapi`, `uvicorn[standard]`, `supabase`, `python-dotenv`. | Declarar lo que necesita el servidor para funcionar. |
| `requirements.txt` (raíz) | Una sola línea efectiva: `-r backend/requirements.txt`, más un comentario que explica que las dependencias viven en `backend/`. | Permitir instalar todo desde la raíz del proyecto con `pip install -r requirements.txt`. |

El archivo de la raíz **no duplica** dependencias: delega en el de `backend/`. Su función es de conveniencia y de punto de entrada.

### 2.2 Por qué existen dos

Al inicio del trabajo se decidió que cada archivo perteneciera a una parte distinta del código y tuviera un propósito propio:

- El de `backend/` queda junto al código que lo usa (`backend/main.py`) y describe únicamente lo que el servidor necesita.
- El de la raíz da un comando único de instalación para quien clona el repositorio y para los flujos que trabajan desde la raíz, como el pipeline de CI (`pip install -r requirements.txt`, `pip-audit -r requirements.txt` y la caché de pip, que apuntan al archivo de la raíz).

La intención era **no cargar recursos innecesarios**: no instalar ni mezclar dependencias de partes del proyecto que no las requieren. El frontend (HTML, CSS y JS) no usa Python, y separar el requirements del backend evita que esa parte arrastre paquetes que no le corresponden.

### 2.3 Por qué no se corrige ahora

- La decisión se tomó **al inicio del trabajo**, cuando la estructura aún era pequeña, y funciona: la instalación local y el CI resuelven las dependencias sin errores atribuibles a esta organización.
- El equipo tiene tareas de mayor prioridad para la entrega (historias de usuario como la búsqueda de repuestos, su visualización, los mensajes de error y el pipeline CI/CD).
- Reorganizar los requirements toca varios puntos a la vez (instalación local, workflow de CI, auditoría de seguridad, caché de pip) y exige validar todo de nuevo. En este momento ese costo supera el beneficio inmediato.

### 2.4 Observaciones sobre el estado actual

Estas observaciones salen de la revisión de los archivos del repositorio y justifican que la deuda se documente en lugar de ignorarse:

1. **Las dependencias de desarrollo no están declaradas.** El workflow de CI ejecuta `ruff`, `pytest` y `pytest --cov`, pero ninguno de los dos `requirements.txt` los incluye. Esto ya se manifestó como un fallo real del job "verificar" en el paso "Lint y sintaxis" (`ruff: command not found`).
2. **El workflow referencia `requirements-dev.txt`** en `cache-dependency-path`, pero ese archivo no forma parte de los archivos revisados. Es un indicio de que la organización de los requirements todavía no está cerrada.
3. **El archivo de la raíz depende del de `backend/`** mediante una ruta relativa. Si alguno se mueve o se renombra, el otro se rompe de forma silenciosa hasta que alguien intente instalar.

---

## 3. Decisión (qué aceptamos cargar)

**Aceptamos mantener, de forma temporal, la organización actual de los archivos `requirements`**: un archivo en `backend/` con las dependencias reales y un archivo en la raíz que lo referencia con `-r`.

Se acuerda además que **la deuda queda registrada y se pagará más adelante** mediante una refactorización con este objetivo:

> Reducir la cantidad de archivos `requirements` para no tener archivos duplicados o muertos dentro del código y lograr un mejor manejo de los recursos.

### 3.1 Qué se acepta explícitamente

- Convivir con dos archivos de dependencias mientras dure el desarrollo de las funcionalidades prioritarias.
- Que las dependencias de desarrollo y pruebas (`ruff`, `pytest`, `pytest-cov`) sigan sin una ubicación definitiva hasta la refactorización.
- Que el riesgo de desorden (archivos sin uso, rutas que se pueden romper al mover algo) quede abierto hasta ese momento.

### 3.2 Qué NO se acepta

- Agregar un **tercer** archivo de dependencias, o copiar dependencias entre archivos, sin antes revisar este ADR. Esta deuda se acepta tal como está; no se amplía.
- Dejar que el tema se olvide: la refactorización debe quedar en el backlog (ver sección 5).

---

## 4. Alternativas consideradas

| Alternativa | Ventaja | Por qué no se elige ahora |
|---|---|---|
| **A. Un solo `requirements.txt` en la raíz** con todas las dependencias | Estructura simple, un único lugar donde mirar. | Obliga a modificar el CI, la auditoría y las instrucciones de instalación, y a validar todo de nuevo. Costo alto para este momento del proyecto. |
| **B. Dejar solo `backend/requirements.txt`** y apuntar CI y documentación a esa ruta | Elimina el archivo redundante de la raíz. | Hay que ajustar varios pasos del workflow y se pierde el comando único `pip install -r requirements.txt` desde la raíz. |
| **C. Dividir en `requirements.txt` (producción) y `requirements-dev.txt` (lint y pruebas)** | Es la práctica más ordenada: separa lo que corre en producción de lo que solo se usa para verificar. | Es la dirección probable de la refactorización, pero requiere decidir qué va en cada archivo y actualizar el CI de una sola vez. |
| **D. Mantener la organización actual (opción elegida)** | Cero riesgo de romper lo que hoy funciona; permite avanzar con las tareas prioritarias. | Acumula deuda técnica que hay que pagar luego. |

---

## 5. Plan para pagar la deuda

La refactorización se hará cuando se cumpla **cualquiera** de estas condiciones:

1. Termina la entrega de las funcionalidades prioritarias del ciclo actual y hay capacidad para trabajo de mantenimiento.
2. Se necesita agregar una dependencia nueva (de producción o de desarrollo) y no está claro en qué archivo debe ir.
3. El CI vuelve a fallar por dependencias no declaradas o por rutas de requirements.
4. Se incorpora un integrante nuevo y la instalación del proyecto genera dudas o errores.

### Pasos previstos

1. Decidir la estructura final (la alternativa C es el punto de partida más probable).
2. Eliminar cualquier archivo duplicado o sin uso.
3. Declarar las dependencias de desarrollo y pruebas en su lugar definitivo.
4. Actualizar el workflow de CI: instalación, auditoría `pip-audit` y `cache-dependency-path`.
5. Actualizar las instrucciones de instalación y el comentario del archivo de la raíz.
6. Validar en una rama propia con pull request a `qa`, siguiendo el flujo del equipo (feature → PR a `qa` → pruebas → PR a `main`).
7. Marcar este ADR como **Reemplazado** y enlazar al ADR que lo sustituya.

---

## 6. Consecuencias (incluyan las negativas)

### 6.1 Negativas

- **Costo de oportunidad.** Refactorizar esta decisión, tomada al principio del trabajo, consumirá tiempo que se podría utilizar para mejorar otros ámbitos del proyecto. Mientras más se posponga, más piezas dependerán de la estructura actual y más costoso será el cambio.
- **Riesgo de archivos duplicados o muertos.** Mientras existan dos archivos, hay posibilidad de que uno quede desactualizado o sin uso sin que nadie lo note.
- **Dependencias de desarrollo sin hogar definitivo.** `ruff` y `pytest` no están declarados, lo que puede provocar fallos en el CI o diferencias entre el entorno local y el de integración.
- **Acoplamiento por ruta relativa.** El archivo de la raíz depende de la ubicación de `backend/requirements.txt`; mover uno rompe el otro.
- **Confusión para integrantes nuevos**, que pueden dudar de cuál archivo modificar al añadir una dependencia.

### 6.2 Positivas

- **No se detiene el avance** de las historias de usuario prioritarias.
- **Cero riesgo inmediato** de romper el flujo actual de instalación y CI.
- **Un punto de entrada claro** para instalar desde la raíz (`pip install -r requirements.txt`), aunque la fuente real esté en `backend/`.
- **Decisión trazable.** Queda documentado por qué existe esta organización, quién debe revisarla y cuándo.

### 6.3 Mitigaciones mientras dure la deuda

- Respetar la regla de la sección 3.2: no crear archivos de dependencias adicionales ni copiar dependencias entre ellos.
- Toda dependencia nueva de producción se agrega **únicamente** en `backend/requirements.txt`.
- Mantener el comentario explicativo en el archivo de la raíz.
- Mantener la refactorización visible en el backlog del equipo.

---

## 7. Estado y seguimiento

| Elemento | Detalle |
|---|---|
| **Estado actual** | Aceptada (temporal) |
| **Deuda asociada** | Refactorización de los archivos `requirements` |
| **Revisión** | Al cumplirse cualquiera de las condiciones de la sección 5 |
| **Reemplazada por** | _Pendiente (ADR futuro)_ |
