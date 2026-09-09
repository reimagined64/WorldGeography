"""Rebuild the checked-in quiz data from local reference packages and reviewed overrides.
Requires: countryinfo==0.1.2, Babel, pycountry, geopandas.
Population facts were transcribed from the source identified in data/sources.json.
Do not treat a new build timestamp as a fresh factual review.
"""
from pathlib import Path
import json, datetime
from countryinfo import CountryInfo
from babel import Locale
from babel.core import get_global
from babel.numbers import get_territory_currencies
import pycountry
ROOT=Path(__file__).resolve().parents[1]
CS=Locale('cs')
raw={c.get('ISO',{}).get('alpha2'):c for c in CountryInfo().all().values()}
POP={k:int(v) for k,v in (line.split() for line in (ROOT/'data/population_2026.txt').read_text().splitlines())}
assert len(POP)==195
extra={
 'MM':{'capital':'Naypyidaw','latlng':[21,96],'region':'Asia','languages':['my']},
 'PS':{'capital':'East Jerusalem','latlng':[31.9,35.2],'region':'Asia','languages':['ar']},
 'ME':{'capital':'Podgorica','latlng':[42.7,19.3],'region':'Europe','languages':['sr']},
 'AD':{'capital':'Andorra la Vella','latlng':[42.54,1.58],'region':'Europe','languages':['ca']},
 'VA':{'capital':'Vatikán','latlng':[41.9029,12.4534],'region':'Europe','languages':['it','la']},
}
raw.update(extra)
raw['GB']=CountryInfo().all()['united kingdom']
# Common Czech exonyms, followed by current and multi-capital corrections.
capital_names={
'Nicosia':'Nikósie','Sofia':'Sofie','Luxembourg':'Lucemburk','Monaco':'Monako','Panama City':'Ciudad de Panamá','Guatemala City':'Ciudad de Guatemala','City of San Marino':'San Marino','Reykjavik':'Reykjavík','Juba':'Džuba',"St. George's":'Saint George’s','Prague':'Praha','Vienna':'Vídeň','Rome':'Řím','Paris':'Paříž','Berlin':'Berlín','London':'Londýn','Warsaw':'Varšava','Brussels':'Brusel','Copenhagen':'Kodaň','Lisbon':'Lisabon','Athens':'Atény','Bucharest':'Bukurešť','Belgrade':'Bělehrad','Kiev':'Kyjev','Kyiv':'Kyjev','Moscow':'Moskva','Helsinki':'Helsinky','Stockholm':'Stockholm','Budapest':'Budapešť','Zagreb':'Záhřeb','Ljubljana':'Lublaň','Reykjavík':'Reykjavík','Sarajevo':'Sarajevo','Chişinău':'Kišiněv','Chisinau':'Kišiněv','Skopje':'Skopje','Tirana':'Tirana','Beijing':'Peking','Tokyo':'Tokio','Seoul':'Soul','Pyongyang':'Pchjongjang','Cairo':'Káhira','Damascus':'Damašek','Baghdad':'Bagdád','Tehran':'Teherán','Algiers':'Alžír','Tripoli':'Tripolis','Riyadh':'Rijád','Abu Dhabi':'Abú Zabí','Doha':'Dauhá','Muscat':'Maskat','Kuwait City':'Kuvajt','Manama':'Manáma','Amman':'Ammán','Beirut':'Bejrút','Jerusalem':'Jeruzalém','East Jerusalem':'Východní Jeruzalém','Sana\'a':'Saná','Khartoum':'Chartúm','Nouakchott':'Nuakšott','Addis Ababa':'Addis Abeba','Mogadishu':'Mogadišo','Djibouti':'Džibuti','Kabul':'Kábul','Islamabad':'Islámábád','New Delhi':'Nové Dillí','Dhaka':'Dháka','Kathmandu':'Káthmándú','Thimphu':'Thimphu','Malé':'Malé','Naypyidaw':'Neipyijto','Hanoi':'Hanoj','Phnom Penh':'Phnompenh','Ulan Bator':'Ulánbátar','Ulaanbaatar':'Ulánbátar','Bishkek':'Biškek','Dushanbe':'Dušanbe','Ashgabat':'Ašchabad','Tashkent':'Taškent','Yerevan':'Jerevan','Tbilisi':'Tbilisi','Baku':'Baku','Brasília':'Brasília','Mexico City':'Ciudad de México','Havana':'Havana','Washington D.C.':'Washington, D.C.','Washington, D.C.':'Washington, D.C.','San José':'San José','Port-au-Prince':'Port-au-Prince','Singapore':'Singapur','Nuku\'alofa':'Nukuʻalofa','Nuku’alofa':'Nukuʻalofa','Nuku\u02bbalofa':'Nukuʻalofa','Port Moresby':'Port Moresby','Cape Town':'Kapské Město','Pretoria':'Pretoria','Saint John\'s':'Saint John’s','Saint George\'s':'Saint George’s','N\u2019Djamena':'N’Djamena','N\'Djamena':'N’Djamena','São Tomé':'São Tomé',
}
cap_overrides={
'BI':['Gitega'],'GQ':['Ciudad de la Paz'],'KZ':['Astana'],'TZ':['Dodoma'],
'ZA':['Pretoria','Kapské Město','Bloemfontein'],'BO':['Sucre'],'NL':['Amsterdam'],
'SZ':['Mbabane','Lobamba'],'LK':['Šrí Džajavardanapura Kotte'],
'CH':['Bern'],'NR':['Yaren (sídlo vlády)'],'PW':['Ngerulmud'],
'ID':['Jakarta'],'MM':['Neipyijto'],'PS':['Východní Jeruzalém (nárokovaný)'],
'IL':['Jeruzalém'],'YE':['Saná'],'MY':['Kuala Lumpur'],'CI':['Yamoussoukro'],
'MD':['Kišiněv'],'NA':['Windhoek'],'FM':['Palikir'],'KI':['Jižní Tarawa'],
'TV':['Funafuti'],'VA':['Vatikán'],'US':['Washington, D.C.'],
'BN':['Bandar Seri Begawan'],'MN':['Ulánbátar'], 'SO':['Mogadišo'],
}
notes={
'EG':'Hlavní město Káhira je zde odlišeno od nového správního centra (The New Capital), kam se přesouvají státní instituce. Káhirský úřední portál nadále uvádí Káhiru jako hlavní město.',
'ZA':'Jihoafrická republika má tři hlavní města: Pretoria (výkonná moc), Kapské Město (zákonodárná) a Bloemfontein (tradičně soudní). Ústavní soud sídlí v Johannesburgu.',
'BO':'Ústavním hlavním městem je Sucre; vláda a parlament sídlí v La Pazu.',
'NL':'Hlavním městem je Amsterdam; vláda a parlament sídlí v Haagu.',
'SZ':'Mbabane je správní hlavní město; Lobamba je královské a zákonodárné sídlo.',
'LK':'Šrí Džajavardanapura Kotte je sídlem parlamentu; Kolombo má významné správní a obchodní funkce.',
'CH':'Bern je spolkové město a sídlo vlády; Švýcarsko formálně neurčuje hlavní město.',
'NR':'Nauru nemá oficiální hlavní město. Vládní instituce sídlí v distriktu Yaren.',
'ID':'Přesun hlavního města do Nusantary probíhá. Herní otázka se ptá na název budované Nusantary, nikoli na datum právního či faktického přesunu vlády.',
'GQ':'Ciudad de la Paz bylo vyhlášeno hlavním městem 2. ledna 2026. Dřívější hlavní město bylo Malabo; instituce se stěhují v přechodném období.',
'BG':'Od 1. ledna 2026 používá Bulharsko euro, nikoli bulharský lev.',
'ZW':'Domácí měnou je Zimbabwe Gold (ZiG, kód ZWG). V zemi se oficiálně používají také cizí měny včetně amerického dolaru; výčet zde není úplný.',
'PS':'Palestina nárokuje Východní Jeruzalém jako hlavní město; správní sídlo je v Ramalláhu. Herní otázka se ptá na správní sídlo. Status Jeruzaléma je sporný. Vatikán/Svatý stolec a Palestina jsou přidány ke 193 členům OSN.',
'IL':'Izrael označuje Jeruzalém za své hlavní město. Status města a rozsah uznání jsou mezinárodně sporné; herní otázka proto rozlišuje konkrétní funkci města.',
'YE':'Saná je ústavní hlavní město. Kvůli konfliktu je politická a správní situace rozdělena; herní otázka proto rozlišuje konkrétní funkci města.',
'MY':'Hlavním městem je Kuala Lumpur, správním centrem Putrajaya.',
'CI':'Hlavním městem je Yamoussoukro; řada institucí sídlí v Abidžanu.',
'FR':'Populační řada OSN používá vlastní územní vymezení Francie; číslo není přímo srovnatelné s francouzským národním součtem včetně všech zámořských území.',
'UA':'Populační projekce vychází z modelu OSN. Válka, migrace a různá územní vymezení významně zvyšují nejistotu.',
'VA':'Ve hře je Vatikán, jehož suverénem je Svatý stolec, nečlenský pozorovatelský stát OSN. Odhad obyvatel není počet vatikánských občanů.',
'CZ':'Populační údaj je projekce řady OSN pro rok 2026, nikoli aktuální počet obyvatel podle ČSÚ. Projekce a národní statistiky se mohou lišit.',
'TG':'Populační číslo je převzato z tabulky Worldometer pro rok 2026; některé novější revize řady OSN se mohou lišit.',
}
# The question uses selected principal / official languages, not an exhaustive legal list.
lang_overrides={
'MG':['mg','fr'],'IQ':['ar','ku'],'NG':['en','ha','yo','ig'],'CZ':['cs'],'SK':['sk'],'ME':['cnr','sr'],'MD':['ro'],'MM':['my'],'PS':['ar'],'VA':['it','la'],
'IN':['hi','en'],'PK':['ur','en'],'AF':['fa','ps'],'BD':['bn'],'JP':['ja'],'CN':['zh'],'SG':['en','zh','ms','ta'],
'ZA':['zu','xh','af','en','st','tn','ts','ss','ve','nr','nso'],
'ZW':['sn','nd','en'],'RW':['rw','en','fr','sw'],'BI':['rn','fr','en'],
'ER':['ti','ar','en'],'ET':['am','om','so','ti','aa'],'ML':['bm','ff','snk','fr'],'BF':['mos','fr'],'NE':['ha','fr'],
'GQ':['es','fr','pt'],'DZ':['ar','tzm'],'MA':['ar','tzm'],'NA':['en','af'],'PG':['en','tpi','ho'],
'FJ':['en','fj','hi'],'WS':['sm','en'],'KI':['gil','en'],'TV':['tvl','en'],'PW':['pau','en'],
'NR':['na','en'],'FM':['en'],'MH':['mh','en'],'SC':['crs','en','fr'],'MU':['mfe','en','fr'],
'KM':['ar','fr'],'TL':['tet','pt'],'VU':['bi','en','fr'],'IE':['ga','en'],'NZ':['en','mi'],
'CH':['de','fr','it','rm'],'BE':['nl','fr','de'],'CA':['en','fr'],'FI':['fi','sv'],'CY':['el','tr'],
'LU':['lb','fr','de'],'MT':['mt','en'],'BA':['bs','hr','sr'],'MK':['mk','sq'],'ES':['es','ca','eu','gl'],
'LK':['si','ta'],'PH':['fil','en'],'ID':['id'],'US':['en'],'AU':['en'],'GB':['en'],
'PY':['es','gn'],'BO':['es','qu','ay'],'PE':['es','qu','ay'],'HT':['ht','fr'],
'IL':['he','ar'],'NP':['ne'],'BT':['dz'],'MV':['dv'],'TH':['th'],'LA':['lo'],'KH':['km'],'VN':['vi'],
'UZ':['uz'],'TJ':['tg'],'TM':['tk'],'KG':['ky','ru'],'KZ':['kk','ru'],'MN':['mn'],
'AM':['hy'],'GE':['ka'],'AZ':['az'],'BY':['be','ru'],'UA':['uk'],
}
currency_overrides={'BT':['BTN','INR'],'BG':['EUR'],'HR':['EUR'],'ZW':['ZWG','USD'],'SL':['SLE'],'VE':['VES'],'MR':['MRU'],'ST':['STN'],'BY':['BYN'],'PS':['ILS','JOD','USD'],'VA':['EUR'],'CU':['CUP'],'SV':['USD'],'PA':['PAB','USD'],'SZ':['SZL','ZAR'],'LS':['LSL','ZAR'],'NA':['NAD','ZAR'],'LR':['LRD','USD']}
lang_names={'cnr':'černohorština','fil':'filipínština','tpi':'tok pisin','ho':'hiri motu','crs':'seychelská kreolština','mfe':'mauricijská kreolština','tzm':'berberština (tamazight)','gil':'kiribatština','tvl':'tuvalština','pau':'palauština','tet':'tetum','rn':'kirundština','nso':'severní sotština','snk':'soninkština'}
name_overrides={'CD':'Demokratická republika Kongo','CG':'Konžská republika','CZ':'Česko','VA':'Vatikán','PS':'Palestina','SZ':'Eswatini','MK':'Severní Makedonie','CI':'Pobřeží slonoviny','US':'Spojené státy','GB':'Spojené království','KR':'Jižní Korea','KP':'Severní Korea','MM':'Myanmar','CV':'Kapverdy','TL':'Východní Timor'}
world=[]
for code,pop in POP.items():
    c=raw[code]; iso=pycountry.countries.get(alpha_2=code)
    caps=cap_overrides.get(code,[capital_names.get(c.get('capital',''),c.get('capital',''))])
    assert caps and caps[0], code
    # CLDR supplies currency validity intervals; dated manual changes take precedence.
    currencies=currency_overrides.get(code,get_territory_currencies(code,datetime.date(2026,9,7)))
    if not currencies: currencies=c.get('currencies',[])
    assert currencies,code
    langs=lang_overrides.get(code)
    territory=get_global('territory_languages').get(code,{})
    if not langs:
        langs=[k.split('_')[0] for k,v in territory.items() if v.get('official_status') in ['official','de_facto_official']]
        langs=list(dict.fromkeys(langs)) or c.get('languages',[])
    assert langs,code
    exclude=sorted(set(langs)|{k.split('_')[0] for k,v in territory.items() if v.get('population_percent',0)>=1 or v.get('official_status')})
    continent=c.get('region','')
    if continent=='Americas':
        continent='South America' if code in 'AR BO BR CL CO EC GY PY PE SR UY VE'.split() else 'North America'
    if code=='RU': continent='Europe'
    if code in ['TR','CY','GE','AM','AZ','KZ']:continent='Asia'
    name=name_overrides.get(code,CS.territories.get(code,iso.name))
    world.append({'code':code,'iso3':iso.alpha_3,'name':name,'capital':caps,
      'currency':currencies,'currencyNames':[{ 'code':cc,'name':('zimbabwské zlato (ZiG)' if cc=='ZWG' else 'marocký dirham' if cc=='MAD' else CS.currencies.get(cc,cc))} for cc in currencies],
      'languages':langs,'languageNames':[lang_names.get(l,CS.languages.get(l,l)) for l in langs], 'excludeLanguages':exclude,
      'lat':c['latlng'][0],'lon':c['latlng'][1],'region':continent,
      'population':pop,'populationYear':2026,'populationKind':'projekce','populationSource':'worldometer-un-2026',
      'note':notes.get(code,''),'easy':pop>18000000 or code in 'CZ SK AT CH HU BE DK FI NO SE IE PT GR HR NZ IS SG AE IL CU JM CR PA EE LV LT'.split()})
# Correct representative positions for tiny states; marker denotes country, not capital.
coords={'FR':[46.7,2.4],'NO':[62,10],'US':[39,-98],'NZ':[-41,174],'KI':[1.45,173],'FM':[6.9,158.2],'TV':[-8.5,179.2],'PW':[7.5,134.6],'MH':[7.1,171.2],'NR':[-0.52,166.94],'TO':[-21.15,-175.2],'WS':[-13.76,-172.1],'SC':[-4.68,55.49],'MT':[35.9,14.45],'BH':[26.05,50.55],'SG':[1.35,103.82]}
for c in world:
    if c['code'] in coords:c['lat'],c['lon']=coords[c['code']]
world.sort(key=lambda c:c['name'])
(ROOT/'data/countries.json').write_text(json.dumps(world,ensure_ascii=False,indent=2))
# Natural Earth is an illustrative generalized basemap, not a current political-border authority.
import geopandas as gpd
import os, pyogrio
f=Path(os.environ.get('NATURAL_EARTH_SHP', Path(pyogrio.__file__).parent/'tests/fixtures/naturalearth_lowres/naturalearth_lowres.shp'))
gdf=gpd.read_file(f)
polys=[]
for _,r in gdf.iterrows():
    iso=r['iso_a3']
    if r['name']=='France':iso='FRA'
    if r['name']=='Norway':iso='NOR'
    gs=list(r.geometry.geoms) if r.geometry.geom_type=='MultiPolygon' else [r.geometry]
    for poly in gs:
        coords=[[round(x,3),round(y,3)] for x,y in poly.exterior.coords]
        if len(coords)>3:polys.append({'iso3':iso,'points':coords})
(ROOT/'data/map.json').write_text(json.dumps(polys,separators=(',',':')))
print(f'Prepared {len(world)} countries, {len(polys)} map polygons, {sum(c["easy"] for c in world)} easy countries.')
print('Capital audit:')
for c in world: print(c['code'],c['name'], ' / '.join(c['capital']),','.join(c['currency']),','.join(c['languageNames']))
