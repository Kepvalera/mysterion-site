# MYSTERION MEDIA: диагностика входа администратора

## Подтверждённая причина текущего отказа

После обновления страницы владелец подтвердил **HTTP 403** на основном `mysterion-international.pages.dev`, не на preview.

В текущем коде недействительный/отсутствующий JWT возвращает 401. Проверка администратора идёт строго после проверки подписи JWT, issuer, audience, exp/iat/nbf и sub:

```sql
SELECT id,role FROM users WHERE access_sub=? AND active=1;
```

Параметр — sub из проверенного JWT, не email-заголовок. Отсутствующая запись, выключенный пользователь или роль вне admin/editor дают 403 forbidden. В фактически привязанной staging-базе таблица users **пуста**, поэтому текущая точная причина — отсутствие разрешённой учётной записи. Проверку JWT ослаблять не требуется.

Исторический 503 нельзя достоверно связать с конкретным исключением: прежний catch скрывал причину. На момент этого аудита настройки и D1 работают; ошибку 503 после актуального повторного входа владелец больше не воспроизводит.

## Проверено только чтением

- Настройки проекта Pages и снимок реально опубликованного Production deployment: MEDIA_ENABLED=true, правильный MEDIA_PUBLIC_ORIGIN, синтаксически корректный issuer, задан Admin AUD.
- Binding MEDIA_DB присутствует, не конфликтует с одноимённой текстовой переменной, указывает именно на D1 `mysterion-media-staging`, UUID `d4966184-ae55-46cf-bf74-4dff1e7debdd`.
- В этой базе присутствуют все таблицы трёх миграций; users имеет id, access_sub, role, active. SELECT количества пользователей по ролям вернул пустой результат.
- Реальные опубликованные Pages Functions: GET `/api/media/videos` и `/api/media/collections` возвращают 200 с пустыми списками. Это подтверждает доступность binding и таблиц во время исполнения, а не только наличие настроек в Dashboard.
- GET `/api/media/admin/me` без JWT возвращает 401 authentication_required. Одного email-заголовка для входа недостаточно; это также закреплено локальным тестом.
- MEDIA_PAID_ENABLED остаётся false. Переменные Viewer Access ещё не настроены; для административной страницы они не требуются.
- Preview отдельно не настроен. Проверка на нём не эквивалентна проверке основного адреса.

Данные пользователей, покупки, права, bindings, Access policies и секреты не изменялись. Ключи и JWT не выводились. Политики Access целиком через доступную сессию не прочитаны; факт прохождения конкретного входа подтверждён ответом владельца и маршрутом 403 в коде.

## Безопасное исправление кода

Прежний экран объединял разные ошибки в одно сообщение. Теперь:

- Сохраняются HTTP-статусы 401/403/421/503 и закрытая по умолчанию модель доступа.
- На странице и в заголовке `X-Mysterion-Media-Error` показан только фиксированный код причины.
- При 503 журнал получает событие `mysterion_media_unavailable` с code и phase. В запись не попадают заголовки, JWT, email, URL, значения окружения, SQL, исключение или stack trace.
- Ошибка запроса роли D1 преобразуется в 503 identity_store_unavailable; отсутствие разрешённого пользователя остаётся 403 forbidden.
- Сообщения об отказах переведены на RU/EN/DE. Они не требуют покупки собственного домена.

| Код | Значение |
| --- | --- |
| origin_not_configured | Не задан корректный MEDIA_PUBLIC_ORIGIN |
| wrong_origin | Запрос пришёл на другой origin, HTTP 421 |
| media_disabled | MEDIA_ENABLED не равен строке true |
| database_not_bound | MEDIA_DB отсутствует в окружении |
| access_issuer_not_configured | Некорректный формат issuer |
| access_audience_not_configured | Не задан Admin AUD |
| authentication_required | Нет JWT, HTTP 401 |
| invalid_identity | JWT не прошёл проверку, HTTP 401 |
| forbidden | JWT проверен, но разрешённой активной роли нет, HTTP 403 |
| identity_store_unavailable | Ошибка выполнения запроса роли в D1, HTTP 503 |
| internal_unavailable | Непредвиденная ошибка, подробности не раскрываются |

Если 503 приходит без этого заголовка и без кода на странице, дополнительно проверьте слой Cloudflare/Access и актуальность deployment: это может быть ответ до выполнения данного обработчика.

## Как владельцу добавить первого администратора

**Ниже только инструкция. INSERT этой задачей не выполнялся. Создание административной записи требует подтверждённой личности и отдельного разрешения владельца.**

1. Пройдите вход Access на основном адресе. В доверенной Identity/Logs Zero Trust определите UUID пользователя; он должен соответствовать JWT sub того же аккаунта/организации Access. Можно открыть в своём авторизованном браузере `https://mysterion-international.pages.dev/cdn-cgi/access/get-identity` и проверить поле user_uuid. Не подставляйте email, id внешнего IdP, Application AUD или сам JWT. JWT и cookies никуда не отправляйте.
2. В Cloudflare D1 откройте именно mysterion-media-staging, проверьте UUID базы выше. Сначала выполните только чтение:

```sql
SELECT role,active,COUNT(*) AS user_count FROM users GROUP BY role,active;
```

3. После отдельного решения владельца замените оба заполнителя ниже реальными UUID. Для id подходит новая случайная UUID; access_sub должен быть подтверждённым sub именно этого Access-пользователя. Не выполняйте пример с незаменёнными заполнителями.

```sql
INSERT INTO users (id, access_sub, role, active)
VALUES ('<NEW_UUID>', '<VERIFIED_ACCESS_SUB>', 'admin', 1);
```

4. Проверьте выбранную запись без вывода JWT:

```sql
SELECT role, active FROM users WHERE access_sub='<VERIFIED_ACCESS_SUB>';
```

Ожидается admin и 1. Затем заново откройте `/admin-media.html`. API `/api/media/admin/me` в авторизованном браузере должен возвращать 200 и роль admin. Запрос без JWT должен по-прежнему отклоняться.

Если уже существует запись с таким access_sub, INSERT завершится ошибкой уникальности: не заменяйте её автоматически и не повышайте произвольному пользователю роль. Сначала проверьте существующую запись и согласуйте изменение.

## Проверки изменения

- `tools/test-media.mjs`: **178** изолированных проверок. В том числе подпись/срок/AUD JWT, недоверенный email, отсутствующий и выключенный пользователь, закрытые маршруты, отдельные ошибки конфигурации, ошибка D1, неизвестное исключение и отсутствие секретов в диагностическом выводе.
- `tools/check-media-browser.mjs`: **67** проверок Chrome, RU/EN/DE, ширины 375/390/430/1440. Проверка не выдаётся за реальный Safari или вход владельца в production.
- Локальная сборка Pages Functions успешна.

Первоначальная учётная запись администратора не создаётся кодом и не появляется автоматически после миграций. Источники: [Access application token, sub и user_uuid](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/), [проверка JWT](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).
