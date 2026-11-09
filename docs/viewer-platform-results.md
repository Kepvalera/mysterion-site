# Результаты локальной разработки MYSTERION

Ветка `viewer-auth`, 9 ноября 2026. Commit/push/deploy не выполнялись. Ни production, ни удалённая staging D1 не изменялись. Первичный владелец в настоящей базе не назначен. `main` не изменён.

Полное описание функций, ограничений и безопасного staging-плана: [viewer-platform-local.md](viewer-platform-local.md).

## Локальные проверки

| Проверка | Результат |
| --- | --- |
| Новые API платформы | 79 проверок: роли, профиль, запрет email-повышения роли, заявки, конкурирующие подтверждения, права/сроки/отзыв, отключение аккаунта и сессии, публичные YouTube/VK, mock Bunny, resume-метаданные, обложки, сохранение DE в D1, идемпотентное создание видеозаписи |
| Миграции на заполненной SQLite | 86 проверок сохранности 12 прежних таблиц и связей; `PRAGMA foreign_key_check` пуст; сотрудников автоматически не создано |
| Авторизация viewer-auth | 87 проверок регистрации, подтверждения, входа, восстановления, гонок токенов и одной сессии; прежний Argon2id сохранён |
| Rate limiting | 32 проверки, включая 10 успешных циклов входа, конкурентные резервы, Retry-After и исключение 5xx из неверных паролей |
| Прежний endpoint кабинета | 20 проверок, в том числе изоляция аккаунтов и очистка после отзыва сессии |
| Тайм-аут/ошибки клиентского auth | 20 проверок, RU/EN, 20 секунд и время ожидания лимита |
| Прежний медийный сервер | 234 проверки, старые права и guard без нового флага сохранены |
| TUS-клиент | 5 сценариев: чанки, пауза/возобновление, обновление разрешения, блокировка чужого URL. Без реальной загрузки |
| Прежний интерфейс кабинета | 119 проверок в Chrome, 320/375/390/430/768/1440 px, RU/EN, выход/отзыв сессии |
| Новая платформа в Chrome | 124 проверки: кабинет RU/EN, 8 разделов русской админки, формы, сохранение имени, выход, публичный каталог, сохранение файла при отключённом Bunny и интерфейс загрузчика; горизонтального переполнения и ошибок JS не обнаружено |
| Cloudflare workerd + локальная D1 | Все миграции 0001–0007, реальная регистрация/верификация/вход, редактирование имени, пустая библиотека и закрытая админка без настройки Access |
| Реальная сборка Pages Functions | Успешна, 2 статических WASM-модуля, без runtime compile, сборка 209 849 байт; bundled WASM исполняется в локальном workerd |
| Проверка секретов | Паттерн-проверка отслеживаемых и неигнорируемых новых файлов: секреты не обнаружены. Это не замена внешнему secret scanning |

В тестах используются только изолированные fixtures. Снимки показывают локальный тестовый аккаунт, а не настоящие покупки или материалы служения. Сообщения 401/403/503 в консоли тестового сервера — ожидаемые негативные проверки, не исключения браузера. В Windows несколько запусков процессов завершались системной ошибкой; повторные локальные запуски соответствующих проверок прошли успешно.

Не проверены настоящие Safari/iPhone, доставка писем, реальный Bunny TUS/CORS и воспроизведение из России, облачный CPU Free и удалённый staging deployment. Платный просмотр не включён.

## Скриншоты

Создаются заново командой `tools/check-platform-browser.mjs`:

- [Кабинет, 390 px, RU](../output/platform-check/participant-home-390-ru.png)
- [Кабинет, 1440 px, RU](../output/platform-check/participant-home-1440-ru.png)
- [Профиль, 390 px, RU](../output/platform-check/participant-profile-390-ru.png)
- [Кабинет, 390 px, EN](../output/platform-check/participant-home-390-en.png)
- [Админка, 390 px](../output/platform-check/admin-overview-390.png)
- [Админка, 1440 px](../output/platform-check/admin-overview-1440.png)
- [Форма видео, 390 px](../output/platform-check/admin-video-form-390.png)
- [Форма видео, 1440 px](../output/platform-check/admin-video-form-1440.png)
- [Публичный каталог, 390 px](../output/platform-check/catalog-390.png)

Скриншоты и JSON измерений лежат в игнорируемой папке `output/platform-check`, не являются материалами сайта и не предназначены для публикации.

## Файлы

Кабинет и публичный интерфейс:

- `viewer-account.html`, `viewer-account.css`, `viewer-account.js`, `viewer-dashboard.js`, `viewer-library.js`, `account.js`.
- Новые `catalog.html`, `catalog.js`, `platform-client.js`, `platform-admin.js`, `platform.css`.
- `bunny-upload.js`: callback для сохранения безопасного resume-метаданного на сервере.
- `media-player.js`: воспроизведение подтверждённого VK embed.

Сервер:

- Новый `functions/api/platform/[[path]].js` и `_routes.json`.
- Новые `media-worker/src/platform.mjs`, `platform-admin.mjs`, `platform-admin-template.mjs`, `platform-data.mjs`, `platform-http.mjs`, `video-source.mjs`.
- `media-worker/src/viewer-auth.mjs`: безопасный session helper и чтение нового кабинета только по флагу.
- `media-worker/src/viewer-rate-limit.mjs`: отдельные ограничения новых операций профиля/заявок/прогресса; прежние лимиты auth сохранены.
- `media-worker/src/auth.mjs`, `page-guard.mjs`, `worker.mjs`: новые роли только по отдельному флагу, сохранение прежнего режима, VK-плеер и обложки.
- `media-worker/src/bunny.mjs`: ограничение embed-токена также сроком сессии и права.
- `_headers`: CSP для разрешённых iframe YouTube/VK/Bunny; иных внешних источников не добавлено.

Миграции и локальные инструменты:

- `media-worker/migrations/0006_viewer_profile.sql`, `0007_participant_platform.sql`.
- `wrangler.viewer-platform-local.example.jsonc` — пример с нулевым UUID, не production binding.
- Новые `tools/platform-local-fixture.mjs`, `test-platform.mjs`, `test-platform-migrations.mjs`, `test-platform-runtime.mjs`, `check-platform-browser.mjs`, `test-viewer-account.mjs`.
- Сохранены предшествующие локальные улучшения `tools/check-viewer-browser.mjs`, `test-viewer-client.mjs`, `test-viewer-d1-runtime.mjs`.
- `docs/viewer-dashboard-local.md`, `docs/viewer-platform-local.md`, этот отчёт.

Существующий неотслеживаемый `wrangler.viewer-staging-d1.jsonc` не редактировался, не удалялся и не добавлялся в Git. Фотографии, главная страница, школы и архивы не изменялись.
