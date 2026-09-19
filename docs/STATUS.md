# Статус публичной консоли

Дата проверки: **19 сентября 2026**.

- Изолированная история Git и самостоятельный npm-проект. Сайт, боты, инфраструктура сервера и приватный training archive не включены.
- Три SHA-256 модельных артефакта сверены с текущими работающими файлами.
- 39 605 реальных токенов и 212 707 минутных OHLCV в bootstrap на блоке 67 054 871, 11:42:08 UTC. Обычный запуск — live; `--recorded` — явный offline replay.
- MODEL ESTIMATE соответствует Terminal; TOP вторичен. Early admission: 4h, quote, цена, полный activity interval и известный reserve. При lag >90s текущая оценка скрывается.
- Семь сортировок, minimum estimate, ready/catalogue, поиск CA, launch facts, model explanations, минутный график, 5m/1h/24h flow, JSON export.
- Самостоятельные RPC и HyperSync, factory lookup старого CA и resumable history от launch. Модель исполняется локально; штатный API не вызывается консолью.
- `npm run check`, `npm run build`, `npm test`, `npm run bench`: 52 теста, 882 прежних численных утверждения и exact parity estimate/TOP для 40 реальных vectors.
- Живой HyperSync + RPC догнал head до блока 67 061 586 с lag 13 секунд: 39 625 токенов, 932 Early ready, 228 Wave ready. Последний проход 715 блоков занял 6.8s и 9 read requests. Это измерение конкретного запуска, не обещание скорости.
- Live API сверка VERTEX: estimate `0.01220523763724389`, TOP `70.0170623724504` совпали точно. Wave ready 228 совпал с доступной серверной выдачей; моменты snapshots различались.
- Восстановление VERTEX и мигрировавшего `0x8c5579a814af1d3a734b293c3042a240d2539c7a` совпало с сохранёнными bars/activity/price; у последнего — 2387 buys, 2425 sells, 30 minute bars и OBSERVING. Factory lookup от genesis восстановил тот же launch block и pool key.
- Windows Terminal: управление и выход проверены. Размеры renderer: 140×42, 120×36, 80×30, 64×24, 40×16. Узкий/низкий экран получает подсказку.
- Вероятностные release gates сохранены. Полный replay/обучение на приватном архиве не публикуется.

Реальные ограничения описаны в [DATA_SOURCES.md](DATA_SOURCES.md). Оформление README использует собственные исследовательские схемы и рендер реальных ячеек консоли; анимации интерфейса сайта отсутствуют.
