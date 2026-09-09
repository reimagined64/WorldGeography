# Verze 7.0 — 8. září 2026

Vráceno bodování 100 základních + až 900 za rychlost, včetně původního
zaokrouhlování po desítkách. Každých 10 000 bodů přidává dva pokusy okamžitě
a jednu vlajku do fronty. Správná vlajka přidává body podle stejného časového
vzorce a jeden další pokus. Bonusové body se započítávají do všech dalších
hranic. Ukazatel další hranice, pravidla a odměny v rozhraní byly aktualizovány.

Zachována platba jednoho pokusu za načtení státu, pět otázek za stát, dohrání
při nulové rezervě, odložení bonusu do konce státu, 12sekundová rotace před
státem i bonusem, obecné názvy měn, všech 21 melodií a celá databáze.
Ukládání a rekordy jsou oddělené klíči v7; starší historie se nepřepisuje.

Simulace nových pravidel: 7 scénářů po 10 000 hráčích až do 10 000 států.
Při 80 % a přesně 5 sekundách mají pokusy zápornou bilanci, medián 27 států;
při přesně 3 sekundách přežilo horizont 77,66 % hráčů. Žádné další ladění
bodů ani záchranné mechanismy nebyly přidané. Viz SIMULACE_CZ.md.

Následující záznamy jsou **historie starších pravidel**, nikoli pravidla v7.

---

# Verze 6.0 — 7. září 2026

Pokus je vstupné za stát, ne trest za chybnou odpověď. Každých 10 000 bodů
přináší okamžitý pokus a vlajku odloženou do konce země. Před každým bonusem
je plná 12sekundová neutrální rotace. Zaplacená země a čekající bonusy se mohou
dohrát i při nulové rezervě. Uložení účtuje vstup pouze jednou; schéma a rekordy
jsou oddělené ve v6.

Bodování je 200 + až 1 800 bodů za rychlost. Měnové možnosti mají pouze obecné
názvy bez národních přívlastků a ISO kódů; plné údaje jsou ve vysvětlení a atlasu.
Opraven starší referenční překlep u marockého dirhamu.

Přidáno 20 vlastních šestnáctitaktových hudebních motivů. Celkem 21 melodií
střídá promíchaný zásobník a otázky začínají na různých místech frází. Pauza
zachovává hudební pozici. Nastavení nabízí přehrání dalšího motivu.

Vyvážení ověřeno 10 000 náhodnými běhy do 10 000 zemí a odděleným plným
herním automatem. Výsledky této starší verze byly přiloženy k vydání v6; nynější SIMULACE_CZ.md
a tests/ obsahují nové výsledky v7, nikoli toto historické vyvážení.
Následující zápisy dokumentují HISTORICKÁ pravidla předchozích verzí.

---

# Změny ve verzi 5.0.0

## Hudba: tajemný soutěžní charakter
- Nahrazen pomalý motiv v D moll novou osmítaktovou kompozicí v C dórské.
- 108 BPM, krátký synkopovaný bas, otevřené souzvuky a jemná rytmická melodie.
- Syntetická rytmická vrstva bez samplů; odstraněny dlouhé basové a držené tóny.
- Naléhavá varianta 120 BPM navazuje na rozpracovanou frázi, nepřeskakuje zpět.
- Jasnější, stále tlumená barva: hudební filtr 2 700 / 3 100 Hz.

## Znělky a nastavení
- Správná odpověď: krátce vzhůru C–D–G–C; chybná: dolů G–F–D–C.
- Zvuk vypršení a získaného pokusu navazuje na stejné tónové centrum.
- Samostatný filtr efektů a vyrovnanější hlasitost sjednocují zvukovou paletu.
- Přehrání správné a chybné odpovědi samostatnými tlačítky v nastavení.
- Ukázky zastaví hudbu a nespouštějí čas otázky; zavření a návrat respektují pauzu.
- Společný zvukový graf pro živé přehrávání i reprodukovatelnou 32sekundovou WAV ukázku.

## Zachováno
- Bonusy jen na individuálních hranicích 10 000 bodů.
- Dvanáctisekundová rotace jen při příchodu do nové země, ne mezi jejími otázkami.
- Pokusy, bodování, limity, duel, atlas, procvičování, data i všechny vlajky.
- Schéma a klíče uložených partií z v4; žádné zbytečné oddělení rekordů.
  Přístup k uložené partii závisí na dostupnosti stejného localStorage.

---

# Historie předchozích vydání

# Změny ve verzi 4.0.0

## Bonusy podle skóre
- Interval 10 000 bodů na hráče: 10 000, 20 000, 30 000 atd.
- Bonus následuje po dosažení i překročení hranice, nikoli po pěti otázkách.
- Každá hranice se spotřebuje právě jednou bez ohledu na výsledek bonusu.
- Nad otázkou je počet bodů do bonusu; odemknutý bonus je označen.
- Bonus může přerušit pětici okruhů; po něm pokračuje stejná země od dalšího okruhu.
- Získané body z bonusů se počítají do celkového skóre pro další hranice.
- Ukládání v4 zachovává i spotřebované hranice; partie v3 zůstávají nedotčené.

## Rotace pouze mezi zeměmi
- Dvanáctisekundový přílet před první zemí a při změně země.
- Bez rotace a povinného čekání mezi okruhy jedné země a kolem vloženého bonusu.
- Po dokončení země zůstávají nejméně tři otočky, zpomalení a přiblížení.
- Mobil při navazujících otázkách zůstává u otázky místo posouvání na glóbus.
- Pravidla platí i pro konečné procvičování.

## Hudba při odpovídání
- Nový pomalejší motiv v D moll, 75 BPM, hlubší bas a delší tlumené tóny.
- Samostatná mírně naléhavější varianta pro posledních pět sekund.
- Menu, přílet, vlajkový bonus a zvukové efekty zachovány.
- Přehrání/zastavení ukázky nové hudby v nastavení; otázka při něm stojí.
- Přiložená 18sekundová WAV ukázka v testech; není nutná pro hraní.

Data zemí, mapa, 195 vlajek, časové limity a bodový vzorec zůstaly zachovány.
Jednotkové a prohlížečové testy byly upraveny pro nová pravidla.

---

# Historie starších verzí (pravidla níže už neplatí pro v4)

# Změny ve verzi 3.0.0

## Opravena animace a oddech
- Plný přílet před KAŽDOU otázkou, nejen novou zemí.
- 12 sekund: oddálení, nejméně tři rovnoměrné celé otočky, plynulé dobrzdění,
  zastavení a až poté přiblížení. Viditelný čas oddechu a počet otoček.
- Výchozí plné otáčení není automaticky odstraněno systémovým reduced-motion.
  Výslovný klidový režim ponechá stejně dlouhý oddech bez otoček.
- Mobil během příletu ukazuje glóbus; po příletu posune pohled na otázku.
- Odpočet začíná až po vykreslení otázky a načtení obrázků.

## Vlajky a bonusy
- 195 vložených PNG vlajek nezávislých na internetu a systémových emoji.
- Vlajky u zemí, v atlasu i přehledu chyb.
- Po pěti běžných otázkách samostatná otázka na jinou vlajku.
- Neutrální glóbus v bonusu neprozradí odpověď; také alternativní text je neutrální.
- Správný bonus přidá pokus bez horního herního limitu; chybný bonus pokus neubere.
- Nová bonusová hudba a znělka získaného pokusu.
- Označená historická afghánská ilustrace, vyloučená z vlajkových bonusů.

## Hra na pokusy
- Zrušen pevný počet kol. Začíná se s pěti pokusy na hráče.
- Běžná chyba / vypršení času: −1. Po vyčerpání zásoby zemí se hraje dál.
- Bonus lze získat pouze do vyčerpání pokusů; vyřazený hráč už tah nedostane.
- Duel pokračuje s posledním aktivním hráčem a končí až po vyřazení obou.
- Uložený stav v3 zachovává pokusy, bonusy, zásobu zemí a zbývající čas.
  Staré partie v1/v2 se nepřevádějí; zůstávají nedotčené.
- Samostatné konečné procvičování bez času/pokusů nadále dostupné.
- Zachované časové limity 30/20/12 sekund a 100 + až 900 bodů za rychlost.

Databáze zemí a mapový podklad jsou převzaté beze změn z v2. Číselné parametry
jsou návrhem remaku, nikoli doloženým doslovným přepisem originálu.

---

# Změny ve verzi 2.0.0

## Zvuk
Nové syntetizované čipové melodie pro menu, let a otázky; samostatné efekty
pro přiblížení, přílet, správnou i chybnou odpověď, vypršení času a dokončení.
Od posledních pěti sekund se ozývá výstraha. Hudba a efekty mají samostatné
přepínače a společnou hlasitost. M přepíná zvuk; ♪ jej může spustit ještě
před hrou. Neobsahuje původní nahrávku ani vytažené noty z C64 programu.

## Glóbus
Před novou zemí následuje oddálení, nejméně dvě plné otočky, zpomalení,
zastavení a samostatný automatický zoom. Otázky i odpovědi zůstávají do příletu
skryté. Při přesunu jsou ovladače glóbu zamčené. Odchod do menu ruší nedokončenou
animaci. Omezený pohyb systému velké otočky vynechává.

## Čas a skóre
30 / 20 / 12 sekund podle obtížnosti, samostatně pro každou otázku.
Správná odpověď znamená 100 bodů + až 900 za rychlost; chybná nebo pozdní
odpověď 0. Viditelný odpočet, lišta a aktuální odměna, na mobilu i pevný
spodní panel. Čas začíná až po příletu. Výsledky ukládají skutečný čas,
bonus a počet vypršených limitů.

## Pauza, obnova a kompatibilita
P zastaví otázku a schová její obsah. Odchod z karty, nápověda, zvukové
nastavení a návrat do menu odpočet pozastaví. Obnovení zachová zbývající čas.
Staré odpovědi importované z v1 si ponechají původní pevné bodování.
Procvičování chyb zůstává bez limitu za 100 bodů. Atlas a datová edice
z předchozího vydání jsou zachovány.

Konkrétní číselné parametry a hudba jsou novou tvorbou pro tento remake,
nikoli tvrzením o přesných konstantách nebo melodiích původní C64 verze.
