# Изолированный Preview из чистого checkout — 2026-11-11

Исходная база: `5454797` в `release/verified-fixes-20261111`. Эта доработка меняет только инструменты сборки, проверки и документацию. Backend, D1 migrations, Access, runtime secrets и производственные настройки не меняются. Push, merge и deployment в ходе подготовки не выполняются.

## Исправление предыдущего предложения

Прежняя длинная Build command могла установить инструменты с нуля, но закрепляла только верхнеуровневую версию Wrangler, не его транзитивные зависимости; скрипт упаковки отдельно требовал готовый `output/viewer-pages-build`. Перенос этой команды в общие Build settings затронул бы будущие production builds.

Теперь зависимости закреплены `tools/release-build/package.json` и `package-lock.json`. `npm ci` устанавливает их из публичного npm с integrity-проверками. Lock содержит optional Linux x64/ARM64 зависимости workerd/esbuild. Использовать Node **24.22.2**. Builder запускает Node напрямую, без shell-зависимых путей, компилирует Worker в новый временный каталог и упаковывает его в постоянный output. Он не запускает тесты, миграции, login или upload автоматически.

Упаковщик выбирает только tracked публичные файлы, исключает README, `.md` и dotfiles и сохраняет лицензии шрифтов. Неигнорируемый случайный untracked JS больше не публикуется. Удалённые 44 файла остаются запрещены манифестом. Старые `output/audit-tools` и готовые Worker/WASM не требуются. Node, Git, npm и доступ к npm registry являются явными prerequisites.

## Чистая сборка на Linux или Pages V3

```bash
git clone --branch release/verified-fixes-20261111 https://github.com/Kepvalera/mysterion-site.git mysterion-preview
cd mysterion-preview
# Проверить, что получен одобренный новый коммит, содержащий эту доработку.
node --version # v24.22.2
npm ci --prefix tools/release-build --no-audit --no-fund
node tools/build-site-release.mjs
node tools/test-pages-preview.mjs
node tools/test-site-release.mjs
```

Команда clone применима после отдельного разрешения на публикацию нового коммита в GitHub. До этого владелец может использовать `git clone --no-hardlinks C:/Projects/mysterion-release-prep <новая-папка>` для чистого локального checkout.

Итог: `output/pages-production`, с `_worker.js/index.js`, двумя WASM, `_routes.json`, `_headers`, 404 и публичными assets. Исходная `functions/` скомпилирована в advanced-mode Worker, а не выкинута. D1 и secrets не вшиваются в bundle; их предоставляет среда Pages. Сам output не переносится в Git.

Повторный запуск в уже существующий каталог намеренно останавливается. Для локальной повторной проверки можно выбрать свежий `--outdir output/новое-имя`; смешивания со старым output и автоматической рекурсивной очистки нет. Это воспроизводимость процесса и зависимостей, не обещание одинаковых байтов на всех ОС.

В данной Windows-среде WSL не установлен и Docker отсутствует. Поэтому фактический Linux/V3-прогон не подтверждён. Здесь выполняются чистый checkout, npm ci и локальный workerd; перед облачной публикацией владельцу нужен Linux-прогон тех же команд. Не устанавливать WSL или менять систему ради этой задачи без отдельного решения.

## Preview без изменения production Build settings

Рекомендуется **загрузить готовый пакет через Wrangler с явной непроизводственной веткой** в существующий Pages-проект. Это не Git push и не переключение типа проекта на Direct Upload. Build command production остаётся пустым, output остаётся `.` на время Preview. Wrangler публикует уже собранный каталог, не запускает облачную Git-сборку.

Существующая production branch должна оставаться `main`. Целевая CLI-ветка: `release/verified-fixes-20261111`. Её стабильный alias:

`https://release-verified-fixes-20261111.mysterion-international.pages.dev`

Произвольный hash URL не становится автоматически доверенным origin. В Preview должен быть ровно этот `MEDIA_PUBLIC_ORIGIN`; добавление production-origin как обхода недопустимо. Если нужного Preview окружения ещё нет, сначала требуется отдельное разрешение владельца на его настройки. Никакая команда ниже не создаёт bindings автоматически.

## Обязательный допуск до Preview deployment

1. `MEDIA_DB` в **Preview**, не Production, привязан к staging `99255496-6173-4efe-8b14-5924f3c1ceeb` и не совпадает с production binding.
2. **Не использовать `wrangler.staging.jsonc`: он исторически содержит production UUID `d4966184-ae55-46cf-bf74-4dff1e7debdd`.** `wrangler.viewer-staging-d1.jsonc` — только локальная справка D1, не deployment config. Не запускать миграции ни одной командой этого плана.
3. Preview variables: MEDIA_ENABLED/VIEWER_AUTH_ENABLED/VIEWER_PLATFORM_ENABLED=true, MEDIA_PAID_ENABLED=false, указанный preview-origin; отдельный VIEWER_RATE_KEY. Staging D1 уже имеет нужную схему; проверка её наличия не разрешает миграции.
4. Отдельные preview Access issuer/AUD; приложение/policy покрывает admin HTML aliases и `/api/platform/admin/*`. Защита всех preview deployment URL проверяется отдельно: публичные preview URLs по умолчанию не защищены одним лишь `noindex`. Администратор получает права только после валидного Access JWT и активной staff-роли в staging D1. Не копировать production пользователей ради теста.
5. Owner вручную проверяет Access coverage стабильного alias и hash URL: без сессии допустим redirect на Access либо отказ backend 401/403/421, но не HTML админки. `/admin-media.js`/`platform-admin.js` могут быть публичными статическими скриптами: они не содержат сессию или права и не должны подменять серверную защиту.
6. Preview R2 не совпадает с production R2. Bunny лучше оставить выключенным; для включения нужна отдельная staging library и отдельные ключи, не production library. Read-only проверка отклоняет включённый Bunny с совпадающим/неподтверждённым library ID.
7. Preview Resend/mailer использует тестовый sender/получателей и отдельные настройки. Не копировать production secrets. Проверка API подтверждает наличие конфигурации, но не проверяет фактическую изоляцию секретов или доставку.

Read-only проверка metadata существующего проекта:

```bash
# CLOUDFLARE_ACCOUNT_ID и CLOUDFLARE_API_TOKEN задать безопасно вне Git.
# Для этой проверки достаточно отдельного токена Pages Read.
node tools/check-pages-preview.mjs --live
```

Используется только GET API проекта. JWT, ключи, env values и полные ответы не печатаются и не сохраняются. Коды ошибок фиксированы. Отсутствие credentials или неверная привязка дают ненулевой exit code. Этот результат НЕ является проверкой Access policies, схемы D1, Resend/Bunny credentials или полной проверкой облачной безопасности. Read credentials в текущей среде отсутствуют; live bindings не прочитаны.

## Команда Preview — только после отдельного разрешения

После Linux build/test, успешного read-only preflight и ручной проверки Access/изоляции:

```bash
node tools/release-build/node_modules/wrangler/bin/wrangler.js pages deploy output/pages-production --project-name mysterion-international --branch release/verified-fixes-20261111 --commit-hash "$(git rev-parse HEAD)" --commit-dirty=false
```

Для upload нужен разрешённый владельцем Pages Edit credential. Не использовать `--branch main`, не выполнять Git push, не добавлять root wrangler.jsonc. Нельзя считать публикацию Preview разрешённой только потому, что сборка прошла.

Проверки владельца после upload:

```bash
PREVIEW=https://release-verified-fixes-20261111.mysterion-international.pages.dev
curl -I "$PREVIEW/admin-media"
curl -I "$PREVIEW/admin-media.html"
curl -I "$PREVIEW/api/platform/admin/me"
curl -I "$PREVIEW/assets/conference-2024/photo-026.webp"
```

Без Access первые три не должны выдавать admin UI/API success. При защите всего Preview отсутствующий image может сначала давать Access redirect; после входа он должен быть 404. Проверить все 44 пути из манифеста, RU/EN/DE fallback, обе галереи, регистрацию/подтверждение/вход/выход в изолированной среде. Запрос paid playback без viewer session не должен выдавать URL; paid feature остаётся выключенным. Hash URL также должен быть закрыт Access или отвергаться строгой origin-проверкой. Не публиковать HAR, cookies, JWT или токены.

## Последующий production, не часть текущего разрешения

После отдельного approval: production NODE_VERSION=24.22.2, V3, cache Disabled, Build command:

```bash
npm ci --prefix tools/release-build --no-audit --no-fund && node tools/build-site-release.mjs
```

Build output directory: `output/pages-production`. Сначала согласовать настройки и исключить посторонние main pushes, затем опубликовать одобренный исходный коммит в GitHub и интегрировать в main через PR: автоматическая Git-сборка опубликует production. Публикация release-ветки в GitHub сама может запустить прежний автоматический Preview с output `.`, поэтому не делать push как способ проверки готового пакета и не смешивать такой автоматический deployment с проверенным CLI Preview. Production bindings/secrets/Access не заменять Preview-настройками. Точная пара production-origin уже поддерживается кодом.

Откат выполняется отдельно на записанный предыдущий успешный production deployment. Он может вернуть старые фотографии; при запрете возврата фото нужен исправляющий deployment с сохранёнными удалениями. Откат схемы D1 не нужен: в этом плане миграций нет.

## Проверки и пределы готовности

Локальные тесты новой доработки: `test-pages-preview.mjs` — отрицательные варианты D1/origin/R2/Bunny; `test-site-release.mjs` — собранный Worker, изолированная локальная D1, admin без Access, отсутствие admin template в ответе, запрет private playback без сессии, регистрация/email verify/login/session/logout, CSRF, 44 удалённых URL и служебные файлы. Все почтовые/провайдерские вызовы локально подменены; никаких удалённых D1 или Bunny операций нет.

**К локальной подготовке Preview можно переходить. К upload пока нельзя давать безусловный допуск:** требуются фактический Linux-прогон, подтверждение Preview bindings/схемы D1, Access policies, тестового mailer и отдельное разрешение на deployment. Production Build settings для этой Preview-проверки менять не требуется.

Первичные источники: [Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/), [Wrangler Pages commands](https://developers.cloudflare.com/workers/wrangler/commands/pages/), [Advanced mode](https://developers.cloudflare.com/pages/functions/advanced-mode/), [Preview deployments](https://developers.cloudflare.com/pages/configuration/preview-deployments/), [Project read API](https://developers.cloudflare.com/api/resources/pages/subresources/projects/methods/get/).
