# MYSTERION MEDIA — инструкция владельцу

Ключи не отправляйте в чат, Antigravity или GitHub. После однократной настройки видео загружаются через панель, без изменения файлов сайта. Ниже описаны **ручные действия владельца**, не уже выполненная настройка.

## 1. Staging и домен

Для будущего **mysterion-international.com** подготовлен отдельный [порядок переключения](mysterion-media-production-cutover.md). Неактивный шаблон не меняет текущий production. Сервер допускает API и защищённый HTML только на точном MEDIA_PUBLIC_ORIGIN: после переключения домена pages.dev и preview с production-настройками получают отказ даже с JWT. Middleware не отдаёт панель без проверки Access/роли. В Cache Rules исключите кэширование /api/media/*, /admin-media* и /media-login*.

Cloudflare → **Workers & Pages → mysterion-international**: сохраните текущие Production-настройки. Для staging нужны отдельные D1, Bunny Library и Access audiences. Preview не должен наследовать production-ключи. Пока всё не проверено: MEDIA_ENABLED=false, BUNNY_ENABLED=false, MEDIA_PAID_ENABLED=false.

Для production рекомендуется собственный домен в активной Cloudflare zone, подключённый через **Pages → Custom domains**. Тогда Access защищает точные пути панели/API, оставляя сайт публичным. Защита preview *.pages.dev не является автоматической защитой production. Для текущего mysterion-international.pages.dev проверьте возможность нужных правил в аккаунте; при отсутствии используйте собственный домен. Проверьте также альтернативный pages.dev и preview.

## 2. D1

1. **Cloudflare → Storage & databases → D1 SQL Database → Create database**: сначала staging; название выберите самостоятельно. Проект ничего автоматически не создаёт.
2. Сохраните Database ID/название. **Workers & Pages → проект → Settings → Bindings → Add → D1 database**: binding **MEDIA_DB**, правильная база/окружение.
3. Подготовлены `media-worker/migrations/0001_media.sql` и `0002_bunny_stream.sql`. Production-миграции требуют отдельного согласования. Сделайте backup и проверьте историю. Если 0001 уже применялась, повторно её не запускайте.
4. С согласованной Wrangler-конфигурацией: `npx wrangler d1 migrations list <database-name> --remote`. Только после одобрения выбранной базы: `npx wrangler d1 migrations apply <database-name> --remote`. Локально используйте --local. После ранее ручного SQL сначала согласуйте корректную историю миграций.
5. Проверьте `PRAGMA foreign_key_check;` и сохранность users/videos/purchases/entitlements/audit_log/bunny_leases.

`wrangler.production.example.jsonc` — **неактивный шаблон**. Можно продолжать через Dashboard. Перед переходом к Wrangler скачайте текущую конфигурацию `wrangler pages download config mysterion-international` в проверяемую копию и сравните с шаблоном. Активный wrangler.jsonc становится источником конфигурации Pages; не заменяйте настроенный проект шаблоном вслепую.

## 3. Access — администраторы

1. **Zero Trust → Access controls → Applications → Add application → Self-hosted and private**.
2. Создайте **MYSTERION MEDIA Admin**. В **одном приложении** добавьте destinations вашего домена для `/admin-media`, `/admin-media.html`, `/api/media/admin/*`. Проверьте обе HTML-формы адреса. Все эти пути должны иметь один audience.
3. Allow — конкретные администраторы/редакторы и IdP, желательно MFA. Не Bypass/Everyone. Защитите API, не только HTML.
4. Application Audience (AUD) → MEDIA_ACCESS_AUD. Issuer `https://<команда>.cloudflareaccess.com`, без завершающего слеша → MEDIA_ACCESS_ISSUER.
5. Подтвердите личность первого администратора, получите JWT sub доверенными средствами Access/серверной диагностики. JWT нельзя отправлять в чат/коммитить. В D1 создайте одобренную строку users: уникальный id, access_sub, role='admin', active=1. Панель не создаёт первого администратора автоматически; email-заголовок прав не даёт.
6. Прямой `/api/media/admin/me` без Access должен получать отказ; поддельный JWT, неверный AUD, viewer/disabled также отвергаются сервером. Editor редактирует черновики; Bunny upload/публикация/удаление требуют admin.
7. Preview защищается отдельно или остаётся выключенным. На альтернативном pages.dev сервер тоже проверяет JWT, но без настроенного Access рабочий вход отсутствует. Обходной пароль в JavaScript не добавляйте.

## 4. Bunny Stream

1. **Bunny Dashboard → Stream → Add Video Library**: создайте staging-библиотеку. Хранение/обработка могут тарифицироваться; бюджет и параметры выбирает владелец. Скрипты библиотек не создают.
2. **Library → API**: числовой Video Library ID → BUNNY_LIBRARY_ID. **Library API Key** → серверный секрет BUNNY_API_KEY. Это ключ библиотеки, не всего аккаунта.
3. **Library → Security**: включите **Embed view token authentication**. Отдельный **Token authentication key** → секрет BUNNY_TOKEN_KEY. Не путать с Library API Key, даже если поле помечено «API key».
4. Защитите **файлы доставки**, не только iframe: соответствующая token authentication Library/Pull Zone, запрет прямого доступа, Allowed Domains с точным доменом **без https://**, отключение публичного MP4 fallback/оригиналов. Реально проверьте прямые playlist/MP4/сегменты. MediaCage/DRM при необходимости согласуется отдельно; подписанный iframe не равен DRM.
5. Hostname связанного CDN/Pull Zone вида vz-....b-cdn.net → BUNNY_CDN_HOST. **Pull Zone → Security → Token authentication**: URL/CDN Token Key → секрет BUNNY_CDN_TOKEN_KEY. Для обложек используется текущая advanced HMAC-SHA256 подпись. Проверьте её в staging; не отключайте защиту видео ради обложки.
6. Разрешите точный домен сайта. Проверьте TUS CORS: POST/HEAD/PATCH и чтение Location/Upload-Offset в браузере. При Chromecast отдельно проверьте рекомендации Bunny.
7. После отрицательных тестов неподписанного iframe/прямых файлов/просроченных URL установите BUNNY_SECURITY_CONFIRMED=true. Это **ручное подтверждение владельца**, не автоматический аудит Bunny.

## 5. Настройки и секреты

**Pages → проект → Settings → Variables and Secrets**, выберите окружение. Ключи добавляйте как **Secret/Encrypt**, не в исходники. После изменения bindings/variables нужен новый deployment.

| Имя | Тип | Значение |
| --- | --- | --- |
| MEDIA_DB | D1 binding | Мигрированная база выбранного окружения |
| MEDIA_PUBLIC_ORIGIN | Variable | Точный https://ваш-домен без слеша/пути |
| MEDIA_ACCESS_ISSUER | Variable | URL команды Access |
| MEDIA_ACCESS_AUD | Variable | Admin application AUD |
| MEDIA_VIEWER_ACCESS_AUD | Variable | Отдельный Viewer application AUD |
| BUNNY_LIBRARY_ID | Variable | Числовой ID библиотеки |
| BUNNY_CDN_HOST | Variable | Только hostname связанного CDN |
| BUNNY_API_KEY | **Secret** | Library API Key |
| BUNNY_TOKEN_KEY | **Secret** | Embed Token Authentication Key |
| BUNNY_CDN_TOKEN_KEY | **Secret** | CDN/Pull Zone Token Key |
| MEDIA_ENABLED | Variable | true после проверки D1/Access |
| BUNNY_ENABLED | Variable | true после настройки Bunny |
| BUNNY_SECURITY_CONFIRMED | Variable | true после реальной проверки защиты файлов |
| MEDIA_PAID_ENABLED | Variable | Пока false; true только после Viewer/rights тестов |
| MEDIA_BUCKET | Optional R2 binding | Существующие бесплатные файлы/ручные обложки |

Локальные секреты допускаются только в неотслеживаемом `.dev.vars`. `.gitignore` исключает .dev.vars/.env*. Реальные секреты текущая задача не запрашивала и не устанавливала.

## 6. Зрители и права

Создайте **отдельное приложение MYSTERION MEDIA Viewer**: `/media-login`, `/media-login.html`, `/api/media/view/*`, собственный AUD → MEDIA_VIEWER_ACCESS_AUD. Настройте разрешённых зрителей/IdP. Не используйте Admin AUD. Публичный каталог остаётся открытым; ссылка входа находится в диалоге плеера.

Одного входа недостаточно: пользователь D1 должен иметь подтверждённую оплаченную покупку и действующее право именно на видео. Здесь нет оплаты, автоматической регистрации или выдачи прав. Проверочные пользователи/покупки — только отдельно одобренные staging-данные. Не создавайте фиктивные production-покупки ради разблокировки. Будущая платёжная интеграция потребует подписанных webhook, сверки суммы/валюты, идемпотентности и возвратов.

## 7. Загрузка через панель

1. Откройте https://ваш-домен/admin-media.html, пройдите Access.
2. «Новый материал»: RU/EN/DE, категория, год, описания. Платные видео — **Bunny Stream**, стоимость в минимальных единицах выбранной валюты. Bunny ID вручную не вводится.
3. Сохраните **черновик**, выберите MP4/WebM/MOV, нажмите «Загрузить в Bunny». Для проверки — только согласованный staging-файл, не публикуйте его как материал служения.
4. Следите за прогрессом; пауза/продолжение работают в той же вкладке. Не закрывайте её: после перезагрузки resume URL теряется. При ошибке проверьте сеть/Access-сессию. UI — до 20 ГБ, chunks — 8 МиБ.
5. Дождитесь обработки, обновите статус, проверьте предпросмотр/звук/обложку/переводы. Автоматическая Bunny-обложка работает без R2; ручная требует необязательный старый бакет.
6. Публикуйте только проверенный реальный материал. Платные требуют MEDIA_PAID_ENABLED и права зрителя; не включайте флаг до проверки инфраструктуры.
7. Удаление скрывает запись и удаляет Bunny-файл. При сбое повторите операцию из панели. Покупки и история сохраняются.

## 8. Перед production

- Anonymous/viewer/editor не получают upload-подпись. JWT/audience/Origin действительно проверяются.
- Ключей нет в HTML/JS/Network responses/логах браузера; выдаются только ограниченные подписи.
- Реальная TUS: несколько PATCH, пауза/продолжение, ошибка сети, обновление истёкшей подписи.
- Обработка, обложка, название, предпросмотр, удаление проверены на библиотеке.
- Нет покупки/другой пользователь/refund/revoked/expired/disabled — отказ. Разрешённый зритель получает URL с TTL 180 секунд.
- Неподписанный/просроченный iframe и прямые playlist/MP4/сегменты не открываются. Проверен **длинный** урок и повторный вход после истечения embed URL.
- 375/390/430/1440, Chrome и настоящий iPhone Safari, переводы/клавиатура.
- Backup D1 и откат: MEDIA_PAID_ENABLED=false, при необходимости BUNNY_ENABLED=false/MEDIA_ENABLED=false. Уже выданный URL D1 не отзывает мгновенно; при инциденте отдельно приостановите доступ Bunny.

Production-миграции и включение инфраструктуры — после этих проверок и отдельного согласования. Текущий push безопасен без них: флаги по умолчанию закрыты.

Источники: [Pages configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/), [Access](https://developers.cloudflare.com/learning-paths/clientless-access/access-application/create-access-app/), [Bunny TUS](https://bunny.net/docs/stream/tus-resumable-uploads), [Bunny tokens](https://bunny.net/docs/stream/token-authentication), [Bunny security](https://bunny.net/docs/stream/security-options).
