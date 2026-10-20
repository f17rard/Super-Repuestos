# ADR 0002 · Base de datos con Supabase

Estado: Aceptada · 20 de octubre de 2026

## Contexto
El equipo necesita una base de datos y quiere avanzar rápido en el
desarrollo. Supabase trae herramientas integradas (base de datos,
autenticación y consultas) que ahorran tiempo. La decisión se tomó a
propósito para agilizar el desarrollo.

## Decisión
Usamos Supabase para la base de datos porque sus herramientas
integradas nos permiten agilizar el desarrollo.

## Consecuencias
+ Desarrollo más rápido gracias a sus herramientas integradas.
- Dependencia fuerte: base de datos, autenticación y consultas quedan
  atadas a Supabase.
- Migrar a otro servicio después requeriría un esfuerzo técnico alto.
- Hoy un cambio menor en la estructura de la base de datos obliga a
  modificar varios archivos del backend (esquemas de validación,
  funciones de consulta y rutas de la API).
