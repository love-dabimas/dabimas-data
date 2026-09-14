import puppeteer from 'puppeteer-core';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
// PHASE4_BASELINE_DIR に release/2026-11 の作業ツリーを指定する。
// 比較側にも node_modules が必要。CHROME_PATH で Chrome の場所を上書きできる。
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseline=process.env.PHASE4_BASELINE_DIR;
const embedOnly=process.argv.includes('--embed-only');
if(!baseline && !embedOnly) throw new Error('PHASE4_BASELINE_DIR に比較用の release/2026-11 作業ツリーを指定してください');
const servers=[];
const targets=[[8791,root],...(!embedOnly ? [[8792,path.resolve(baseline)]] : [])];
for(const [port,cwd] of targets) {
  try {await fetch(`http://127.0.0.1:${port}/`);} catch {
    const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd,stdio:'ignore',windowsHide:true});
    servers.push(server);
    let ready=false;
    for(let i=0;i<100;i++) {
      try {await fetch(`http://127.0.0.1:${port}/`);ready=true;break;} catch {await new Promise(r=>setTimeout(r,200));}
    }
    assert.ok(ready,`server ${port}`);
  }
}
const output=path.join(root,'.tools/phase4b');
await fs.mkdir(output,{recursive:true});
const browser=await puppeteer.launch({headless:false,executablePath:process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--window-size=900,1000'],defaultViewport:{width:375,height:844}});
const page=await browser.newPage();
await page.bringToFront();
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const settle=()=>new Promise(resolve=>setTimeout(resolve,400));
const report=[];
const ok=(name,detail)=>{report.push({name,detail});console.log('OK',name,detail??'');};
const keyword=async(target,value)=>{
  await target.waitForSelector('#keyword');
  await target.$eval('#keyword',el=>{el.scrollIntoView();el.focus();el.select();});
  await page.keyboard.press('Backspace');
  if(value) await page.keyboard.type(value);
  await settle();
};
try {
  if (!embedOnly) {
  const snapshots=[];
  for(const port of [8792,8791]) {
    await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle0'});
    await keyword(page,'アイアンリージ');
    await page.waitForSelector('.result-card');
    await settle();
    const snapshot=await page.evaluate(()=>({cards:[...document.querySelectorAll('.result-card')].slice(0,3).map(el=>el.outerHTML),search:document.querySelector('.control-panel').outerHTML}));
    assert.equal(snapshot.cards.length,3);
    snapshots.push(snapshot);
    await fs.writeFile(`${output}/standalone-${port}.json`,JSON.stringify(snapshot,null,2));
    await page.screenshot({path:`${output}/standalone-${port}.png`});
  }
  assert.deepEqual(snapshots[1],snapshots[0]);
  ok('standalone outerHTML', '3 cards and search controls identical to release/2026-11');
  await page.goto('http://127.0.0.1:8791/?embed=1',{waitUntil:'networkidle0'});
  await keyword(page,'アイアンリージ');
  assert.equal(await page.$eval('html',el=>el.classList.contains('embed-mode')),false);
  assert.equal(await page.$('.pair-theory-chips'),null);
  assert.equal(await page.$('.custom-horse-badge'),null);
  await settle();
  assert.deepEqual(await page.$$eval('.result-card',els=>els.slice(0,3).map(el=>el.outerHTML)),snapshots[0].cards);
  ok('direct embed query', 'standalone cards unchanged; no embed class, chips or custom badges');
  }
  await page.goto('http://127.0.0.1:8791/tests/theory-assist-phase4.html',{waitUntil:'networkidle0'});
  await page.waitForFunction(()=>window.phase4?.rows.length>0);
  const frame=page.frames().find(f=>f.url().includes('picker=1'));
  await frame.waitForSelector('.pair-theory-chips button');
  const candidates=await page.evaluate(()=>({count:phase4.rows.length,valid:phase4.rows.every(r=>r.length===5 && r.every(x=>typeof x==='string') && !r[0].startsWith('ch_')),sent:phase4.messages.filter(x=>x.type==='dabimas:candidates').length,cloneMs:phase4.candidateCloneMs,totalMs:phase4.candidateMs}));
  assert.equal(candidates.count,2979);assert.equal(candidates.sent,1);assert.equal(candidates.valid,true);
  ok('candidates',candidates);
  const chips=()=>frame.$$eval('.pair-theory-chips button',els=>els.map(el=>({text:el.textContent,disabled:el.disabled,selected:el.getAttribute('aria-pressed')})));
  const clickChip=async(index)=>{const buttons=await frame.$$('.pair-theory-chips button');await buttons[index].click();await settle();};
  let state=await chips();
  assert.deepEqual(state.map(x=>x.text),['完璧2頭','超完璧0頭','奇跡1頭','至高計算中']);
  assert.equal(state[3].disabled,true);
  ok('chips order, counts and pending',state);
  await clickChip(0);
  assert.equal((await chips())[0].selected,'true');
  assert.equal(await frame.$$eval('.result-card',els=>els.length),2);
  assert.deepEqual((await chips()).map(x=>x.text),state.map(x=>x.text));
  assert.equal(await frame.$$eval('.result-card__horse-name',els=>els.some(el=>el.textContent.includes('アイアンリージ'))),true);
  ok('bit union', 'perfect includes the master carrying bits 1|4; counts remain independent');
  await clickChip(1);
  assert.equal(await frame.$$eval('.result-card',els=>els.length),0);
  assert.match(await frame.$eval('.empty-state',el=>el.textContent),/該当なし.*超完璧な配合になる種牡馬はいませんでした/);
  assert.equal((await chips())[1].selected,'true');
  await clickChip(1);
  assert.equal((await chips())[1].selected,'false');
  ok('zero result', 'selection retained at zero; clicking again restores results');
  await keyword(frame,'検証自家製スター');
  await frame.waitForSelector('.custom-horse-badge');
  assert.equal(await frame.$$eval('.result-card',els=>els.length),1);
  const stats=await frame.$eval('.result-card__legacy .horsedata2 > table:nth-child(2)',el=>[...el.querySelectorAll('td')].map(x=>x.textContent));
  assert.deepEqual(stats,Array(9).fill('ー'));
  assert.equal(await frame.$('.result-card__favorite'),null);
  assert.match(await frame.$eval('.result-card',el=>el.textContent),/面白/);
  assert.match(await frame.$eval('.result-card',el=>el.textContent),/見事/);
  await frame.click('.result-card__pedigree-toggle');
  await settle();
  assert.equal(await frame.$$eval('.result-card .detail tr',els=>els.length),15);
  assert.equal(await frame.$eval('html',el=>el.scrollWidth<=el.clientWidth),true);
  await page.screenshot({path:`${output}/custom-pedigree-375.png`,fullPage:true});
  ok('custom card', '9 dashes, 15 pedigree rows, line codes, custom badge; no favorite button; no horizontal overflow');
  await frame.click('.result-card__horse-name');
  await frame.waitForSelector('.result-card.is-picked .result-card__deselect');
  await frame.click('.result-card__deselect');
  assert.equal(await frame.$('.result-card.is-picked'),null);
  await frame.click('.result-card__horse-name');
  await frame.click('.picker-bar__confirm');
  await page.waitForFunction(()=>phase4.messages.some(x=>x.type==='dabimas:select'));
  const selection=await page.evaluate(()=>phase4.messages.find(x=>x.type==='dabimas:select'));
  assert.equal(selection.horseId,'ch_phase4');assert.equal(selection.gender,'0');
  ok('pick and clear',selection);
  await page.evaluate(()=>sendPhase4({type:'dabimas:reset-pick'}));await settle();
  assert.equal(await frame.$('.result-card.is-picked'),null);
  await keyword(frame,'検証祖先8');
  assert.equal(await frame.$$eval('.result-card',els=>els.length),1);
  ok('ancestor keyword', 'custom sire found by a pedigree ancestor');
  await keyword(frame,'');
  await frame.$$eval('.quick-tabs button',els=>els.find(x=>x.textContent.startsWith('レア')).click());await settle();
  await frame.$$eval('.quick-panel button',els=>els.find(x=>x.textContent.trim()==='真').click());await settle();
  assert.deepEqual((await chips()).map(x=>x.text),['完璧1頭','超完璧0頭','奇跡0頭','至高計算中']);
  ok('rare intersection', 'removing master rarity updates counts, custom horse remains exempt');
  await clickChip(0);
  await page.click('#change-mare');await settle();
  assert.equal((await chips()).every(x=>x.selected==='false'),true);
  ok('mare changed', 'chip selection cleared');
  await frame.$eval('.pair-theory-chips',el=>el.scrollIntoView());await settle();
  await page.screenshot({path:`${output}/chips-375.png`,fullPage:true});
  assert.equal(await frame.$eval('html',el=>el.scrollWidth<=el.clientWidth),true);
  assert.deepEqual(errors,[]);
  await fs.writeFile(`${output}/report.json`,JSON.stringify(report,null,2));
  console.log('ALL BROWSER CHECKS PASSED');
} catch(error) {
  console.error(error);
  console.error('Page errors:',errors);
  await fs.writeFile(`${output}/report.json`,JSON.stringify({passed:report,error:error.message,pageErrors:errors},null,2));
  await page.screenshot({path:`${output}/failure.png`,fullPage:true}).catch(error=>console.error('Screenshot:',error.message));
  process.exitCode=1;
} finally {await browser.close();for(const server of servers)server.kill();}
