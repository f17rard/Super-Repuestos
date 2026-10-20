-- Migración: integridad de repuestos.categoria
-- Ejecutar en el SQL Editor de Supabase antes de usar el filtro de categorías del frontend.
-- Si el ALTER falla, localiza los datos sucios con el SELECT DISTINCT de abajo.

ALTER TABLE repuestos
ADD CONSTRAINT repuestos_categoria_chk
CHECK (categoria IS NULL OR categoria IN (
  'motor', 'electrico', 'frenos', 'transmision',
  'suspension', 'aire_acondicionado', 'accesorios'
));

-- Diagnóstico (ejecutar solo si el ALTER anterior falló):
-- SELECT DISTINCT categoria FROM repuestos
-- WHERE categoria IS NOT NULL
--   AND categoria NOT IN (
--     'motor', 'electrico', 'frenos', 'transmision',
--     'suspension', 'aire_acondicionado', 'accesorios'
--   );
