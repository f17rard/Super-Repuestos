# ADR-007: No añadir selección de países

**Clasificación:** Alcance.

## Contexto

El catálogo está pensado para un solo mercado, por lo que no hace falta variar el contenido, la moneda ni la disponibilidad según el país. Por cuestiones de tiempo se decidió dejar esta función fuera del alcance.

## Decisión

No incluir un selector de países; se mantiene un catálogo único.

## Consecuencias

- **Positivas:** la aplicación es más simple de desarrollar y probar.
- **Negativas:** queda limitada para expandirse a otros países. Hacerlo después implicaría modelar país, moneda y stock por región.
