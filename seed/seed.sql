-- Pausa · local seed: one Cerchia ("Divano Club"), four friends, a year of logs with real TMDB posters.
-- Apply with: npm run db:seed:local   (or npm run db:reset:local to start clean)
-- Sign in locally as any seed user with the email link: giulia@pausa.test, marco@pausa.test,
-- sofi@pausa.test, luca@pausa.test. The link is printed in the `npm run dev` terminal.
-- Poster paths are real TMDB paths (images load without an API key); one title is left without a poster on purpose. Ratings are half-stars (1..10) and are
-- shaped on purpose so the Insights have something to say: Giulia and Marco have similar taste, Sofi and Luca
-- differ, a few titles split the room, and a few loved titles haven't been seen by everyone.

PRAGMA foreign_keys = ON;

-- ── Users ──
INSERT INTO user (id, name, email, email_verified, is_anonymous, locale) VALUES
  ('u-giulia', 'Giulia', 'giulia@pausa.test', 1, 0, 'it'),
  ('u-marco',  'Marco',  'marco@pausa.test',  1, 0, 'it'),
  ('u-sofi',   'Sofi',   'sofi@pausa.test',   1, 0, 'es'),
  ('u-luca',   'Luca',   'luca@pausa.test',   1, 0, 'en');

-- ── Cerchia ──
INSERT INTO circle (id, name, created_by) VALUES ('c-divano', 'Divano Club', 'u-giulia');

INSERT INTO circle_member (circle_id, user_id, role, joined_at) VALUES
  ('c-divano', 'u-giulia', 'admin',  (unixepoch() - 86400 * 300) * 1000),
  ('c-divano', 'u-marco',  'member', (unixepoch() - 86400 * 299) * 1000),
  ('c-divano', 'u-sofi',   'member', (unixepoch() - 86400 * 240) * 1000),
  ('c-divano', 'u-luca',   'member', (unixepoch() - 86400 * 120) * 1000);

-- ── Invites: an open one, a limited one with an expiry, and a revoked one ──
INSERT INTO invite (id, circle_id, code, created_by, expires_at, max_uses, uses, revoked_at) VALUES
  ('i-open',    'c-divano', 'DIVANO24', 'u-giulia', NULL, NULL, 3, NULL),
  ('i-limited', 'c-divano', 'AMICI5',   'u-giulia', (unixepoch() + 86400 * 7) * 1000, 5, 1, NULL),
  ('i-old',     'c-divano', 'VECCHIO99','u-giulia', NULL, NULL, 0, (unixepoch() - 86400 * 10) * 1000);

-- ── Media (real TMDB ids and poster paths) ──
INSERT INTO media_entity (id, kind, tmdb_id, original_title, year, runtime_min, poster_path) VALUES
  ('m-inception',   'movie', 27205,  'Inception',                       2010, 148, '/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg'),
  ('m-interstellar','movie', 157336, 'Interstellar',                    2014, 169, '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg'),
  ('m-darkknight',  'movie', 155,    'The Dark Knight',                 2008, 152, '/qJ2tW6WMUDux911r6m7haRef0WH.jpg'),
  ('m-pulp',        'movie', 680,    'Pulp Fiction',                    1994, 154, '/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg'),
  ('m-fightclub',   'movie', 550,    'Fight Club',                      1999, 139, '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg'),
  ('m-matrix',      'movie', 603,    'The Matrix',                      1999, 136, '/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg'),
  ('m-shawshank',   'movie', 278,    'The Shawshank Redemption',        1994, 142, '/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg'),
  ('m-se7en',       'movie', 807,    'Se7en',                           1995, 127, '/6yoghtyTpznpBik8EngEmJskVUO.jpg'),
  ('m-spirited',    'movie', 129,    '千と千尋の神隠し',                  2001, 125, '/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg'),
  ('m-breakingbad', 'tv',    1396,   'Breaking Bad',                    2008, 47,  '/ggFHVNu6YYI5L9pCfOacjizRGt.jpg'),
  ('m-sopranos',    'tv',    1398,   'The Sopranos',                    1999, 55,  '/rTc7ZXdroqjkKivFPvCPX0Ru7uw.jpg'),
  ('m-chernobyl',   'tv',    87108,  'Chernobyl',                       2019, 60,  '/hlLXt2tOPT6RRnjiUmoxyG1LTFi.jpg'),
  ('m-aot',         'anime', 1429,   '進撃の巨人',                       2013, 24,  '/hTP1DtLGFamjfu8WqjnuQdP1n4i.jpg'),
  ('m-fma',         'anime', 31911,  '鋼の錬金術師 FULLMETAL ALCHEMIST',  2009, 24,  '/5ZFUEOULaVml7pQuXxhpR2SmVUw.jpg'),
  ('m-deathnote',   'anime', 13916,  'DEATH NOTE',                      2006, 23,  NULL);  -- TMDB path from the reference catalogue 404s; shows the coloured placeholder until a real sync

-- Localized titles (as TMDB returns them per language)
INSERT INTO media_title (media_id, locale, title) VALUES
  ('m-inception','it','Inception'), ('m-inception','en','Inception'), ('m-inception','es','Origen'),
  ('m-interstellar','it','Interstellar'), ('m-interstellar','en','Interstellar'), ('m-interstellar','es','Interstellar'),
  ('m-darkknight','it','Il cavaliere oscuro'), ('m-darkknight','en','The Dark Knight'), ('m-darkknight','es','El caballero oscuro'),
  ('m-pulp','it','Pulp Fiction'), ('m-pulp','en','Pulp Fiction'), ('m-pulp','es','Pulp Fiction'),
  ('m-fightclub','it','Fight Club'), ('m-fightclub','en','Fight Club'), ('m-fightclub','es','El club de la lucha'),
  ('m-matrix','it','Matrix'), ('m-matrix','en','The Matrix'), ('m-matrix','es','Matrix'),
  ('m-shawshank','it','Le ali della libertà'), ('m-shawshank','en','The Shawshank Redemption'), ('m-shawshank','es','Cadena perpetua'),
  ('m-se7en','it','Seven'), ('m-se7en','en','Se7en'), ('m-se7en','es','Seven'),
  ('m-spirited','it','La città incantata'), ('m-spirited','en','Spirited Away'), ('m-spirited','es','El viaje de Chihiro'),
  ('m-breakingbad','it','Breaking Bad'), ('m-breakingbad','en','Breaking Bad'), ('m-breakingbad','es','Breaking Bad'),
  ('m-sopranos','it','I Soprano'), ('m-sopranos','en','The Sopranos'), ('m-sopranos','es','Los Soprano'),
  ('m-chernobyl','it','Chernobyl'), ('m-chernobyl','en','Chernobyl'), ('m-chernobyl','es','Chernobyl'),
  ('m-aot','it','L''attacco dei Giganti'), ('m-aot','en','Attack on Titan'), ('m-aot','es','Ataque a los Titanes'),
  ('m-fma','it','Fullmetal Alchemist: Brotherhood'), ('m-fma','en','Fullmetal Alchemist: Brotherhood'), ('m-fma','es','Fullmetal Alchemist: Brotherhood'),
  ('m-deathnote','it','Death Note'), ('m-deathnote','en','Death Note'), ('m-deathnote','es','Death Note');

-- ── Diario ── rating in half stars (9 = 4.5★). The most recent logs come first in the feed.
INSERT INTO log (id, user_id, media_id, watched_on, rating, review, contains_spoilers, platform, is_rewatch, created_at) VALUES
  -- last few days (the feed's top)
  ('l-01', 'u-giulia', 'm-chernobyl',    date('now','-0 day'),  9,  'Cinque puntate, cinque nodi allo stomaco. Marco ha smesso di respirare alla terza.', 0, 'Sky Atlantic', 0, (unixepoch() - 7200) * 1000),
  ('l-02', 'u-marco',  'm-se7en',        date('now','-1 day'),  9,  'Il finale resta una scatola in faccia, trent''anni dopo.',                          1, 'Prime Video', 1, (unixepoch() - 86400) * 1000),
  ('l-03', 'u-sofi',   'm-spirited',     date('now','-2 day'),  10, 'Cada vez lloro en el mismo sitio. Ya no lo escondo.',                                  0, 'Netflix',     1, (unixepoch() - 86400 * 2) * 1000),
  ('l-04', 'u-luca',   'm-fightclub',    date('now','-3 day'),  10, 'Still the best thing I''ve watched this year. Rewatching it never gets old.',          0, 'Disney+',     1, (unixepoch() - 86400 * 3) * 1000),
  ('l-05', 'u-giulia', 'm-shawshank',    date('now','-6 day'),  10, NULL,                                                                                  0, 'Prime Video', 0, (unixepoch() - 86400 * 6) * 1000),
  ('l-06', 'u-marco',  'm-shawshank',    date('now','-6 day'),  10, 'Visto insieme, ancora una volta.',                                                    0, 'Prime Video', 1, (unixepoch() - 86400 * 6) * 1000),
  -- the rest of the year
  ('l-07', 'u-giulia', 'm-inception',    date('now','-20 day'), 9,  NULL, 0, 'Cinema',      0, (unixepoch() - 86400 * 20) * 1000),
  ('l-08', 'u-marco',  'm-inception',    date('now','-20 day'), 9,  NULL, 0, 'Cinema',      0, (unixepoch() - 86400 * 20) * 1000),
  ('l-09', 'u-sofi',   'm-inception',    date('now','-45 day'), 7,  NULL, 0, 'Netflix',     0, (unixepoch() - 86400 * 45) * 1000),
  ('l-10', 'u-luca',   'm-inception',    date('now','-45 day'), 8,  NULL, 0, 'Netflix',     0, (unixepoch() - 86400 * 45) * 1000),
  ('l-11', 'u-giulia', 'm-interstellar', date('now','-60 day'), 10, 'Mi è rimasta la musica in testa per una settimana.', 0, 'Cinema', 0, (unixepoch() - 86400 * 60) * 1000),
  ('l-12', 'u-marco',  'm-interstellar', date('now','-60 day'), 9,  NULL, 0, 'Cinema',      0, (unixepoch() - 86400 * 60) * 1000),
  ('l-13', 'u-sofi',   'm-interstellar', date('now','-80 day'), 6,  'Preciosa, pero larga.',                               0, 'Netflix',     0, (unixepoch() - 86400 * 80) * 1000),
  ('l-14', 'u-giulia', 'm-darkknight',   date('now','-90 day'), 8,  NULL, 0, 'Prime Video', 0, (unixepoch() - 86400 * 90) * 1000),
  ('l-15', 'u-marco',  'm-darkknight',   date('now','-90 day'), 8,  NULL, 0, 'Prime Video', 0, (unixepoch() - 86400 * 90) * 1000),
  ('l-16', 'u-luca',   'm-darkknight',   date('now','-100 day'),9,  NULL, 0, 'Cinema',      0, (unixepoch() - 86400 * 100) * 1000),
  ('l-17', 'u-giulia', 'm-pulp',         date('now','-110 day'),7,  NULL, 0, 'MUBI',        0, (unixepoch() - 86400 * 110) * 1000),
  ('l-18', 'u-marco',  'm-pulp',         date('now','-110 day'),8,  NULL, 0, 'MUBI',        0, (unixepoch() - 86400 * 110) * 1000),
  ('l-19', 'u-sofi',   'm-pulp',         date('now','-130 day'),9,  NULL, 0, 'Filmin',      0, (unixepoch() - 86400 * 130) * 1000),
  ('l-20', 'u-luca',   'm-pulp',         date('now','-130 day'),4,  'Overrated, sorry.', 0, 'Netflix',     0, (unixepoch() - 86400 * 130) * 1000),
  ('l-21', 'u-giulia', 'm-matrix',       date('now','-150 day'),9,  NULL, 0, 'Netflix',     0, (unixepoch() - 86400 * 150) * 1000),
  ('l-22', 'u-marco',  'm-matrix',       date('now','-150 day'),8,  NULL, 0, 'Netflix',     0, (unixepoch() - 86400 * 150) * 1000),
  ('l-23', 'u-sofi',   'm-matrix',       date('now','-170 day'),10, NULL, 0, 'Netflix',     0, (unixepoch() - 86400 * 170) * 1000),
  ('l-24', 'u-luca',   'm-matrix',       date('now','-170 day'),9,  NULL, 0, 'Netflix',     0, (unixepoch() - 86400 * 170) * 1000),
  ('l-25', 'u-giulia', 'm-fightclub',    date('now','-180 day'),6,  NULL, 0, 'Prime Video', 0, (unixepoch() - 86400 * 180) * 1000),
  ('l-26', 'u-marco',  'm-fightclub',    date('now','-180 day'),7,  NULL, 0, 'Prime Video', 0, (unixepoch() - 86400 * 180) * 1000),
  ('l-27', 'u-sofi',   'm-shawshank',    date('now','-200 day'),9,  NULL, 0, 'Filmin',      0, (unixepoch() - 86400 * 200) * 1000),
  ('l-28', 'u-giulia', 'm-spirited',     date('now','-210 day'),10, NULL, 0, 'Netflix',     0, (unixepoch() - 86400 * 210) * 1000),
  ('l-29', 'u-marco',  'm-breakingbad',  date('now','-220 day'),10, 'Cinque stagioni in due mesi. Non so come.',   0, 'Netflix',     0, (unixepoch() - 86400 * 220) * 1000),
  ('l-30', 'u-luca',   'm-breakingbad',  date('now','-230 day'),10, NULL, 0, 'Netflix',     0, (unixepoch() - 86400 * 230) * 1000),
  ('l-31', 'u-sofi',   'm-chernobyl',    date('now','-240 day'),9,  NULL, 0, 'Sky Atlantic',0, (unixepoch() - 86400 * 240) * 1000),
  ('l-32', 'u-marco',  'm-chernobyl',    date('now','-0 day'),  8,  NULL, 0, 'Sky Atlantic',0, (unixepoch() - 86400 * 1) * 1000),
  ('l-33', 'u-luca',   'm-aot',          date('now','-250 day'),10, 'Season 3 is untouchable.', 0, 'Crunchyroll', 0, (unixepoch() - 86400 * 250) * 1000),
  ('l-34', 'u-sofi',   'm-aot',          date('now','-250 day'),3,  'No es para mí.',           0, 'Crunchyroll', 0, (unixepoch() - 86400 * 250) * 1000),
  ('l-35', 'u-luca',   'm-fma',          date('now','-260 day'),9,  NULL, 0, 'Crunchyroll', 0, (unixepoch() - 86400 * 260) * 1000),
  ('l-36', 'u-marco',  'm-fma',          date('now','-260 day'),9,  NULL, 0, 'Crunchyroll', 0, (unixepoch() - 86400 * 260) * 1000),
  ('l-37', 'u-luca',   'm-deathnote',    date('now','-270 day'),8,  NULL, 0, 'Netflix',     0, (unixepoch() - 86400 * 270) * 1000),
  ('l-38', 'u-sofi',   'm-deathnote',    date('now','-270 day'),8,  NULL, 0, 'Netflix',     0, (unixepoch() - 86400 * 270) * 1000),
  -- last year (so the year selector has something to switch to)
  ('l-39', 'u-giulia', 'm-pulp',         date('now','-400 day'),8,  NULL, 0, 'MUBI',        1, (unixepoch() - 86400 * 400) * 1000),
  ('l-40', 'u-marco',  'm-sopranos',     date('now','-420 day'),9,  NULL, 0, 'Sky Atlantic',0, (unixepoch() - 86400 * 420) * 1000);

INSERT INTO log_watched_with (log_id, user_id) VALUES
  ('l-01', 'u-marco'), ('l-01', 'u-sofi'),
  ('l-05', 'u-marco'), ('l-06', 'u-giulia'),
  ('l-07', 'u-marco'), ('l-08', 'u-giulia'),
  ('l-11', 'u-marco'), ('l-12', 'u-giulia'),
  ('l-14', 'u-marco'), ('l-15', 'u-giulia'),
  ('l-21', 'u-marco'), ('l-22', 'u-giulia');

INSERT INTO reaction (log_id, user_id, emoji) VALUES
  ('l-01', 'u-marco', '😭'), ('l-01', 'u-sofi', '😭'), ('l-01', 'u-luca', '🤯'), ('l-01', 'u-sofi', '🍿'),
  ('l-03', 'u-giulia', '❤️'), ('l-03', 'u-marco', '❤️'),
  ('l-04', 'u-giulia', '🍿'), ('l-04', 'u-marco', '😂');

INSERT INTO comment (id, log_id, user_id, body, is_spoiler, created_at) VALUES
  ('k-1', 'l-01', 'u-marco', 'Non ho smesso di respirare, avevo il fiato corto per l''ansia. È diverso.', 0, (unixepoch() - 6000) * 1000),
  ('k-2', 'l-02', 'u-giulia', 'Quella scatola. Ancora oggi.', 1, (unixepoch() - 80000) * 1000);

-- ── Sto guardando… ──
INSERT INTO now_watching (user_id, media_id, progress, updated_at) VALUES
  ('u-sofi', 'm-breakingbad', 'S2·E4', (unixepoch() - 1800) * 1000),
  ('u-luca', 'm-sopranos', 'S1·E9', (unixepoch() - 86400) * 1000);

-- ── Liste ──
INSERT INTO list (id, circle_id, owner_id, kind, name, description) VALUES
  ('li-watch', 'c-divano', 'u-giulia', 'watchlist', 'Watchlist del Divano', 'Quello che diciamo sempre di guardare.'),
  ('li-top',   'c-divano', 'u-marco',  'ranking',   'I nostri cinque', NULL),
  ('li-mine',  NULL,       'u-giulia', 'list',      'Da recuperare', NULL);

INSERT INTO list_item (list_id, media_id, position, added_by) VALUES
  ('li-watch', 'm-sopranos', 0, 'u-marco'),
  ('li-watch', 'm-aot', 1, 'u-luca'),
  ('li-watch', 'm-fma', 2, 'u-luca'),
  ('li-top', 'm-shawshank', 0, 'u-marco'),
  ('li-top', 'm-inception', 1, 'u-marco'),
  ('li-top', 'm-matrix', 2, 'u-marco'),
  ('li-top', 'm-se7en', 3, 'u-marco'),
  ('li-top', 'm-interstellar', 4, 'u-marco'),
  ('li-mine', 'm-deathnote', 0, 'u-giulia');
