# Simulace herní rovnováhy — World Geography 7.0

## Výsledek

**Při 80% úspěšnosti běžných i vlajkových otázek a čase přesně 5 sekund
na odpověď není tato ekonomika dlouhodobě udržitelná.** Z 10 000 simulovaných
hráčů nedosáhl horizontu 10 000 států nikdo. Medián délky hry je
**27 států**, průměr **35,91 státu**
a nejdelší hra v této sadě skončila po **270 státech**.

Při rychlejších odpovědích se bilance obrací. Za přesně 3 sekundy dosáhlo
horizontu 77,66 % hráčů; při náhodných časech rovnoměrně mezi 1 a 5 sekundami
71,65 %. **„Do pěti sekund“ a „vždy za pět sekund“ tedy nejsou stejný scénář.**
Ani kladná střední bilance nevylučuje prohru v nepříznivé úvodní sérii.

## Pravidla použitého sestavení

Verze 7 vrací přesně funkci bodování verze 5. Standardní obtížnost Cestovatel
má limit 20 sekund. Správná odpověď v limitu dává 100 základních bodů a až 900
za rychlost; výsledek se zaokrouhluje po desítkách:

```js
100 + 10 * Math.round(90 * (1 - elapsedMs / limitMs))
```

Při dosažení limitu je odměna nula. Při přesně 5 sekundách je tedy správná
odpověď za **780 bodů**, nikoli 1 550, 775 ani 2 000. Zaokrouhlování po desítkách
je převzaté z předchozí nižší bodové škály, nikoli nová úprava vyvážení.

Každý hráč má na začátku pět pokusů. Načtení státu, včetně prvního, stojí
jeden pokus za všech pět otázek. Chyba nebo vypršení času další pokus neodebírá.
Za každou dosaženou či překročenou hranici 10 000 bodů hráč dostává
**dva pokusy okamžitě a nárok na jednu vlajku**. Vlajka počká na dokončení
státu. Správná vlajka dává **stejné body za rychlost jako běžná odpověď
plus jeden další pokus**. Její body se započítávají i do dalších hranic.
Chybný bonus nemá odměnu ani postih. Získané bonusy se vyřídí před další zemí.

Nula rezervních pokusů neukončuje již zaplacený stát ani získané bonusy.
Teprve potom se rozhoduje, zda zbývá pokus na další stát. Model nepoužívá
skryté záchrany, strop počtu získaných pokusů ani dodatečné zvýšení bodů.

## Srovnání scénářů

Každý řádek má **10 000 nezávislých simulovaných hráčů** a horizont
**10 000 států**. Úspěšnosti před lomítkem patří běžným otázkám, za lomítkem
vlajkám. „Pokračovalo“ znamená dokončení všech 10 000 států a všech získaných
bonusů s alespoň jedním pokusem na další stát, nikoli dokázané nekonečné přežití.
Časové nastavení se vztahuje také na vlajku.

| Úspěšnost běžné / vlajky a čas | Bodů za správnou, průměr | Teoretická změna pokusů / stát | Pokračovalo po 10 000 státech | Medián rezervy přeživších |
|---|---:|---:|---:|---:|
| 80 % / 80 % · přesně 5 s | 780 | −0,0683 | 0 / 10 000 (0,00 %) | — |
| 80 % / 80 % · přesně 4 s | 820 | −0,0171 | 0 / 10 000 (0,00 %) | — |
| 80 % / 80 % · přesně 3 s | 870 | +0,0473 | 7 766 / 10 000 (77,66 %) | 478 |
| 80 % / 80 % · přesně 2 s | 910 | +0,0992 | 9 489 / 10 000 (94,89 %) | 995 |
| 80 % / 80 % · náhodně 1–5 s | 865 | +0,0408 | 7 165 / 10 000 (71,65 %) | 414 |
| 85 % / 85 % · přesně 5 s | 780 | +0,0119 | 3 999 / 10 000 (39,99 %) | 129 |
| 80 % / 90 % · přesně 5 s | 780 | −0,0269 | 0 / 10 000 (0,00 %) | — |

U náhodných časů je každý čas nezávislý, rovnoměrně rozložený na spojitém
intervalu 1–5 sekund. Průměrný čas je 3 sekundy, ale průměrná odměna 865 bodů.
Za odpověď **přesně** v čase 3,000 sekundy je vlivem zaokrouhlení nahoru na
půli desítky odměna 870 bodů; proto tyto dva řádky nemají totožnou bilanci.
Časy a správnost jsou v modelu nezávislé. Celkem bylo v sedmi sadách zpracováno
**288 283 974 států**.

### Rozptyl Monte Carlo odhadu

Pro orientaci jsou níže 95% Wilsonovy intervaly pro pravděpodobnost dosažení
simulovaného horizontu v daném modelu. Jde o nejistotu náhodného odhadu,
nikoli o interval pokrývající rozdíly mezi skutečnými lidmi a modelem.

| Scénář | 95% interval podílu pokračujících |
|---|---:|
| 80 % / 80 % · přesně 5 s | 0,00–0,04 % |
| 80 % / 80 % · přesně 4 s | 0,00–0,04 % |
| 80 % / 80 % · přesně 3 s | 76,83–78,47 % |
| 80 % / 80 % · přesně 2 s | 94,44–95,30 % |
| 80 % / 80 % · náhodně 1–5 s | 70,76–72,52 % |
| 85 % / 85 % · přesně 5 s | 39,03–40,95 % |
| 80 % / 90 % · přesně 5 s | 0,00–0,04 % |

## Základní scénář podrobně: 80 %, 5 sekund

| Ukazatel | Výsledek |
|---|---:|
| Počet her | 10 000 |
| Správná odpověď | 780 bodů |
| Medián délky hry | 27 států |
| Průměrná délka hry | 35,91 státu |
| 10. / 90. percentil délky | 10 / 72 států |
| Nejkratší / nejdelší hra | 7 / 270 států |
| Zbýval pokus po 25. státu | 5 301 hráčům |
| Zbýval pokus po 50. státu | 2 065 hráčům |
| Zbýval pokus po 100. státu | 415 hráčům |
| Zbýval pokus po 250. státu | 5 hráčům |
| Naměřená úspěšnost běžných / vlajkových odpovědí | 79,9931 % / 79,9113 % |

Oddechy nejsou z délky hry odstraněné pravidly: ve skutečné hře trvá rotace
12 sekund před státem i před vlajkou. Simulátor na tyto animace nečeká, protože
se během nich nemění skóre, pokusy ani čas pro odpověď. Počet států lze takto
simulovat rychle, ale nejde o záznam lidského hraní v reálném čase.

## Proč se pokusy při pěti sekundách tenčí

Označme `p` pravděpodobnost běžné správné odpovědi, `q` pravděpodobnost
správné vlajky a `P` průměr bodů za správnou odpověď. Za stát je v průměru
`R = 5 × p × P` bodů z běžných otázek. Pokud `B` je dlouhodobý počet bonusů
na stát, musí zahrnovat i bonusové body:

```text
B = (R + B × q × P) / 10000
B = R / (10000 − q × P)
Získané pokusy na stát = B × (2 + q)
Čistá změna rezervy = B × (2 + q) − 1
```

Při `p = q = 0,8`, `P = 780`:

```text
R = 5 × 0,8 × 780 = 3120 bodů
B = 3120 / (10000 − 624) = 0,3327645 bonusu na stát
Příjem pokusů = 0,3327645 × 2,8 = 0,9317406
Čistá změna = −0,0682594 pokusu na stát
```

Hráč dlouhodobě získává přibližně 0,932 pokusu za každý zaplacený pokus.
To je úbytek asi jednoho pokusu za 14,65 státu ve střední bilanci. Neznamená
to, že lze délku hry přesně odhadnout dělením počátečních pěti pokusů tímto
úbytkem: hranice se vyplácejí skokově, první stát se platí předem a náhodné série
mohou zásobu vyčerpat dřív. Konečná bilance s celočíselnými hranicemi byla
kontrolována v každé simulované hře:

```text
rezerva = 5 − počet načtených států
          + 2 × floor(skóre / 10000)
          + počet správných vlajek
```

### Hranice kladné průměrné bilance

Při stejné 80% úspěšnosti běžných i vlajkových otázek musí průměr bodů za
správnou odpověď překročit **833,33 bodu**. U stálého času a bodů po desítkách
je proto potřeba alespoň **840 bodů**: ve standardním režimu přibližně
**3,66 sekundy nebo rychleji**. U proměnlivých časů rozhoduje průměr přidělených
bodů, nikoli nejpomalejší odpověď.

Při pevných pěti sekundách a stejné úspěšnosti v obou typech otázek musí být
úspěšnost pro kladnou bilanci vyšší než přibližně **84,27 %**.
Při pevných 80 % u běžných otázek a pěti sekundách by samotné vlajky musely
mít úspěšnost přes **96,41 %**. Ani kladný průměr není záruka přežití jednotlivce:
například při 85 % správně a pěti sekundách se udrží kladná bilance, ale celý
horizont v této sadě zvládlo jen 39,99 % hráčů.

## Kontrola bez náhodných sérií

Pevné pořadí čtyř správných a jedné chybné odpovědi v každém státu a také
čtyř správných vlajek z každých pěti:

| Čas | Dokončených států | Skóre | Vlajek | Zbývající pokusy |
|---|---:|---:|---:|---:|
| 5 s | 33 | 109 200 | 10 | 0 |
| 3 s | 10 000 | 37 403 040 | 3 740 | 477 |

Pětisekundová hra tedy skončí i bez náhodně vzniklých dlouhých sérií chyb.
Ve třísekundové se při tomto pevném vzorci zastavil pouze testovací horizont,
nikoli hra sama.

## Shoda simulátoru se skutečným herním automatem

`tests/simulate.js` volá stejné funkce `pointsForTime`, `createEconomy`,
`spendCountryAttempt`, `awardPoints`, `consumeBonus` a `awardFlagAttempt`
jako hra. Pouze slučuje připsání bodů za pět otázek již zaplaceného státu.
To nezmění rozhodnutí na jeho konci: uvnitř něj se další pokus neodečítá,
nulová rezerva neukončuje hru a bonusy jsou odložené až po páté otázce.

`tests/simulation.test.js` porovnal 48 běhů redukovaného modelu s plným
herním automatem, včetně generování zemí, otázek, bonusů a konce hry.
Shodovalo se skóre, rezerva, počet států, počet správných odpovědí i počet
bonusů, dohromady přes 19 762 odpovědí. Polovina srovnání používá pevný čas,
polovina náhodný čas 1–5 sekund. Dále bylo 8 859 časových vzorků porovnáno
s původním nižším bodovacím vzorcem.

Oddělený test plného automatu prošel 2 000 států s pravidelnou 80% úspěšností
za 3 sekundy: 748 bonusů, skóre 7 481 130 a 100 zbývajících pokusů. Náhodný
pětisekundový test se semenem 71007 skončil po 18 státech s nulovou rezervou;
jde o jeden konkrétní průběh, ne průměr z hlavní simulace.

## Reprodukce a omezení

Po rozbalení zdrojů v adresáři World-Geography:

```sh
node tests/simulate.js
node tests/simulation.test.js
node tests/core.test.js
node tests/timing.test.js
```

Hlavní sada používá semeno 7100007. Semena všech scénářů, přesné souhrny,
checkpointy a ukázkové prohry jsou v `tests/simulation-results.json`.
Úplný výstup je v `tests/simulation-run-v7.log`. Simulátor nepotřebuje internet
ani další balíčky pro Node.js. Všechny vzorce a testovací skripty jsou přiložené.

Nezávislá správnost je modelový předpoklad. Skutečný hráč může mít silnější
či slabší oblasti, korelované chyby, jinou znalost vlajek a různé reakční časy;
v dlouhé partii se navíc může učit či unavit. Simulace neodvozuje svou
pravděpodobnost správnosti z konkrétního obsahu databáze. Kladná průměrná
bilance ani dosažení konečného horizontu není slib nekonečné hry.

Pravidla v7 byla nastavena podle uživatelem popsaného ověření v originálu.
Simulace ověřuje tento remake, nikoli původní program pro C64. Další parametry
nebyly upraveny tak, aby vynutily dřívější požadavek na téměř nekonečnou hru.
