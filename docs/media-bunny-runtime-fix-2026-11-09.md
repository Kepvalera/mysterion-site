# Bunny create: исправление несовместимости Cloudflare runtime

Связанный production-ответ: `bunny_network_error`, HTTP 502, phase `bunny_create`, Request ID `dcf6ec5e-c5f5-4b97-be6c-bca7831f93d8`.

## Подтверждённая причина

`bunnyRequest()` передавал `redirect: 'error'` в серверный fetch. Cloudflare Workers / Pages Functions не поддерживают этот режим: при создании Request возникает TypeError до отправки HTTP-запроса. Локальный workerd с compatibility date 2026-11-08 воспроизвёл это исключение. Обработчик ошибочно классифицировал его как сетевой сбой Bunny.

Обычный Node Request принимает этот режим; предыдущие Node-тесты с имитацией fetch не воспроизводили ограничение Workers. Теперь добавлен отдельный регрессионный тест именно в workerd.

## Проверка запроса

- Endpoint создания корректный: `POST https://video.bunnycdn.com/library/803179/videos`, JSON `{title: ...}`.
- Заголовок AccessKey берётся только из серверного `BUNNY_API_KEY`. Общий ключ аккаунта, embed key и браузерные параметры для этой цели код не использует.
- По значению секрета нельзя безопасно определить его назначение. Подлинность ключа в Bunny в этой работе не проверялась; секрет не извлекался и не выводился. Обнаруженный runtime-дефект возникает раньше проверки ключа Bunny.
- Запрос выполняется внутри Pages Function через `functions/api/[[path]].js`, а не в отдельно развёрнутом Worker. Переносить переменные в другой Worker не требуется.
- Историческая запись Cloudflare Logs по указанному Request ID не получена. Вывод основан на коде, предоставленном ответе и воспроизведении в workerd, а не на заявленном чтении этой записи.

## Исправление и безопасность

API и CDN-запросы используют `redirect: 'manual'`. Любой 3xx отклоняется до чтения тела и без запроса к Location: ключ AccessKey и подписанные CDN-данные не отправляются на другой адрес. Использовать `follow` нельзя.

Ошибки различаются: transport → bunny_network_error, timeout → bunny_timeout, ответ Bunny 401 → bunny_auth_failed, 403 → bunny_forbidden, неверный JSON → bunny_response_invalid, 3xx → bunny_redirect_blocked. В Logs дополнительно сохраняется только разрешённое имя класса исключения, без исходного сообщения. Тела ответов, ключи, JWT и cookies не логируются. Панель объясняет блокировку перенаправления на RU/EN.

Проверки Access JWT, AUD, D1-ролей, origin, прав просмотра и флаг платного доступа не менялись. Изменений удалённой базы, библиотеки Bunny и секретов не выполнялось.

## Проверки

- `tools/test-bunny-runtime.mjs`: 61 проверка внутри workerd, 9 перехваченных исходящих вызовов; старый режим вызывает TypeError, исправленный create и CDN работают с локальными ответами. Проверены 401/403, сеть, timeout, некорректный JSON и запрет redirect без повторного POST.
- `tools/test-media.mjs`: 234 серверных теста, включая 301/302/307/308, роли и безопасность. SQLite в памяти, Bunny имитируется.
- 65 браузерных проверок Chrome (375/390/430/1440 px, RU/EN), включая сообщение bunny_redirect_blocked, сохранность выбранного файла и отсутствие TUS/публикации после отказа.
- Сборка Pages Functions и проверка секретов выполняются перед публикацией.

## Что сделать владельцу

После нового успешного deployment перезагрузить `/admin-media.html` с обновлением ресурсов, открыть сохранённый черновик и повторить загрузку один раз. Для исправления режима redirect менять настройки Cloudflare/Bunny, ключи или миграции не требуется.

Если следующий ответ — bunny_auth_failed / Bunny HTTP 401: Bunny → Stream → библиотека MYSTERION MEDIA (803179) → API, сверить именно Library API Key; Cloudflare Pages → Settings → Variables and Secrets → Production → BUNNY_API_KEY (Secret), затем новый deployment. Не отправлять ключ в чат. Не менять ключ лишь по старому bunny_network_error.

Если остаётся другая ошибка, передать только HTTP-статус и JSON error/phase/requestId/upstreamStatus. Успешную реальную загрузку подтвердит повторный тест владельца; локальные проверки не выдаются за создание реального видео в production.

Источники: [ограничения redirect в Cloudflare Request](https://developers.cloudflare.com/workers/runtime-apis/request/), [Bunny Stream Create Video](https://bunny.net/docs/api-reference/stream/manage-videos/create-video).
