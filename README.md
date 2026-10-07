# Ranking de coros — GitHub Pages

Ranking de la votación pública de **Juntos Suena Mejor**, con vista general y por nivel.

## Cómo funciona

- La fuente es la API pública de la primera ronda:
  `https://app.juntossuenamejor.cl/api/voting/choirs?round_code=first`
- GitHub Actions consulta la API y publica el sitio en GitHub Pages.
- El workflow ejecuta una única actualización programada cada 5 minutos, sin relevos encadenados, y serializa las publicaciones para evitar solapamientos. GitHub puede retrasar las ejecuciones programadas.
- La página consulta `data.json` y `history.json` cada minuto para detectar una publicación nueva.
- `history.json` conserva hasta 30 días de mediciones y permite calcular votos sumados en 1h, 6h, 12h y 24h.
- Si la API falla, se intenta conservar el último dato válido ya publicado.

## Sitio

https://aeaz-j.github.io/RankingCoro/

## Archivos públicos

GitHub Pages publica únicamente:

- `index.html`
- `styles.css`
- `app.js`
- `data.json`
- `history.json`

El sitio no vota, no inicia sesión y no requiere servicios de pago.
