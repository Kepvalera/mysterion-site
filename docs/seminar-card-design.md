# Seminar card contrast and presentation

Prepared locally against Production `86e6e76e0287cb9c9ce251e598793a804ef7769c`. No Production deployment or data changes are authorized for this task.

The original account card used `var(--member-card,#fff)`, but the account defines no `--member-card`. Its light inherited paragraph text therefore appeared on white. Global heading styles also set dark headings inside the dark account page.

The account seminar section now owns its navy/gold palette with explicit title, body, status, countdown, button and helper-text colors. Actions wrap on desktop and stack on narrow phones. Disabled Zoom entry retains readable text and is described by a date/time/timezone helper. The helper uses the existing event opening timestamp and lifecycle; it does not determine access.

The public seminar page keeps a light surface with explicit dark text and matching buttons, independent of inherited color schemes. No global site theme is introduced.

Only presentation, accessibility associations, explanatory copy and asset version references change. Registration/payment functions, Zoom request handling, the disabled-button access predicate, backend modules, migrations and stored records remain unchanged. The separately prepared timezone/save correction is kept separate from this patch.

Real Chrome screenshots use isolated test data, not Production participant data. Checks cover RU/EN; light/dark system preferences; 320, 375, 390, 430, 768 and 1366 px; contrast at least 4.5:1; closed/open/completed meeting states; and the public seminar page. Screenshots remain local under `output/card-design-screenshots` and are not public site assets.
