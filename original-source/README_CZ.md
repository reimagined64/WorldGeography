# World Geography — Arcade Edition 7.0

Český samostatný webový remake inspirovaný zeměpisnou hrou pro Commodore 64.
Nový kód, vlastní syntetizovaná hudba, glóbus, 195 zemí a vložené vlajky.
Nejde o program pro původní C64 ani o přesnou rekonstrukci původního zdrojového kódu.

## Spuštění

Otevřete `index.html` v běžném prohlížeči s JavaScriptem. Distribuovaný soubor
`World-Geography-v7.html` je tentýž soubor pod jiným názvem. Nepotřebuje instalaci,
síťové připojení, externí obrázky, knihovny ani zvukové soubory. Zvuk se aktivuje
interakcí se stránkou, obvykle tlačítkem Zahájit expedici. Ve firemním či školním
prohlížeči mohou správci otevření lokálního HTML nebo zvuk zakázat.

## Pravidla verze 7

Každý hráč začíná s pěti pokusy. **Načtení nové země stojí jeden pokus** za všech
pět jejích otázek. První země je také placená: po zahájení se proto zobrazí čtyři
rezervní pokusy. Chybná odpověď ani vypršení času neodečítá další pokus. Po
zaplacení země smíte dokončit všech pět otázek, i když ukazatel rezervy klesl na nulu.

Otázky jdou v pořadí stát, hlavní město, měna, jazyk a obyvatelstvo. Vždy se vybírá
jedna ze tří odpovědí. Správná odpověď přináší body podle rychlosti, chybná žádné.
Mezi otázkami stejné země není povinná animace ani čekání. Vysvětlení si můžete
číst libovolně dlouho; další krok spouštíte tlačítkem.

### 10 000 bodů: dva pokusy hned, vlajka po zemi

Při dosažení či překročení 10 000, 20 000, 30 000 bodů atd. hráč **okamžitě získá
dva pokusy**. Zároveň se do fronty uloží nárok na právě jeden vlajkový bonus.
Pět otázek rozpracované země se nejdřív dohraje; vlajka je nikdy nepřeruší.

Bonus nestojí žádný pokus. Správná vlajka přidává další jeden pokus a body za
rychlost. Chyba nebo vypršení bonusu nic neodebírá. Bonusové body mohou samy
překročit novou bodovou hranici: automatická odměna i odměna za správnou vlajku
se v takovém případě sečtou. Další získaný bonus se přidá do fronty. Všechny
čekající bonusy patří hráči, který je získal, a vyřídí se před dalším státem nebo
předáním tahu. Jedna hranice se neopakuje ani po chybě, uložení či načtení.

Teprve po dohrání zaplacené země a jejích bonusů se zkoumá, zda má hráč pokus
na další zemi. Bodová hranice nebo vlajka jej tedy mohou zachránit i z nulové
rezervy. Počet kol ani odměněných pokusů nemá herní strop. Ve dvou hráčích má
každý vlastní skóre, pokusy, hranice i bonusy; vyřazený hráč vynechává další tahy.

### Otáčení a oddech

Před první zemí, každou další zemí **a každým vlajkovým bonusem** je 12 sekund
oddechu. Glóbus se oddálí, rovnoměrně provede nejméně tři celé otočky, zpomalí
a zastaví. Před běžnou otázkou pak přiblíží vybranou zemi. Před vlajkou zůstává
neutrální, bez zvýraznění a polohové nápovědy. Bonus tedy nestrhává vstupní pokus,
i když je také uveden animací glóbu.

Mezi pěti otázkami jedné země se nerotuje. Klidový režim odstraní pohyb, ale
ponechá oddech. Hodiny otázky začnou až po jejím vykreslení a načtení vlajky.

### Čas a vrácené bodování

| Obtížnost | Limit jedné otázky |
|---|---:|
| Průzkumník | 30 sekund |
| Cestovatel (standardní) | 20 sekund |
| Kartograf | 12 sekund |

Správná odpověď: **100 základních + až 900 bodů za rychlost**, nejvýše 1 000.
Body klesají po desítkách. Přesný vzorec je
`100 + 10 * Math.round(90 * (1 - uplynulý_čas / limit))`.
Při dosažení limitu je odměna nula. Ve standardním režimu je odpověď za přesně
5 sekund za 780 bodů, za 10 sekund za 550 bodů. **Stejné bodování platí i pro
správnou vlajku**, která navíc přidává jeden pokus. V tréninku bez limitu
zůstává 100 bodů za správnou odpověď a žádná ekonomika pokusů.

Jde o návrat k nižší škále z verze 5, ne o nové zvyšování odměn. Zároveň se
odměna za každou bodovou hranici zvýšila na dva pokusy. Při 80% správnosti
běžných i vlajkových odpovědí za přesně pět sekund tato ekonomika stále mírně
ubývá: medián 10 000 simulovaných her je 27 států. Při přesně třech sekundách
pokračovalo po 10 000 státech 77,66 % hráčů. Úplné předpoklady, rozbor, další
scénáře a reprodukovatelné výsledky jsou v `SIMULACE_CZ.md`.

### Měnové otázky

Možnosti zobrazují pouze obecné názvy: například **koruna, dolar, frank, peso,
libra, dirham**. Nezobrazují národní přívlastky ani ISO kódy. Shodné názvy různých
měn se sloučí a z chybných možností se vyloučí všechny měnové skupiny platné
v dané zemi. Je tak právě jedna správná možnost i u zemí s více měnami.

Úplný název a kód jsou až ve vysvětlení po odpovědi a ve studijním atlasu. Jde
o zjednodušené označení jednotky, nikoli tvrzení, že všechny dolary či franky
jsou jednou a toutéž měnou. Zároveň byla opravena starší chyba MAD na marocký
dirham; ověřovací zdroj Bank Al-Maghrib je zapsaný v `data/sources.json`.

## Hudba: původní motiv a 20 nových

Podkres odpovídání má **21 samostatných motivů**. Nové melodie mají vlastní
melodická témata, pořadí harmonií, rytmické nástupy a basové akcenty; nejsou to
jen transpozice jedné smyčky. Původní motiv má 8 taktů, nové 16 taktů, přibližně
35,6 sekundy při 108 dobách za minutu.

Motivy se vybírají z promíchaného zásobníku: žádný se nevrátí, dokud neprojdou
všechny. Ani na rozhraní dvou zásobníků se nesmí zopakovat stejná melodie.
Každá nová otázka začíná na jiné sudé osminové pozici fráze; začátky se losují
samostatně. Pauza nemění melodii ani její rozpracovanou pozici. Posledních pět
sekund běžné otázky zrychlí na 120 dob za minutu bez návratu k začátku fráze.

Zachovaný je tajemný soutěžní charakter, krátký pulzující bas, jemné arpeggio
a tónová příbuznost se znělkami správné a chybné odpovědi. Menu, oddech a bonus
mají vlastní doprovod. Hudba i efekty vznikají přímo pomocí Web Audio, bez
nahrávek či převzatých melodií z původní hry. Nejde o emulaci čipu SID.

Tlačítko ≋ nastavuje hlasitost, hudbu a efekty. Umožní poslechnout aktuální motiv,
přepnout na další a otestovat znělky odpovědí. Otázka během nastavení zůstává
pozastavená. Přiložená MP3 je 134,8sekundová přehlídka všech 21 motivů, každý
od jiného místa, s ukázkami správné/chybné odpovědi či získání pokusu. Ve hře
se MP3 nenačítá: používá se živá syntéza.

## Ovládání a ukládání

Odpovědi: myš, dotyk nebo 1–3 / A–C; šipky vybírají a Enter potvrzuje.
P pozastaví otázku a skryje zadání. M zapíná a vypíná zvuk. Enter po vyhodnocení
pokračuje, když není fokus v jiném ovládacím prvku. Glóbus lze mimo přílet
otáčet tažením a měnit přiblížení tlačítky.

Uložení zachovává čas, zaplacený stát, body, rezervní pokusy, automatické odměny
i čekající či již vydané bonusy. Za načtení stejného rozpracovaného státu se
pokus znovu neplatí. Nedokončený přílet se po návratu opakuje bez dalšího debetu.

Verze 7 používá klíče `wg.run.v7` a `wg.record.v7`, oddělené i od verze 6.
Starší partie se kvůli jiné ekonomice nepřevádějí ani nepřepisují; dřívější zvukové
preference zůstávají použitelné. Místní úložiště záleží na nastavení prohlížeče.
Jeho zákaz či vyčerpání kvóty se oznámí a aktuální hra pokračuje v paměti, ale
nejnovější postup se nemusí uložit. Neomezený počet kol není zárukou nekonečné
paměti nebo neomezené kapacity prohlížeče.

## Data a licence

Faktická databáze, mapový podklad, vlajky a 21 melodií zůstávají z verze 6; tato aktualizace není
novým úplným auditem všech zeměpisných faktů. Datová edice je označená
7. zářím 2026. Obyvatelstvo představuje projekce roku 2026, nikoli živé počítadlo.
Zdroje a metodické poznámky jsou dostupné ve hře a v `data/sources.json`.

Vlajky jsou vložené PNG ilustrace Noto Color Emoji. Afghánská republikánská
varianta je označená v atlasu a nepoužívá se v bonusu. Podobné vlajky se navzájem
nepoužívají jako chybné možnosti. Mapa je generalizovaná orientační pomůcka,
nikoli právní stanovisko k hranicím. Kód a nové hudební motivy: MIT; ostatní
materiály mají podmínky v `THIRD_PARTY_NOTICES.txt` a `licenses/`. Balíček
neobsahuje fontové soubory ani původní ROM či komerční hudbu.

## Sestavení a testy

Základní sestavení vyžaduje pouze Python 3:

```sh
python scripts/build.py
```

Otevře se či distribuuje výsledný `index.html`. Zdrojová data jsou už vložená
v balíčku; není potřeba spouštět jejich původní přípravné skripty ani nic
stahovat. `scripts/prepare_data.py` je oddělený pomocný nástroj s dalšími
závislostmi a jeho spuštění neznamená nové ověření aktuálnosti dat.

Testy jádra vyžadují Node.js:

```sh
node tests/core.test.js
node tests/timing.test.js
node tests/audio.test.js
node tests/globe.test.js
node tests/simulate.js
node tests/simulation.test.js
```

Integrační testy vyžadují Python Playwright a dostupný Chromium:

```sh
CHROMIUM_PATH=/usr/bin/chromium python tests/browser.test.py
CHROMIUM_PATH=/usr/bin/chromium python tests/browser.test.py --real
python tests/make_audio_demo.py
```

Poslední příkaz navíc využívá FFmpeg s MP3 enkodérem. Přehlídka používá stejné
zvukové funkce jako hra; metadata a pořadí motivů jsou v
`tests/audio-demo-results.json`. Některé testy používají virtuální čas pro
rychlou kontrolu stavů; varianta `--real` měří skutečný oddech země i bonusu.
Testy ukládání a načtení používají řízenou náhradu místního úložiště. Otevření
`file://` bylo v testovacím prostředí zablokováno správní politikou Chromia
(viz `tests/native-file-results.json`). Proto se testované HTML načítá přímo
do stránky a neprohlašuje se tím ověření otevírání lokálních souborů. Nativní perzistence přes zavření
skutečného prohlížeče zde proto není vydávána za úspěšně ověřenou. Samotný HTML soubor neprovádí síťové načítání.
Safari, Firefox a skutečné mobilní přístroje nebyly v tomto běhu ověřovány;
mobilní rozvržení bylo testované v emulovaném viewportu Chromia.

Podrobnosti: `tests/TEST_REPORT_CZ.txt`, `tests/core-results.json`,
`tests/browser-virtual-results.json`, `tests/browser-real-results.json` a
`tests/simulation-results.json` a `tests/simulation-test-results.json`.
