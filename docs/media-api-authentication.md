# Авторизация API MYSTERION MEDIA

Проверено: в привязанной staging D1 есть один активный admin. HTML перенаправляет анонимный запрос в Cloudflare Access, а `/api/media/admin/me` отвечает 401 authentication_required непосредственно из приложения. Этот код возникает до запроса роли: исходная реализация возвращала его при отсутствующем Cf-Access-Jwt-Assertion либо при токене длиннее 16000 символов. Теперь эти случаи различаются: отсутствие — authentication_required, превышение лимита — invalid_identity. Frontend уже отправляет credentials: same-origin.

Весь API обрабатывается Pages Functions через functions/api/[[path]].js и включён в _routes.json. Наличие маршрута в _routes.json **не является настройкой Cloudflare Access**. `/api/media/members/me` в приложении отсутствует: административная сессия — `/api/media/admin/me`, кабинет зрителя — `/api/media/view/account`, управление зрителями — `/api/media/admin/members`. Несуществующий адрес не должен использоваться для проверки входа.

## Исправление

Общая серверная функция сначала берёт JWT из assertion-заголовка; только при его отсутствии использует cookie CF_Authorization. Оба источника проходят ту же проверку RS256, доверенных JWKS, issuer, AUD, exp/iat/nbf/sub и роли D1. Недействительный явный заголовок не заменяется cookie. Дубли cookie и слишком большие значения отклоняются. Email, произвольный Bearer, global Access session и localStorage не дают административных прав. Проверки Origin для изменений сохранены.

Для 401 возвращаются фиксированные диагностические заголовки X-Mysterion-Media-Error и X-Mysterion-Auth-Transport (assertion/cookie/missing). JWT, cookies, email, значения секретов и payload не выводятся и не журналируются.

## Что вручную проверить в Cloudflare

1. Zero Trust → Access → Applications → административное приложение. В **одном приложении с одним AUD** должны быть hostname mysterion-international.pages.dev и пути `/admin-media`, `/admin-media.html`, `/admin-media/*`, `/api/media/admin/*`. Правило Allow — только утверждённые администраторы; Bypass/Everyone не использовать.
2. MEDIA_ACCESS_AUD должен соответствовать этому приложению, MEDIA_ACCESS_ISSUER — его команде. API не должен попадать в другое приложение с другим AUD или в более специфичную Bypass-политику.
3. Проверьте Cookie Path Attribute: cookie, ограниченная путём HTML, не отправляется на `/api/media/admin/`. Для общего приложения согласуйте область cookie с HTML и API; после исправления повторите вход. Не ослабляйте Secure/HttpOnly и проверку JWT.
4. Если API получает redirect на Access, откройте `/api/media/admin/me` обычной навигацией после входа, затем перезагрузите панель: fetch намеренно не следует сторонним login redirects. Правильно настроенный общий application/AUD позволяет пользоваться той же сессией.
5. В браузере Network проверьте только статус, error и X-Mysterion-Auth-Transport. missing означает отсутствие обоих переносчиков; invalid_identity при cookie/assertion — проверяйте срок, issuer и AUD. Полный Cookie/JWT никому не отправляйте.

Политики Access целиком через доступную административную API-сессию подтвердить не удалось, поэтому точный состав правил и Cookie Path Attribute требуют проверки владельцем. Старый authentication_required не позволял различить отсутствие assertion и превышение лимита; наличие рабочей cookie именно в запросе владельца до исправления удалённо не проверялось. Исправление обрабатывает этот совместимый способ переноса, но не отменяет защиту API через Access.

После публикации анонимный API обязан оставаться закрытым (401 или отказ Access); авторизованный пользователь с действующим JWT и ролью admin получает 200. Реальный браузерный вход владельца требует его повторной проверки. База, роли, настройки Access и MEDIA_PAID_ENABLED не изменялись.

Проверки: 185 серверных тестов, 67 браузерных проверок Chrome (RU/EN/DE, мобильные и настольные размеры), локальная сборка Pages Functions и сканирование шаблонов секретов. Тесты не создавали пользователей, покупки или реальные Bunny-ресурсы.

Проверки: 185 серверных тестов, 67 браузерных проверок Chrome (RU/EN/DE, мобильные и настольные размеры), локальная сборка Pages Functions и сканирование шаблонов секретов. Тесты не создавали пользователей, покупки или реальные Bunny-ресурсы.

Источники: [JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/), [Access cookies и Cookie Path Attribute](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/).
