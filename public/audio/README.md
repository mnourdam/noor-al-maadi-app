# Irth Audio Files

Drop the following audio files here. They are loaded by `src/lib/audioManager.ts`
and served from `/audio/*`. If any file is missing the app degrades silently
(a single console warning, no crash).

Expected files:

| Filename                      | Purpose                                          |
|-------------------------------|--------------------------------------------------|
| irth-ambience.mp3             | Soft looping background ambience                 |
| success-soft.mp3              | Played on a correct answer / activity success    |
| chapter-complete.mp3          | Played the first time a chapter is completed     |
| campaign-complete.mp3         | Played the first time a campaign is completed   |
| unlock-reward.mp3             | Played when a museum / collection item reveals   |

Recommended: short (< 2s) gentle SFX, normalized around -14 LUFS.
Ambience: 30-90s seamless loop.
