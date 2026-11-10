# Подготовка чистого релиза — MYSTERION INTERNATIONAL

Дата: 2026-11-11. Статус: локальный кандидат для review, без нового коммита и без публикации.

## Основание и размещение

- Выполнен `git fetch origin main`. Актуальный на момент подготовки `origin/main`: `680b0e6c8e8cb533c78636af302c2ed68efae05d`.
- Создана отдельная ветка `release/verified-fixes-20261111` от этого коммита.
- Отдельный worktree: `C:/Projects/mysterion-release-prep`.
- Исходная ветка `backup/copilot-unfinished-20261111`, её WIP-коммит `1f1e3e7` и незакоммиченные исправления сохранены в `C:/Projects/mysterion-site`.
- Отбор основан на `docs/copilot-completion-review-2026-11-11.md` исходного worktree. WIP-коммит не переносился целиком, cherry-pick/merge не выполнялись.
- Выбранные изменения подготовлены в index отдельного worktree. HEAD остаётся базовым коммитом. Финальный коммит требует подтверждения владельца.

## Точный состав релиза: 12 файлов

Статусы приведены относительно `origin/main`. Это полный разрешённый список; другие файлы не должны попасть в будущий коммит.

| Статус | Файл | Назначение |
| --- | --- | --- |
| M | `media-worker/src/auth.mjs` | Фиксированные причины отказа Access и безопасный staging-only logger; обязательные проверки JWT сохранены |
| M | `media-worker/src/page-guard.mjs` | Вызов logger после отказа и request ID в заголовке ошибки защищённого HTML |
| M | `media-worker/src/platform.mjs` | Вызов logger после отказа и request ID в заголовке ошибки API |
| M | `media-worker/src/worker.mjs` | Вызов logger в существующей обработке ошибок legacy media API |
| A | `tools/test-access-diagnostics.mjs` | Причины отказов, проверка подписи, безопасные поля, ограничения staging, ошибки API/HTML |
| A | `tools/test-access-worker-diagnostics.mjs` | Legacy media API, request ID, отсутствие fallback на cookie после отказа assertion, отсутствие чувствительных данных |
| M | `tools/test-viewer-wasm.mjs` | Нормализация CRLF только для `.mjs` при проверке provenance; бинарные WASM не нормализуются |
| A | `tools/verify-staging-bunny-config.mjs` | Чтение реального Wrangler TOML/JSON/JSONC и локальная проверка staging-плана |
| A | `tools/prepare-staging-bunny-config.mjs` | Копирование уже проверенного файла без подмены переменных и перезаписи результата |
| A | `tools/test-staging-bunny-config.mjs` | Реальные файлы, отрицательные сценарии, неизменность содержимого и запрет перезаписи |
| A | `docs/staging-access-diagnostics.md` | Условия включения, разрешённые поля, причины отказов и безопасное сопоставление request ID |
| A | `docs/release-preparation-2026-11-11.md` | Этот состав релиза, проверки и риски |

Runtime и тесты перенесены выборочно. Единственное дополнительное изменение относительно проверенного исходника: тест запрета диагностики расширен с двух до шести конфигураций (выключенный/отсутствующий флаг, оба production-домена, preview и staging с завершающим `/`). Сам механизм диагностики не расширялся.

## Границы изменения поведения

Подробная диагностика работает только при одновременных `MEDIA_ACCESS_DIAGNOSTICS=true` и точном `MEDIA_PUBLIC_ORIGIN=https://mysterion-viewer-staging.pages.dev`. На обоих production-origin detailed logger выключен даже при установленном флаге. Никакие переменные окружений автоматически не меняются. Лог содержит только requestId, фиксированную reason, source и audHasWhitespace. JWT, cookies, email, sub, пароли, ключи и тексты upstream-исключений не выводятся.

Публичные коды отказа JWT сохранены; подробная причина не возвращается клиенту. RS256, issuer, audience, время действия и sub проверяются до допуска. Отказ явного assertion не приводит к повторной попытке с cookie.

В production изменение видимого контракта ограничено добавлением `X-Mysterion-Request-ID` к ошибкам platform API и защищённого HTML. Общие безопасные логи ошибок сохраняются. Роли, регистрация, Resend, viewer-сессии, права просмотра, оплата и настройки Bunny не изменяются. `/api/media/session` сохраняет существующий контракт подписанного выхода; legacy admin при включённой платформе остаётся закрыт.

Точная пара production-origin и CSRF уже входят в базовый `680b0e6`; `origin.mjs` не меняется. Cookie остаются привязаны к своему хосту: автоматический перенос входа между двумя доменами не добавлен.

## Что исключено

`dist/`, `output/`, временные файлы, `worker-changes.txt`, memory-bank, любые Wrangler-конфигурации, migrations, HTML/CSS/клиентские JS, фотографии и обложки не входят в изменение релиза. Предыдущий большой отчёт остаётся только в исходном worktree; здесь включён самостоятельный краткий отчёт релиза.

В частности, не перенесены ни удаления изображений из WIP, ни их копии из WIP `dist/assets/`. В исходном резервном worktree удалённые изображения не восстановлены. Новый worktree является checkout базового `origin/main`, поэтому существующие в этой базе assets остаются базовыми файлами; разница релиза по `assets/` и `dist/` нулевая. Публикация/пересборка статического сайта не выполнялась. Отдельное решение о составе статических assets нельзя подменять переносом WIP целиком.

## Повторная проверка в релизном worktree

Все 25 перечисленных запусков завершились с exit code 0; повторных попыток для этого прогона не потребовалось. Не использовались production-данные, реальные отправки писем, загрузки Bunny и удалённые D1 migrations. Тест миграций работает исключительно с локальной SQLite.

| Скрипт в `tools/` | Результат |
| --- | --- |
| test-media.mjs | 245 проверок |
| test-viewer-auth.mjs | 90 |
| test-viewer-account.mjs | 20 |
| test-viewer-client.mjs | 20 |
| test-viewer-rate-limit.mjs | 32 |
| test-platform.mjs | 95 |
| test-platform-upload.mjs | 10; создание Bunny только в mock |
| test-platform-video-delete.mjs | 42; реальные удаления отсутствуют |
| test-public-media-platform.mjs | 37 |
| test-bunny-upload.mjs | 5 клиентских сценариев |
| test-member-login-history.mjs | 40 |
| test-access-diagnostics.mjs | 26; оба production-origin не включают подробную диагностику |
| test-access-worker-diagnostics.mjs | 12 |
| test-viewer-wasm.mjs | 13 |
| test-staging-bunny-config.mjs | 20 |
| test-platform-migrations.mjs | 89; локальная SQLite, FK и данные сохранены |
| test-platform-runtime.mjs | workerd + локальная D1: регистрация, подтверждение, вход, профиль, admin fails closed, Rutube |
| test-viewer-runtime.mjs | workerd Argon2id и 4 независимых HTTP-запроса |
| test-viewer-d1-runtime.mjs | workerd + локальная D1: регистрация/подтверждение, одна сессия, история входов |
| test-viewer-rate-runtime.mjs | 12 запросов: 5 допущено / 7 отклонено |
| test-bunny-runtime.mjs | 61, upstream mock |
| test-viewer-pages-build.mjs | Локальная сборка Pages Functions, 2 WASM-модуля, login в bundle |
| check-media-routes.mjs | 10 правил, защита aliases сохранена |
| check-platform-browser.mjs | 149, ошибок нет, 320–1440 px, пользовательский RU/EN, admin RU |
| check-viewer-browser.mjs | 119, ошибок нет |

Дополнительно выполняются `check-media-secrets.mjs`, `git diff --check` и сверка полного списка изменённых/добавленных файлов с таблицей выше. Секрет-сканер проверяет tracked + nonignored untracked text, печатает только расположения совпадений. Ограничения: не проверяет всю историю Git, ignored output, личные файлы конфигурации и журналы провайдеров.

Результаты и точные команды: игнорируемый `output/release-checks/results.json`; журналы тестов: `output/release-checks/*.log`. Инвентаризация и SHA-256 файлов кандидата: `output/release-checks/release-manifest.json`. Эти артефакты не входят в коммит.

Среда: Node `24.22.2`, Wrangler `4.158.0`, зависимости уже установлены в исходном проекте. Для локальных проверок создана игнорируемая junction `output/audit-tools`, указывающая на существующие инструменты исходного проекта; она не является частью релиза. Рабочие результаты создаются в output нового worktree.

Примеры повторного запуска из `C:/Projects/mysterion-release-prep`:

```powershell
& C:/Projects/mysterion-site/output/audit-tools/node-v24.22.2-win-x64/node.exe --import ./tools/register-viewer-wasm.mjs tools/test-access-diagnostics.mjs
& C:/Projects/mysterion-site/output/audit-tools/node-v24.22.2-win-x64/node.exe tools/test-staging-bunny-config.mjs
```

## Готовность, необязательные компоненты и риски

Основной связанный набор для публикации исходников: четыре backend-файла, оба новых Access-теста и инструкция staging. Файлы нужно рассматривать вместе, поскольку обработчики импортируют logger из auth.

Bunny-инструменты с их тестом включены по заданию, но являются отдельными локальными утилитами и не нужны работающему production runtime. Их наличие в Git не включает Bunny, не меняет secrets и не выполняет deployment. WASM-нормализация относится только к переносимости теста на Windows. Отчёт — документация review. Эти компоненты необязательны для запуска backend, но готовы к включению в исходный релиз.

Оставшиеся риски:

1. Подробный logger требует правильного staging `MEDIA_PUBLIC_ORIGIN`; это программная проверка конфигурации, а не доказательство независимого окружения Cloudflare. Не менять production-origin ради включения диагностики.
2. Для Bunny-валидатора используется `experimental_readRawConfig` локального Wrangler 4.158.0. После обновления Wrangler нужно повторить тесты. Утилита строго привязана к проверенным staging D1/library/CDN и отклоняет другие значения; это не универсальный валидатор всех вариантов Cloudflare bindings.
3. Локальный `BUNNY_SECURITY_CONFIRMED=true` не подтверждает действующие Allowed Domains, токенизацию и ключи в Bunny. Подготовитель не проставляет этот флаг автоматически.
4. Внешние Cloudflare Access и доставка Resend не покрываются локальными заглушками. Зелёные тесты не являются live-проверкой production.
5. Chrome с эмуляцией размеров не заменяет Safari и реальные телефоны.
6. Перед последующим коммитом/публикацией повторно проверить, не изменился ли `origin/main`; сейчас кандидат основан на обновлённом `680b0e6`.

До публикации вручную проверить в существующей инфраструктуре, не изменяя её без отдельного разрешения:

- Cloudflare: Access coverage HTML и API на обоих доменах, issuer/AUD, реальный вход owner и запрет для пользователя без роли; detailed diagnostics выключена в production.
- Resend: подтверждение email и восстановление, доставка, правильный домен ссылки, истечение/одноразовость токена.
- Bunny: ограничения доменов и токенизация, upload/resume и разрешённое воспроизведение, отказ без прав/после отзыва. Платный просмотр не включать ради проверки.
- После разрешённой публикации: smoke-проверка обоих доменов, вход/выход/сессии, роли, playback и мобильная навигация.

Git push, merge в main, deployment, изменение Cloudflare/Bunny/Resend/D1 и пользовательских данных не выполнялись. Следующий шаг — подтверждение владельцем точного состава и разрешение на коммит; это само по себе не разрешает публикацию.
