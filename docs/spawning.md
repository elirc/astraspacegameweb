# Starting castles and the world frontier

New human and developer-created NPC accounts share one placement service. Existing holdings retain their coordinates. A durable PostgreSQL cursor advances through expanding shells of four-tile cells around the world center. Each shell is shuffled and each site is jittered using the world seed, so newcomers settle on every side instead of filling the old fifteen-column strip. This is Warband's implementation, not a reconstruction of another game's private server code.

Every new castle leaves at least one empty grid tile between it and existing holdings. Sites within four tiles on either axis of an owned holding worth more than eight times the starter score are skipped. This avoids immediate placement next to large strongholds; it is not immunity from attacks. The cursor advances only when a complete spawn commits and never rewinds after conquest, defeat or restarts.

Where fewer than two neutral targets exist within six tiles, the service adds up to two lightly defended ruined keeps, three to six tiles from the newcomer. It counts existing targets and respects spacing, bounds and occupied coordinates. Dense neighborhoods may have fewer new ruins when no safe sites remain. Existing neutral resources or defenders are never reset. Ruins are ordinary neutral holdings and use normal battle, plunder and conquest rules.

Placement uses the existing exclusive world transaction and indexed coordinate checks in batches. The player, starting castle, ruins, welcome report and frontier cursor commit together. Concurrent human/NPC joins cannot claim the same site. A rollback cannot consume a position or leave an orphan account. Searching is bounded to 8,192 candidate cells per join; a full or obstructed frontier returns an explicit 409 instead of scanning the entire world indefinitely. Reserved spacing means there can be unused tiles when no suitable starter site remains.

## Research and design choices

- **Original Tribal Wars:** InnoGames documents an expanding outer rim, partly randomized starting positions and world-dependent area/friend options. Its map is a continuous world divided into 100-by-100-cell continents. Sources: [official glossary](https://support-admin.innogames.de/kb/TribalWars/en_DK/1295?ls=1), [starting-position FAQ](https://support.innogames.com/kb/TribalWars/en_DK/5994/FAQ--Playing-With-Friends--Starting-Positions), [map guide](https://support.innogames.com/kb/TribalWars/en_DK/1208/What-is-the-Map).
- **Neutral targets:** Official Tribal Wars world settings tie barbarian creation to new joins, with ratios varying by world. Warband's local quota of two targets is our own balance choice. [Example official settings](https://ukc4.tribalwars.co.uk/page/settings).
- **Valor:** The original developer's Trial by Sword release notes describe smaller worlds, conquest of barbarian cities, zoomable maps and visible troop movement. They support concentrated territorial conflict, but do not establish a spawn spiral, region order or radius formula. The former official website, forum and help center were unavailable during research. [Original developer App Store listing](https://apps.apple.com/us/app/valor/id384844988).

The adopted principles are a compact inhabited core, randomized outward growth, local neutral targets and consistent human/NPC placement. Direction selection, friend relocation and exact historical spawn formulas are not part of this change.

## Map art

The map now depicts fortified stone keeps with battlements, gatehouses, torchlight and restrained ownership banners over dark woodland. Public point tiers determine fortress scale. Both Pixi and Canvas use the same original generated-in-code atlas, with shared textures, tile caching and culling. No Tribal Wars or Valor art assets were copied.

Graphics initialization has an eight-second deadline, including the initial animation frame. A slow or failed WebGL startup switches to the same Canvas artwork. A renderer that finishes after the deadline is disposed without replacing the working map. The fault-injection browser test holds the real renderer module request, then releases it and observes disposal of its late GPU context.
