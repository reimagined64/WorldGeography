# English dataset — review artifact

<!-- Machine-written by `npm run data:review`. Do not hand-edit: edit
     `data/overrides/countries.en.json` for a name, `notes.en.json` for a note
     or `data/build/sources.json` for a citation, then regenerate. -->

Generated from the fetch of 2026-09-15, reference year 2026.

Every English value the pipeline produces, beside its Czech counterpart.
`pinned` means `data/overrides/countries.en.json` names it. `CLDR` means the
value is whatever `Intl.DisplayNames` returned and nobody has looked at it.
A **bold** source is the row to look at first: the Czech side decided CLDR
was wrong there, and the English side took its word.

663 values in total; 0 where Czech corrected CLDR and English did not.

The last two tables are a different kind of review. They hold the prose U17
translated by hand — the notes and the citations — where nothing was
generated and so nothing can be flagged: both columns are somebody's
writing, and they are here to be read against each other.

Nothing is outstanding.

## Country names

195 entries: 21 pinned in `countries.en.json`, 174 taken from CLDR.
0 of them are ones the Czech side overrode and the English side did not.
CLDR gives four of these a form a quiz cannot use — two Congos disambiguated with a city, Myanmar with a parenthesis, Palestine as a territory — and those four are pinned. The rest are pinned where they are already right, so a CLDR release that moves one is reported as a shadowed change rather than shipped.

| Code | Czech | English | Czech overrides | English source |
| --- | --- | --- | --- | --- |
| AF | Afghánistán | Afghanistan |  | CLDR |
| AL | Albánie | Albania |  | CLDR |
| DZ | Alžírsko | Algeria |  | CLDR |
| AD | Andorra | Andorra |  | CLDR |
| AO | Angola | Angola |  | CLDR |
| AG | Antigua a Barbuda | Antigua and Barbuda |  | pinned |
| AR | Argentina | Argentina |  | CLDR |
| AM | Arménie | Armenia |  | CLDR |
| AU | Austrálie | Australia |  | CLDR |
| BS | Bahamy | Bahamas |  | CLDR |
| BH | Bahrajn | Bahrain |  | CLDR |
| BD | Bangladéš | Bangladesh |  | CLDR |
| BB | Barbados | Barbados |  | CLDR |
| BE | Belgie | Belgium |  | CLDR |
| BZ | Belize | Belize |  | CLDR |
| BJ | Benin | Benin |  | CLDR |
| BT | Bhútán | Bhutan |  | CLDR |
| BO | Bolívie | Bolivia |  | CLDR |
| BA | Bosna a Hercegovina | Bosnia and Herzegovina |  | pinned |
| BW | Botswana | Botswana |  | CLDR |
| BR | Brazílie | Brazil |  | CLDR |
| BN | Brunej | Brunei |  | CLDR |
| BG | Bulharsko | Bulgaria |  | CLDR |
| BF | Burkina Faso | Burkina Faso |  | CLDR |
| BI | Burundi | Burundi |  | CLDR |
| BY | Bělorusko | Belarus |  | CLDR |
| CL | Chile | Chile |  | CLDR |
| HR | Chorvatsko | Croatia |  | CLDR |
| CD | Demokratická republika Kongo | Democratic Republic of the Congo | yes | pinned |
| DM | Dominika | Dominica |  | CLDR |
| DO | Dominikánská republika | Dominican Republic |  | CLDR |
| DK | Dánsko | Denmark |  | CLDR |
| DJ | Džibutsko | Djibouti |  | CLDR |
| EG | Egypt | Egypt |  | CLDR |
| EC | Ekvádor | Ecuador |  | CLDR |
| ER | Eritrea | Eritrea |  | CLDR |
| EE | Estonsko | Estonia |  | CLDR |
| SZ | Eswatini | Eswatini | yes | pinned |
| ET | Etiopie | Ethiopia |  | CLDR |
| FJ | Fidži | Fiji |  | CLDR |
| PH | Filipíny | Philippines |  | CLDR |
| FI | Finsko | Finland |  | CLDR |
| FR | Francie | France |  | CLDR |
| GA | Gabon | Gabon |  | CLDR |
| GM | Gambie | Gambia |  | CLDR |
| GH | Ghana | Ghana |  | CLDR |
| GD | Grenada | Grenada |  | CLDR |
| GE | Gruzie | Georgia |  | CLDR |
| GT | Guatemala | Guatemala |  | CLDR |
| GN | Guinea | Guinea |  | CLDR |
| GW | Guinea-Bissau | Guinea-Bissau |  | CLDR |
| GY | Guyana | Guyana |  | CLDR |
| HT | Haiti | Haiti |  | CLDR |
| HN | Honduras | Honduras |  | CLDR |
| IN | Indie | India |  | CLDR |
| ID | Indonésie | Indonesia |  | CLDR |
| IE | Irsko | Ireland |  | CLDR |
| IQ | Irák | Iraq |  | CLDR |
| IS | Island | Iceland |  | CLDR |
| IT | Itálie | Italy |  | CLDR |
| IL | Izrael | Israel |  | CLDR |
| JM | Jamajka | Jamaica |  | CLDR |
| JP | Japonsko | Japan |  | CLDR |
| YE | Jemen | Yemen |  | CLDR |
| ZA | Jihoafrická republika | South Africa |  | CLDR |
| KR | Jižní Korea | South Korea | yes | pinned |
| SS | Jižní Súdán | South Sudan |  | CLDR |
| JO | Jordánsko | Jordan |  | CLDR |
| KH | Kambodža | Cambodia |  | CLDR |
| CM | Kamerun | Cameroon |  | CLDR |
| CA | Kanada | Canada |  | CLDR |
| CV | Kapverdy | Cape Verde | yes | pinned |
| QA | Katar | Qatar |  | CLDR |
| KZ | Kazachstán | Kazakhstan |  | CLDR |
| KE | Keňa | Kenya |  | CLDR |
| KI | Kiribati | Kiribati |  | CLDR |
| CO | Kolumbie | Colombia |  | CLDR |
| KM | Komory | Comoros |  | CLDR |
| CG | Konžská republika | Republic of the Congo | yes | pinned |
| CR | Kostarika | Costa Rica |  | CLDR |
| CU | Kuba | Cuba |  | CLDR |
| KW | Kuvajt | Kuwait |  | CLDR |
| CY | Kypr | Cyprus |  | CLDR |
| KG | Kyrgyzstán | Kyrgyzstan |  | CLDR |
| LA | Laos | Laos |  | CLDR |
| LS | Lesotho | Lesotho |  | CLDR |
| LB | Libanon | Lebanon |  | CLDR |
| LY | Libye | Libya |  | CLDR |
| LR | Libérie | Liberia |  | CLDR |
| LI | Lichtenštejnsko | Liechtenstein |  | CLDR |
| LT | Litva | Lithuania |  | CLDR |
| LV | Lotyšsko | Latvia |  | CLDR |
| LU | Lucembursko | Luxembourg |  | CLDR |
| MG | Madagaskar | Madagascar |  | CLDR |
| MY | Malajsie | Malaysia |  | CLDR |
| MW | Malawi | Malawi |  | CLDR |
| MV | Maledivy | Maldives |  | CLDR |
| ML | Mali | Mali |  | CLDR |
| MT | Malta | Malta |  | CLDR |
| MA | Maroko | Morocco |  | CLDR |
| MH | Marshallovy ostrovy | Marshall Islands |  | CLDR |
| MU | Mauricius | Mauritius |  | CLDR |
| MR | Mauritánie | Mauritania |  | CLDR |
| HU | Maďarsko | Hungary |  | CLDR |
| MX | Mexiko | Mexico |  | CLDR |
| FM | Mikronésie | Micronesia |  | CLDR |
| MD | Moldavsko | Moldova |  | CLDR |
| MC | Monako | Monaco |  | CLDR |
| MN | Mongolsko | Mongolia |  | CLDR |
| MZ | Mosambik | Mozambique |  | CLDR |
| MM | Myanmar | Myanmar | yes | pinned |
| NA | Namibie | Namibia |  | CLDR |
| NR | Nauru | Nauru |  | CLDR |
| NP | Nepál | Nepal |  | CLDR |
| NE | Niger | Niger |  | CLDR |
| NG | Nigérie | Nigeria |  | CLDR |
| NI | Nikaragua | Nicaragua |  | CLDR |
| NL | Nizozemsko | Netherlands |  | CLDR |
| NO | Norsko | Norway |  | CLDR |
| NZ | Nový Zéland | New Zealand |  | CLDR |
| DE | Německo | Germany |  | CLDR |
| OM | Omán | Oman |  | CLDR |
| PW | Palau | Palau |  | CLDR |
| PS | Palestina | Palestine | yes | pinned |
| PA | Panama | Panama |  | CLDR |
| PG | Papua-Nová Guinea | Papua New Guinea |  | CLDR |
| PY | Paraguay | Paraguay |  | CLDR |
| PE | Peru | Peru |  | CLDR |
| CI | Pobřeží slonoviny | Côte d’Ivoire | yes | pinned |
| PL | Polsko | Poland |  | CLDR |
| PT | Portugalsko | Portugal |  | CLDR |
| PK | Pákistán | Pakistan |  | CLDR |
| AT | Rakousko | Austria |  | CLDR |
| GQ | Rovníková Guinea | Equatorial Guinea |  | CLDR |
| RO | Rumunsko | Romania |  | CLDR |
| RU | Rusko | Russia |  | CLDR |
| RW | Rwanda | Rwanda |  | CLDR |
| SV | Salvador | El Salvador |  | CLDR |
| WS | Samoa | Samoa |  | CLDR |
| SM | San Marino | San Marino |  | CLDR |
| SA | Saúdská Arábie | Saudi Arabia |  | CLDR |
| SN | Senegal | Senegal |  | CLDR |
| KP | Severní Korea | North Korea | yes | pinned |
| MK | Severní Makedonie | North Macedonia | yes | pinned |
| SC | Seychely | Seychelles |  | CLDR |
| SL | Sierra Leone | Sierra Leone |  | CLDR |
| SG | Singapur | Singapore |  | CLDR |
| SK | Slovensko | Slovakia |  | CLDR |
| SI | Slovinsko | Slovenia |  | CLDR |
| SO | Somálsko | Somalia |  | CLDR |
| AE | Spojené arabské emiráty | United Arab Emirates |  | CLDR |
| GB | Spojené království | United Kingdom | yes | pinned |
| US | Spojené státy | United States | yes | pinned |
| RS | Srbsko | Serbia |  | CLDR |
| LK | Srí Lanka | Sri Lanka |  | CLDR |
| CF | Středoafrická republika | Central African Republic |  | CLDR |
| SR | Surinam | Suriname |  | CLDR |
| LC | Svatá Lucie | St. Lucia |  | CLDR |
| KN | Svatý Kryštof a Nevis | Saint Kitts and Nevis |  | pinned |
| ST | Svatý Tomáš a Princův ostrov | São Tomé and Príncipe |  | pinned |
| VC | Svatý Vincenc a Grenadiny | Saint Vincent and the Grenadines |  | pinned |
| SD | Súdán | Sudan |  | CLDR |
| SY | Sýrie | Syria |  | CLDR |
| TZ | Tanzanie | Tanzania |  | CLDR |
| TH | Thajsko | Thailand |  | CLDR |
| TG | Togo | Togo |  | CLDR |
| TO | Tonga | Tonga |  | CLDR |
| TT | Trinidad a Tobago | Trinidad and Tobago |  | pinned |
| TN | Tunisko | Tunisia |  | CLDR |
| TR | Turecko | Türkiye |  | CLDR |
| TM | Turkmenistán | Turkmenistan |  | CLDR |
| TV | Tuvalu | Tuvalu |  | CLDR |
| TJ | Tádžikistán | Tajikistan |  | CLDR |
| UG | Uganda | Uganda |  | CLDR |
| UA | Ukrajina | Ukraine |  | CLDR |
| UY | Uruguay | Uruguay |  | CLDR |
| UZ | Uzbekistán | Uzbekistan |  | CLDR |
| VU | Vanuatu | Vanuatu |  | CLDR |
| VA | Vatikán | Vatican City | yes | pinned |
| VE | Venezuela | Venezuela |  | CLDR |
| VN | Vietnam | Vietnam |  | CLDR |
| TL | Východní Timor | Timor-Leste | yes | pinned |
| ZM | Zambie | Zambia |  | CLDR |
| ZW | Zimbabwe | Zimbabwe |  | CLDR |
| AZ | Ázerbájdžán | Azerbaijan |  | CLDR |
| IR | Írán | Iran |  | CLDR |
| TD | Čad | Chad |  | CLDR |
| ME | Černá Hora | Montenegro |  | CLDR |
| CZ | Česko | Czechia | yes | pinned |
| CN | Čína | China |  | CLDR |
| GR | Řecko | Greece |  | CLDR |
| SB | Šalamounovy ostrovy | Solomon Islands |  | CLDR |
| ES | Španělsko | Spain |  | CLDR |
| SE | Švédsko | Sweden |  | CLDR |
| CH | Švýcarsko | Switzerland |  | CLDR |

## Capitals

198 entries: 9 pinned in `countries.en.json`, 189 taken from upstream.
87 of them are ones the Czech side overrode and the English side did not.
English is the language upstream writes these in, so an English entry is a respelling and a Czech entry is an exonym. A Czech override here is expected and is not a signal about the English side, which is why the count above is reported and not flagged in the totals.

| Upstream name | Czech | English | Czech overrides | English source |
| --- | --- | --- | --- | --- |
| Abu Dhabi | Abú Zabí | Abu Dhabi | yes | upstream |
| Abuja | Abuja | Abuja |  | upstream |
| Accra | Accra | Accra |  | upstream |
| Addis Ababa | Addis Abeba | Addis Ababa | yes | upstream |
| Algiers | Alžír | Algiers | yes | upstream |
| Amman | Ammán | Amman | yes | upstream |
| Amsterdam | Amsterdam | Amsterdam |  | upstream |
| Andorra la Vella | Andorra la Vella | Andorra la Vella |  | upstream |
| Ankara | Ankara | Ankara |  | upstream |
| Antananarivo | Antananarivo | Antananarivo |  | upstream |
| Apia | Apia | Apia |  | upstream |
| Ashgabat | Ašchabad | Ashgabat | yes | upstream |
| Asmara | Asmara | Asmara |  | upstream |
| Astana | Astana | Astana |  | upstream |
| Asunción | Asunción | Asunción |  | upstream |
| Athens | Atény | Athens | yes | upstream |
| Baghdad | Bagdád | Baghdad | yes | upstream |
| Baku | Baku | Baku | yes | upstream |
| Bamako | Bamako | Bamako |  | upstream |
| Bandar Seri Begawan | Bandar Seri Begawan | Bandar Seri Begawan |  | upstream |
| Bangkok | Bangkok | Bangkok |  | upstream |
| Bangui | Bangui | Bangui |  | upstream |
| Banjul | Banjul | Banjul |  | upstream |
| Basseterre | Basseterre | Basseterre |  | upstream |
| Beijing | Peking | Beijing | yes | upstream |
| Beirut | Bejrút | Beirut | yes | upstream |
| Belgrade | Bělehrad | Belgrade | yes | upstream |
| Belmopan | Belmopan | Belmopan |  | upstream |
| Berlin | Berlín | Berlin | yes | upstream |
| Bern | Bern | Bern |  | upstream |
| Bishkek | Biškek | Bishkek | yes | upstream |
| Bissau | Bissau | Bissau |  | upstream |
| Bloemfontein | Bloemfontein | Bloemfontein |  | upstream |
| Bogotá | Bogotá | Bogotá |  | upstream |
| Brasília | Brasília | Brasília | yes | upstream |
| Bratislava | Bratislava | Bratislava |  | upstream |
| Brazzaville | Brazzaville | Brazzaville |  | upstream |
| Bridgetown | Bridgetown | Bridgetown |  | upstream |
| Brussels | Brusel | Brussels | yes | upstream |
| Bucharest | Bukurešť | Bucharest | yes | upstream |
| Budapest | Budapešť | Budapest | yes | upstream |
| Buenos Aires | Buenos Aires | Buenos Aires |  | upstream |
| Cairo | Káhira | Cairo | yes | upstream |
| Canberra | Canberra | Canberra |  | upstream |
| Cape Town | Kapské Město | Cape Town | yes | upstream |
| Caracas | Caracas | Caracas |  | upstream |
| Castries | Castries | Castries |  | upstream |
| Chisinau | Kišiněv | Chisinau | yes | upstream |
| City of San Marino | San Marino | San Marino | yes | pinned |
| Ciudad de la Paz | Ciudad de la Paz | Ciudad de la Paz |  | upstream |
| Conakry | Conakry | Conakry |  | upstream |
| Copenhagen | Kodaň | Copenhagen | yes | upstream |
| Dakar | Dakar | Dakar |  | upstream |
| Damascus | Damašek | Damascus | yes | upstream |
| Dhaka | Dháka | Dhaka | yes | upstream |
| Dili | Dili | Dili |  | upstream |
| Djibouti | Džibuti | Djibouti | yes | upstream |
| Dodoma | Dodoma | Dodoma |  | upstream |
| Doha | Dauhá | Doha | yes | upstream |
| Dublin | Dublin | Dublin |  | upstream |
| Dushanbe | Dušanbe | Dushanbe | yes | upstream |
| East Jerusalem | Východní Jeruzalém (nárokovaný) | East Jerusalem (claimed) | yes | pinned |
| Freetown | Freetown | Freetown |  | upstream |
| Funafuti | Funafuti | Funafuti |  | upstream |
| Gaborone | Gaborone | Gaborone |  | upstream |
| Georgetown | Georgetown | Georgetown |  | upstream |
| Gitega | Gitega | Gitega |  | upstream |
| Guatemala City | Ciudad de Guatemala | Guatemala City | yes | upstream |
| Hanoi | Hanoj | Hanoi | yes | upstream |
| Harare | Harare | Harare |  | upstream |
| Havana | Havana | Havana | yes | upstream |
| Helsinki | Helsinky | Helsinki | yes | upstream |
| Honiara | Honiara | Honiara |  | upstream |
| Islamabad | Islámábád | Islamabad | yes | upstream |
| Jakarta | Jakarta | Jakarta |  | upstream |
| Jerusalem | Jeruzalém | Jerusalem | yes | upstream |
| Juba | Džuba | Juba | yes | upstream |
| Kabul | Kábul | Kabul | yes | upstream |
| Kampala | Kampala | Kampala |  | upstream |
| Kathmandu | Káthmándú | Kathmandu | yes | upstream |
| Khartoum | Chartúm | Khartoum | yes | upstream |
| Kigali | Kigali | Kigali |  | upstream |
| Kingston | Kingston | Kingston |  | upstream |
| Kingstown | Kingstown | Kingstown |  | upstream |
| Kinshasa | Kinshasa | Kinshasa |  | upstream |
| Kuala Lumpur | Kuala Lumpur | Kuala Lumpur |  | upstream |
| Kuwait City | Kuvajt | Kuwait City | yes | upstream |
| Kyiv | Kyjev | Kyiv | yes | upstream |
| Libreville | Libreville | Libreville |  | upstream |
| Lilongwe | Lilongwe | Lilongwe |  | upstream |
| Lima | Lima | Lima |  | upstream |
| Lisbon | Lisabon | Lisbon | yes | upstream |
| Ljubljana | Lublaň | Ljubljana | yes | upstream |
| Lobamba | Lobamba | Lobamba |  | upstream |
| Lomé | Lomé | Lomé |  | upstream |
| London | Londýn | London | yes | upstream |
| Luanda | Luanda | Luanda |  | upstream |
| Lusaka | Lusaka | Lusaka |  | upstream |
| Luxembourg | Lucemburk | Luxembourg | yes | upstream |
| Madrid | Madrid | Madrid |  | upstream |
| Majuro | Majuro | Majuro |  | upstream |
| Malé | Malé | Malé | yes | upstream |
| Managua | Managua | Managua |  | upstream |
| Manama | Manáma | Manama | yes | upstream |
| Manila | Manila | Manila |  | upstream |
| Maputo | Maputo | Maputo |  | upstream |
| Maseru | Maseru | Maseru |  | upstream |
| Mbabane | Mbabane | Mbabane |  | upstream |
| Mexico City | Ciudad de México | Mexico City | yes | upstream |
| Minsk | Minsk | Minsk |  | upstream |
| Mogadishu | Mogadišo | Mogadishu | yes | upstream |
| Monaco | Monako | Monaco | yes | upstream |
| Monrovia | Monrovia | Monrovia |  | upstream |
| Montevideo | Montevideo | Montevideo |  | upstream |
| Moroni | Moroni | Moroni |  | upstream |
| Moscow | Moskva | Moscow | yes | upstream |
| Muscat | Maskat | Muscat | yes | upstream |
| N'Djamena | N’Djamena | N’Djamena | yes | pinned |
| Nairobi | Nairobi | Nairobi |  | upstream |
| Nassau | Nassau | Nassau |  | upstream |
| Naypyidaw | Neipyijto | Naypyidaw | yes | upstream |
| New Delhi | Nové Dillí | New Delhi | yes | upstream |
| Ngerulmud | Ngerulmud | Ngerulmud |  | upstream |
| Niamey | Niamey | Niamey |  | upstream |
| Nicosia | Nikósie | Nicosia | yes | upstream |
| Nouakchott | Nuakšott | Nouakchott | yes | upstream |
| Nuku'alofa | Nukuʻalofa | Nukuʻalofa | yes | pinned |
| Oslo | Oslo | Oslo |  | upstream |
| Ottawa | Ottawa | Ottawa |  | upstream |
| Ouagadougou | Ouagadougou | Ouagadougou |  | upstream |
| Palikir | Palikir | Palikir |  | upstream |
| Panama City | Ciudad de Panamá | Panama City | yes | upstream |
| Paramaribo | Paramaribo | Paramaribo |  | upstream |
| Paris | Paříž | Paris | yes | upstream |
| Phnom Penh | Phnompenh | Phnom Penh | yes | upstream |
| Podgorica | Podgorica | Podgorica |  | upstream |
| Port Louis | Port Louis | Port Louis |  | upstream |
| Port Moresby | Port Moresby | Port Moresby | yes | upstream |
| Port of Spain | Port of Spain | Port of Spain |  | upstream |
| Port Vila | Port Vila | Port Vila |  | upstream |
| Port-au-Prince | Port-au-Prince | Port-au-Prince | yes | upstream |
| Porto-Novo | Porto-Novo | Porto-Novo |  | upstream |
| Prague | Praha | Prague | yes | upstream |
| Praia | Praia | Praia |  | upstream |
| Pretoria | Pretoria | Pretoria | yes | upstream |
| Pyongyang | Pchjongjang | Pyongyang | yes | upstream |
| Quito | Quito | Quito |  | upstream |
| Rabat | Rabat | Rabat |  | upstream |
| Reykjavik | Reykjavík | Reykjavík | yes | pinned |
| Riga | Riga | Riga |  | upstream |
| Riyadh | Rijád | Riyadh | yes | upstream |
| Rome | Řím | Rome | yes | upstream |
| Roseau | Roseau | Roseau |  | upstream |
| Saint John's | Saint John’s | Saint John’s | yes | pinned |
| San José | San José | San José | yes | upstream |
| San Salvador | San Salvador | San Salvador |  | upstream |
| Sana'a | Saná | Sanaa | yes | pinned |
| Santiago | Santiago | Santiago |  | upstream |
| Santo Domingo | Santo Domingo | Santo Domingo |  | upstream |
| São Tomé | São Tomé | São Tomé | yes | upstream |
| Sarajevo | Sarajevo | Sarajevo | yes | upstream |
| Seoul | Soul | Seoul | yes | upstream |
| Singapore | Singapur | Singapore | yes | upstream |
| Skopje | Skopje | Skopje | yes | upstream |
| Sofia | Sofie | Sofia | yes | upstream |
| South Tarawa | Jižní Tarawa | South Tarawa | yes | upstream |
| Sri Jayawardenepura Kotte | Šrí Džajavardanapura Kotte | Sri Jayawardenepura Kotte | yes | upstream |
| St. George's | Saint George’s | Saint George’s | yes | pinned |
| Stockholm | Stockholm | Stockholm | yes | upstream |
| Sucre | Sucre | Sucre |  | upstream |
| Suva | Suva | Suva |  | upstream |
| Tallinn | Tallinn | Tallinn |  | upstream |
| Tashkent | Taškent | Tashkent | yes | upstream |
| Tbilisi | Tbilisi | Tbilisi | yes | upstream |
| Tegucigalpa | Tegucigalpa | Tegucigalpa |  | upstream |
| Tehran | Teherán | Tehran | yes | upstream |
| Thimphu | Thimphu | Thimphu | yes | upstream |
| Tirana | Tirana | Tirana | yes | upstream |
| Tokyo | Tokio | Tokyo | yes | upstream |
| Tripoli | Tripolis | Tripoli | yes | upstream |
| Tunis | Tunis | Tunis |  | upstream |
| Ulaanbaatar | Ulánbátar | Ulaanbaatar | yes | upstream |
| Vaduz | Vaduz | Vaduz |  | upstream |
| Valletta | Valletta | Valletta |  | upstream |
| Vatican City | Vatikán | Vatican City | yes | upstream |
| Victoria | Victoria | Victoria |  | upstream |
| Vienna | Vídeň | Vienna | yes | upstream |
| Vientiane | Vientiane | Vientiane |  | upstream |
| Vilnius | Vilnius | Vilnius |  | upstream |
| Warsaw | Varšava | Warsaw | yes | upstream |
| Washington, D.C. | Washington, D.C. | Washington, D.C. | yes | upstream |
| Wellington | Wellington | Wellington |  | upstream |
| Windhoek | Windhoek | Windhoek |  | upstream |
| Yamoussoukro | Yamoussoukro | Yamoussoukro |  | upstream |
| Yaoundé | Yaoundé | Yaoundé |  | upstream |
| Yaren | Yaren (sídlo vlády) | Yaren (seat of government) | yes | pinned |
| Yerevan | Jerevan | Yerevan | yes | upstream |
| Zagreb | Záhřeb | Zagreb | yes | upstream |

## Currencies

142 entries: 2 pinned in `countries.en.json`, 140 taken from CLDR.
0 of them are ones the Czech side overrode and the English side did not.
The quiz unit in the key is the bare word a player is offered as an option; the two columns are the full name the atlas and the explanation print.

| Code · quiz unit (cs / en) | Czech | English | Czech overrides | English source |
| --- | --- | --- | --- | --- |
| AED · dirham / dirham | SAE dirham | United Arab Emirates Dirham |  | CLDR |
| AFN · afghán / afghani | afghánský afghán | Afghan Afghani |  | CLDR |
| ALL · lek / lek | albánský lek | Albanian Lek |  | CLDR |
| AMD · dram / dram | arménský dram | Armenian Dram |  | CLDR |
| AOA · kwanza / kwanza | angolská kwanza | Angolan Kwanza |  | CLDR |
| ARS · peso / peso | argentinské peso | Argentine Peso |  | CLDR |
| AUD · dolar / dollar | australský dolar | Australian Dollar |  | CLDR |
| AZN · manat / manat | ázerbájdžánský manat | Azerbaijani Manat |  | CLDR |
| BAM · marka / mark | bosenská konvertibilní marka | Bosnia-Herzegovina Convertible Mark |  | CLDR |
| BBD · dolar / dollar | barbadoský dolar | Barbadian Dollar |  | CLDR |
| BDT · taka / taka | bangladéšská taka | Bangladeshi Taka |  | CLDR |
| BHD · dinár / dinar | bahrajnský dinár | Bahraini Dinar |  | CLDR |
| BIF · frank / franc | burundský frank | Burundian Franc |  | CLDR |
| BND · dolar / dollar | brunejský dolar | Brunei Dollar |  | CLDR |
| BOB · boliviano / boliviano | bolivijský boliviano | Bolivian Boliviano |  | CLDR |
| BRL · real / real | brazilský real | Brazilian Real |  | CLDR |
| BSD · dolar / dollar | bahamský dolar | Bahamian Dollar |  | CLDR |
| BTN · ngultrum / ngultrum | bhútánský ngultrum | Bhutanese Ngultrum |  | CLDR |
| BWP · pula / pula | botswanská pula | Botswanan Pula |  | CLDR |
| BYN · rubl / ruble | běloruský rubl | Belarusian Ruble |  | CLDR |
| BZD · dolar / dollar | belizský dolar | Belize Dollar |  | CLDR |
| CAD · dolar / dollar | kanadský dolar | Canadian Dollar |  | CLDR |
| CDF · frank / franc | konžský frank | Congolese Franc |  | CLDR |
| CHF · frank / franc | švýcarský frank | Swiss Franc |  | CLDR |
| CLP · peso / peso | chilské peso | Chilean Peso |  | CLDR |
| CNY · jüan / yuan | čínský jüan | Chinese Yuan |  | CLDR |
| COP · peso / peso | kolumbijské peso | Colombian Peso |  | CLDR |
| CRC · colón / colón | kostarický colón | Costa Rican Colón |  | CLDR |
| CUP · peso / peso | kubánské peso | Cuban Peso |  | CLDR |
| CVE · escudo / escudo | kapverdské escudo | Cape Verdean Escudo |  | CLDR |
| CZK · koruna / crown | česká koruna | Czech Koruna |  | CLDR |
| DJF · frank / franc | džibutský frank | Djiboutian Franc |  | CLDR |
| DKK · koruna / crown | dánská koruna | Danish Krone |  | CLDR |
| DOP · peso / peso | dominikánské peso | Dominican Peso |  | CLDR |
| DZD · dinár / dinar | alžírský dinár | Algerian Dinar |  | CLDR |
| EGP · libra / pound | egyptská libra | Egyptian Pound |  | CLDR |
| ERN · nakfa / nakfa | eritrejská nakfa | Eritrean Nakfa |  | CLDR |
| ETB · birr / birr | etiopský birr | Ethiopian Birr |  | CLDR |
| EUR · euro / euro | euro | Euro |  | CLDR |
| FJD · dolar / dollar | fidžijský dolar | Fijian Dollar |  | CLDR |
| GBP · libra / pound | britská libra | British Pound |  | CLDR |
| GEL · lari / lari | gruzínské lari | Georgian Lari |  | CLDR |
| GHS · cedi / cedi | ghanský cedi | Ghanaian Cedi |  | CLDR |
| GMD · dalasi / dalasi | gambijský dalasi | Gambian Dalasi |  | CLDR |
| GNF · frank / franc | guinejský frank | Guinean Franc |  | CLDR |
| GTQ · quetzal / quetzal | guatemalský quetzal | Guatemalan Quetzal |  | CLDR |
| GYD · dolar / dollar | guyanský dolar | Guyanaese Dollar |  | CLDR |
| HNL · lempira / lempira | honduraská lempira | Honduran Lempira |  | CLDR |
| HTG · gourde / gourde | haitský gourde | Haitian Gourde |  | CLDR |
| HUF · forint / forint | maďarský forint | Hungarian Forint |  | CLDR |
| IDR · rupie / rupee | indonéská rupie | Indonesian Rupiah |  | CLDR |
| ILS · šekel / shekel | izraelský nový šekel | Israeli New Shekel |  | CLDR |
| INR · rupie / rupee | indická rupie | Indian Rupee |  | CLDR |
| IQD · dinár / dinar | irácký dinár | Iraqi Dinar |  | CLDR |
| IRR · rijál / rial | íránský rijál | Iranian Rial |  | CLDR |
| ISK · koruna / crown | islandská koruna | Icelandic Króna |  | CLDR |
| JMD · dolar / dollar | jamajský dolar | Jamaican Dollar |  | CLDR |
| JOD · dinár / dinar | jordánský dinár | Jordanian Dinar |  | CLDR |
| JPY · jen / yen | japonský jen | Japanese Yen |  | CLDR |
| KES · šilink / shilling | keňský šilink | Kenyan Shilling |  | CLDR |
| KGS · som / som | kyrgyzský som | Kyrgyz Som |  | CLDR |
| KHR · riel / riel | kambodžský riel | Cambodian Riel |  | CLDR |
| KMF · frank / franc | komorský frank | Comorian Franc |  | CLDR |
| KPW · won / won | severokorejský won | North Korean Won |  | CLDR |
| KRW · won / won | jihokorejský won | South Korean Won |  | CLDR |
| KWD · dinár / dinar | kuvajtský dinár | Kuwaiti Dinar |  | CLDR |
| KZT · tenge / tenge | kazašské tenge | Kazakhstani Tenge |  | CLDR |
| LAK · kip / kip | laoský kip | Laotian Kip |  | CLDR |
| LBP · libra / pound | libanonská libra | Lebanese Pound |  | CLDR |
| LKR · rupie / rupee | srílanská rupie | Sri Lankan Rupee |  | CLDR |
| LRD · dolar / dollar | liberijský dolar | Liberian Dollar |  | CLDR |
| LSL · loti / loti | lesothský loti | Lesotho Loti |  | CLDR |
| LYD · dinár / dinar | libyjský dinár | Libyan Dinar |  | CLDR |
| MAD · dirham / dirham | marocký dirham | Moroccan Dirham | yes | pinned |
| MDL · leu / leu | moldavský leu | Moldovan Leu |  | CLDR |
| MGA · ariary / ariary | madagaskarský ariary | Malagasy Ariary |  | CLDR |
| MKD · denár / denar | makedonský denár | Macedonian Denar |  | CLDR |
| MMK · kyat / kyat | myanmarský kyat | Myanmar Kyat |  | CLDR |
| MNT · tugrik / tugrik | mongolský tugrik | Mongolian Tugrik |  | CLDR |
| MRU · ouguiya / ouguiya | mauritánská ouguiya | Mauritanian Ouguiya |  | CLDR |
| MUR · rupie / rupee | mauricijská rupie | Mauritian Rupee |  | CLDR |
| MVR · rupie / rupee | maledivská rupie | Maldivian Rufiyaa |  | CLDR |
| MWK · kwacha / kwacha | malawijská kwacha | Malawian Kwacha |  | CLDR |
| MXN · peso / peso | mexické peso | Mexican Peso |  | CLDR |
| MYR · ringgit / ringgit | malajsijský ringgit | Malaysian Ringgit |  | CLDR |
| MZN · metical / metical | mozambický metical | Mozambican Metical |  | CLDR |
| NAD · dolar / dollar | namibijský dolar | Namibian Dollar |  | CLDR |
| NGN · naira / naira | nigerijská naira | Nigerian Naira |  | CLDR |
| NIO · córdoba / córdoba | nikaragujská córdoba | Nicaraguan Córdoba |  | CLDR |
| NOK · koruna / crown | norská koruna | Norwegian Krone |  | CLDR |
| NPR · rupie / rupee | nepálská rupie | Nepalese Rupee |  | CLDR |
| NZD · dolar / dollar | novozélandský dolar | New Zealand Dollar |  | CLDR |
| OMR · rijál / rial | ománský rijál | Omani Rial |  | CLDR |
| PAB · balboa / balboa | panamská balboa | Panamanian Balboa |  | CLDR |
| PEN · sol / sol | peruánský sol | Peruvian Sol |  | CLDR |
| PGK · kina / kina | papuánská nová kina | Papua New Guinean Kina |  | CLDR |
| PHP · peso / peso | filipínské peso | Philippine Peso |  | CLDR |
| PKR · rupie / rupee | pákistánská rupie | Pakistani Rupee |  | CLDR |
| PLN · zlotý / zloty | polský zlotý | Polish Zloty |  | CLDR |
| PYG · guarani / guaraní | paraguajské guarani | Paraguayan Guarani |  | CLDR |
| QAR · rijál / rial | katarský rijál | Qatari Riyal |  | CLDR |
| RON · leu / leu | rumunský leu | Romanian Leu |  | CLDR |
| RSD · dinár / dinar | srbský dinár | Serbian Dinar |  | CLDR |
| RUB · rubl / ruble | ruský rubl | Russian Ruble |  | CLDR |
| RWF · frank / franc | rwandský frank | Rwandan Franc |  | CLDR |
| SAR · rijál / rial | saúdský rijál | Saudi Riyal |  | CLDR |
| SBD · dolar / dollar | šalamounský dolar | Solomon Islands Dollar |  | CLDR |
| SCR · rupie / rupee | seychelská rupie | Seychellois Rupee |  | CLDR |
| SDG · libra / pound | súdánská libra | Sudanese Pound |  | CLDR |
| SEK · koruna / crown | švédská koruna | Swedish Krona |  | CLDR |
| SGD · dolar / dollar | singapurský dolar | Singapore Dollar |  | CLDR |
| SLE · leone / leone | sierraleonský leone | Sierra Leonean Leone |  | CLDR |
| SOS · šilink / shilling | somálský šilink | Somali Shilling |  | CLDR |
| SRD · dolar / dollar | surinamský dolar | Surinamese Dollar |  | CLDR |
| SSP · libra / pound | jihosúdánská libra | South Sudanese Pound |  | CLDR |
| STN · dobra / dobra | svatotomášská dobra | São Tomé & Príncipe Dobra |  | CLDR |
| SYP · libra / pound | syrská libra | Syrian Pound |  | CLDR |
| SZL · lilangeni / lilangeni | svazijský lilangeni | Swazi Lilangeni |  | CLDR |
| THB · baht / baht | thajský baht | Thai Baht |  | CLDR |
| TJS · somoni / somoni | tádžické somoni | Tajikistani Somoni |  | CLDR |
| TMT · manat / manat | turkmenský manat | Turkmenistani Manat |  | CLDR |
| TND · dinár / dinar | tuniský dinár | Tunisian Dinar |  | CLDR |
| TOP · paanga / paʻanga | tonžská paanga | Tongan Paʻanga |  | CLDR |
| TRY · lira / lira | turecká lira | Turkish Lira |  | CLDR |
| TTD · dolar / dollar | trinidadský dolar | Trinidad & Tobago Dollar |  | CLDR |
| TZS · šilink / shilling | tanzanský šilink | Tanzanian Shilling |  | CLDR |
| UAH · hřivna / hryvnia | ukrajinská hřivna | Ukrainian Hryvnia |  | CLDR |
| UGX · šilink / shilling | ugandský šilink | Ugandan Shilling |  | CLDR |
| USD · dolar / dollar | americký dolar | US Dollar |  | CLDR |
| UYU · peso / peso | uruguayské peso | Uruguayan Peso |  | CLDR |
| UZS · sum / sum | uzbecký sum | Uzbekistani Som |  | CLDR |
| VES · bolívar / bolívar | venezuelský bolívar | Venezuelan Bolívar |  | CLDR |
| VND · dong / dong | vietnamský dong | Vietnamese Dong |  | CLDR |
| VUV · vatu / vatu | vanuatský vatu | Vanuatu Vatu |  | CLDR |
| WST · tala / tala | samojská tala | Samoan Tala |  | CLDR |
| XAF · frank / franc | CFA/BEAC frank | Central African CFA Franc |  | CLDR |
| XCD · dolar / dollar | východokaribský dolar | East Caribbean Dollar |  | CLDR |
| XOF · frank / franc | CFA/BCEAO frank | West African CFA Franc |  | CLDR |
| YER · rijál / rial | jemenský rijál | Yemeni Rial |  | CLDR |
| ZAR · rand / rand | jihoafrický rand | South African Rand |  | CLDR |
| ZMW · kwacha / kwacha | zambijská kwacha | Zambian Kwacha |  | CLDR |
| ZWG · zlato / gold | zimbabwské zlato (ZiG) | Zimbabwe Gold (ZiG) | yes | pinned |

## Languages

128 entries: 14 pinned in `countries.en.json`, 114 taken from CLDR.
0 of them are ones the Czech side overrode and the English side did not.


| Tag | Czech | English | Czech overrides | English source |
| --- | --- | --- | --- | --- |
| aa | afarština | Afar |  | CLDR |
| af | afrikánština | Afrikaans |  | CLDR |
| am | amharština | Amharic |  | CLDR |
| ar | arabština | Arabic |  | CLDR |
| ay | ajmarština | Aymara |  | CLDR |
| az | ázerbájdžánština | Azerbaijani |  | CLDR |
| be | běloruština | Belarusian |  | CLDR |
| bg | bulharština | Bulgarian |  | CLDR |
| bi | bislamština | Bislama |  | CLDR |
| bm | bambarština | Bambara |  | CLDR |
| bn | bengálština | Bangla |  | CLDR |
| bs | bosenština | Bosnian |  | CLDR |
| ca | katalánština | Catalan |  | CLDR |
| cnr | černohorština | Montenegrin | yes | pinned |
| crs | seychelská kreolština | Seychellois Creole | yes | pinned |
| cs | čeština | Czech |  | CLDR |
| da | dánština | Danish |  | CLDR |
| de | němčina | German |  | CLDR |
| dv | maledivština | Divehi |  | CLDR |
| dz | dzongkä | Dzongkha |  | CLDR |
| el | řečtina | Greek |  | CLDR |
| en | angličtina | English |  | CLDR |
| es | španělština | Spanish |  | CLDR |
| et | estonština | Estonian |  | CLDR |
| eu | baskičtina | Basque |  | CLDR |
| fa | perština | Persian |  | CLDR |
| ff | fulbština | Fula |  | CLDR |
| fi | finština | Finnish |  | CLDR |
| fil | filipínština | Filipino | yes | pinned |
| fj | fidžijština | Fijian |  | CLDR |
| fr | francouzština | French |  | CLDR |
| ga | irština | Irish |  | CLDR |
| gil | kiribatština | Gilbertese | yes | pinned |
| gl | galicijština | Galician |  | CLDR |
| gn | guaranština | Guarani |  | CLDR |
| gsw | němčina (Švýcarsko) | Swiss German |  | CLDR |
| ha | hauština | Hausa |  | CLDR |
| he | hebrejština | Hebrew |  | CLDR |
| hi | hindština | Hindi |  | CLDR |
| ho | hiri motu | Hiri Motu | yes | pinned |
| hr | chorvatština | Croatian |  | CLDR |
| ht | haitština | Haitian Creole |  | CLDR |
| hu | maďarština | Hungarian |  | CLDR |
| hy | arménština | Armenian |  | CLDR |
| id | indonéština | Indonesian |  | CLDR |
| ig | igboština | Igbo |  | CLDR |
| is | islandština | Icelandic |  | CLDR |
| it | italština | Italian |  | CLDR |
| ja | japonština | Japanese |  | CLDR |
| ka | gruzínština | Georgian |  | CLDR |
| kk | kazaština | Kazakh |  | CLDR |
| km | khmérština | Khmer |  | CLDR |
| ko | korejština | Korean |  | CLDR |
| ku | kurdština | Kurdish |  | CLDR |
| ky | kyrgyzština | Kyrgyz |  | CLDR |
| la | latina | Latin |  | CLDR |
| lb | lucemburština | Luxembourgish |  | CLDR |
| lo | laoština | Lao |  | CLDR |
| lt | litevština | Lithuanian |  | CLDR |
| lv | lotyština | Latvian |  | CLDR |
| mfe | mauricijská kreolština | Mauritian Creole | yes | pinned |
| mg | malgaština | Malagasy |  | CLDR |
| mh | maršálština | Marshallese |  | CLDR |
| mi | maorština | Māori |  | CLDR |
| mk | makedonština | Macedonian |  | CLDR |
| mn | mongolština | Mongolian |  | CLDR |
| mos | mosi | Mossi |  | CLDR |
| ms | malajština | Malay |  | CLDR |
| mt | maltština | Maltese |  | CLDR |
| my | barmština | Burmese |  | CLDR |
| na | naurština | Nauru |  | CLDR |
| nb | norština (bokmål) | Norwegian Bokmål |  | CLDR |
| nd | ndebele (Zimbabwe) | North Ndebele |  | CLDR |
| ne | nepálština | Nepali |  | CLDR |
| nl | nizozemština | Dutch |  | CLDR |
| nn | norština (nynorsk) | Norwegian Nynorsk |  | CLDR |
| no | norština | Norwegian |  | CLDR |
| nr | ndebele (Jižní Afrika) | South Ndebele |  | CLDR |
| nso | severní sotština | Northern Sotho | yes | pinned |
| ny | ňandžština | Nyanja |  | CLDR |
| om | oromština | Oromo |  | CLDR |
| pau | palauština | Palauan | yes | pinned |
| pl | polština | Polish |  | CLDR |
| ps | paštština | Pashto |  | CLDR |
| pt | portugalština | Portuguese |  | CLDR |
| qu | kečuánština | Quechua |  | CLDR |
| rm | rétorománština | Romansh |  | CLDR |
| rn | kirundština | Kirundi | yes | pinned |
| ro | rumunština | Romanian |  | CLDR |
| ru | ruština | Russian |  | CLDR |
| rw | kiňarwandština | Kinyarwanda |  | CLDR |
| sg | sangština | Sango |  | CLDR |
| si | sinhálština | Sinhala |  | CLDR |
| sk | slovenština | Slovak |  | CLDR |
| sl | slovinština | Slovenian |  | CLDR |
| sm | samojština | Samoan |  | CLDR |
| sn | šonština | Shona |  | CLDR |
| snk | soninkština | Soninke | yes | pinned |
| so | somálština | Somali |  | CLDR |
| sq | albánština | Albanian |  | CLDR |
| sr | srbština | Serbian |  | CLDR |
| ss | siswatština | Swati |  | CLDR |
| st | sotština (jižní) | Southern Sotho |  | CLDR |
| sv | švédština | Swedish |  | CLDR |
| sw | svahilština | Swahili |  | CLDR |
| ta | tamilština | Tamil |  | CLDR |
| tet | tetum | Tetum | yes | pinned |
| tg | tádžičtina | Tajik |  | CLDR |
| th | thajština | Thai |  | CLDR |
| ti | tigrinijština | Tigrinya |  | CLDR |
| tk | turkmenština | Turkmen |  | CLDR |
| tn | setswanština | Tswana |  | CLDR |
| to | tongánština | Tongan |  | CLDR |
| tpi | tok pisin | Tok Pisin | yes | pinned |
| tr | turečtina | Turkish |  | CLDR |
| ts | tsonga | Tsonga |  | CLDR |
| tvl | tuvalština | Tuvaluan | yes | pinned |
| tzm | berberština (tamazight) | Central Atlas Tamazight | yes | pinned |
| uk | ukrajinština | Ukrainian |  | CLDR |
| ur | urdština | Urdu |  | CLDR |
| uz | uzbečtina | Uzbek |  | CLDR |
| ve | venda | Venda |  | CLDR |
| vi | vietnamština | Vietnamese |  | CLDR |
| wo | wolofština | Wolof |  | CLDR |
| xh | xhoština | Xhosa |  | CLDR |
| yo | jorubština | Yoruba |  | CLDR |
| zh | čínština | Chinese |  | CLDR |
| zu | zuluština | Zulu |  | CLDR |

## Country notes

22 entries, hand-written in both languages.
The footnote the atlas prints, and the extra sentence the population explanation carries for four countries. Several of them state a disputed claim rather than a fact, so a translation that softens or drops one changes what the game says about a border; the rest qualify a population figure.

| Country | Czech | English |
| --- | --- | --- |
| BO · Bolivia | Ústavním hlavním městem je Sucre; vláda a parlament sídlí v La Pazu. | The constitutional capital is Sucre; the government and parliament sit in La Paz. |
| BG · Bulgaria | Od 1. ledna 2026 používá Bulharsko euro, nikoli bulharský lev. | Since 1 January 2026 Bulgaria has used the euro, not the Bulgarian lev. |
| EG · Egypt | Hlavní město Káhira je zde odlišeno od nového správního centra (The New Capital), kam se přesouvají státní instituce. Káhirský úřední portál nadále uvádí Káhiru jako hlavní město. | The capital, Cairo, is distinguished here from the new administrative centre (the New Administrative Capital), to which state institutions are moving. Cairo's official portal continues to name Cairo as the capital. |
| SZ · Eswatini | Mbabane je správní hlavní město; Lobamba je královské a zákonodárné sídlo. | Mbabane is the administrative capital; Lobamba is the royal and legislative seat. |
| FR · France | Populační řada OSN používá vlastní územní vymezení Francie; číslo není přímo srovnatelné s francouzským národním součtem včetně všech zámořských území. | The UN population series uses its own territorial definition of France; the figure is not directly comparable with the French national total that includes all overseas territories. |
| ID · Indonesia | Přesun hlavního města do Nusantary probíhá. Herní otázka se ptá na název budované Nusantary, nikoli na datum právního či faktického přesunu vlády. | The move of the capital to Nusantara is under way. The game's question asks for the name of the Nusantara being built, not for the date of the legal or actual transfer of government. |
| IL · Israel | Izrael označuje Jeruzalém za své hlavní město. Status města a rozsah uznání jsou mezinárodně sporné; herní otázka proto rozlišuje konkrétní funkci města. | Israel designates Jerusalem as its capital. The city's status and the extent of its recognition are internationally disputed; the game's question therefore distinguishes a specific function of the city. |
| YE · Yemen | Saná je ústavní hlavní město. Kvůli konfliktu je politická a správní situace rozdělena; herní otázka proto rozlišuje konkrétní funkci města. | Sanaa is the constitutional capital. Because of the conflict the political and administrative situation is divided; the game's question therefore distinguishes a specific function of the city. |
| ZA · South Africa | Jihoafrická republika má tři hlavní města: Pretoria (výkonná moc), Kapské Město (zákonodárná) a Bloemfontein (tradičně soudní). Ústavní soud sídlí v Johannesburgu. | South Africa has three capitals: Pretoria (executive), Cape Town (legislative) and Bloemfontein (traditionally judicial). The Constitutional Court sits in Johannesburg. |
| MY · Malaysia | Hlavním městem je Kuala Lumpur, správním centrem Putrajaya. | The capital is Kuala Lumpur, the administrative centre Putrajaya. |
| NR · Nauru | Nauru nemá oficiální hlavní město. Vládní instituce sídlí v distriktu Yaren. | Nauru has no official capital. Government institutions sit in the district of Yaren. |
| NL · Netherlands | Hlavním městem je Amsterdam; vláda a parlament sídlí v Haagu. | The capital is Amsterdam; the government and parliament sit in The Hague. |
| PS · Palestine | Palestina nárokuje Východní Jeruzalém jako hlavní město; správní sídlo je v Ramalláhu. Herní otázka se ptá na správní sídlo. Status Jeruzaléma je sporný. Vatikán/Svatý stolec a Palestina jsou přidány ke 193 členům OSN. | Palestine claims East Jerusalem as its capital; the administrative seat is in Ramallah. The game's question asks for the administrative seat. The status of Jerusalem is disputed. The Vatican/Holy See and Palestine are added to the 193 UN members. |
| CI · Côte d’Ivoire | Hlavním městem je Yamoussoukro; řada institucí sídlí v Abidžanu. | The capital is Yamoussoukro; many institutions sit in Abidjan. |
| GQ · Equatorial Guinea | Ciudad de la Paz bylo vyhlášeno hlavním městem 2. ledna 2026. Dřívější hlavní město bylo Malabo; instituce se stěhují v přechodném období. | Ciudad de la Paz was declared the capital on 2 January 2026. The former capital was Malabo; institutions are moving during a transitional period. |
| LK · Sri Lanka | Šrí Džajavardanapura Kotte je sídlem parlamentu; Kolombo má významné správní a obchodní funkce. | Sri Jayawardenepura Kotte is the seat of parliament; Colombo holds significant administrative and commercial functions. |
| TG · Togo | Populační číslo je projekce OSN WPP 2024, střední varianta, pro rok 2026; některé novější revize řady OSN se mohou lišit. | The population figure is a UN WPP 2024 projection, medium variant, for 2026; some more recent revisions of the UN series may differ. |
| UA · Ukraine | Populační projekce vychází z modelu OSN. Válka, migrace a různá územní vymezení významně zvyšují nejistotu. | The population projection is based on the UN model. War, migration and differing territorial definitions raise the uncertainty considerably. |
| VA · Vatican City | Ve hře je Vatikán, jehož suverénem je Svatý stolec, nečlenský pozorovatelský stát OSN. Odhad obyvatel není počet vatikánských občanů. | The game holds Vatican City, whose sovereign is the Holy See, a non-member observer state of the UN. The population estimate is not a count of Vatican citizens. |
| ZW · Zimbabwe | Domácí měnou je Zimbabwe Gold (ZiG, kód ZWG). V zemi se oficiálně používají také cizí měny včetně amerického dolaru; výčet zde není úplný. | The domestic currency is Zimbabwe Gold (ZiG, code ZWG). Foreign currencies including the US dollar are also in official use; the list here is not exhaustive. |
| CZ · Czechia | Populační údaj je projekce řady OSN pro rok 2026, nikoli aktuální počet obyvatel podle ČSÚ. Projekce a národní statistiky se mohou lišit. | The population figure is a projection from the UN series for 2026, not the current population count published by the Czech Statistical Office. Projections and national statistics can differ. |
| CH · Switzerland | Bern je spolkové město a sídlo vlády; Švýcarsko formálně neurčuje hlavní město. | Bern is the federal city and the seat of government; Switzerland does not formally designate a capital. |

## Citations

16 entries, hand-written in both languages.
The sources dialog. The name is the link text and the sentence under it says what that source was used for; five of them are written by the pipeline from `sources.lock.json` and change whenever a pin does.

| Link | Czech | English |
| --- | --- | --- |
| https://research.un.org/en/unmembers/currentmembers | **OSN – členské státy**<br>Rozsah základní sady: 193 členských států; přidány Palestina a Vatikán/Svatý stolec. Kontrola 7. 9. 2026. | **UN – member states**<br>The scope of the base set: 193 member states, with Palestine and the Vatican/Holy See added. Checked 7 September 2026. |
| https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/WPP2024_Demographic_Indicators_Medium.csv.gz | **OSN – World Population Prospects 2024 (CSV, střední varianta)**<br>Přímý zdroj 195 populačních hodnot: sloupec TPopulation1July pro rok 2026, uváděný v tisících a násobený tisícem. Soubor je připnutý otiskem sha256 286ac36bb141… (16557272 B), staženo 2026-09-10. Jde o projekce střední varianty WPP 2024, nikoli o dnešní sčítání. | **UN – World Population Prospects 2024 (CSV, medium variant)**<br>The direct source of 195 population values: column TPopulation1July for 2026, published in thousands and multiplied by a thousand. The file is pinned by the sha256 digest 286ac36bb141… (16557272 B), retrieved 2026-09-10. These are medium-variant WPP 2024 projections, not a census taken today. |
| https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_admin_0_countries.geojson | **Natural Earth – 1:110m Admin 0, v5.1.2**<br>Generalizovaný mapový podklad 1:110m, public domain. Připnuto na značku v5.1.2, otisk sha256 6866c877d39c… (838726 B), staženo 2026-09-10. Kód země se čte z pole ISO_A3; polygony, které upstream nechává nepřiřazené, rozhoduje data/overrides/territory.json. Podklad není zdrojem právního vymezení hranic. | **Natural Earth – 1:110m Admin 0, v5.1.2**<br>A generalised 1:110m basemap, public domain. Pinned to the v5.1.2 tag, sha256 digest 6866c877d39c… (838726 B), retrieved 2026-09-10. The country code is read from the ISO_A3 field; polygons upstream leaves unassigned are decided by data/overrides/territory.json. The basemap is not a source for the legal course of borders. |
| https://github.com/mledoze/countries | **world-countries – referenční databáze (ODC-ODbL 1.0)**<br>Balíček 5.1.0: ISO kódy, anglické názvy hlavních měst, měny, jazyky, světadíl a orientační polohy. Data jsou pod ODC-ODbL 1.0, proto je data/build/countries.json odvozená databáze a šíří se pod toutéž licencí; plné znění je v licenses/ODbL-1.0.txt. Ověřeno 2026-09-15. | **world-countries – reference database (ODC-ODbL 1.0)**<br>Package 5.1.0: ISO codes, English capital names, currencies, languages, continent and representative positions. Its data is under ODC-ODbL 1.0, which makes data/build/countries.json a derivative database distributed under that same licence; the full text is in licenses/ODbL-1.0.txt. Verified 2026-09-15. |
| https://cldr.unicode.org/ | **Unicode CLDR – prostřednictvím ICU v Node.js**<br>České a anglické názvy zemí, měn a jazyků přes Intl.DisplayNames: icu 78.2 / cldr 48.0 / node 24.14.0. Verze ICU rozhoduje o znění popisků, proto je Node připnutý v .nvmrc. Ověřeno 2026-09-15. | **Unicode CLDR – through the ICU in Node.js**<br>Czech and English names of countries, currencies and languages through Intl.DisplayNames: icu 78.2 / cldr 48.0 / node 24.14.0. The ICU version decides how the labels are worded, which is why Node is pinned in .nvmrc. Verified 2026-09-15. |
| https://raw.githubusercontent.com/googlefonts/noto-emoji/v2.051/fonts/NotoColorEmoji.ttf | **Noto Color Emoji 2.051 – předloha vlajkových ilustrací**<br>Předloha 195 vlajkových ilustrací. Obrázky vykresluje npm run data:flags z připnutého souboru písma, otisk sha256 72a635cb3d2f… (10673480 B), staženo 2026-09-15; samotné písmo se nedistribuuje a ve hře jsou jen hotové PNG. Jde o stylizované ilustrace, nikoli o technické vyobrazení poměrů stran a barev. | **Noto Color Emoji 2.051 – the master for the flag illustrations**<br>The master for 195 flag illustrations. npm run data:flags renders the images from the pinned font file, sha256 digest 72a635cb3d2f… (10673480 B), retrieved 2026-09-15; the font itself is not distributed and only the finished PNGs are in the game. These are stylised illustrations, not technical depictions of ratios and colours. |
| https://www.consilium.europa.eu/en/policies/join-the-euro-area/ | **Rada EU – přistoupení k eurozóně**<br>Primární ověření: Bulharsko používá euro od 1. ledna 2026; ve hře není jako správná měna bulharský lev. | **Council of the EU – joining the euro area**<br>Primary verification: Bulgaria has used the euro since 1 January 2026; the Bulgarian lev is not a correct currency answer in the game. |
| https://www.guineaecuatorialpress.com/noticias/decreto_ley_por_el_que_se_declara_la_ciudad_de_la_paz_djibloho_capital_de_la_republica_de_guinea_ecuatorial | **Vláda Rovníkové Guineje – dekret 1/2026**<br>Primární ověření vyhlášení Ciudad de la Paz hlavním městem dne 2. ledna 2026, včetně přechodného období pro přesun institucí. | **Government of Equatorial Guinea – decree 1/2026**<br>Primary verification of the declaration of Ciudad de la Paz as the capital on 2 January 2026, including the transitional period for moving institutions. |
| https://setneg.go.id/baca/index/mensesneg_tekankan_komitmen_presiden_prabowo_untuk_percepatan_pembangunan_ikn | **Indonéský státní sekretariát – rozvoj Nusantary**<br>Primární zdroj o pokračující výstavbě Nusantary (13. 1. 2026). Herní otázka se ptá na jméno budovaného města, nikoli na sporné datum právního přesunu. | **Indonesian State Secretariat – the development of Nusantara**<br>A primary source on the continuing construction of Nusantara (13 January 2026). The game's question asks for the name of the city being built, not for the disputed date of the legal transfer. |
| https://www.atarimagazines.com/compute/issue125/G8_Reviewers_choice.php | **COMPUTE!, leden 1991 – původní World Geography**<br>Dobový popis glóbů, map a otázek na města, jazyky, měny a obyvatelstvo. Nová implementace neobsahuje původní program, grafiku ani hudbu. | **COMPUTE!, January 1991 – the original World Geography**<br>A contemporary description of the globes, maps and questions on cities, languages, currencies and population. This new implementation contains none of the original program, graphics or music. |
| https://www.rbz.co.zw/ | **Reserve Bank of Zimbabwe – měnové údaje**<br>Primární ověření domácí měny ZiG v roce 2026; kurzovní lístky RBZ používají kód ZWG. | **Reserve Bank of Zimbabwe – currency data**<br>Primary verification of the ZiG domestic currency in 2026; the RBZ exchange-rate sheets use the code ZWG. |
| https://ikn.go.id/en/posts/pembangunan-ikn-maju-tanpa-ragu-otorita-ikn-tegaskan-progres-terus-berjalan | **Otorita IKN – výstavba Nusantary, květen 2026**<br>Aktualizace z 21. 5. 2026: pokračující výstavba a rozlišení výstavby od právního rozhodnutí o přesunu hlavního města. | **Otorita IKN – the construction of Nusantara, May 2026**<br>An update of 21 May 2026: construction continues, and it separates that construction from the legal decision to move the capital. |
| https://www.cairo.gov.eg/en/about-governorate/cairo-in-lines/ | **Káhirský úřední portál – Cairo in Lines**<br>Primární zdroj nadále označuje Káhiru za hlavní město Egypta. | **Cairo's official portal – Cairo in Lines**<br>The primary source continues to name Cairo as the capital of Egypt. |
| https://sis.gov.eg/en/media-center/events/the-inauguration-of-the-state-strategic-command-headquarters-the-octagon-in-the-new-capital/ | **Egyptská státní informační služba – The New Capital**<br>Vládní zpráva ze 4. 7. 2026 o státních institucích v novém správním centru; v atlasu odlišeno od Káhiry. | **Egyptian State Information Service – The New Capital**<br>A government report of 4 July 2026 on state institutions in the new administrative centre; distinguished from Cairo in the atlas. |
| https://github.com/googlefonts/noto-emoji | **Google Noto Emoji — ilustrace vlajek**<br>195 vložených PNG obrázků vyrenderovaných z Noto Color Emoji 2.051 (2025-08-18). Nezávisí na podpoře emoji na zařízení. Stylizované, nikoli vexilologické technické výkresy. Syrská ilustrace má zelený horní pruh a tři červené hvězdy. Afghánská ilustrace je republikánská trikolóra; stát je vyřazen z vlajkových bonusů. Viz metodické poznámky v atlasu. | **Google Noto Emoji — the flag illustrations**<br>195 embedded PNG images rendered from Noto Color Emoji 2.051 (2025-08-18). They do not depend on a device's emoji support. Stylised, not vexillological technical drawings. The Syrian illustration has a green top stripe and three red stars. The Afghan illustration is the republican tricolour; the country is left out of the flag bonuses. See the methodology notes in the atlas. |
| https://www.bkam.ma/en/Monetary-policy/Strategic-framework/Presentation | **Bank Al-Maghrib — marocký dirham**<br>Oprava názvu měny MAD: marocký dirham, nikoli dinár. Ověřeno 7. 9. 2026. | **Bank Al-Maghrib — the Moroccan dirham**<br>A correction to the name of the currency MAD: Moroccan dirham, not dinar. Verified 7 September 2026. |
