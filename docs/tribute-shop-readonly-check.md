# Проверка Tribute Shop без создания платежей

Проверка подготовлена локально; сама по себе не публикует код и не меняет Cloudflare.

## Secret

В Cloudflare: **Workers & Pages → mysterion-international → Settings → Variables and Secrets**. Выбрать среду **Production**, затем **Add**.

- Включить **Encrypt** (или выбрать Type: **Secret**, если интерфейс предлагает выбор типа).
- Name: `TRIBUTE_API_KEY`.
- Value: API-ключ из Tribute. Вводить только в поле Secret, не в чат, исходники, команды или обычную переменную.

Сохранить. Значение Secret нельзя получить обратно через API Cloudflare; обработчик читает его только из серверного `env`. Для применения к запущенному коду нужен новый deployment. Подготовленный код нужно включить в отдельный согласованный релиз поверх актуального production, не публиковать резервную ветку целиком.

## Запуск после публикации

Войти в существующую административную систему как `owner`. Из консоли браузера на том же домене выполнить запрос **без API-ключа**:

```js
fetch('/api/platform/admin/integrations/tribute/check', {
  method: 'POST',
  credentials: 'same-origin',
  headers: {'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest'},
  body: '{}'
}).then(r => r.json()).then(console.log);
```

Используются существующие Cloudflare Access, роль `owner` и CSRF-проверка. Права и правила входа не меняются. Публичного диагностического endpoint нет. Проверка не добавляет кнопки в интерфейс.

## Что означает результат

- `apiAccessible:true`: ключ принят и `GET https://tribute.tg/api/v1/shops` вернул корректный список.
- `activeShopFound:true`, `shops[].active:true`: найден магазин со `status:1`.
- `onlyStars:false`, `rubModeEligible:true`: стандартный режим магазина допускает создание заказа в RUB по документации. Это **не проверка фактического приёма рублёвого платежа**, и не отдельный флаг валют в ответе API.
- `onlyStars:true`: магазин принимает Stars; рублёвую оплату школы как обычный RUB-заказ считать подтверждённой нельзя.
- `shops:[]`: активных магазинов не найдено. `/shops` не возвращает неактивные магазины; отсутствие магазина и его деактивацию этим запросом различить нельзя.
- `rubPaymentTested:false`: заказов и платежей не создавалось.

Ошибки возвращают только фиксированные коды: `tribute_api_key_missing`, `tribute_api_key_invalid_format`, `tribute_api_unauthorized`, `tribute_api_forbidden`, `tribute_api_rate_limited`, `tribute_api_redirect_blocked`, `tribute_api_unavailable`, `tribute_api_unreachable`, `tribute_api_response_invalid`. Ответ Tribute и тексты исключений не возвращаются и не логируются. Перенаправления запрещены, чтобы не передать `Api-Key` другому хосту; время запроса ограничено 10 секундами, тело ответа — 128 КиБ.

Проверка выполняет только GET к одному фиксированному адресу Tribute. Она не обращается к заказам, не создаёт webhook, не меняет D1 и права доступа. Существующие проверки сотрудника читают D1 как и прежде.

Официальная документация: [авторизация](https://wiki.tribute.tg/for-shops/api), [магазины и режимы оплаты](https://wiki.tribute.tg/for-shops/api/methods).
