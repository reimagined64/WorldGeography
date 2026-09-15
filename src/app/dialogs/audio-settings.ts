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
import { $, dialog, esc, persist } from '../dom.ts';
import { t } from '../../i18n/index.ts';
import { openDialog } from '../main.ts';

/** Never reset: a repeated key makes `beginQuestion` decline to restart. */
let musicPreviewSerial = 0;

export function showAudioSettings(): void {
  const audio = requireAudio();
  const input = (id: string): HTMLInputElement => $(id) as HTMLInputElement;
  const previewButton = (): HTMLButtonElement => $('audio-question-preview') as HTMLButtonElement;

  openDialog(`<h2 id="dialog-title">${t('audio.title')}</h2><p>${t('audio.intro')}</p><label class="audio-toggle"><span>${t('audio.enable')}</span><input id="audio-enabled" type="checkbox" ${audio.enabled?'checked':''}></label><label class="audio-volume"><span>${t('audio.volume')} <b id="volume-label">${Math.round(audio.volume*100)} %</b></span><input id="audio-volume" type="range" min="0" max="100" value="${Math.round(audio.volume*100)}" aria-label="${esc(t('audio.volumeLabel'))}"></label><label class="audio-toggle"><span>${t('audio.music')}</span><input id="audio-music" type="checkbox" ${audio.music?'checked':''}></label><label class="audio-toggle"><span>${t('audio.effects')}</span><input id="audio-effects" type="checkbox" ${audio.effects?'checked':''}></label><p id="audio-theme-label" class="audio-disclaimer">${t('audio.themeSummary')}</p><button id="audio-question-preview" class="secondary full">${t('audio.previewQuestion')}</button><button id="audio-next-theme" class="secondary full">${t('audio.nextTheme')}</button><button id="audio-preview" class="secondary full">${t('audio.previewCorrect')}</button><button id="audio-wrong-preview" class="secondary full">${t('audio.previewWrong')}</button><p class="audio-disclaimer">${t('audio.disclaimer')}</p>`);
  const apply=()=>{
    audio.configure({enabled:input('audio-enabled').checked,music:input('audio-music').checked,effects:input('audio-effects').checked,volume:Number(input('audio-volume').value)/100});
    $('volume-label').textContent=Math.round(audio.volume*100)+' %';persist(STORE.audio,audio.settings());if(audio.enabled)audio.unlock();
  };
  ['audio-enabled','audio-music','audio-effects','audio-volume'].forEach(id=>{$(id).oninput=apply;});
  previewButton().onclick=()=>{
    if(audio.scene==='question'&&!audio.paused){audio.setScene('feedback');previewButton().textContent=t('audio.previewQuestion');return;}
    audio.configure({enabled:true,music:true});input('audio-enabled').checked=true;input('audio-music').checked=true;persist(STORE.audio,audio.settings());
    audio.unlock().then(ok=>{if(ok&&dialog().open&&previewButton()){audio.setPaused(false);audio.stopVoices('effects');audio.beginQuestion(`preview:${++musicPreviewSerial}`);audio.setScene('question');previewButton().textContent=t('audio.previewStop');updateThemeLabel();}});
  };
  function updateThemeLabel(){const m=audio.status().melody;$('audio-theme-label').textContent=t('audio.themeDetail',{index:m.index+1,count:m.count,name:m.name,bar:Math.floor(m.startStep/8)+1});}
  ($('audio-next-theme') as HTMLButtonElement).onclick=()=>{audio.setScene('feedback');previewButton().click();};
  const previewAnswer=(kind: string)=>{
    audio.configure({enabled:true,effects:true});input('audio-enabled').checked=true;input('audio-effects').checked=true;persist(STORE.audio,audio.settings());
    audio.unlock().then(ok=>{if(ok&&dialog().open&&previewButton()){
      audio.setPaused(false);audio.setScene('feedback');audio.cue(kind);
      previewButton().textContent=t('audio.previewQuestion');
    }});
  };
  ($('audio-preview') as HTMLButtonElement).onclick=()=>previewAnswer('correct');
  ($('audio-wrong-preview') as HTMLButtonElement).onclick=()=>previewAnswer('wrong');
}
