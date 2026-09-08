# Missile summary normalization and preloaded topics

Updated 72 existing summaries after identifying 110 existing nonblank missile summaries before editing. Added 22 preloaded missile topics and 73 exact normalization/display rules. Left 38 existing topic summaries unchanged for review.

New topics cover selected air-combat, air-defence and naval anti-ship missiles. No transcript-use requirement was applied to preloads. The user-supplied Wikipedia lists were used for candidate coverage; the tables below retain specification sources. Existing slugs, titles, aliases, authored references and unrelated registry metadata are preserved. Existing blank descriptions were outside the summary-normalization pass. Candidate lists were reviewed selectively, without bulk-loading ground-to-ground weapons.

## Summary pattern

`<Origin Country/Countries> <Range?> <Guidance Type> <Type> missile <optional distinguishing information>`

Country lists use normalized names in alphabetical order, with `and` before the final country. `USSR/Russia` denotes successive development rather than multinational collaboration. Keep `family` and `system` when those are the referents. Range is optional; existing labels require existing summary or project-source support, and new preloads use cited specifications. Avoid assigning range by an invented numeric threshold.

Use the terminal homing category for homing missiles; do not catalogue every navigation aid. Use `and` for combined modes and `or` for alternatives across variants. Keep a short variant qualifier only when needed to avoid a false uniform classification. The original combined option `semi-active radar homing and active radar homing` remains valid.

## Updated guidance options

- `infrared homing`
- `semi-active radar homing`
- `active radar homing`
- `passive radar homing`
- `radar homing`
- `electro-optical homing`
- `semi-active laser homing`
- `command guidance`
- `radio command guidance`
- `laser command guidance`
- `track-via-missile guidance`
- `radar beam riding`
- `inertial guidance`
- `astro-inertial guidance`
- `satellite guidance`
- `terrain contour matching`
- `digital scene matching`
- `fibre-optic command guidance`

`radar homing` and `command guidance` are broader categories for sources that do not establish a subtype. Navigation and fibre-optic categories are available for future labels even where a missile remains unchanged because its type does not fit. They are supported by the reviewed Trident, Tomahawk and IDAS material; do not treat a data link alone as a seeker type. The user-provided guidance screenshot was treated as a coverage reference. Steering laws, target-recognition features and individual sensors were not added as interchangeable guidance classes. Guidance or missile-type ambiguities remain in the unchanged list.

Navigation and command references: [Trident II D5](https://www.navy.mil/Resources/Fact-Files/Display-FactFiles/Article/2169285/trident-ii-d5-missile/trident-ii-d5-missile/), [Tomahawk](https://www.navy.mil/Resources/Fact-Files/Display-FactFiles/Article/2169229/tomohawk-cruise-missile/tomahawk-cruise-missile/), [IDAS](https://new.diehl.com/defence/en/press-media/news/diehl-defence-and-thyssenkrupp-marine-systems-develop-unique-defence-system-for-submarines-idas). The existing Trident project material also identifies celestial fixes.

Candidate lists: [air-to-air](https://en.wikipedia.org/wiki/Air-to-air_missile), [submarine-launched](https://en.wikipedia.org/wiki/Submarine-launched_missile), [submarine-launched ballistic](https://en.wikipedia.org/wiki/Submarine-launched_ballistic_missile), [cruise](https://en.wikipedia.org/wiki/Cruise_missile), [air-to-surface](https://en.wikipedia.org/wiki/Air-to-surface_missile). Air-to-surface preloads were restricted to anti-ship weapons; ground-to-ground weapons were not selected.

## Existing summary updates

| Topic slug | Revised summary | Sources |
| --- | --- | --- |
| `3m22-zircon` | Russia active radar homing surface-to-surface missile for hypersonic naval strike. | [1](https://gur.gov.ua/en/content/warsanctions-hur-mo-publikuie-detali-shchodo-rosiiskoi-balistychnoi-rakety-3m22-tsyrkon.html); [2](https://war-sanctions.gur.gov.ua/en/ballistics/zircon/part/5541) |
| `agm-12-bullpup` | USA radio command guidance air-to-surface missile family. | [1](https://www.nationalmuseum.af.mil/Visit/Museum-Exhibits/Fact-Sheets/Display/Article/195857/martin-agm-12b-bullpup-a/) |
| `agm-45-shrike` | USA passive radar homing air-to-surface missile. | [1](https://www.nationalmuseum.af.mil/Visit/Museum-Exhibits/Fact-Sheets/Display/Article/196035/USAFmuseum/agm-45-shrike-anti-radar-missile/) |
| `agm-65-maverick` | USA electro-optical homing, infrared homing or semi-active laser homing air-to-surface missile family. | [1](https://www.af.mil/News/Article-Display/Article/104577/agm-65-maverick/); [2](https://www.nepa.navy.mil/Portals/20/Documents/aftteis1/virginia-capes/nepa-eo/vacapes-feis-vol2-appendices-full.pdf) |
| `agm-88-harm` | USA passive radar homing air-to-surface missile. | [1](https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104574/agm-88-harm/) |
| `aim-54-phoenix` | USA long-range semi-active radar homing and active radar homing air-to-air missile carried by the F-14 Tomcat. | [1](https://www.navair.navy.mil/node/12701); [2](../task-notes/2026-09-06_T18-40-42-0500_named-armament-topics-and-search-cards.md) |
| `aim-9-sidewinder` | USA short-range infrared homing or semi-active radar homing air-to-air missile family. | [1](https://www.aftc.af.mil/News/On-This-Day-in-Test-History/Article-Display-Test-History/Article/2530201/april-9-2004-416th-flight-test-squadron-test-fires-aim-9x-for-the-first-time-fr/); [2](https://airandspace.si.edu/collection-objects/sidewinder-missile/nasm_A20030007000); [3](../src/derived/video-segments/2021-10-03_T17-02-53_bruships-a-special-questions-what-ifs-till-the-bru-runs-out-7_a2LmlZcxL5M.json) |
| `alarm-missile` | UK passive radar homing air-to-surface missile. | [1](https://www.rafmuseum.org.uk/documents/LargePrintGuides/The%20RAF%20in%20an%20Age%20of%20Uncertainty.pdf); [2](https://collections.rafmuseum.org.uk/collection/object/object-197120/) |
| `aspide-missile` | Italy semi-active radar homing surface-to-air missile. | [1](https://www.mbda-systems.com/media/19261/download); [2](../src/derived/video-segments/2026-06-04_T18-30-05_modularity-squared-what-happens-if-the-stanflex-and-meko-combined-into-a-single-program_8PhKcYKQJus.json); [3](../src/derived/video-segments/2026-07-03_T18-30-17_durand-de-la-penne-class-the-destroyer-class-which-showed-the-oto-melara-76mm-had-came-of-age_eYhGE7TDlHQ.json); [4](../src/derived/topic-normalization-patterns.tsv) |
| `aster-15` | France and Italy short-range active radar homing surface-to-air missile. | [1](https://eurosam.com/history/); [2](https://eurosam.com/legal-information/); [3](https://www.mbda-systems.com/sites/mbda/files/2024-06/2018%20ASTER%20datasheet.pdf); [4](../task-notes/2026-09-06_T18-40-42-0500_named-armament-topics-and-search-cards.md); [5](../src/derived/video-segments/2024-02-29_T19-16-53_aircraft-carriers-in-science-fiction_Bra5G5MJJwk.json) |
| `aster-30` | France and Italy active radar homing surface-to-air missile for area defence. | [1](https://eurosam.com/history/); [2](https://eurosam.com/legal-information/); [3](https://www.mbda-systems.com/sites/mbda/files/2024-06/2018%20ASTER%20datasheet.pdf); [4](../task-notes/2026-09-06_T18-40-42-0500_named-armament-topics-and-search-cards.md); [5](../src/derived/video-segments/2024-11-24_T15-16-22_jellicoe-as-3rd-sea-lord-essay-competion-and-wow-collab-last-9-of-the-36hr-historiophon-part-4-4_XtibVSN-Ho8.json) |
| `brahmos` | India and Russia active radar homing air-to-surface and surface-to-surface missile family for supersonic anti-ship and land attack. | [1](https://www.brahmos.com/page/brahmos-missile); [2](https://www.iadb.in/2023/08/03/brahmos-supersonic-cruise-missile-superlative-weapon-for-cruise-missile-triad/); [3](https://www.ecil.co.in/rnd); [4](https://www.ecil.co.in/defence_seekers) |
| `brahmos-missile` | India and Russia active radar homing air-to-surface and surface-to-surface missile family for supersonic anti-ship and land attack. | [1](https://www.brahmos.com/page/brahmos-missile); [2](https://www.iadb.in/2023/08/03/brahmos-supersonic-cruise-missile-superlative-weapon-for-cruise-missile-triad/); [3](https://www.ecil.co.in/rnd); [4](https://www.ecil.co.in/defence_seekers) |
| `brimstone-missile` | UK active radar homing air-to-surface and surface-to-surface missile family; later variants add semi-active laser homing. | [1](https://www.mbda-systems.com/products/tactical-strike/brimstone); [2](https://www.mbda-systems.com/first-brimstone-3-missile-firing-tremendous-success); [3](https://mbdainc.com/dual-mode-brimstone-achieves-direct-hits-mq-9-reaper-testing/) |
| `chaparral` | USA short-range infrared homing surface-to-air missile system derived from Sidewinder. | [1](https://history.redstone.army.mil/miss-chaparral.html) |
| `evolved-sea-sparrow-missile` | Australia, Belgium, Canada, Denmark, Germany, Greece, Netherlands, Norway, Portugal, Spain, Turkey and USA semi-active radar homing surface-to-air missile family; Block 2 adds active radar homing. | [1](https://www.navy.mil/Resources/Fact-Files/Display-FactFiles/Article/2168978/evolved-seasparrow-missile-block-1-essm-rim-162d/); [2](https://www.navsea.navy.mil/Media/News/Article/1567858/nato-seasparrow-conducts-successful-flight-test-of-essm-block-2/) |
| `exocet` | France active radar homing air-to-surface and surface-to-surface missile family for anti-ship strikes. | [1](https://www.mbda-systems.com/products/deep-strike/exocet-family); [2](https://www.mbda-systems.com/our-company/our-history) |
| `exocet-missile` | France active radar homing air-to-surface and surface-to-surface missile family for anti-ship strikes. | [1](https://www.mbda-systems.com/products/deep-strike/exocet-family); [2](https://www.mbda-systems.com/our-company/our-history) |
| `harpoon-missile` | USA active radar homing air-to-surface and surface-to-surface missile family for anti-ship strikes. | [1](https://www.navy.mil/Resources/Fact-Files/Display-FactFiles/Article/2168358/harpoon-missile/) |
| `hellfire-missile` | USA semi-active laser homing or active radar homing air-to-surface and surface-to-surface missile family. | [1](https://www.navy.mil/Resources/Fact-Files/Display-FactFiles/Article/2168362/agm-114bkmn-hellfire-missile/); [2](https://investors.lockheedmartin.com/node/10366/pdf); [3](https://www.navy.mil/Press-Office/News-Stories/display-news/Article/2263528/surface-to-surface-missile-test-for-lcs-successful/) |
| `hq-7` | China short-range command guidance surface-to-air missile system with land and naval versions. | [1](https://odin.t2com.army.mil/WEG/Asset/94a79413331e07b9e3b31793a1cc870d) |
| `iris-t` | Germany, Greece, Italy, Norway, Spain and Sweden infrared homing air-to-air and surface-to-air missile family. | [1](https://new.diehl.com/defence/en/render-tab-content/2511); [2](https://www.diehl.com/defence/en/products/guided-missiles/6637/); [3](../src/derived/video-segments/2025-10-26_T19-24-46_bruships-217-back-from-japan-2025-jetlag-is-a-myth-naval-history-questions-answered-live_TRn1VfEpKGE.json); [4](../task-notes/2026-09-06_T18-40-42-0500_named-armament-topics-and-search-cards.md) |
| `losat` | USA laser command guidance surface-to-surface missile system for kinetic-energy anti-tank attack; experimental. | [1](https://www.dote.osd.mil/Portals/97/pub/reports/FY2000/other/2000DOTEAnnRpt.pdf?ver=2019-11-13-183527-323); [2](https://asc.army.mil/docs/wsh2/2004-wsh.pdf) |
| `meteor-missile` | France, Germany, Italy, Spain, Sweden and UK beyond-visual-range active radar homing air-to-air missile. | [1](https://www.mbda-systems.com/products/air-dominance/meteor); [2](https://www.mbda-systems.com/mbda-presents-latest-missile-technologies-laad-2023); [3](../task-notes/2026-09-06_T18-40-42-0500_named-armament-topics-and-search-cards.md); [4](../src/derived/video-segments/2026-06-18_T18-46-30_the-defence-investment-plan-a-live-review-if-it-s-been-published-a-chat-of-what-to-look-for-if-n_LYcA94lzYJM.json) |
| `mistral-missile` | France short-range infrared homing surface-to-air missile family with helicopter-launched air-to-air versions. | [1](https://www.mbda-systems.com/products/force-protection/mistral-family); [2](https://www.mbda-systems.com/sites/mbda/files/2024-07/2023%20Mistral%203%20datasheet.pdf); [3](https://www.mbda-systems.com/sites/mbda/files/2024-07/2023%20Mistral%20ATAM%20datasheet.pdf); [4](https://www.mbda-systems.com/mbda-nioa-explore-mistral-missile-manufacture-australia); [5](../src/derived/video-segments/2026-01-18_T19-33-24_bruships-228-naval-history-questions-answered-live_AbUh5f_DM-g.json); [6](../task-notes/2026-09-06_T18-40-42-0500_named-armament-topics-and-search-cards.md) |
| `naval-strike-missile` | Norway infrared homing surface-to-surface missile for anti-ship and land attack. | [1](https://www.kongsberg.com/what-we-do/defence-and-security/missile-systems/nsm-naval-strike-missile/); [2](https://www.kongsberg.com/news/news-archive/2015/raytheon-and-kongsberg-team-on-naval-strike-missile/) |
| `otomat-missiles` | France and Italy active radar homing surface-to-surface missile family for anti-ship strikes. | [1](https://www.mbda-systems.com/our-company/our-history); [2](https://www.mbda-systems.com/wp-content/uploads/2015/07/OTOMAT.pdf); [3](https://www.mbda-systems.com/products/deep-strike/teseootomat-family) |
| `p-500` | USSR active radar homing surface-to-surface missile for supersonic anti-ship strikes. | [1](https://odin.t2com.army.mil/WEG/Asset/27f5c0099222174f3d4a085ffdaeb633) |
| `p-500-bazalt` | USSR active radar homing surface-to-surface missile for supersonic anti-ship strikes. | [1](https://odin.t2com.army.mil/WEG/Asset/27f5c0099222174f3d4a085ffdaeb633) |
| `p-700-granit` | USSR active radar homing and passive radar homing surface-to-surface missile for anti-ship strikes from ships and submarines. | [1](https://odin.t2com.army.mil/WEG/Asset/9b1823e0be3a1e39eb65bc96d24c2e7d) |
| `p-700-missiles` | USSR active radar homing and passive radar homing surface-to-surface missile for anti-ship strikes from ships and submarines. | [1](https://odin.t2com.army.mil/WEG/Asset/9b1823e0be3a1e39eb65bc96d24c2e7d) |
| `pac-3` | USA active radar homing surface-to-air missile family using hit-to-kill interception. | [1](https://www.boeing.com/content/dam/boeing/boeingdotcom/defense/pac3-missile-seeker/pdf/PAC-3_Seeker_ProductCard.pdf); [2](https://www.lockheedmartin.org/content/dam/lockheed-martin/mfc/documents/pac-3/24-09790-iamd-pac-3-mse-partner-ppt--updates_r2.pdf) |
| `patriot` | USA track-via-missile guidance or active radar homing surface-to-air missile system. | [1](https://asc.army.mil/docs/wsh2/1991-wsh.pdf); [2](https://www.lockheedmartin.com/content/dam/lockheed-martin/mfc/documents/pac-3/24-09790-iamd-pac-3-mse-partner-ppt--updates_r2.pdf) |
| `patriot-missile` | USA track-via-missile guidance or active radar homing surface-to-air missile family. | [1](https://asc.army.mil/docs/wsh2/1991-wsh.pdf); [2](https://www.lockheedmartin.com/content/dam/lockheed-martin/mfc/documents/pac-3/24-09790-iamd-pac-3-mse-partner-ppt--updates_r2.pdf) |
| `patriot-missile-system` | USA track-via-missile guidance or active radar homing surface-to-air missile system. | [1](https://asc.army.mil/docs/wsh2/1991-wsh.pdf); [2](https://www.lockheedmartin.com/content/dam/lockheed-martin/mfc/documents/pac-3/24-09790-iamd-pac-3-mse-partner-ppt--updates_r2.pdf) |
| `r-37-missile` | USSR/Russia long-range active radar homing air-to-air missile family. | [1](https://odin.t2com.army.mil/WEG/Asset/59940359ebacd5953098f01ece89c21e); [2](../src/transcripts/txt/2023-11-08_T22-00-19_unrotated-projectiles-to-hypersonics-some-history-and-thoughts-on-missiles-as-part-of-navies_QpWEABwydRU.txt); [3](../src/derived/video-segments/2023-11-08_T22-00-19_unrotated-projectiles-to-hypersonics-some-history-and-thoughts-on-missiles-as-part-of-navies_QpWEABwydRU.json); [4](../task-notes/2026-09-06_T18-40-42-0500_named-armament-topics-and-search-cards.md) |
| `ram-missile` | Germany and USA passive radar homing and infrared homing surface-to-air missile family. | [1](https://www.diehl.com/defence/en/products/guided-missiles/6637/); [2](https://www.secnav.navy.mil/fmc/fmb/Documents/02pres/proc/WPN_book.PDF) |
| `rbs-08` | France and Sweden radio command guidance and active radar homing surface-to-surface missile for anti-ship strikes. | [1](https://aeroseum.se/en/exhibitions-objects/robot-08-a-creative-redesign/) |
| `red-top-missile` | UK infrared homing air-to-air missile carried by Lightning and Sea Vixen interceptors. | [1](https://www.rafmuseum.org.uk/research/collections/hawker-siddeley-red-top-air-to-air-missile/); [2](https://www.rafmuseum.org.uk/research/archive-exhibitions/de-havilland-the-man-and-the-company/other-companies/); [3](../src/derived/video-segments/2025-04-13_T18-32-13_bruships-189-naval-history-questions-answered-live_lsBKqyqxSkE.json); [4](../src/derived/video-segments/2025-06-20_T18-30-06_britains-obsession-with-supersonic-harriers_6D9NR747Nvw.json) |
| `rim-116-rolling-airframe-missile` | Germany and USA passive radar homing and infrared homing surface-to-air missile family. | [1](https://www.diehl.com/defence/en/products/guided-missiles/6637/); [2](https://www.secnav.navy.mil/fmc/fmb/Documents/02pres/proc/WPN_book.PDF) |
| `rim-162-essm` | Australia, Belgium, Canada, Denmark, Germany, Greece, Netherlands, Norway, Portugal, Spain, Turkey and USA semi-active radar homing surface-to-air missile family; Block 2 adds active radar homing. | [1](https://www.navy.mil/Resources/Fact-Files/Display-FactFiles/Article/2168978/evolved-seasparrow-missile-block-1-essm-rim-162d/) |
| `rim-2-terrier` | USA medium-range radar beam riding or semi-active radar homing surface-to-air missile family. | [1](https://www.jhuapl.edu/sites/default/files/2024-09/34-02-Palumbo.pdf); [2](https://secwww.jhuapl.edu/techdigest/content/techdigest/pdf/V02-N04/02-04-Oliver_Pacing.pdf) |
| `rim-24-tartar` | USA short-range semi-active radar homing surface-to-air missile. | [1](https://secwww.jhuapl.edu/techdigest/content/techdigest/pdf/V22-N04/22-04-Meyer.pdf); [2](https://pages.jh.edu/gazette/2002/25mar02/25sixty.html) |
| `rim-66-standard-missile` | USA medium-range semi-active radar homing surface-to-air missile family with infrared and active radar homing variants. | [1](https://www.navy.mil/Resources/Fact-Files/Display-FactFiles/Article/2169011/standard-missile/); [2](https://www.dote.osd.mil/Portals/97/pub/reports/FY2024/navy/2024sm-2.pdf?ver=07_B1kp1xOwBYblia9BwMQ%3D%3D) |
| `rim-67-standard-missile` | USA long-range semi-active radar homing surface-to-air missile family for Terrier-era launchers. | [1](../src/derived/video-segments/2022-12-27_T20-00-09_leahy-class-bainbridge-class-destroyer-leaders-to-cruisers-by-the-stroke-of-a-pen_o8aLq_2LY0E.json); [2](../src/derived/video-segments/2022-12-28_T19-00-21_belknap-class-truxton-class-good-ships-not-sure-about-the-naming_dQCI0wrdgAI.json); [3](../src/derived/video-segments/2023-06-23_T18-00-07_leahy-class-bainbridge-class-comment-response_KPRx8yC4wfY.json); [4](../src/derived/video-segments/2023-06-26_T18-00-09_belknap-class-and-truxton-comment-response_Ni2MCKgs2hk.json) |
| `rim-7-sea-sparrow` | USA short-range semi-active radar homing surface-to-air missile derived from AIM-7 Sparrow. | [1](https://www.navy.mil/Resources/Fact-Files/Display-FactFiles/Article/2168965/seasparrow-missile-rim-7/) |
| `s-300` | USSR radio command guidance, track-via-missile guidance or semi-active radar homing surface-to-air missile family. | [1](https://odin.t2com.army.mil/WEG/Asset/173bd71102f94acaca62e670a388fe29); [2](https://odin.t2com.army.mil/WEG/Asset/ec646ac25a7bb795173581bd8ea053df); [3](https://odin.t2com.army.mil/WEG/Asset/S-300PMU-1_%28SA-20_Gargoyle%29_Russian_Long-Range_Air_Defense_Missile_System) |
| `s-400` | Russia semi-active radar homing or active radar homing surface-to-air missile system. | [1](https://www.foi.se/rest-api/report/FOI-R--4651--SE) |
| `sea-cat` | UK short-range radio command guidance surface-to-air missile. | [1](https://www.globalsecurity.org/military/library/report/1984/HJA.htm) |
| `sea-cat-missile` | UK short-range radio command guidance surface-to-air missile. | [1](https://www.globalsecurity.org/military/library/report/1984/HJA.htm) |
| `sea-ceptor` | UK active radar homing surface-to-air missile system using CAMM. | [1](https://www.mbda-systems.com/products/force-protection/camm-family/sea-ceptor); [2](https://www.mbda-systems.com/sites/mbda/files/2024-07/CAMM%20family%20brochure%20-%20WEB.pdf); [3](https://www.mbda-systems.com/ps850m-sea-ceptor-missile-system-enters-service-royal-navy) |
| `sea-dart` | UK medium-range semi-active radar homing surface-to-air missile. | [1](https://publications.gc.ca/collections/collection_2015/mdn-dnd/D12-21-1984-2-eng.pdf); [2](https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/784305/archive_doctrine_uk_joint_air_defence_jwp_3_63.pdf) |
| `sea-dart-missile` | UK medium-range semi-active radar homing surface-to-air missile. | [1](https://publications.gc.ca/collections/collection_2015/mdn-dnd/D12-21-1984-2-eng.pdf); [2](https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/784305/archive_doctrine_uk_joint_air_defence_jwp_3_63.pdf) |
| `sea-sparrow` | USA short-range semi-active radar homing surface-to-air missile derived from AIM-7 Sparrow. | [1](https://www.navy.mil/Resources/Fact-Files/Display-FactFiles/Article/2168965/seasparrow-missile-rim-7/) |
| `sea-sparrow-missile` | USA short-range semi-active radar homing surface-to-air missile derived from AIM-7 Sparrow. | [1](https://www.navy.mil/Resources/Fact-Files/Display-FactFiles/Article/2168965/seasparrow-missile-rim-7/) |
| `sea-wolf` | UK short-range radio command guidance surface-to-air missile. | [1](https://www.globalsecurity.org/military/library/report/1984/HJA.htm) |
| `sea-wolf-missile` | UK short-range radio command guidance surface-to-air missile. | [1](https://www.globalsecurity.org/military/library/report/1984/HJA.htm) |
| `seaslug-missile` | UK radar beam riding surface-to-air missile carried by County-class destroyers. | [1](https://collection.sciencemuseumgroup.org.uk/documents/aa110157132); [2](https://emuseum.aberdeencity.gov.uk/objects/85263/mountbatten-medallic-history-of-great-britain-and-the-sea-me) |
| `sm-2` | USA semi-active radar homing surface-to-air missile family with infrared and active radar homing variants. | [1](https://www.navy.mil/Resources/Fact-Files/Display-FactFiles/Article/2169011/standard-missile/); [2](https://www.dote.osd.mil/Portals/97/pub/reports/FY2024/navy/2024sm-2.pdf?ver=07_B1kp1xOwBYblia9BwMQ%3D%3D) |
| `sm-2-missile` | USA semi-active radar homing surface-to-air missile family with infrared and active radar homing variants. | [1](https://www.navy.mil/Resources/Fact-Files/Display-FactFiles/Article/2169011/standard-missile/); [2](https://www.dote.osd.mil/Portals/97/pub/reports/FY2024/navy/2024sm-2.pdf?ver=07_B1kp1xOwBYblia9BwMQ%3D%3D) |
| `sm-3` | Japan and USA infrared homing surface-to-air missile family for exoatmospheric interception; Japan co-developed Block IIA. | [1](https://www.rtx.com/raytheon/what-we-do/strategic-missile-defense/sm-3-interceptor); [2](https://www.nids.mod.go.jp/english/publication/east-asian/pdf/2007/east-asian_e2007_08.pdf); [3](https://www.war.gov/News/Releases/Release/Article/4567790/department-of-war-boeing-and-rtx-forge-agreements-to-strengthen-production-of-c/) |
| `sm-3-block-ib` | USA infrared homing surface-to-air missile for exoatmospheric interception, with a two-colour seeker. | [1](https://www.rtx.com/raytheon/what-we-do/strategic-missile-defense/sm-3-interceptor); [2](https://www.war.gov/News/Releases/Release/Article/4567790/department-of-war-boeing-and-rtx-forge-agreements-to-strengthen-production-of-c/) |
| `sm-3-block-iia` | Japan and USA infrared homing surface-to-air missile for exoatmospheric interception. | [1](https://www.rtx.com/raytheon/what-we-do/strategic-missile-defense/sm-3-interceptor); [2](https://www.nids.mod.go.jp/english/publication/east-asian/pdf/2007/east-asian_e2007_08.pdf); [3](https://www.war.gov/News/Releases/Release/Article/4567790/department-of-war-boeing-and-rtx-forge-agreements-to-strengthen-production-of-c/) |
| `sm-3-missile` | Japan and USA infrared homing surface-to-air missile family for exoatmospheric interception; Japan co-developed Block IIA. | [1](https://www.rtx.com/raytheon/what-we-do/strategic-missile-defense/sm-3-interceptor); [2](https://www.nids.mod.go.jp/english/publication/east-asian/pdf/2007/east-asian_e2007_08.pdf); [3](https://www.war.gov/News/Releases/Release/Article/4567790/department-of-war-boeing-and-rtx-forge-agreements-to-strengthen-production-of-c/) |
| `sm-6` | USA long-range semi-active radar homing and active radar homing surface-to-air missile family with surface-strike variants. | [1](https://www.navy.mil/Resources/Fact-Files/Display-FactFiles/Article/2169011/standard-missile/); [2](https://www.navsea.navy.mil/Media/News/Article/685151/navy-successfully-tests-new-sm-6-capability/); [3](https://www.cpf.navy.mil/newsroom/news/article/2704954/uss-john-paul-jones-aegis-bmd-system-intercepts-target-missile/) |
| `sm-6-missile` | USA long-range semi-active radar homing and active radar homing surface-to-air missile family with surface-strike variants. | [1](https://www.navy.mil/Resources/Fact-Files/Display-FactFiles/Article/2169011/standard-missile/); [2](https://www.navsea.navy.mil/Media/News/Article/685151/navy-successfully-tests-new-sm-6-capability/) |
| `spear-3` | UK active radar homing and semi-active laser homing air-to-surface missile developed for the F-35B. | [1](https://www.mbda-systems.com/spear-versatile-networked-and-ready-multi-platform-battlefield); [2](https://www.mbda-systems.com/wp-content/uploads/2018/08/spear.pdf); [3](https://www.mbda-systems.com/spear-missile-bound-f-35b-achieves-firing-milestone) |
| `storm-shadow` | France and UK long-range infrared homing air-to-surface missile for fixed land targets. | [1](https://www.mbda-systems.com/media/19203/download); [2](https://publications.parliament.uk/pa/cm201719/cmselect/cmdfence/1071/107104.htm) |
| `tartar-missile` | USA short-range semi-active radar homing surface-to-air missile. | [1](https://secwww.jhuapl.edu/techdigest/content/techdigest/pdf/V22-N04/22-04-Meyer.pdf); [2](https://pages.jh.edu/gazette/2002/25mar02/25sixty.html) |
| `terrier-missile` | USA medium-range radar beam riding or semi-active radar homing surface-to-air missile family. | [1](https://www.jhuapl.edu/sites/default/files/2024-09/34-02-Palumbo.pdf); [2](https://secwww.jhuapl.edu/techdigest/content/techdigest/pdf/V02-N04/02-04-Oliver_Pacing.pdf) |
| `type-88-surface-to-ship-missile` | Japan radar homing surface-to-surface missile for coastal defence. | [1](https://www.clearing.mod.go.jp/hakusho_data/2015/pdf/27shiryo03.pdf); [2](https://www.mod.go.jp/gsdf/equipment/fire/) |
| `yj-83` | China active radar homing or electro-optical homing air-to-surface and surface-to-surface missile family for anti-ship strikes. | [1](https://odin.t2com.army.mil/WEG/Asset/a1ad4c4999d94579ce198d64ce7b6072) |

## New preloaded topics

| Topic slug | Title | Summary | Exact creation inputs | Sources |
| --- | --- | --- | --- | --- |
| `a-darter-missile` | A-Darter Missile | Brazil and South Africa short-range infrared homing air-to-air missile. | `a-darter`, `a-darter-missiles` | [1](https://www.deneldynamics.co.za/press-article/-Successful-A-Darter-Qualification-And-Certification/221) |
| `aam-4-missile` | AAM-4 Missile | Japan active radar homing air-to-air missile. | `aam-4`, `type-99-air-to-air-missile` | [1](https://www.mod.go.jp/en/d_act/d_budget/pdf/220416.pdf); [2](https://www.mod.go.jp/asdf/adtw/adm/shiken/kakoshiken_missile2.html) |
| `aam-5-missile` | AAM-5 Missile | Japan short-range infrared homing air-to-air missile. | `aam-5`, `type-04-air-to-air-missile` | [1](https://www.mhi.com/jp/business/products-services/space-defense/missile-systems/type04-air-to-air-missile-aam-5); [2](https://www.mod.go.jp/asdf/adtw/adm/shiken/kakoshiken_missile2.html); [3](https://www.clearing.mod.go.jp/hakusho_data/2013/2013/pdf/25shiryo2.pdf) |
| `aim-120-amraam` | AIM-120 AMRAAM | USA active radar homing air-to-air and surface-to-air missile family. | `aim-120`, `amraam`, `amraam-missile`, `advanced-medium-range-air-to-air-missile` | [1](https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104576/aim-120-amraam/); [2](https://www.kongsberg.com/what-we-do/defence-and-security/integrated-air-and-missile-defence/nasams-multi-missile-launcher/) |
| `aim-132-asraam` | AIM-132 ASRAAM | UK short-range infrared homing air-to-air missile. | `aim-132`, `asraam`, `asraam-missile`, `advanced-short-range-air-to-air-missile` | [1](https://www.gov.uk/government/news/mod-to-upgrade-air-to-air-missile); [2](https://www.mbda-systems.com/sites/mbda/files/2024-06/2023%20ASRAAM%20datasheet.pdf); [3](https://www.afmc.af.mil/News/Photos/igphoto/2001513739/) |
| `aim-4-falcon` | AIM-4 Falcon | USA short-range semi-active radar homing or infrared homing air-to-air missile family. | `aim-4`, `hughes-aim-4-falcon` | [1](https://airandspace.si.edu/collection-objects/model-missile-falcon-aim-4d/nasm_A19981617000); [2](https://mapsairmuseum.org/wp-content/uploads/2024/02/AIM-4-Falcon.pdf); [3](https://www.nationalmuseum.af.mil/Visit/Museum-Exhibits/Fact-Sheets/Display/Article/197614/hughes-aim-4f-super-falcon-air-to-air-missile/) |
| `aim-7m-sparrow` | AIM-7M Sparrow | USA medium-range semi-active radar homing air-to-air missile. | `aim-7m`, `aim-7m-sparrow-missile` | [1](https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104575/aim-7-sparrow/%20/lang/aim-7-sparrow/); [2](https://www.navair.navy.mil/sparrow) |
| `asm-3-missile` | ASM-3 Missile | Japan active radar homing and passive radar homing air-to-surface missile for supersonic anti-ship strikes. | `asm-3`, `asm-3-anti-ship-missile` | [1](https://www.mod.go.jp/atla/research/ats2018/img/ats2018_summary.pdf); [2](https://www.mod.go.jp/j/policy/hyouka/yosan_shikko/2018/04.pdf) |
| `astra-mk1-missile` | Astra Mk1 Missile | India beyond-visual-range active radar homing air-to-air missile. | `astra-mk1`, `astra-mk-1`, `astra-mark-1`, `astra-mk-1-missile` | [1](https://bdl-india.in/astra); [2](https://www.pib.gov.in/PressReleseDetailm.aspx?PRID=1992193&lang=2&reg=48); [3](https://www.pib.gov.in/PressReleasePage.aspx?PRID=1989502&lang=2&reg=48) |
| `atmaca-missile` | ATMACA Missile | Turkey active radar homing surface-to-surface missile for anti-ship and land attack. | `atmaca`, `atmaca-anti-ship-missile` | [1](https://www.roketsan.com.tr/en/products/atmaca-anti-ship-missile) |
| `hsiung-feng-iii-missile` | Hsiung Feng III Missile | Taiwan active radar homing surface-to-surface missile for supersonic anti-ship strikes. | `hsiung-feng-iii`, `hsiung-feng-3`, `hsiung-feng-iii-anti-ship-missile` | [1](https://www.ncsist.org.tw/eng/csistdup/products/product.aspx?catalog=8&product_Id=10); [2](https://www.ncsist.org.tw/csistdup/products/product.aspx?catalog=8&product_Id=274) |
| `i-derby-er-missile` | I-Derby ER Missile | Israel active radar homing air-to-air and surface-to-air missile. | `i-derby-er`, `i-derby-er-missiles` | [1](https://www.rafael.co.il/wp-content/uploads/2024/09/i-derby-er-air-to-air-and-surface-to-air-missile.pdf) |
| `kh-31a-missile` | Kh-31A Missile | USSR active radar homing air-to-surface missile for supersonic anti-ship strikes. | `kh-31a`, `kh-31a-anti-ship-missile` | [1](https://odin.t2com.army.mil/WEG/Asset/ddf8ac1b54206d213d0d1466fd55e39a); [2](https://www.govinfo.gov/content/pkg/GOVPUB-D5-PURL-gpo76796/pdf/GOVPUB-D5-PURL-gpo76796.pdf) |
| `marte-er-missile` | MARTE ER Missile | Italy active radar homing air-to-surface and surface-to-surface missile for anti-ship strikes. | `marte-er`, `marte-extended-range`, `marte-er-anti-ship-missile` | [1](https://www.mbda-systems.com/products/deep-strike/marte-family/marte-er) |
| `mica-missile` | MICA Missile | France active radar homing or infrared homing air-to-air and surface-to-air missile family. | `mica`, `mica-missiles` | [1](https://www.mbda-systems.com/products/air-dominance/mica-family/mica); [2](https://archives.defense.gouv.fr/portail/dossiers/archives-des-dossiers/modernisation-amelioration-des-capacites-operationnelles/equipements-derniere-generation.html); [3](https://archives.defense.gouv.fr/content/download/108415/1057854/vision_13_fevrier_2011.pdf); [4](https://www.mbda-systems.com/sites/mbda/files/2024-07/2022%20MICA%20datasheet.pdf) |
| `penguin-missile` | Penguin Missile | Norway infrared homing air-to-surface and surface-to-surface missile family for anti-ship strikes. | `penguin-anti-ship-missile` | [1](https://www.kongsberg.com/contentassets/16524994454e40c085295d6316b316c5/annualreport1999.pdf); [2](https://www.kongsberg.com/contentassets/18d55b1398d34e2a875078038983f829/aar04eng.pdf) |
| `pl-12-missile` | PL-12 Missile | China beyond-visual-range active radar homing air-to-air missile. | `pl-12`, `pl12-missile` | [1](https://odin.t2com.army.mil/WEG/Asset/65b19559b44ce7b1138b5ccbf384c7a8) |
| `pl-15-missile` | PL-15 Missile | China long-range active radar homing air-to-air missile. | `pl15-missile` | [1](https://odin.t2com.army.mil/WEG/Asset/PL-15_(Thunderbolt-15)_Chinese_Active_Radar-Guided_Very_Long_Range_Air-to-Air_Missile) |
| `python-5-missile` | Python-5 Missile | Israel infrared homing air-to-air and surface-to-air missile. | `python-5`, `python5-missile` | [1](https://www.rafael.co.il/wp-content/uploads/2024/09/python-Air-to-Air-and-Air-defense-Missile.pdf) |
| `r-73-missile` | R-73 Missile | USSR short-range infrared homing air-to-air missile. | `r-73`, `vympel-r-73`, `aa-11-archer` | [1](https://odin.t2com.army.mil/WEG/Asset/65e3d0ca5634700fb28ca6884c3bee17) |
| `rbs15-mk3-missile` | RBS15 Mk3 Missile | Germany and Sweden active radar homing surface-to-surface missile for anti-ship and land attack. | `rbs15-mk3`, `rbs-15-mk3`, `rbs-15-mk3-missile` | [1](https://www.diehl.com/defence/de/presse-und-medien/news/diehl-liefert-weitere-seezielflugkoerper-an-die-deutsche-marine/); [2](https://www.saab.com/newsroom/press-releases/2016/saab-signs-rbs15-mk3-teaming-agreement-with-mesko); [3](https://www.saab.com/newsroom/press-releases/2008/rbs15-mk3-surface-to-surface-missile-successfully-fired) |
| `type-80-air-to-ship-missile` | Type 80 Air-to-Ship Missile | Japan active radar homing air-to-surface missile for anti-ship strikes. | `type-80-asm-1`, `type-80-air-to-ship-missile` | [1](https://www.mod.go.jp/asdf/airpark/GUIDE/equipment/weapon/asm1.html) |

Each new canonical slug also has an exact display rule. Generic Falcon, Sparrow/AIM-7, Astra and Derby names are not redirected to narrower variants. New summaries are manual registry metadata; the deterministic synchronizer still creates blank descriptions.

## Existing slugs left unchanged

- `asm-135-asat`
- `cam-missile`
- `camm`
- `common-anti-air-modular-missile`
- `df-21`
- `hhq-9`
- `hyunmoo-3-cruise-missile`
- `hyunmoo-4-ballistic-missile`
- `idas-missile`
- `ikara-anti-submarine-missile`
- `jatm`
- `jl-3`
- `kh-35`
- `lightweight-sea-wolf`
- `lrasm`
- `m-11-shtorm`
- `m-2-air-defence-system`
- `milas-missiles`
- `p-1000-vulkan`
- `p-15-termite`
- `p-800-oniks`
- `pl-21`
- `polaris-missile`
- `poseidon-missile`
- `prsm`
- `rim-8-talos`
- `rum-139-asroc`
- `smart-missile`
- `standard-missile`
- `sub-harpoon`
- `subroc`
- `talos`
- `talos-missile`
- `tomahawk-missile`
- `trident-d5`
- `trident-missile`
- `yj-8`
- `yu-8-missile`

## Optional preloads not added

These are proposed slugs for deferred candidates, not existing topic records. Submarine-only candidates remain here because the reviewed material did not establish a fit with the four requested type labels. Other candidates have unresolved family, origin or guidance boundaries.

- `3m80-moskit-missile`
- `aim-7-sparrow`
- `c-802-missile`
- `exocet-sm39`
- `jl-1`
- `jl-2`
- `k-15-sagarika`
- `kh-22-missile`
- `kh-41-missile`
- `r-13`
- `r-21`
- `r-27-zyb`
- `r-29-vysota`
- `r-30-bulava`
- `r-39-rif`
- `r-77-missile`

## Validation

- `report:video-topic-usage` passed: 29,823 stored topics, 29,799 used, 24 unused, zero unregistered topics, zero normalization blockers and zero normalization reviews. Both generated reports were inspected. All 22 preloads are present with zero usage. The existing 215 similarity-review candidates are unchanged and remain discovery information.
- `audit:topic-normalization` passed across 2,165 shards: zero blockers and zero review findings.
- `check:video-topics` passed: the registry is current.
- Structural comparison confirmed exactly 72 summary-only changes to existing records and 22 new records. All 38 flagged records, existing titles, slugs, aliases and unrelated metadata were preserved. Every prior normalization row was preserved byte-for-byte.

## Files changed

- [topics.json](../src/derived/video-segments/topics.json): normalized existing summaries and added the 22 reviewed preloads.
- [topic-normalization-patterns.tsv](../src/derived/topic-normalization-patterns.tsv): added 51 exact creation mappings and 22 exact display rules for the new topics.
- This task note: records the classification vocabulary, revised summaries, sources, deferred slugs and validation results.
