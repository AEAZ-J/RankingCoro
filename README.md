# Ranking de coros — GitHub Pages

Ranking de la votación pública de **Juntos Suena Mejor**, separado por nivel:

- Inicial
- Intermedio
- Avanzado
- Coro participante

## Publicación

El workflow `Actualizar ranking` intenta leer la votación pública y publicar el sitio con GitHub Pages aproximadamente cada 5 minutos.

La dirección esperada para este repositorio es:

https://aeaz-j.github.io/RankingCoro/

## Importante

- El scraper no vota ni inicia sesión: solo lee la página pública.
- GitHub Actions puede retrasar ejecuciones programadas cuando hay alta carga.
- La web consulta el archivo publicado cada 15 segundos y muestra una nueva lectura apenas esté disponible.
- Si cambia el diseño del sitio de votación, el scraper puede necesitar ajustes.
