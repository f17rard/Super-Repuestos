# ADR 0003 · Backend en Python

Estado: Aceptada · 20 de octubre de 2026

## Contexto
El equipo necesita elegir el lenguaje para el backend. Todos se sienten
cómodos con Python y lo conocen bien por su versatilidad. La decisión se
tomó a propósito, por esa comodidad del equipo.

## Decisión
Usamos Python para el backend debido al conocimiento y la comodidad
que todos tenemos con el lenguaje.

## Consecuencias
+ El equipo trabaja con un lenguaje que domina, lo que da velocidad.
+ Python es versátil y se adapta a las necesidades del proyecto.
- Cambiar de lenguaje más adelante implicaría tirar el código del
  servidor y empezar de nuevo.
- Hay que cuidar la unión entre el backend en Python y Supabase para
  que los cambios en los datos no rompan varias partes a la vez.
