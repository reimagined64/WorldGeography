"""Real-clock render check for the shipped build; no direct game-state writes."""
from pathlib import Path
import json, os
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1]
HTML=(R/'index.html').read_text();OUT=R/'tests/screenshots';results=[];errors=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    def load(save=None,mobile=False):
        context=browser.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 1100},is_mobile=mobile,has_touch=mobile)
        page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
        page.evaluate('''save=>{const store={};if(save)store['wg.run.v7']=JSON.stringify(save);Object.defineProperty(window,'localStorage',{value:{getItem:k=>store[k]??null,setItem:(k,v)=>store[k]=String(v),removeItem:k=>delete store[k]}})}''',save)
        page.set_content(HTML,wait_until='load')
        if save:
            page.locator('#resume').click()
            if page.locator('#resume-clock').count():page.locator('#resume-clock').click()
        page.wait_for_timeout(300)
        assert page.evaluate('WorldGeography.version')=='7.0.0'
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
        return page
    seed=load()
    fixtures=seed.evaluate('''()=>{
        const all=JSON.parse(document.getElementById('country-data').textContent);
        function make(n){
            const g=GeoCore.makeGame(all,{difficulty:'normal',region:'all',players:1,names:['Anna'],motion:'full'},37501);
            for(let i=0;i<n;i++){GeoCore.submit(g,g.questions[g.index].correct,5000);GeoCore.advance(g,all);}
            g.revealedIndex=g.index;g.clock={index:g.index,elapsedMs:3000,paused:true};return g;
        }
        return {milestone:make(12),bonus:make(15)};
    }''')
    seed.context.close()
    page=load(fixtures['milestone'])
    question=page.evaluate('WorldGeography.getState().questions[WorldGeography.getState().index]')
    page.locator(f'[data-answer="{question["correct"]}"]').click();page.wait_for_timeout(350)
    a=page.evaluate('WorldGeography.getState().answers.at(-1)')
    assert a['scoreLifeDelta']==2 and a['flagLifeDelta']==0 and a['basePoints']==100
    assert '+2 pokusy' in page.locator('.life-feedback').inner_text()
    nonempty=page.evaluate("(()=>{const c=document.getElementById('globe'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return n;})()")
    assert nonempty>100000
    page.screenshot(path=str(OUT/'desktop-milestone-final-v7.png'),full_page=True)
    results.append({'check':'Rendered globe and +2 milestone on final build','paintedCanvasPixels':nonempty,'answer':a})
    page.context.close()
    page=load(fixtures['bonus'])
    assert 'BODY A +1 POKUS' in page.locator('.bonus-reward').inner_text()
    page.screenshot(path=str(OUT/'desktop-bonus-final-v7.png'),full_page=True)
    before=page.evaluate('WorldGeography.getState()');q=before['questions'][before['index']]
    page.locator(f'[data-answer="{q["correct"]}"]').click();after=page.evaluate('WorldGeography.getState()');a=after['answers'][-1]
    assert after['scores'][0]-before['scores'][0]==a['points']>0
    assert after['lives'][0]-before['lives'][0]==1
    results.append({'check':'Real-clock bonus awards score plus one attempt','answer':a})
    page.context.close()
    page=load(fixtures['milestone'],mobile=True)
    assert page.locator('#mobile-hud').is_visible()
    assert 'K +2 A VLAJCE' in page.locator('#bonus-progress').inner_text()
    page.screenshot(path=str(OUT/'mobile-question-final-v7.png'),full_page=True)
    results.append({'check':'Real-clock 390px question layout and +2 milestone label'})
    page.context.close()
    page=load(fixtures['bonus'],mobile=True)
    assert 'BODY A +1 POKUS' in page.locator('.bonus-reward').inner_text()
    page.screenshot(path=str(OUT/'mobile-bonus-final-v7.png'),full_page=True)
    results.append({'check':'Real-clock 390px bonus labels and score display'})
    page.context.close();browser.close()
assert not errors,errors
(R/'tests/final-ui-results.json').write_text(json.dumps({'version':7,'checks':results,'errors':errors},ensure_ascii=False,indent=2))
print(f'PASS — {len(results)} final real-clock UI checks')
