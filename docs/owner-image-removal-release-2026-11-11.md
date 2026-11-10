# Финальный релиз с удалением фотографий — 2026-11-11

MYSTERION INTERNATIONAL. Worktree: `C:/Projects/mysterion-release-prep`. Ветка: `release/verified-fixes-20261111`. Основа: уже существующий коммит `dba3cc4` с проверенными исправлениями Access и Bunny-инструментов. Новый коммит, push, merge и deployment не выполнялись.

## Разрешённые удаления

Из `1f1e3e7` взяты исключительно 40 удалений изображений: 5 фотографий и 35 видеообложек. Список получен через `git diff-tree --diff-filter=D --no-renames`, без переноса WIP или `dist/`.

Все пять фотографий имели побайтно одинаковые копии. После отдельного явного разрешения владельца в этом чате удалены следующие дополнительные четыре файла:

| Исходное удаление | Дополнительно разрешённая идентичная копия |
| --- | --- |
| `assets/conference-2024/photo-027.webp` | `assets/conference-2024/photo-026.webp` |
| `assets/conference-2024/photo-029.webp` | `assets/conference-2024/photo-028.webp` |
| `assets/conference-2024/photo-032.webp`, `photo-033.webp` | `assets/conference-2024/photo-031.webp` |
| `assets/conference-2025/photo-029.webp` | `assets/conference-2025/photo-028.webp` |

Итого **44 файла: 9 фотографий и 35 обложек**. Полный поимённый список: [conference-image-removals-2026-11-11.json](conference-image-removals-2026-11-11.json). `files` содержит исходные 40 paths; `additionalApprovedFiles` — отдельно разрешённые четыре копии. Основание дополнительного разрешения записано в манифесте.

Сравнение Git blob ID исходного дерева подтверждает идентичность копий. Среди оставшихся tracked assets нет побайтно одинаковых копий удалённых изображений. Других удалений или изменений оставшихся изображений нет. Изображения не восстанавливались, не заменялись и не генерировались.

## Страницы, галереи и языки

В `conference-2024-data.js` осталось **23 фотографии**, в `conference-2025-data.js` — **35**, в прежнем порядке. Удалены записи с удалёнными src/poster. Старые video-записи не использовались действующими photo-only страницами; источники медиатеки не затронуты.

В `conference-2024.html` и `conference-2025.html` добавлен `?v=20261111-owner-removals` к URL данных. Новый HTML не использует старый URL списка из браузерного кеша. Сетка, CSS, диалог увеличения и существующие фотографии сохранены.

Добавлен `404.html` в существующем оформлении с общей навигацией и абсолютными ссылками: отсутствующий файл возвращает 404 вместо SPA-подстановки главной страницы. Защищённые страницы и авторизация не менялись.

В HTML/JS/CSS нового публичного пакета ссылок на удалённые 44 пути нет. Упоминания остаются только в непубликуемых тесте, манифесте и отчётах.

Проверены RU, EN и запрос DE, включая сохранённый `mysterion-language=de`. По действующим правилам проекта немецкий интерфейс не показывается: DE безопасно переключается на RU. Новые переводы/пункт DE не добавлялись. Legacy DE в D1 не читался и не изменялся. Это проверка трёх входных значений языка, а не заявление о немецком интерфейсе.

## Локальный production-пакет

Новый `tools/package-site-release.mjs` создаёт каждый пакет в свежем `output/site-release/package-*`. Копируются только публичные файлы из Git-инвентаря и новые неигнорируемые публичные файлы. Отсутствующие разрешённые удаления пропускаются; восстановленный файл из манифеста или неожиданно отсутствующий другой публичный файл вызывает ошибку.

`dist/`, `output/`, private configs, backend sources, docs, tests и audit-tools не копируются. `_worker.js/` содержит уже проверенные локально собранные Pages Functions и два WASM: защита не заменяется статическим HTML.

```powershell
$releaseNode = 'C:/Projects/mysterion-site/output/audit-tools/node-v24.22.2-win-x64/node.exe'
& $releaseNode tools/test-viewer-pages-build.mjs
& $releaseNode tools/package-site-release.mjs
& $releaseNode tools/test-conference-image-removals.mjs
```

Путь актуального пакета: `output/site-release/latest-package.txt`. Финальный пакет содержит 161 публичный файл плюс Functions/WASM; 44 удалённых пути отсутствуют. Предыдущие локальные пакеты не используются и не перезаписываются. Нельзя публиковать весь корень worktree или весь output: там сохранены старые артефакты. Пакет не загружался в Cloudflare.

## Кеш и текущая выдача

Выполнены 88 HEAD-запросов (44 пути × 2 домена). До публикации все отвечают 200 image/webp: действующий deployment ещё содержит файлы. Это не доказательство устаревшего кеша после релиза — новый релиз не опубликован.

Наблюдаемые Cache-Control: основной домен — `public, max-age=14400, must-revalidate` (4 часа), pages.dev — `public, max-age=0, must-revalidate`. Наблюдались MISS/REVALIDATED. Результаты: `output/conference-removal-check/live-before-deploy.json`. Запросы без cookies и credentials.

Cloudflare Pages использует ETag; дополнительные Cache Rules могут давать устаревшие ответы. Корневой 404 отключает SPA fallback. См. [Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/).

Новый пакет предотвращает повторное включение файлов; уже закешированные браузером ответы могут жить до max-age. После разрешённой публикации нужно проверить каждый удалённый URL на обоих доменах обычным и принудительно перепроверенным запросом. Только при подтверждённой остаточной выдаче обсуждать адресную очистку кеша. Кеш не очищался; настройки сборки/Cache Rules в Dashboard не менялись и чтением панели не подтверждены.

Старые hash-based deployment URL могут оставаться доступными независимо от production alias. Их удаление/ограничение — отдельное действие, не выполнявшееся здесь. См. [Preview deployments](https://developers.cloudflare.com/pages/configuration/preview-deployments/#preview-aliases). Обновление production не удаляет историю Git и сохранённые пользователями копии.

## Проверки

- `test-conference-image-removals.mjs`: полный список, оставшиеся файлы, отсутствие удалённых файлов/ссылок в пакете; **266 HTTP-проверок**, включая два отказа admin. Оба production-hostname, обычный URL, query и старый `/dist/`-префикс. Удалённые paths возвращают 404, не image response.
- Chrome: **18 сочетаний** год/ширина/язык; 320, 390, 1440 px; декодирование всех оставшихся изображений, увеличение, отсутствие overflow. Также главная, photos.html, сохранённый DE и настоящий 404. Итог: JavaScript-ошибок и неожиданных 404 нет.
- `test-viewer-pages-build.mjs`: успешная локальная сборка, два WASM и login в собранном Worker.
- `test-media.mjs` — 245; `test-viewer-auth.mjs` — 90; `test-platform.mjs` — 95; `test-access-diagnostics.mjs` — 26; `test-access-worker-diagnostics.mjs` — 12: прошли.
- `git diff dba3cc4 -- media-worker functions _routes.json _headers`: пусто. Код авторизации, схемы и runtime-маршрутизация не изменены.
- Git-удаления: ровно 40 WIP paths + 4 отдельно разрешённых; других удалений нет.
- Финальная проверка: секрет-сканер — 209 текстовых файлов, совпадений нет; `git diff --check` — без ошибок. Сканер не охватывает ignored output и всю историю Git.
- Старый общий `check-ui-languages.mjs` остановился на `catalog.html: missing account navigation`. Каталог не изменён относительно dba3cc4: он имеет отдельную platform-навигацию, а тест ожидает общую шапку. Существующее несоответствие не исправлялось в задаче удаления фотографий. Языки конференций проверены отдельным браузерным тестом.
- На Windows встречались сбои дочернего Git и один сбой запуска Chrome. Финальные результаты берутся из последнего успешного `output/conference-removal-check/results.json` на **44** файла, а не промежуточного прогона на 40.

Safari/реальные телефоны и live авторизация/доставка/видео не проверялись заново. Cloudflare Access, D1, Bunny, Resend, secrets и пользовательские данные не изменялись.

## Полный состав после dba3cc4

- D: 44 paths из двух массивов `docs/conference-image-removals-2026-11-11.json`.
- M: `conference-2024-data.js`, `conference-2025-data.js`, `conference-2024.html`, `conference-2025.html`.
- M: `docs/release-preparation-2026-11-11.md` — историческая пометка и ссылка на этот отчёт.
- A: `404.html`, `docs/conference-image-removals-2026-11-11.json`, `docs/owner-image-removal-release-2026-11-11.md`, `tools/package-site-release.mjs`, `tools/test-conference-image-removals.mjs`.

Итого **54 новых изменения**: 44 удаления, 5 изменённых и 5 новых файлов. В окончательный релиз относительно `680b0e6` также входят исправления `dba3cc4`: всего **65 уникальных файлов**. Машинный полный список: `output/conference-removal-check/final-release-files.json` (локальный, не входит в коммит).

Разрешение на удаление копий не разрешает коммит, push, deployment, очистку кеша или удаление старых deployments. Новый коммит ожидает подтверждения владельца.
