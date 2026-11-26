-- ServiceDesk: SQL-запросы для демонстрации базы данных на защите.
-- Где запускать: Neon Console → SQL Editor (база servicedesk) или любой клиент PostgreSQL.
-- Запускайте по одному запросу: выделите его и нажмите Run.
-- Разделы 1–4 только читают данные. Запросы раздела 5 специально завершаются
-- ошибкой: PostgreSQL отклоняет неправильные данные, поэтому в базе ничего не меняется.
-- Подробные объяснения: docs/DATABASE.md


-- ============================================================
-- 1. Структура: какие таблицы, поля, связи и индексы есть в базе
-- ============================================================

-- 1.1 Таблицы приложения (_prisma_migrations — служебная таблица истории миграций)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 1.2 Поля таблицы заявок: тип, обязательность, значение по умолчанию
SELECT column_name, data_type, character_maximum_length AS max_length,
       is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'Ticket'
ORDER BY ordinal_position;

-- 1.3 Перечисления (ENUM): допустимые роли, статусы и приоритеты
SELECT t.typname AS enum_type, e.enumlabel AS value
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
ORDER BY t.typname, e.enumsortorder;

-- 1.4 Внешние ключи: какая таблица на какую ссылается и что происходит при удалении
SELECT tc.table_name AS from_table, kcu.column_name AS from_column,
       ccu.table_name AS to_table, rc.delete_rule AS on_delete
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints rc
  ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
ORDER BY from_table, from_column;

-- 1.5 Индексы: первичные ключи, уникальные поля и индексы для частых запросов
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 1.6 История миграций: какие изменения структуры применены и когда
SELECT migration_name, finished_at
FROM "_prisma_migrations"
ORDER BY started_at;


-- ============================================================
-- 2. Данные: что лежит в таблицах и как они связаны
-- ============================================================

-- 2.1 Количество строк в каждой таблице
SELECT 'User' AS table_name, COUNT(*) AS rows FROM "User"
UNION ALL SELECT 'Category', COUNT(*) FROM "Category"
UNION ALL SELECT 'Ticket', COUNT(*) FROM "Ticket"
UNION ALL SELECT 'Comment', COUNT(*) FROM "Comment"
UNION ALL SELECT 'SupportRequest', COUNT(*) FROM "SupportRequest"
UNION ALL SELECT 'AuthRateLimit', COUNT(*) FROM "AuthRateLimit";

-- 2.2 Пользователи: в базе хранится только хеш пароля, а не сам пароль
SELECT name, role, "createdAt",
       left("passwordHash", 45) || '…' AS password_hash
FROM "User"
ORDER BY role, "createdAt";

-- 2.3 JOIN: последние заявки вместе с категорией, автором и исполнителем
SELECT t.id, t.title, t.status, t.priority,
       c.name AS category, author.name AS author,
       COALESCE(agent.name, '— не назначен') AS assignee, t."createdAt"
FROM "Ticket" t
JOIN "Category" c ON c.id = t."categoryId"
JOIN "User" author ON author.id = t."createdById"
LEFT JOIN "User" agent ON agent.id = t."assignedToId"
ORDER BY t.id DESC
LIMIT 10;

-- 2.4 Комментарии одной заявки (связь Ticket 1 — N Comment)
SELECT t.id AS ticket_id, t.title, u.name AS author, cm.content, cm."createdAt"
FROM "Comment" cm
JOIN "Ticket" t ON t.id = cm."ticketId"
JOIN "User" u ON u.id = cm."authorId"
WHERE cm."ticketId" = (SELECT "ticketId" FROM "Comment" ORDER BY "createdAt" DESC LIMIT 1)
ORDER BY cm."createdAt";


-- ============================================================
-- 3. Те же расчёты, что показывает приложение
-- ============================================================

-- 3.1 Заявки по статусам — круговая диаграмма на обзоре
SELECT status, COUNT(*) AS tickets
FROM "Ticket"
GROUP BY status
ORDER BY status;

-- 3.2 Заявки по категориям — раздел «Отчёты»
SELECT c.name AS category, COUNT(t.id) AS total,
       COUNT(t.id) FILTER (WHERE t.status IN ('NEW', 'IN_PROGRESS', 'WAITING')) AS open
FROM "Category" c
LEFT JOIN "Ticket" t ON t."categoryId" = c.id
GROUP BY c.name
ORDER BY total DESC;

-- 3.3 Работа исполнителей и среднее время решения в часах — раздел «Отчёты»
SELECT u.name, u.role,
       COUNT(t.id) FILTER (WHERE t.status IN ('NEW', 'IN_PROGRESS', 'WAITING')) AS open,
       COUNT(t.id) FILTER (WHERE t."resolvedAt" IS NOT NULL) AS resolved,
       ROUND(AVG(EXTRACT(EPOCH FROM (t."resolvedAt" - t."createdAt")) / 3600)::numeric, 1) AS avg_hours
FROM "User" u
JOIN "Ticket" t ON t."assignedToId" = u.id
GROUP BY u.id, u.name, u.role
ORDER BY resolved DESC;

-- 3.4 Блок «Требует внимания»: открытые заявки без исполнителя
SELECT id, title, priority, "createdAt"
FROM "Ticket"
WHERE status IN ('NEW', 'IN_PROGRESS', 'WAITING') AND "assignedToId" IS NULL
ORDER BY priority DESC, "createdAt"
LIMIT 5;

-- 3.5 Центр поддержки = таблица SupportRequest: жалобы и вопросы вместе с заявкой и людьми
--     Это ровно то, что администратор видит на странице «Центр поддержки».
--     (чтобы были строки, отправьте заявку кнопкой «Отправить в центр поддержки»)
SELECT 'SR-' || lpad(sr.id::text, 4, '0') AS request, sr.type, sr.status,
       author.name AS author, 'SD-' || lpad(t.id::text, 4, '0') AS ticket, t.title,
       left(sr.message, 60) AS message,
       COALESCE(admin.name, '—') AS handled_by, sr.response, sr."createdAt"
FROM "SupportRequest" sr
JOIN "Ticket" t ON t.id = sr."ticketId"
JOIN "User" author ON author.id = sr."authorId"
LEFT JOIN "User" admin ON admin.id = sr."handledById"
ORDER BY sr.status, sr."createdAt";

-- 3.6 Сколько жалоб, вопросов и претензий к качеству — по статусам (счётчики на странице)
SELECT type, status, COUNT(*) AS requests
FROM "SupportRequest"
GROUP BY type, status
ORDER BY type, status;


-- ============================================================
-- 4. Права доступа: каждая роль получает свой WHERE
--    (lib/policies.js → ticketScope; сервер добавляет его к каждому запросу)
-- ============================================================

-- 4.1 Сотрудник видит только свои заявки: WHERE "createdById" = текущий пользователь
SELECT COUNT(*) AS employee_sees
FROM "Ticket"
WHERE "createdById" = (SELECT id FROM "User" WHERE role = 'EMPLOYEE' ORDER BY "createdAt" LIMIT 1);

-- 4.2 Исполнитель видит назначенные ему и созданные им заявки
SELECT COUNT(*) AS agent_sees
FROM "Ticket"
WHERE "assignedToId" = (SELECT id FROM "User" WHERE role = 'AGENT' ORDER BY "createdAt" LIMIT 1)
   OR "createdById" = (SELECT id FROM "User" WHERE role = 'AGENT' ORDER BY "createdAt" LIMIT 1);

-- 4.3 Администратор видит все заявки (без ограничения WHERE)
SELECT COUNT(*) AS admin_sees FROM "Ticket";


-- ============================================================
-- 5. Целостность: база сама не пускает неправильные данные.
--    Каждый запрос ДОЛЖЕН завершиться ошибкой — так доказывается защита.
--    Запускайте по одному.
-- ============================================================

-- 5.1 Внешний ключ: заявка с несуществующей категорией
--     Ожидаемая ошибка: violates foreign key constraint "Ticket_categoryId_fkey"
INSERT INTO "Ticket" (title, description, "categoryId", "createdById", "updatedAt")
VALUES ('Проверка', 'Категории с таким id не существует', 'no-such-category',
        (SELECT id FROM "User" ORDER BY "createdAt" LIMIT 1), now());

-- 5.2 Уникальность: второй пользователь с уже занятым email
--     Ожидаемая ошибка: duplicate key value violates unique constraint "User_email_key"
INSERT INTO "User" (id, name, email, "passwordHash", role)
SELECT 'demo-duplicate', 'Дубликат', email, 'not-a-real-hash', 'EMPLOYEE'
FROM "User" ORDER BY "createdAt" LIMIT 1;

-- 5.3 ENUM: статус, которого нет в списке допустимых
--     Ожидаемая ошибка: invalid input value for enum "TicketStatus": "DONE"
UPDATE "Ticket" SET status = 'DONE'
WHERE id = (SELECT MIN(id) FROM "Ticket");

-- 5.4 Длина поля: название заявки длиннее 160 символов
--     Ожидаемая ошибка: value too long for type character varying(160)
UPDATE "Ticket" SET title = repeat('x', 161)
WHERE id = (SELECT MIN(id) FROM "Ticket");

-- 5.5 NOT NULL: категория без названия
--     Ожидаемая ошибка: null value in column "name" ... violates not-null constraint
INSERT INTO "Category" (id, name) VALUES ('demo-empty', NULL);

-- 5.5b ENUM: тип обращения, которого нет в списке
--     Ожидаемая ошибка: invalid input value for enum "SupportRequestType": "SPAM"
INSERT INTO "SupportRequest" ("ticketId", "authorId", type, message, "updatedAt")
SELECT t.id, t."createdById", 'SPAM', 'Проверка типа обращения', now()
FROM "Ticket" t ORDER BY t.id LIMIT 1;

-- 5.6 ON DELETE RESTRICT: удалить категорию, в которой есть заявки
--     Ожидаемая ошибка: update or delete on table "Category" violates foreign key constraint
DELETE FROM "Category"
WHERE id = (SELECT "categoryId" FROM "Ticket" ORDER BY id LIMIT 1);


-- ============================================================
-- 6. Живая проверка вместе с приложением
-- ============================================================

-- 6.1 Создайте в приложении заявку с названием «Демо защиты», затем выполните:
SELECT t.id, t.title, t.status, t.priority, c.name AS category,
       u.name AS author, t."createdAt", t."updatedAt", t."resolvedAt"
FROM "Ticket" t
JOIN "Category" c ON c.id = t."categoryId"
JOIN "User" u ON u.id = t."createdById"
WHERE t.title ILIKE '%Демо защиты%'
ORDER BY t.id DESC;

-- 6.2 Поменяйте статус на «Решена» и снова выполните 6.1:
--     заполнится "resolvedAt", обновится "updatedAt".
-- 6.3 Добавьте комментарий и проверьте его в таблице Comment:
SELECT cm.content, u.name AS author, cm."createdAt"
FROM "Comment" cm
JOIN "User" u ON u.id = cm."authorId"
WHERE cm."ticketId" = (SELECT MAX(id) FROM "Ticket" WHERE title ILIKE '%Демо защиты%');

-- 6.4 ON DELETE CASCADE: удалите эту заявку в приложении (корзина в карточке)
--     и повторите 6.3 — комментариев удалённой заявки больше нет, они удалены вместе с ней.
