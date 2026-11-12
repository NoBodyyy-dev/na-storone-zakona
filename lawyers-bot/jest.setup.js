// Тестам не нужен настоящий .env: конфиг читается при импорте, поэтому подставляем заглушки.
process.env.BOT_TOKEN ||= '0:test';
process.env.DATABASE_URL ||= 'postgres://test:test@localhost:5432/test';
process.env.NODE_ENV ||= 'test';
