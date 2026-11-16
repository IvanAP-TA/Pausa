-- Pausa · local seed: one Cerchia ("Divano Club"), four friends, a realistic week of logs.
-- Apply with: npm run db:seed:local   (or npm run db:reset:local to start clean)
-- Sign in locally as any seed user with the email link: giulia@pausa.test, marco@pausa.test,
-- sofi@pausa.test, luca@pausa.test. The link is printed in the `npm run dev` terminal.
-- TMDB ids and posters are left empty on purpose: they get filled when TMDB sync runs with a real key.

PRAGMA foreign_keys = ON;

-- ── Users ──
INSERT INTO user (id, name, email, email_verified, is_anonymous, locale) VALUES
  ('u-giulia', 'Giulia', 'giulia@pausa.test', 1, 0, 'it'),
  ('u-marco',  'Marco',  'marco@pausa.test',  1, 0, 'it'),
  ('u-sofi',   'Sofi',   'sofi@pausa.test',   1, 0, 'es'),
  ('u-luca',   'Luca',   'luca@pausa.test',   1, 0, 'en');

-- ── Cerchia ──
INSERT INTO circle (id, name, invite_code, created_by) VALUES
  ('c-divano', 'Divano Club', 'DIVANO24', 'u-giulia');

INSERT INTO circle_member (circle_id, user_id, role, joined_at) VALUES
  ('c-divano', 'u-giulia', 'admin',  (unixepoch() - 86400 * 60) * 1000),
  ('c-divano', 'u-marco',  'member', (unixepoch() - 86400 * 59) * 1000),
  ('c-divano', 'u-sofi',   'member', (unixepoch() - 86400 * 40) * 1000),
  ('c-divano', 'u-luca',   'member', (unixepoch() - 86400 * 12) * 1000);

-- ── Media (canonical) ──
INSERT INTO media_entity (id, kind, original_title, year, runtime_min) VALUES
  ('m-pastlives', 'movie', 'Past Lives', 2023, 106),
  ('m-anatomy',   'movie', 'Anatomie d''une chute', 2023, 151),
  ('m-spirited',  'movie', '千と千尋の神隠し', 2001, 125),
  ('m-dune2',     'movie', 'Dune: Part Two', 2024, 166),
  ('m-perfect',   'movie', 'Perfect Days', 2023, 124),
  ('m-aftersun',  'movie', 'Aftersun', 2022, 102),
  ('m-bear',      'tv',    'The Bear', 2022, 30),
  ('m-frieren',   'anime', '葬送のフリーレン', 2023, 24);

-- Localized titles (as TMDB returns them per language)
INSERT INTO media_title (media_id, locale, title) VALUES
  ('m-pastlives', 'it', 'Past Lives'), ('m-pastlives', 'en', 'Past Lives'), ('m-pastlives', 'es', 'Vidas pasadas'),
  ('m-anatomy', 'it', 'Anatomia di una caduta'), ('m-anatomy', 'en', 'Anatomy of a Fall'), ('m-anatomy', 'es', 'Anatomía de una caída'),
  ('m-spirited', 'it', 'La città incantata'), ('m-spirited', 'en', 'Spirited Away'), ('m-spirited', 'es', 'El viaje de Chihiro'),
  ('m-dune2', 'it', 'Dune - Parte due'), ('m-dune2', 'en', 'Dune: Part Two'), ('m-dune2', 'es', 'Dune: Parte dos'),
  ('m-perfect', 'it', 'Perfect Days'), ('m-perfect', 'en', 'Perfect Days'), ('m-perfect', 'es', 'Perfect Days'),
  ('m-aftersun', 'it', 'Aftersun'), ('m-aftersun', 'en', 'Aftersun'), ('m-aftersun', 'es', 'Aftersun'),
  ('m-bear', 'it', 'The Bear'), ('m-bear', 'en', 'The Bear'), ('m-bear', 'es', 'The Bear'),
  ('m-frieren', 'it', 'Frieren - Oltre la fine del viaggio'), ('m-frieren', 'en', 'Frieren: Beyond Journey''s End'), ('m-frieren', 'es', 'Frieren: Más allá del final del viaje');

-- ── Diario ── (rating in half stars: 9 = 4.5★)
INSERT INTO log (id, user_id, media_id, watched_on, rating, review, contains_spoilers, platform, is_rewatch, created_at) VALUES
  ('l-1', 'u-giulia', 'm-pastlives', date('now', '-0 day'), 9,
   'Ho pianto in silenzio per venti minuti. Marco ha fatto finta di niente.', 0, 'MUBI', 0, (unixepoch() - 7200) * 1000),
  ('l-2', 'u-marco', 'm-anatomy', date('now', '-1 day'), 8,
   'Il finale in tribunale non risponde a niente, ed è proprio quello il punto.', 1, 'Prime Video', 0, (unixepoch() - 86400) * 1000),
  ('l-3', 'u-sofi', 'm-perfect', date('now', '-2 day'), 10,
   'Quiero vivir como Hirayama. Bueno, quizá con menos baños públicos.', 0, 'Filmin', 0, (unixepoch() - 86400 * 2) * 1000),
  ('l-4', 'u-luca', 'm-dune2', date('now', '-3 day'), 7,
   'Looked incredible on the big screen. Still not sure what Feyd-Rautha wanted.', 0, 'Cinema', 0, (unixepoch() - 86400 * 3) * 1000),
  ('l-5', 'u-giulia', 'm-aftersun', date('now', '-6 day'), 9,
   NULL, 0, 'MUBI', 1, (unixepoch() - 86400 * 6) * 1000),
  ('l-6', 'u-marco', 'm-spirited', date('now', '-9 day'), 10,
   'Terza volta. Senza Facce resta il migliore.', 0, 'Netflix', 1, (unixepoch() - 86400 * 9) * 1000);

INSERT INTO log_watched_with (log_id, user_id) VALUES
  ('l-1', 'u-marco'), ('l-1', 'u-luca'),
  ('l-4', 'u-marco'), ('l-4', 'u-sofi'),
  ('l-6', 'u-giulia');

INSERT INTO reaction (log_id, user_id, emoji) VALUES
  ('l-1', 'u-marco', '😭'), ('l-1', 'u-sofi', '😭'), ('l-1', 'u-luca', '😭'), ('l-1', 'u-sofi', '🍿'),
  ('l-3', 'u-giulia', '❤️'), ('l-3', 'u-marco', '❤️'),
  ('l-4', 'u-giulia', '🍿');

INSERT INTO comment (id, log_id, user_id, body, is_spoiler, created_at) VALUES
  ('k-1', 'l-1', 'u-marco', 'Non ho fatto finta di niente, avevo qualcosa nell''occhio.', 0, (unixepoch() - 6000) * 1000),
  ('k-2', 'l-2', 'u-giulia', 'Per me è stata lei. Fine della discussione.', 1, (unixepoch() - 80000) * 1000);

-- ── Sto guardando… ──
INSERT INTO now_watching (user_id, media_id, progress, updated_at) VALUES
  ('u-sofi', 'm-bear', 'S3·E4', (unixepoch() - 1800) * 1000),
  ('u-luca', 'm-frieren', 'E12', (unixepoch() - 86400) * 1000);

-- ── Liste ──
INSERT INTO list (id, circle_id, owner_id, kind, name, description) VALUES
  ('li-watch', 'c-divano', 'u-giulia', 'watchlist', 'Watchlist del Divano', 'Quello che diciamo sempre di guardare.'),
  ('li-top',   'c-divano', 'u-marco',  'ranking',   'Top 5 del 2023', NULL);

INSERT INTO list_item (list_id, media_id, position, added_by) VALUES
  ('li-watch', 'm-frieren', 0, 'u-luca'),
  ('li-watch', 'm-bear', 1, 'u-sofi'),
  ('li-watch', 'm-dune2', 2, 'u-marco'),
  ('li-top', 'm-pastlives', 0, 'u-marco'),
  ('li-top', 'm-anatomy', 1, 'u-marco'),
  ('li-top', 'm-perfect', 2, 'u-marco'),
  ('li-top', 'm-aftersun', 3, 'u-marco');
