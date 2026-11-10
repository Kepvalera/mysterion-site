# Исправление запуска Pages Worker — 2026-11-11

База: `02f96a2`. Локальная ветка: `fix/pages-worker-startup`. Действующие bindings, D1, Bunny, Resend, Access, домены и настройки Cloudflare не менялись. Upload, push, merge, создание Cloudflare-проектов и deployment не выполнялись.

## Установленная причина в сборке

`tools/build-site-release.mjs` компилировал Pages Functions с `--compatibility-date 2026-11-08`, не задавая Node compatibility явно. В установленном Wrangler 4.158.0 (`workers-utils/src/compatibility-date.ts`, включённом в CLI) `NODEJS_COMPAT_DEFAULT_ON_DATE` равна `2026-08-04`. Поэтому сборка автоматически включала Node compatibility v2 и inject polyfills из unenv, хотя runtime-код сайта использует Web APIs и не импортирует Node builtins.

В bundle до исправления действительно присутствуют:

- `unenv/.../perf_hooks`, process/console/stream polyfills;
- внешние `node:stream`, `node:events`;
- `class ... { static { __name(this, ...) } }`, включая PerformanceEntry/PerformanceObserver и другие классы.

При публикации advanced-mode `_worker.js/` Pages повторно собирает Worker. В Wrangler эта ветка создаёт файл `bundledWorker-*.mjs`, как в предоставленном стеке. Поэтому проверка только исходного runtime-кода или первого bundle недостаточна.

Старый артефакт был проверен в workerd с compatibility date `2024-01-01`, без Node compatibility: startup не проходит (`No such module node:stream`). Прежний `test-site-release.mjs` использовал ту же новую дату, что и compiler, при которой Node уже включён автоматически; это маскировало зависимость от Node polyfills.

Точный production `bundledWorker-0.35870100682493056.mjs` недоступен локально; фактическая дата/flags Production из Dashboard не читались. Поэтому точный `Object.defineProperty` на строке 242 локально не воспроизведён и не объявляется доказанным багом V8. Доказано наличие лишних Node-shims и несовместимость со средой без Node; предоставленный стек относится к class-initializer helper. Исправление устраняет оба нежелательных условия, а не подавляет исключение в `__name`.

## Исправление

1. Компилятор получает `--compatibility-flags no_nodejs_compat no_nodejs_compat_v2`. Нужны оба opt-out флага для используемой версии Wrangler. Это **параметры локальной компиляции**, не изменение Production flags в Dashboard.
2. Полученный JS нормализуется официальным esbuild transform с target `es2020`, format `esm`, keepNames=true. Статические блоки классов понижаются до обычных присваиваний после определения класса, без `__name(this, ...)` внутри static initializer. WASM остаются статическими импортами.
3. Builder отклоняет bundle с `node:`, unenv или непониженными static blocks. Он не делает regex-подмену helper, не игнорирует исключения и не меняет права доступа.
4. esbuild 0.28.2 явно закреплён как прямая build dependency, lockfile обновлён. Wrangler остаётся 4.158.0.

## Изменённые файлы

- `tools/build-site-release.mjs`: явная Web-runtime сборка, ES2020 lowering, запрет нежелательных зависимостей.
- `tools/release-build/package.json`, `package-lock.json`: прямая pinned esbuild dependency.
- `tools/test-site-release.mjs`: regression assertions против Node shims и static blocks.
- `tools/test-worker-startup.mjs`: новый startup/rebundle тест.
- `docs/pages-worker-startup-fix-2026-11-11.md`: этот отчёт.

Runtime/backend исходники, `_routes.json`, `_headers`, 44 удаления изображений и конфигурационные файлы bindings не меняются.

## Проверки

```powershell
npm ci --prefix tools/release-build --no-audit --no-fund
node tools/build-site-release.mjs --outdir output/pages-worker-startup-fixed
node tools/test-worker-startup.mjs output/pages-worker-startup-fixed
node tools/test-site-release.mjs output/pages-worker-startup-fixed
```

Для повторного build использовать новый outdir или свежий checkout: существующие артефакты намеренно не перезаписываются.

- Новый Worker не содержит node:* imports, unenv и static class blocks.
- `test-worker-startup.mjs`: 6 успешных запусков — прямой артефакт и повторный esbuild bundle, даты 2024-01-01 / 2026-08-03 / 2026-11-08, везде оба Node opt-out flags. Ненастроенная авторизация возвращает ожидаемый 503 вместо аварии при загрузке модуля.
- Дополнительно выполнена локальная повторная компиляция advanced-mode каталога командой Wrangler `pages functions build --build-output-directory ... --compatibility-date 2024-01-01`, без upload. Она завершилась успешно. Runtime-тест повторного bundle отдельно использует esbuild, а не выдаётся за точный облачный publisher.
- `test-site-release.mjs`: 95 проверок; регистрация, подтверждение email, login/session/logout, CSRF, admin отказ без Access и private playback отказ без сессии, 44 удалённых URL. 155 файлов, из них 152 публичных и Worker + 2 WASM.
- `test-viewer-auth.mjs`: 90; `test-platform.mjs`: 95; `test-access-diagnostics.mjs`: 26; `test-viewer-wasm.mjs`: 13; `test-bunny-runtime.mjs`: 61.

Все D1 в тестах локальные, почта подменена, реальных Bunny/Resend вызовов нет. На Windows встречались промежуточные ошибки запуска дочерних процессов; итоговые прогоны выполнены отдельно. Production publication остаётся отдельной проверкой после разрешения владельца.

## Как доставить исправление

Убедиться, что Pages Build command вызывает **исправленный builder**, а не старую длинную команду с прямым `pages functions build` и `package-site-release.mjs`, которая обойдёт новый шаг:

```text
npm ci --prefix tools/release-build --no-audit --no-fund && node tools/build-site-release.mjs
```

Build output directory остаётся `output/pages-production`. Добавлять Node compatibility в Production ради этого bundle не требуется. В этом задании Build settings не менялись.

Изменения подготовлены локально и требуют коммита перед push. Команды для владельца после review:

```powershell
git switch fix/pages-worker-startup
git add -- tools/build-site-release.mjs tools/release-build/package.json tools/release-build/package-lock.json tools/test-site-release.mjs tools/test-worker-startup.mjs docs/pages-worker-startup-fix-2026-11-11.md
git diff --cached --check
git commit -m "Fix Pages Worker startup without Node compatibility"
git push -u origin fix/pages-worker-startup
```

После push ветки может автоматически создаться Preview, если это включено в Pages. Production main не обновлять напрямую: PR и merge — после отдельного разрешения и проверки. В текущей сессии push и публикация не выполнены.
