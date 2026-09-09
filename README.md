# Neon Rush — Backend (MVP)

Серверная экономика игры: аккаунты, баланс RUSH, игровые сессии с серверной
валидацией, сезоны, leaderboard, предварительный расчёт наград OOPS.

Стек: Node.js + TypeScript + Express + PostgreSQL + Redis.
OOPS **не** отправляется в блокчейн — это только число в БД (`season_player_stats.oops_estimated`).
Leaderboard дублируется в Firestore как read-cache (`src/firestore/client.ts`, сейчас — заглушка,
включается через `FIRESTORE_ENABLED=true` + `GOOGLE_APPLICATION_CREDENTIALS`, ключи в репозиторий не кладутся).

## Быстрый старт

```bash
cp .env.example .env
docker compose up -d          # postgres + redis
npm install
npm run migrate               # применяет migrations/001_init.sql
npm run dev                   # http://localhost:3000
```

## Тесты

```bash
npm test
```

Интеграционные тесты (`tests/integration`) поднимают реальные запросы через Postgres/Redis
(укажите `DATABASE_URL`/`REDIS_URL` в `.env`, по умолчанию — локальный docker-compose).
Юнит-тесты (`tests/unit`) покрывают формулу OOPS и anti-cheat правила без БД.

## Как назначить первого админа

MVP не имеет отдельного endpoint для назначения ролей (сознательно — это привилегированная
операция). Сделайте это напрямую в БД после регистрации обычного пользователя:

```sql
UPDATE users SET role = 'admin' WHERE username = 'your_admin_username';
```

## Ключевые решения дизайна

- **Guest-first онбординг**: `POST /api/auth/guest` создаёт анонимного игрока (без email/пароля)
  и сразу выдаёт полноценную пару токенов — тот же формат ответа, что у `login`/`register`.
  `POST /api/auth/upgrade` (только для гостя) апгрейдит **ту же строку `users`** до полного
  аккаунта — `user_id` не меняется, поэтому баланс RUSH и статистика сезона сохраняются
  автоматически, без миграции данных.

- **RUSH начисляется только на сервере**: `src/modules/sessions/validation.ts` пересчитывает
  правдоподобный score по длительности сессии и не доверяет клиентскому значению напрямую.
- **Баланс меняется в одном месте**: `src/modules/economy/ledger.service.ts` — единственная
  функция, которая пишет в `users.rush_balance`, и всегда добавляет запись в `rush_transactions`.
- **Идемпотентность**: `Idempotency-Key` (или `event_id` в теле) обязателен на `/sessions/:id/end`.
  Redis `SETNX` — быстрый первый барьер; `UNIQUE` на `game_results.event_id` — надёжный бэкстоп.
- **Rate limiting**: fixed-window счётчик в Redis, отдельно на login/register/session-эндпоинты.
- **OOPS формула**: `player_rush / total_season_rush * reward_pool`, затем `min(., max_oops_per_player)`.
  Пересчитывается по требованию и автоматически при закрытии сезона (`POST /admin/seasons/:id/close`).

## Дальнейшие шаги (не в этом MVP)

- Реальная интеграция Firebase Admin SDK для sync leaderboard.
- TON Connect и фактическая отправка OOPS в блокчейн — отдельный этап после
  тестирования игровой экономики, как и договаривались.
- Renormalization начисленных OOPS после применения капа на игрока (сумма может
  не совпасть с полным пулом — сейчас это осознанное упрощение MVP).
