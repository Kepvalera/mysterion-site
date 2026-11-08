# Миграции только для mysterion-media-staging

Подтверждённая владельцем база:

- Название: `mysterion-media-staging`
- Database ID: `d4966184-ae55-46cf-bf74-4dff1e7debdd` — идентификатор, не секрет
- Конфигурация: `wrangler.staging.jsonc`
- Каталог SQL: `media-worker/migrations`
- История: `d1_migrations`

Это отдельная конфигурация CLI для миграций. Она не называется wrangler.jsonc, не содержит pages_build_output_dir/main и автоматически не используется публикацией Pages. Production-конфигурация, bindings сайта, Access и платный просмотр не переключаются. Все feature flags здесь false.

## Проверенные файлы

`0001_media.sql` создаёт исходные таблицы. `0002_bunny_stream.sql` перестраивает videos, добавляя Bunny Stream и служебную аренду. Исходные SQL-файлы не изменялись. D1 поддерживает используемые PRAGMA; defer_foreign_keys временно откладывает проверку внутри транзакции, не отключая внешние ключи навсегда.

После обеих миграций таблицы приложения:

| Таблица | Назначение |
| --- | --- |
| users | Личности Access, роли и активность |
| videos | Каталог RU/EN/DE и источники YouTube/R2/Bunny |
| purchases | Будущие подтверждённые покупки |
| entitlements | Права просмотра |
| audit_log | Журнал административных операций |
| bunny_leases | Краткие блокировки операций Bunny |

Wrangler дополнительно ведёт `d1_migrations`. Существующая `_cf_KV` — служебная, её не удалять. SQLite может создавать свои внутренние таблицы. `videos_bunny` существует только на время перестройки и в итоговой структуре отсутствует. Ни пользователи, ни видео, ни покупки/права не добавляются.

## Локальная проверка

Выполнена через Wrangler 4.158.0 и настоящий локальный эмулятор D1 с явным --local, а не только через обычную SQLite. Отдельный тест `tools/test-media-staging.mjs` создаёт новую локальную базу в output, применяет обе миграции, проверяет таблицы/поля Bunny, отсутствие записей, foreign_key_check, quick_check и повторный запуск. Состояние/отчёт не отправляются в Git.

Для ручного повторения из корня проекта:

```powershell
npx wrangler@4.158.0 d1 migrations apply mysterion-media-staging --local --config wrangler.staging.jsonc --persist-to output/d1-staging-check
npx wrangler@4.158.0 d1 execute mysterion-media-staging --local --config wrangler.staging.jsonc --persist-to output/d1-staging-check --file tools/check-media-staging.sql
```

## Как владельцу применить к удалённой staging

Эти удалённые команды подготовлены для владельца; агент их **не выполнял**.

1. Откройте терминал с Node.js/npm в `C:\Projects\mysterion-site`. Использованная для проверки версия Node — 24. Выполните OAuth-вход, не отправляя ключи в чат:

```powershell
npx wrangler@4.158.0 login
```

2. Убедитесь, что выбран Cloudflare-аккаунт с указанной базой. Посмотрите ожидающие миграции:

```powershell
npx wrangler@4.158.0 d1 migrations list mysterion-media-staging --remote --config wrangler.staging.jsonc
```

3. Точная команда применения **только к staging**:

```powershell
npx wrangler@4.158.0 d1 migrations apply mysterion-media-staging --remote --config wrangler.staging.jsonc
```

Перед подтверждением проверьте название mysterion-media-staging, ID d4966184-ae55-46cf-bf74-4dff1e7debdd и файлы 0001_media.sql / 0002_bunny_stream.sql. Если Wrangler показывает другую базу или неожиданные миграции — остановитесь. Не меняйте имя на MEDIA_DB/production и не убирайте --config. Предоставленная база была пустой; если её состояние изменилось, сначала проверьте структуру/историю и сохраните нужные данные.

4. После применения выполните только проверочные SELECT/PRAGMA:

```powershell
npx wrangler@4.158.0 d1 execute mysterion-media-staging --remote --config wrangler.staging.jsonc --file tools/check-media-staging.sql
```

Ожидается: шесть таблиц приложения, две записи истории миграций, foreign_key_check без строк, quick_check=ok и нулевое число строк приложения. Используется поддерживаемый D1 quick_check; обычный SQLite integrity_check сюда не включён.

Для просмотра таблиц в SQL Console:

```sql
SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
PRAGMA foreign_key_check;
PRAGMA quick_check;
```

Повторный migrations apply учитывает d1_migrations и не повторяет выполненные файлы. Не вставляйте SQL-файлы вручную повторно и не удаляйте историю. Применение схемы не создаёт администратора, не даёт прав на видео и не подключает базу к production. Не включайте платные flags.

Официальные источники: [D1 migrations и выбор базы по имени](https://developers.cloudflare.com/d1/reference/migrations/), [внешние ключи](https://developers.cloudflare.com/d1/sql-api/foreign-keys/), [поддерживаемые SQL/PRAGMA](https://developers.cloudflare.com/d1/sql-api/sql-statements/).
# Обновление миграций

После этапа 1c821ca добавлена **0003_media_members.sql**. Перед новым удалённым применением проверьте, что 0001/0002 уже отражены в `d1_migrations`. Актуальная инструкция — [кабинеты и коллекции](mysterion-media-members-setup.md). Проверочный SQL теперь рассчитан на все три миграции; до применения 0003 новые таблицы отсутствуют. Автоматического удалённого применения нет.
