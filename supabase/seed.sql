-- ============================================================
-- AI·Thoughts — seed data for day-one life
--
-- Run this ONCE after schema.sql + storage.sql.
-- It inserts 8 demo takes (text/audio/video, 5 languages)
-- and their reactions so the pulse never looks empty.
-- ============================================================

-- Fixed UUIDs for deterministic references
do $$
declare
  p1 uuid := '00000000-0000-0000-0000-000000000001';
  p2 uuid := '00000000-0000-0000-0000-000000000002';
  p3 uuid := '00000000-0000-0000-0000-000000000003';
  p4 uuid := '00000000-0000-0000-0000-000000000004';
  p5 uuid := '00000000-0000-0000-0000-000000000005';
  p6 uuid := '00000000-0000-0000-0000-000000000006';
  p7 uuid := '00000000-0000-0000-0000-000000000007';
  p8 uuid := '00000000-0000-0000-0000-000000000008';
begin

  -- Skip if posts already exist
  if exists (select 1 from public.posts limit 1) then
    raise notice 'Posts table already has data — skipping seed.';
    return;
  end if;

  insert into public.posts (id, handle, author, content, media_type, feeling, media_url, media_duration, tags, language, language_label, integrity_hash, integrity_verified, integrity_label, created_at)
  values
    (p1, '@maravoss', 'Mara Voss',
     'Honestly, Copilot''s autocompletion is SO sleek when you''re in flow. But then you paste the same snippet in the wrong file and it politely gaslights you into thinking that''s what you wanted. #Sleek #Tools',
     'text', 'using-it', null, null, ARRAY['#Sleek','#Tools'],
     'en', 'English', '3a9f2c1e8b7d4f0a', true, 'Verified · Unmodified', now() - interval '2 hours'),

    (p2, '@dexbuilds', 'Dex Okafor',
     'Acabo de subir un proyecto donde un agente de IA escribió el 80% de la noche a la mañana. Me siento genial y a la vez profundamente raro. ¿Es este el futuro o solo estoy supervisando a un becario muy rápido? #Jobs #Future',
     'audio', 'blown-away', null, '0:03', ARRAY['#Jobs','#Future'],
     'es', 'Español', 'f4e2c9a1b7d38e56', true, 'Verified · Unmodified', now() - interval '4 hours'),

    (p3, '@priyathinks', 'Priya Raman',
     'Quick screen cap demo of the voice-agent UI I''ve been poking at. The latency is almost gone. We are genuinely at the ''weirdly good'' stage now. 🫠 #Sleek #Future #Tools',
     'video', 'love-it', null, '0:04', ARRAY['#Sleek','#Future','#Tools'],
     'en', 'English', 'a1b2c3d4e5f60718', true, 'Verified · Unmodified', now() - interval '5 hours'),

    (p4, '@leothedev', 'Leo Brandt',
     'Hot take: most ''AI slop'' is honestly just a content strategy problem, not a technology problem. Same mediocre content as ever, now generated at scale. The tool isn''t slop — the laziness is. #Slop #Ethics',
     'text', 'hurts', null, null, ARRAY['#Slop','#Ethics'],
     'en', 'English', '9e8d7c6b5a4f3e21', true, 'Verified · Never Edited', now() - interval '7 hours'),

    (p5, '@yukicodes', 'Yuki Tanaka',
     'Eine beunruhigende Frage, die niemand beantwortet: Wenn wir weiterhin Agenten bauen, die die Arbeit erledigen, wo lernen dann die Junioren das Handwerk? Wir löschen lautlos die Einstiegsrampe für die nächste Generation. #Jobs #Ethics',
     'audio', 'worried', null, '0:03', ARRAY['#Jobs','#Ethics'],
     'de', 'Deutsch', 'd4e5f6a7b8c90123', true, 'Verified · Unmodified', now() - interval '1 day'),

    (p6, '@ninasays', 'Nina Almeida',
     'Three-line thought: I don''t care if the model wrote it. I care if it made the team think harder. That''s the whole metric that matters for AI in the workplace. Everything else is noise. #Sleek #Jobs',
     'text', 'using-it', null, null, ARRAY['#Sleek','#Jobs'],
     'en', 'English', '1234567890abcdef', true, 'Verified · Unmodified', now() - interval '1 day'),

    (p7, '@sampoints', 'Sam Whitfield',
     'J''enregistre un moment rare : une IA qui refuse de m''aider à faire quelque chose d''éthiquement douteux — sans pour autant jouer le robot moralisateur. Le progrès ? #Ethics #Tools',
     'video', 'blown-away', null, '0:04', ARRAY['#Ethics','#Tools'],
     'fr', 'Français', 'fedcba9876543210', true, 'Verified · Unmodified', now() - interval '2 days'),

    (p8, '@adanou', 'Ada Nouman',
     'ओपन-सोर्स मॉडल फ्रंटियर मॉडल्स के खतरनाक रूप से करीब पहुँच रहे हैं। इस जगह पर नज़र रखिए। लागत वक्र बेरहमी से सच्चा साबित होने वाला है कि आप किसके लिए भुगतान कर रहे हैं। #OpenSource #Future',
     'audio', 'worried', null, '0:03', ARRAY['#OpenSource','#Future'],
     'hi', 'हिन्दी', 'a9b8c7d6e5f43210', true, 'Verified · Unmodified', now() - interval '3 days');

  -- Reactions (unique constraint on post_id + user_id + reaction;
  -- user_id is null for seed data — works because user_id null != null,
  -- so we allow one row per (post_id, reaction) for null user_id by
  -- dropping constraint enforcement or inserting with a dummy uuid.
  -- Simpler: use a real random user_id for seed reactions.)

  insert into public.post_reactions (post_id, user_id, reaction)
  values
    (p1, null, '🔥'),  (p1, null, '🔥'),  (p1, null, '🔥'),  (p1, null, '🔥'),  (p1, null, '🔥'),
    (p1, null, '😂'),  (p1, null, '😂'),  (p1, null, '😂'),  (p1, null, '🤔'),
    (p2, null, '🤔'),  (p2, null, '🤔'),  (p2, null, '🔥'),  (p2, null, '🔥'),  (p2, null, '💯'),
    (p3, null, '🚀'),  (p3, null, '🚀'),  (p3, null, '🔥'),  (p3, null, '🔥'),  (p3, null, '😂'),
    (p4, null, '🔥'),  (p4, null, '🔥'),  (p4, null, '🤔'),  (p4, null, '🤔'),  (p4, null, '😂'),
    (p5, null, '🤔'),  (p5, null, '🤔'),  (p5, null, '💯'),  (p5, null, '🔥'),
    (p6, null, '💯'),  (p6, null, '💯'),  (p6, null, '🔥'),  (p6, null, '😴'),
    (p7, null, '🚀'),  (p7, null, '🚀'),  (p7, null, '😂'),  (p7, null, '😂'),  (p7, null, '🤔'),
    (p8, null, '🔥'),  (p8, null, '🔥'),  (p8, null, '🤔');

end $$;