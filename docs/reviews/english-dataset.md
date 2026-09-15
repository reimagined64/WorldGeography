# English dataset — review artifact

<!-- Machine-written by `npm run data:review`. Do not hand-edit: edit
     `data/overrides/countries.en.json` and regenerate. -->

Generated from the fetch of 2026-09-15, reference year 2026.

Every English value the pipeline produces, beside its Czech counterpart.
`pinned` means `data/overrides/countries.en.json` names it. `CLDR` means the
value is whatever `Intl.DisplayNames` returned and nobody has looked at it.
A **bold** source is the row to look at first: the Czech side decided CLDR
was wrong there, and the English side took its word.

663 values in total; 0 where Czech corrected CLDR and English did not.

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
