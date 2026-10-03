-- Hand-written migration (ADR-06): trigram matching for school/service search (ADR-10).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
