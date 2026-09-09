/**
 * The sound dialog: four preferences, and the previews that make them audible.
 *
 * The only state it keeps is `musicPreviewSerial`, and it is module-level
 * rather than per-dialog on purpose — `beginQuestion` refuses a key it has
 * already seen, so a serial that reset when the dialog reopened would make the
 * second preview silent.
 *
 * Every preference change is written through immediately: the dialog has no
 * confirm step, so the write *is* the confirmation.
 */
import { requireAudio } from '../state.ts';
import { STORE } from '../storage.ts';

export interface AudioSettingsHost {
  /** `document.getElementById`, as the shell already wraps it. */
  $(id: string): HTMLElement;
  openDialog(html: string): void;
  /** `write`, plus the shell's one-shot warning toast on a refusal. */
  persist(key: string, value: unknown): boolean;
}

/** Never reset: a repeated key makes `beginQuestion` decline to restart. */
let musicPreviewSerial = 0;

export function showAudioSettings(host: AudioSettingsHost): void {
  const { $, openDialog, persist } = host;
  const audio = requireAudio();
  const input = (id: string): HTMLInputElement => $(id) as HTMLInputElement;
  const previewButton = (): HTMLButtonElement => $('audio-question-preview') as HTMLButtonElement;

  openDialog(`<h2 id="dialog-title">Hudba a zvuky.</h2><p>Nově vytvořený čipový doprovod. Při odpovídání se střídá 21 tajemných soutěžních melodií s pravidelným pulzem, krátkými basy a jemnou melodií. Každá otázka začíná na jiném místě; motiv se neopakuje, dokud neprojdou všechny. Správná i chybná odpověď používají stejnou zvukovou paletu; menu, přílet a bonus mají vlastní hudbu. Neobsahuje nahrávky ani melodie z originálu.</p><label class="audio-toggle"><span>Zapnout zvuk</span><input id="audio-enabled" type="checkbox" ${audio.enabled?'checked':''}></label><label class="audio-volume"><span>Hlasitost <b id="volume-label">${Math.round(audio.volume*100)} %</b></span><input id="audio-volume" type="range" min="0" max="100" value="${Math.round(audio.volume*100)}" aria-label="Hlasitost zvuku"></label><label class="audio-toggle"><span>Hudba v menu a během hry</span><input id="audio-music" type="checkbox" ${audio.music?'checked':''}></label><label class="audio-toggle"><span>Efekty a varování před koncem času</span><input id="audio-effects" type="checkbox" ${audio.effects?'checked':''}></label><p id="audio-theme-label" class="audio-disclaimer">21 motivů · náhodný začátek každé otázky</p><button id="audio-question-preview" class="secondary full">Ukázka hudby při odpovídání ♪</button><button id="audio-next-theme" class="secondary full">Další melodie →</button><button id="audio-preview" class="secondary full">Ukázka: správná odpověď</button><button id="audio-wrong-preview" class="secondary full">Ukázka: chybná odpověď</button><p class="audio-disclaimer">Nastavení se ukládá jen v tomto prohlížeči. Otázka zůstane pozastavená, dokud ji sami neobnovíte.</p>`);
  const apply=()=>{
    audio.configure({enabled:input('audio-enabled').checked,music:input('audio-music').checked,effects:input('audio-effects').checked,volume:Number(input('audio-volume').value)/100});
    $('volume-label').textContent=Math.round(audio.volume*100)+' %';persist(STORE.audio,audio.settings());if(audio.enabled)audio.unlock();
  };
  ['audio-enabled','audio-music','audio-effects','audio-volume'].forEach(id=>{$(id).oninput=apply;});
  previewButton().onclick=()=>{
    if(audio.scene==='question'&&!audio.paused){audio.setScene('feedback');previewButton().textContent='Ukázka hudby při odpovídání ♪';return;}
    audio.configure({enabled:true,music:true});input('audio-enabled').checked=true;input('audio-music').checked=true;persist(STORE.audio,audio.settings());
    audio.unlock().then(ok=>{if(ok&&($('dialog') as HTMLDialogElement).open&&previewButton()){audio.setPaused(false);audio.stopVoices('effects');audio.beginQuestion(`preview:${++musicPreviewSerial}`);audio.setScene('question');previewButton().textContent='Zastavit hudební ukázku';updateThemeLabel();}});
  };
  function updateThemeLabel(){const m=audio.status().melody;$('audio-theme-label').textContent=`${m.index+1} / ${m.count} · ${m.name} · začátek od ${Math.floor(m.startStep/8)+1}. taktu`;}
  ($('audio-next-theme') as HTMLButtonElement).onclick=()=>{audio.setScene('feedback');previewButton().click();};
  const previewAnswer=(kind: string)=>{
    audio.configure({enabled:true,effects:true});input('audio-enabled').checked=true;input('audio-effects').checked=true;persist(STORE.audio,audio.settings());
    audio.unlock().then(ok=>{if(ok&&($('dialog') as HTMLDialogElement).open&&previewButton()){
      audio.setPaused(false);audio.setScene('feedback');audio.cue(kind);
      previewButton().textContent='Ukázka hudby při odpovídání ♪';
    }});
  };
  ($('audio-preview') as HTMLButtonElement).onclick=()=>previewAnswer('correct');
  ($('audio-wrong-preview') as HTMLButtonElement).onclick=()=>previewAnswer('wrong');
}
