# MYSTERION MEDIA — Pages / D1 / Access / Bunny Stream

Платные видео окончательно переведены на **Bunny Stream**. См. [инструкцию владельцу](mysterion-media-owner-setup.md).

## Компоненты и данные

Pages сохраняет статический сайт; Functions обслуживают /api/media/* и защищённые HTML admin-media/media-login. Перед выдачей HTML middleware проверяет канонический origin и JWT; админ-страница также требует активную роль D1. D1 хранит каталог RU/EN/DE, пользователей/роли, покупки, права, аудит и привязку Bunny ID. Access — отдельные приложения Admin и Viewer с разными audiences. Bunny — прямая загрузка, обработка, обложки и подписанный плеер. Подключение будущего домена: [порядок переключения](mysterion-media-production-cutover.md).

R2 теперь **необязателен**. Старый код/записи сохранены для бесплатных файлов и ручных обложек; для платных R2 и YouTube запрещены. Без MEDIA_BUCKET работают каталог, Bunny-загрузка и автоматические обложки. Главная и homepage.min.css/js не изменены.

Полные HTML-интерфейсы панели/входа перенесены в media-worker/src/page-templates.mjs. Middleware выдаёт их только после проверки JWT/origin/роли. Публичные admin-media.html и media-login.html сохранены как закрытые fallback без формы: кодированные алиасы статических файлов не открывают интерфейс управления. Исходники клиентского кода не являются правами доступа; API проверяет каждую операцию независимо.

0001_media.sql неизменна. 0002_bunny_stream.sql добавляет bunny, поля библиотеки/статуса/обложки/удаления, bunny_leases; сохраняет записи, покупки, права и аудит. FK откладываются внутри транзакции миграции D1. Проверена непустая SQLite и foreign_key_check. **Production-миграции не выполнялись**, приложение их не запускает. wrangler.production.example.jsonc — неактивный шаблон, не включать без сверки текущих настроек.

Bunny GUID назначается только сервером. Через форму нельзя присвоить чужой GUID или заменить связанный источник. Library ID закреплён в записи.

## API и загрузка

Все пути начинаются с /api/media:

- GET /videos: опубликованные и наступившие по дате записи, поиск/фильтры/страницы, без source_ref/GUID/ключей.
- GET /videos/:id/play: только бесплатные YouTube/R2/Bunny.
- POST /view/play/:id: платный Bunny с JWT Viewer и проверкой прав.
- GET /videos/:id/cover: R2 либо серверный подписанный запрос к проверенному Bunny CDN.
- /admin/me, /admin/videos, /admin/videos/:id: каталог с ролями, версиями и аудитом.
- POST /admin/videos/:id/bunny/upload: admin-only, создаёт объект при первом запросе и выдаёт TUS-подпись конкретного GUID. Повтор не создаёт второе видео.
- POST /admin/videos/:id/bunny/sync: название, статус/прогресс, filename обложки.
- POST /admin/videos/:id/bunny/preview: подписанный admin-only предпросмотр, включая черновик.
- POST /admin/videos/:id/bunny/delete: повтор удаления уже скрытого материала.

Editor редактирует черновики; upload/публикация/удаление требуют admin. Endpoint выдачи ролей/покупок/прав из браузера отсутствует.

bunny-upload.js — TUS 1.0: POST, HEAD, PATCH по 8 МиБ, XHR progress, пауза/продолжение и обновление подписи. Файл идёт напрямую в Bunny. Разрешение на 15 минут относится к одному Library ID/GUID; API-ключ браузеру не передаётся. Resume URL хранится **только в памяти вкладки**: после перезагрузки продолжение пока не реализовано. UI принимает MP4/WebM/MOV до 20 ГБ; это не криптографическая квота подписи.

Статус опрашивается раз в 10 секунд после загрузки; опрос останавливается при готовности/ошибке, скрытии вкладки и смене записи. Готовность консервативно требует status=4; публикация дополнительно проверяет API Bunny. Постоянных Canvas/requestAnimationFrame нет.

## Защита

По умолчанию всё закрыто. MEDIA_ENABLED требует D1/Access; Bunny — BUNNY_ENABLED=true, ключи и BUNNY_SECURITY_CONFIRMED=true. Платные публикация/просмотр дополнительно требуют MEDIA_PAID_ENABLED=true.

JWT: RS256, доверенный JWKS/issuer, audience, exp/iat/nbf; пользователь/роль проверяются в D1. Admin AUD не принимается вместо Viewer AUD. Origin проверяется на изменяющих запросах и платном play. SQL — bind-параметры, ответы разрешений — no-store. Upstream-ошибки не раскрывают ключи. CSP допускает upload только video.bunnycdn.com и известные iframe.

Платный просмотр требует опубликованного готового Bunny-видео, JWT Viewer, активного пользователя, его неотозванного/неистёкшего права именно на материал, связанной покупки того же пользователя/видео со статусом paid. Refund/revoked/expired/disabled запрещают новую выдачу. Роль admin, email и localStorage права зрителя не дают. Покупки/права текущая панель не создаёт; платежи/webhook отсутствуют.

Embed: SHA256 HEX(Token Authentication Key + GUID + expires); TUS: SHA256 HEX(Library ID + Library API Key + expires + GUID); CDN-обложка: текущая advanced HMAC-SHA256 подпись HS256-, отдельный CDN Token Key. Домены фиксированы/проверены, redirects запрещены, произвольные URL не проксируются.

**Подписанный URL — bearer-доступ, не DRM.** Его можно передать до истечения срока. TTL выдачи — 180 секунд; отзыв D1 не аннулирует выданный URL мгновенно, длительность начатой сессии зависит от Bunny. Обязательны staging-тесты неподписанного iframe, прямых playlist/MP4/сегментов, просроченного URL и длинного урока. Оригиналы/MP4 fallback нельзя оставлять открытыми. MediaCage/DRM согласуется отдельно.

## Согласованность

Изменения/аудит — атомарный D1 batch с revision. Короткая аренда блокирует конфликтующие Bunny-операции. Удаление сначала ставит D1 tombstone и закрывает новые выдачи, затем удаляет Bunny-файл. Сбой сохраняет bunny_delete_pending для повтора в панели. Покупки/аудит остаются.

D1 и Bunny не образуют общей транзакции. После неудачного сохранения созданного объекта выполняется компенсирующий DELETE. При одновременном сбое возможен orphan: нужна сверка Dashboard/журналов; фоновая reconciliation отсутствует. Описания/переводы — в D1, название Bunny синхронизируется при сохранении/ручном обновлении; ошибка показана и допускает повтор.

## Проверка и границы

Локальные тесты: SQLite в памяти, RSA-ключи процесса, тестовые ответы провайдера. Проверяются миграция с данными, подписи независимо через Node crypto, JWT/роли/Origin, привязка GUID, готовность, TTL, права/refund/отзыв/истечение, удаление и FK. Chrome — RU/EN/DE, 375/390/430/1440, закрытая панель, форма, TUS по частям, предпросмотр и CSP.

Реальные библиотеки/платные ресурсы/production-миграции не создавались. Живые Access/Bunny/CORS/обработка/долгое воспроизведение требуют staging. Safari/настоящий iPhone не проверены. Кабинет, платежи, автоматическая выдача прав и resume после закрытия браузера — будущие этапы.

## Официальные источники

- [Bunny TUS](https://bunny.net/docs/stream/tus-resumable-uploads)
- [Embed authentication](https://bunny.net/docs/stream/token-authentication)
- [Bunny security](https://bunny.net/docs/stream/security-options)
- [Advanced CDN tokens](https://bunny.net/docs/cdn/security/token-authentication/advanced)
- [D1 foreign keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/)
- [Pages configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)
# Дополнение: управляемые кабинеты и коллекции

Текущий модуль `members.mjs` и миграция `0003_media_members.sql` добавляют ручные разрешения без записей в purchases, аудит управления зрителями, коллекции и небольшие обложки D1. Вход делегирован Cloudflare Access. Модуль выключен до явного `MEDIA_MEMBERS_ENABLED=true` после миграции. Подробности и границы production-готовности: [настройка кабинетов](mysterion-media-members-setup.md). Предыдущая архитектура покупок сохранена; актуальный сервер допускает также действующий ручной grant. Платный playback остаётся отдельно выключенным.
