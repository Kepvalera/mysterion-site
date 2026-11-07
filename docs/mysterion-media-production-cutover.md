# Подготовка mysterion-international.com

Домен указан только в **неактивном шаблоне** wrangler.production.example.jsonc и этой инструкции. Production-origin, DNS, Access, bindings, секреты и платный просмотр кодом не переключаются. Пока владелец не завершит настройку, защищённые страницы/API остаются закрыты.

## Что проверяет код

MEDIA_PUBLIC_ORIGIN — единственный точный канонический origin. Нет автоматической подстановки pages.dev, preview или Host/X-Forwarded-Host. Разрешён HTTPS; HTTP допускается только для loopback локальных тестов. Нельзя указывать путь, query, credentials или завершающий слеш.

После установки https://mysterion-international.com любой API-запрос через production pages.dev, preview, www или другой порт получает отказ 421, даже с валидным JWT и подставленным Origin. Редиректов с переносом credentials API не делает. Если нужно www — сначала подключите его и настройте отдельный Cloudflare redirect на канонический apex; он не является вторым разрешённым API-origin.

HTML /admin-media, /admin-media.html и /media-login, /media-login.html теперь проходит Pages Functions middleware. До выдачи HTML проверяются origin и JWT; для админ-страниц также активная роль admin/editor в D1. Неаутентифицированный запрос, неверный AUD и неподготовленная конфигурация не получают административную форму. Сам API независимо повторяет авторизацию. Ответы защищённых страниц — private, no-store; CSP выставляется из middleware, поскольку статические _headers не защищают ответы Functions.

_routes.json включает только API и защищённые страницы/их варианты. Главная, фотоархивы, стили, шрифты и анимации остаются статическими. JS оболочки панели может быть публичным: секретов в нём нет, права от этого не появляются.

## Действия владельца после покупки домена

1. В Cloudflare добавьте домен в свой аккаунт и завершите DNS-настройку у регистратора по указаниям Cloudflare. В Workers & Pages → mysterion-international → Custom domains добавьте mysterion-international.com. Дождитесь Active и рабочего HTTPS. **До этого не меняйте MEDIA_PUBLIC_ORIGIN и не добавляйте принудительный redirect.**
2. В Zero Trust создайте Admin application с единым AUD для /admin-media, /admin-media.html и /api/media/admin/*. Политика — конкретные администраторы, IdP и MFA, без Bypass/Everyone. Добавьте нужные варианты со слешем. Создайте отдельное Viewer application/AUD для /media-login, /media-login.html и /api/media/view/*. См. подробную инструкцию владельцу.
3. Для D1 подготовьте отдельный staging и binding MEDIA_DB. Проверьте backup/историю миграций. Применение 0001/0002 к production — **только после отдельного согласования**, текущая задача их не запускает.
4. В Pages Production Variables and Secrets укажите MEDIA_PUBLIC_ORIGIN=https://mysterion-international.com, проверенные MEDIA_ACCESS_ISSUER, MEDIA_ACCESS_AUD и отдельный MEDIA_VIEWER_ACCESS_AUD. Переключение переменных/новый deployment — только после шагов 1–3. Не копируйте production D1/ключи в preview; там нужны отдельные ресурсы/origin/AUD либо MEDIA_ENABLED=false.
5. В Access настройте защиту/закрытие preview и альтернативного pages.dev. Серверная origin-проверка дополнительно запрещает там API и защищённые HTML, даже если edge-политика забыта. Публичные страницы старого адреса пока можно оставить доступными; общий redirect можно отдельно настроить после подключения домена. Проверьте обе формы URL и прямые обращения к API.
6. В Bunny Library/Pull Zone добавьте mysterion-international.com в Allowed Domains без схемы. Подготовьте серверные BUNNY_API_KEY, BUNNY_TOKEN_KEY, BUNNY_CDN_TOKEN_KEY как encrypted secrets Pages, Library ID и CDN hostname. Проверьте embed tokens, закрытость прямых файлов/оригиналов/MP4, CDN-обложки и TUS CORS. Ключи не передавайте в чат/Git.
7. Сохраните MEDIA_PAID_ENABLED=false. BUNNY_ENABLED и BUNNY_SECURITY_CONFIRMED также не включайте до реальной проверки библиотеки и staging. Подключение платежей и активация платного просмотра — отдельный этап, автоматически они не выполняются.

## Контроль перед открытием

- Канонический домен/TLS работает, меню и относительные ссылки остаются на нём.
- Админ проходит Access и роль D1; anonymous/viewer/disabled/поддельный JWT получают отказ на HTML и API.
- На pages.dev и preview даже валидный production JWT не открывает панель/API.
- Прямые файлы Bunny и неподписанный embed закрыты; платное разрешение не выдаётся без всех флагов, секретов, личности, покупки и права.
- Реальные загрузка/CORS/обработка/обложка/длинный урок и iPhone Safari проверены отдельно. Локальный Chrome их не заменяет.
- Откат: отключить MEDIA_ENABLED/BUNNY_ENABLED, платный флаг оставить false, при необходимости отозвать доступ Bunny. Отзыв права D1 не аннулирует ранее выданный краткоживущий URL мгновенно.

Подробно: [инструкция владельцу](mysterion-media-owner-setup.md), [архитектура](mysterion-media-architecture.md). Источники: [Pages middleware](https://developers.cloudflare.com/pages/functions/middleware/), [Pages routing](https://developers.cloudflare.com/pages/functions/routing/), [custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/).
