# MYSTERION — официальный сайт (статический шаблон)

В комплекте: русско-английская главная страница, адаптивный дизайн, меню для телефона, переключение RU/EN и базовая SEO-разметка.

## Как посмотреть
Откройте `index.html` в браузере. Сайт работает локально; для дополнительных веб-шрифтов нужен интернет. Без интернета включаются системные шрифты.

## Как опубликовать без Tilda
1. Распакуйте архив.
2. Загрузите **содержимое папки** на Netlify, Cloudflare Pages, GitHub Pages или любой статический веб-хостинг.
3. Подключите собственный домен в настройках хостинга.
4. Настройте HTTPS и проверьте мобильное отображение.

## Какие файлы менять
- `index.html`: HTML-структура и контактные ссылки.
- `styles.css`: цвета, отступы и оформление.
- `script.js`: русский и английский тексты (объект `translations`).
- `assets/favicon.svg`: иконка вкладки.

## Фотографии
- Положите `assets/hero.jpg` — главная фотография. Если её нет, автоматически отображается красивый абстрактный фон.
- Положите `assets/founders.jpg` — одобренное фото Эдуарда и Натальи. Если файла нет, отображается заглушка.

## Что обязательно уточнить перед публикацией
- Подтвердить телефон и email (взяты из ранее согласованного черновика, но не проверены на действующем сайте).
- Согласовать текст биографии основателей, сведения о миссионерских поездках и конференции 2026 года.
- Добавить официальные ссылки Telegram/соцсетей.
- Добавить реальные фотографии, видео, свидетельства.
- При запуске регистрации и приёма платежей потребуется отдельная интеграция с сервисом регистрации/оплаты и юридические документы.
- Кнопки «Узнать о школе» и «Связаться» сейчас открывают почтовое приложение: полноценной регистрации, базы данных и онлайн-платежей **нет**.

Сайт — самостоятельный статический проект, без Tilda и без зависимости от платформы конструктора.


## Обновление дизайна
Текущая версия оформлена в более глубоком небесно-галактическом стиле: тёмная палитра, звёздный фон, золотистые акценты и атмосфера духовной глубины.

## Визуальная версия: Twilight / Neutral Galaxy
Средняя светлота: дымчато-лиловый, тёплый серо-перламутровый, розовое золото и мягкое космическое сияние. Иллюстрация фона `assets/aurora.svg` включена в сборку и не требует внешних изображений.


## Новый фирменный стиль
Небесно-голубая палитра, золотая корона и официальная графика MYSTERION INTERNATIONAL. Изображение в assets/mysterion-crown.webp. Цифр 2026 в эмблеме нет.


## New media pages
- `sermons.html` — sermons and teachings with category filters, search, and video player.
- `photos.html` — gallery for approved photos.
- `sermons-data.js` — paste real YouTube video IDs, titles, speakers, dates and categories. To automatically show new uploads in a playlist, set `youtubePlaylistId` to the ID of a public playlist and add new videos to that playlist on YouTube. The playlist section will update without editing the site.
- `photos-data.js` — list photo files uploaded into `assets/photos/`.

**Note:** Static Netlify Drop hosting does not provide a video/photo upload admin panel. To add individual video cards or photos, update the files and redeploy the site; or connect a CMS later. Videos are embedded from YouTube; avoid hosting multi-GB MP4 files in the site ZIP. Only publish materials you own or have permission to share. Private recordings must not be embedded publicly.


## Фото основателей
Добавлены две предоставленные фотографии в assets/photos. Первая используется на главной странице в разделе «Основатели», обе доступны в фотогалерее.
