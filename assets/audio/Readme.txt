AQUATIC HAVOC — AUDIO SETTINGS
==============================
Every game sound is a replaceable file in this folder.
To reskin a sound: drop your own .mp3/.ogg/.wav with the SAME base name
(e.g. replace thunder.wav with your own thunder.mp3) and reload the game.
The loader prefers .mp3, then .ogg, then .wav. Files listed below marked
(custom kept) are never overwritten by `npm run gen-audio` — new files only
fill in missing slots. `npm run gen-audio -- --force` regenerates everything.

FILENAME              IN-GAME USE
--------              -----------
roar.wav              fish roar ( hooked fights )
boss_roar.wav         boss war-horn arrival
boss_theme.wav        boss battle music loop
music_loop.wav        tide ambient music loop
coin.wav              coins / shop buy
hit.wav               bullet hits
ui_click.wav          UI clicks
uihover.wav           button hover ticks
portal.wav            teleports / gates / rifts
bell.wav              abyssal bells (priest arrival)
thunder.wav           lightning / storms
explosion.wav         blasts / breaches
splash.wav            water splashes
cast.wav              rod cast whistle
snap.wav              line snap
beach.wav             beaching a catch
levelup.wav           level-up arp
reeltick.wav          reel crank ticks
tensionstress.wav     line-tension warning whine
fishscreech.wav       fish screech
whoosh.wav            dashes / lunges
bubble.wav            underwater blips
icecrack.wav          freeze shatters
hurt.wav              player takes damage
fishdeath.wav         fish death wail
bosskilled.wav        boss kill fanfare
victory.wav           catch victory arp
savesuccess.wav       save confirm
error.wav             UI error buzz
skill_cast.wav        skill charge-up
skill_zap.wav         electric skills
skill_blast.wav       heavy skill blasts
throw.wav             bobber throw (alias: cast)
water_touch.wav       bobber water touch (alias: splash)
reload.wav            gun reload
gun_pistol.wav        pistol-family shots
gun_shotgun.wav       shotgun-family shots
gun_rifle.wav         rifle-family shots
gun_harpoon.wav       harpoon-family shots
gun_smg.wav           smg-family shots
gun_rail.wav          rail/sniper-family shots
gun_plasma.wav        plasma-family shots
gun_flame.wav         flame-family shots
gun_launcher.wav      launcher/rocket-family shots
dash.*                dash (Q) — same slot as whoosh, tried first
sacrifice.wav         blood sacrifice merge
theme_cave.wav        Hollow Cave ambient loop
theme_temple.wav      Void Shrine ambient loop
theme_isle.wav        wild isles ambient loop
(manifest.json)       extension map so the loader never 404-probes.
                      REGENERATE after swapping formats:
                      npm run gen-audio-manifest
                      (the loader also falls back across extensions, so a
                      stale manifest only costs one extra probe, never silence)
