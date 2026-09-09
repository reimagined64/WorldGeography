/**
 * The data-and-methodology dialog, plus the JSON export button it owns.
 *
 * Everything it prints is passed in: the citation list, the country database
 * and the licence text are read from the page's inert `<script type>` blocks
 * by the shell, so this module reads no DOM of its own beyond the button it
 * just rendered.
 */
import type { Country } from '../../engine/types.ts';

/** One entry of `data/build/sources.json`. */
export interface SourceEntry {
  name: string;
  url: string;
  use: string;
}

export interface SourcesDialogHost {
  /** `document.getElementById`, as the shell already wraps it. */
  $(id: string): HTMLElement;
  openDialog(html: string): void;
  esc(value: unknown): string;
  sources: readonly SourceEntry[];
  countries: readonly Country[];
  /** The text of the inert `#license-data` block, read once by the shell. */
  licenseText: string;
}

export function showSources(host: SourcesDialogHost): void {
  const { $, openDialog, esc, sources, countries, licenseText } = host;
  openDialog(`<h2 id="dialog-title">Data mají svůj příběh.</h2><p>Datová edice <strong>7. září 2026</strong>. Výběr tvoří 193 členů OSN, Palestina a Vatikán (Svatý stolec je pozorovatelským státem OSN). Nezahrnuje závislá území ani další částečně uznané státy.</p><h3>Obyvatelstvo: projekce, ne živé počítadlo</h3><p>Hra obsahuje hodnoty pro rok <strong>2026</strong> převzaté z tabulky Worldometer, která odkazuje na populační řadu OSN. Jde o projekce WPP 2024; nejde o dnešní přesné sčítání ani automaticky nejnovější národní statistiku. Metodika a územní vymezení se mohou od národních údajů lišit. Čísla v odpovědích zaokrouhlujeme. Databáze se sama nepřepisuje z internetu.</p><h3>Názvy, měny a jazyky</h3><p>Referenční údaje pocházejí z CountryInfo a Unicode CLDR, s ručními opravami současných měn a hlavních měst. Zvlášť ověřené změny zahrnují euro v Bulharsku a Ciudad de la Paz v Rovníkové Guineji. Jazyky jsou výběrem hlavních nebo úředních jazyků, nikoli úplným právním seznamem. Specificky formulované otázky rozlišují více hlavních měst, sídla vlády a nárokovaná města.</p><h3>Mapa a sporná území</h3><p>Natural Earth je generalizovaný orientační podklad. Hranice a barevné plochy nejsou právním stanoviskem a nemusí zachycovat všechny současné územní spory. U mikrostátů a ostrovů pomáhá značka polohy. Polohový bod není souřadnicí hlavního města.</p>${sources.map(s=>`<div class="source-item"><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)} ↗</a><p>${esc(s.use)}</p></div>`).join('')}<h3>Vlajky a jejich varianty</h3><p>195 PNG ilustrací je přímo uvnitř hry (Noto Color Emoji 2.051). Jde o stylizované obrázky, ne technické výkresy poměrů stran a barev. Afghánská trikolóra je republikánská varianta, nikoli bílá vlajka de facto úřadů; není používána v bonusových otázkách. Velmi podobné vlajky se navzájem nepoužívají jako chybné možnosti.</p><h3>Soukromí a licence</h3><p>Hra funguje bez internetu, nepoužívá analytiku, reklamu ani vzdálené knihovny. Jména, výsledek a rozehraná hra se ukládají jen v místním prohlížeči. Odkazy na zdroje otevírají externí web až po kliknutí. Nový kód je poskytnut pod licencí MIT; zdrojová data mají vlastní podmínky uvedené v balíčku.</p><details class="license-details"><summary>Licence kódu a materiálů</summary><pre>${esc(licenseText)}</pre></details><button id="export-data" class="secondary full">Exportovat herní databázi do JSON</button>`);
  $('export-data').onclick=()=>{const blob=new Blob([JSON.stringify({edition:'2026-09-07',countries,sources},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='world-geography-data-2026.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
}
