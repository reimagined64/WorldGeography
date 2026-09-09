"""Version 7 integration against the standalone offline HTML. --real adds actual
12-second globe measurements; default uses Playwright's virtual clock."""
from pathlib import Path
import json, os, sys, time
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];HTML=(ROOT/'index.html').read_text();OUT=ROOT/'tests/screenshots';OUT.mkdir(exist_ok=True)
checks=[];errors=[];requests=[]
def check(name):checks.append(name);print('PASS — '+name,flush=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
 def new_page(width=1440,height=1000,storage=None,mobile=False,virtual=True):
  context=browser.new_context(viewport={'width':width,'height':height},device_scale_factor=1,reduced_motion='reduce',is_mobile=mobile,has_touch=mobile)
  page=context.new_page();page.virtual=virtual
  page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
  if virtual:
   page.clock.install(time='2026-09-07T10:00:00Z');page.clock.pause_at('2026-09-07T10:00:01Z')
  if True:
   page.evaluate('''initial=>{window.__testStorage={...initial};Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>window.__testStorage[k]??null,setItem:(k,v)=>{window.__testStorage[k]=String(v)},removeItem:k=>delete window.__testStorage[k]}})}''',storage or {})
   page.set_content(HTML,wait_until='load')
  assert page.evaluate('WorldGeography.version')=='7.0.0'
  return page
 def state(page):return page.evaluate('WorldGeography.getState()')
 def status(page):return page.evaluate('WorldGeography.getStatus()')
 def q(page):g=state(page);return g['questions'][g['index']]
 def ready(page):
  if page.virtual:
   if status(page)['phase']=='flying':page.clock.run_for(12500)
   if status(page)['phase']=='question' and not status(page)['clock']['running']:page.clock.run_for(180)
  else:page.wait_for_function("WorldGeography.getStatus().phase==='question'&&WorldGeography.getStatus().clock?.running",timeout=20000)
  assert status(page)['phase']=='question' and status(page)['clock']['running'],status(page)
 def answer(page,correct=True):
  ready(page);question=q(page);index=state(page)['index'];i=question['correct'] if correct else (question['correct']+1)%3
  page.locator(f'[data-answer="{i}"]').click();a=state(page)['answers'][index];assert a['correct']==correct;return a
 def fixture(page,outcomes,elapsed=5000,players=1,advance=True,revealed=False):
  return page.evaluate('''({outcomes,elapsed,players,advance,revealed})=>{const all=JSON.parse(document.getElementById('country-data').textContent),g=GeoCore.makeGame(all,{difficulty:'normal',region:'all',players,names:['Anna','Petr'],motion:'full'},37501);
   outcomes.forEach((ok,i)=>{const q=g.questions[g.index];GeoCore.submit(g,ok?q.correct:(q.correct+1)%3,elapsed);if(advance||i<outcomes.length-1)GeoCore.advance(g,all);});
   if(revealed){g.revealedIndex=g.index;g.clock={index:g.index,elapsedMs:5000,paused:true};}return g;}''',dict(outcomes=outcomes,elapsed=elapsed,players=players,advance=advance,revealed=revealed))
 def restore(g,**kwargs):
  page=new_page(storage={'wg.run.v7':json.dumps(g)},**kwargs);assert state(page) is not None,'valid save was rejected';page.locator('#resume').click()
  if status(page)['phase']=='paused':page.locator('#resume-clock').click()
  return page
 def no_overflow(page):assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'horizontal overflow'
 def save_snapshot(page):
  return page.evaluate("window.__testStorage['wg.run.v7']")

 seed=new_page()
 mid=fixture(seed,[True]*12,revealed=True) # 9,360, current currency; +2 on next answer
 queued=fixture(seed,[True]*13) # 10,140, current language, flag deferred
 bonus=fixture(seed,[True]*15) # 11,700, flag issued after population
 last=fixture(seed,[False]*20) # last country prepaid: zero reserve, all five questions remain
 end=fixture(seed,[False]*24,revealed=True)
 duel=fixture(seed,[True]*5+[False]*5+[True]*5,elapsed=0,players=2) # Anna 10k, Petr 0
 seed.context.close()
 if '--real' in sys.argv:
  for is_bonus,g in [(False,None),(True,bonus)]:
   page=restore(g,virtual=False) if g else new_page(virtual=False)
   if not g:
    page.wait_for_timeout(250);page.screenshot(path=str(OUT/'desktop-home-v7.png'),full_page=True);page.locator('#start').click()
   start=time.monotonic();before=status(page)['globe']['longitude'];samples=[]
   while True:
    capture=page.evaluate('({status:WorldGeography.getStatus(),answers:document.querySelectorAll("[data-answer]").length})');s=capture['status']
    if s['phase']!='flying':break
    samples.append(s);assert s['clock'] is None;assert capture['answers']==0
    if len(samples)==15:page.screenshot(path=str(OUT/('desktop-bonus-flight-v7.png' if g else 'desktop-flight-v7.png')),full_page=True)
    page.wait_for_timeout(120);assert time.monotonic()-start<30
   ready(page);duration=time.monotonic()-start
   assert duration>=11.8 and max(s['globe']['flight']['turnsCompleted'] for s in samples)==3
   assert {'spin','settle','zoom'}.issubset({s['globe']['flight']['stage'] for s in samples})
   assert all(s['globe']['flight']['neutral']==is_bonus for s in samples)
   assert status(page)['clock']['elapsedMs']<1200
   if g:assert state(page)['lives']==g['lives'];page.screenshot(path=str(OUT/'desktop-bonus-v7.png'),full_page=True)
   audio=[]
   for _ in range(8):page.wait_for_timeout(50);audio.append(status(page)['audio']['rms'])
   assert max(audio)>0.00001,'actual audio signal'
   check(f'Real-time {"bonus" if g else "country"} flight: {duration:.2f}s, 3 turns, timer blocked, neutral={is_bonus}, audio output')
   page.context.close()
 else:
  page=new_page();page.clock.run_for(100);no_overflow(page);assert '−1 pokus za všech 5' in page.locator('.survival-rule').inner_text();assert '+2 pokusy hned' in page.locator('.survival-rule').inner_text();assert 'AŽ 1 000 BODŮ' in page.locator('.setup-bottom').inner_text();page.screenshot(path=str(OUT/'desktop-home-v7.png'),full_page=True)
  page.locator('#start').click();assert state(page)['lives']==[4];assert status(page)['phase']=='flying';assert page.locator('[data-answer]').count()==0;ready(page)
  assert 'K +2 A VLAJCE' in page.locator('#bonus-progress').inner_text();first=q(page);themes=[];offsets=[]
  for category in ['country','capital','currency','language','population']:
   assert q(page)['type']==category;assert q(page)['country']==first['country'];ready(page)
   m=status(page)['audio']['melody'];themes.append(m['index']);offsets.append(m['startStep']);lives=state(page)['lives'][:]
   if category=='currency':
    texts=page.locator('.answer-text').all_text_contents();assert not any(' · ' in t or any(c.isupper() for c in t) for t in texts)
    page.screenshot(path=str(OUT/'desktop-currency-v7.png'),full_page=True)
   a=answer(page,False);assert a['lifeDelta']==0;assert state(page)['lives']==lives
   if category!='population':page.locator('#next').click();assert status(page)['phase']=='question';assert status(page)['globe']['flight'] is None
  assert len(set(themes))==5;assert all(a!=b for a,b in zip(offsets,offsets[1:]));assert 'Další země' in page.locator('#next').inner_text()
  page.locator('#next').click();assert state(page)['lives']==[3];assert status(page)['phase']=='flying'
  check('Country debited once; five wrong answers cost nothing; immediate same-country transitions; distinct melodies and offsets; short currency choices')
  page.context.close()

  page=restore(mid);ready(page);a=answer(page);assert a['scoreLifeDelta']==2;assert state(page)['lives']==[4];assert state(page)['pendingBonuses']==[[10000]]
  assert 'Vlajka čeká' in page.locator('.life-feedback').inner_text();assert '+2 pokusy' in page.locator('.life-feedback').inner_text();assert 'VLAJKA ČEKÁ PO STÁTU' in page.locator('#bonus-progress').inner_text()
  page.screenshot(path=str(OUT/'desktop-milestone-v7.png'),full_page=True)
  for category in ['language','population']:
   page.locator('#next').click();assert q(page)['type']==category;assert status(page)['phase']=='question';answer(page,False)
  assert 'Vlajkový bonus' in page.locator('#next').inner_text();lives=state(page)['lives'][:]
  page.locator('#next').click();assert q(page)['type']=='flag';assert status(page)['phase']=='flying';assert status(page)['globe']['flight']['neutral'];assert state(page)['lives']==lives
  ready(page);assert 'BODY A +1 POKUS' in page.locator('.bonus-reward').inner_text();score=state(page)['scores'][0];a=answer(page);assert a['flagLifeDelta']==1;assert state(page)['lives']==[lives[0]+1];assert 100<=a['points']<=1000;assert state(page)['scores'][0]==score+a['points'];assert a['basePoints']==100
  check('10k grants TWO immediate attempts; scored flag waits for all remaining categories; free neutral bonus rotation; correct flag gives points and another attempt')
  page.context.close()

  page=restore(queued);assert q(page)['type']=='language';assert status(page)['phase']=='question';ready(page);assert state(page)['lives']==queued['lives'];assert state(page)['pendingBonuses']==[[10000]]
  before=status(page)['clock']['elapsedMs'];page.locator('#pause-game').click();page.clock.run_for(10000);assert abs(status(page)['clock']['elapsedMs']-before)<100
  raw=save_snapshot(page);g=json.loads(raw);page.context.close();page=restore(g);ready(page);assert state(page)['lives']==g['lives'];assert state(page)['pendingBonuses']==g['pendingBonuses']
  check('Save/resume preserves paid country, queued bonus, and clock; pause does not consume an attempt')
  page.context.close()

  page=restore(bonus);assert status(page)['phase']=='flying';saved_lives=state(page)['lives'][:];page.clock.run_for(2000);raw=save_snapshot(page);page.context.close()
  page=restore(json.loads(raw));assert status(page)['phase']=='flying';assert state(page)['lives']==saved_lives;ready(page)
  page.clock.run_for(21000);assert status(page)['phase']=='feedback';a=state(page)['answers'][-1];assert a['timedOut'] and a['lifeDelta']==0
  page.locator('#next').click();assert q(page)['type']=='country';assert state(page)['bonusIssued']==[1];assert state(page)['lives']==[saved_lives[0]-1]
  check('Bonus saved during flight restarts without a debit; timeout consumes no attempt and cannot repeat milestone')
  page.context.close()

  page=restore(last);assert state(page)['lives']==[0];ready(page);assert 'STÁT JE ZAPLACEN' in page.locator('.score-lives').inner_text()
  for i in range(5):
   a=answer(page,False);assert a['lifeDelta']==0
   if i<4:page.locator('#next').click();assert status(page)['phase']=='question'
  assert state(page)['gameOver'];page.locator('#next').click();assert page.evaluate('WorldGeography.getView()')=='results';assert len(state(page)['answers'])==25
  page.locator('#review').click();ready(page);assert state(page)['review'];assert status(page)['clock']['remainingMs']==float('inf') or page.locator('[data-time-readout]').first.inner_text()=='∞'
  check('Last paid country completes at zero reserve; game ends after 25 errors / 5 countries; untimed practice remains available')
  page.context.close()

  page=restore(duel);assert q(page)['player']==0 and q(page)['type']=='flag';ready(page);answer(page,False);page.locator('#next').click();assert q(page)['player']==1;assert state(page)['lives']==[5,3]
  check('Duel keeps thresholds, queued flags and entry costs personal; turn changes only after bonus')
  page.context.close()

  page=new_page();page.locator('#sound-options').click();page.locator('#audio-question-preview').click();page.clock.run_for(500);first=status(page)['audio']['melody'];assert first['count']==21
  page.locator('#audio-next-theme').click();page.clock.run_for(500);second=status(page)['audio']['melody'];assert first['index']!=second['index'] and first['startStep']!=second['startStep'];assert second['name'] in page.locator('#audio-theme-label').inner_text()
  page.screenshot(path=str(OUT/'desktop-music-v7.png'),full_page=True);page.locator('#audio-preview').click();page.clock.run_for(50);assert status(page)['audio']['scene']=='feedback'
  check('Sound settings can audition successive melodies and matched answer cues; selected motif/start displayed')
  page.context.close()

  page=restore(mid,width=390,height=844,mobile=True);ready(page);no_overflow(page);assert page.locator('#mobile-hud').is_visible()
  page.screenshot(path=str(OUT/'mobile-question-v7.png'),full_page=True);page.screenshot(path=str(OUT/'mobile-question-viewport-v7.png'))
  page.locator('#sound-options').click();page.clock.run_for(500);assert status(page)['phase']=='paused';page.locator('#dialog-close').click();assert status(page)['phase']=='paused'
  check('390px mobile layout has no horizontal overflow; timer, points and attempts visible; sound dialog pauses question')
  page.context.close()

  page=restore(bonus,width=390,height=844,mobile=True);assert status(page)['phase']=='flying';page.clock.run_for(2000);no_overflow(page);page.screenshot(path=str(OUT/'mobile-bonus-flight-v7.png'))
  ready(page);no_overflow(page);page.screenshot(path=str(OUT/'mobile-bonus-v7.png'));assert page.locator('.bonus-flag').is_visible()
  check('Mobile bonus rest and flag layout render with neutral globe and no horizontal overflow')
  page.context.close()

  page=new_page();page.evaluate("Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem(){throw new Error('Storage blocked')},setItem(){throw new Error('Storage blocked')}}})")
  page.locator('#start').click();assert state(page)['lives']==[4];assert page.locator('#toast').is_visible();ready(page);answer(page,False);assert state(page)['lives']==[4]
  check('Blocked storage produces a warning and does not break gameplay')
  page.context.close()

 assert not errors,errors
 assert not any(url.startswith(('http://','https://')) for url in requests),requests
 check('No browser JavaScript errors or external HTTP requests')
 browser.close()
 kind='real' if '--real' in sys.argv else 'virtual'
 (ROOT/f'tests/browser-{kind}-results.json').write_text(json.dumps({'checks':checks,'errors':errors,'nativeStorage':'Not verified: this environment blocks file:// and local HTTP navigation by administrator policy; save/restore scenarios use a controlled storage shim.','externalRequests':[r for r in requests if r.startswith(('http://','https://'))]},ensure_ascii=False,indent=2))
 print(f'PASS — {len(checks)} integration groups ({kind})',flush=True)
