## Qué cambia

<!-- Descripción breve de qué hace este PR y por qué -->

## Cómo probar

<!-- Pasos para verificar el cambio -->

1.
2.
3.

## Screenshots (si aplica)

<!-- Capturas de pantalla del antes/después -->

## Checklist

- [ ] `pnpm typecheck` pasa sin errores
- [ ] `pnpm lint` pasa sin warnings
- [ ] `pnpm format:check` pasa
- [ ] `pnpm build` compila correctamente
- [ ] Probado manualmente en dark mode
- [ ] No se hardcodean credenciales ni secrets
- [ ] Si toca DB: migración incluida en `supabase/migrations/`
- [ ] Si agrega ruta: agregada en `lib/navigation.tsx` y breadcrumb
- [ ] Si agrega proceso batch: instrumentado con `process_runs`
