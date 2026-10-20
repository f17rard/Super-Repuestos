# ADR 0001 · Despliegue en Vercel

Estado: Aceptada · 20 de octubre de 2026

## Contexto
El equipo necesita publicar la aplicación web. Se intentó primero con
GitHub Pages, pero el equipo se dio cuenta de que no iba a funcionar
para lo que el proyecto necesita. Había que elegir otro proveedor de
hosting a propósito, no por accidente.

## Decisión
Usamos Vercel para el despliegue porque GitHub Pages no iba a funcionar
para lo que necesita el proyecto.

## Consecuencias
+ Funciona donde GitHub Pages no servía.
+ Cambiar de proveedor de hosting más adelante es relativamente sencillo.
+ No hay que reescribir la lógica de la aplicación si se cambia.
- Dependemos de Vercel mientras sea nuestro proveedor.
- Si migramos, hay que reconfigurar el despliegue en el nuevo proveedor.
