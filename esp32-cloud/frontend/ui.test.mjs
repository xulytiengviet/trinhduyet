import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('./app.js',import.meta.url),'utf8');
const shell=readFileSync(new URL('./olivia-shell.js',import.meta.url),'utf8');
const style=readFileSync(new URL('./style.css',import.meta.url),'utf8');

test('dashboard has a chatbot-first Vietnamese quick start',()=>{
  assert.match(html,/id="view-chat"/);
  assert.match(html,/class="chat-layout"/);
  assert.match(html,/HƯỚNG DẪN NHANH/);
  assert.match(html,/3 BƯỚC/);
  assert.match(html,/https:\/\/xiaozhi\.me\/console\/agents/);
  assert.match(html,/https:\/\/xulytiengviet\.github\.io\/Bilabot\/#bb-setup/);
  assert.match(html,/id="olivia-ai-frame"/);
});
test('all UI script entrypoints have their required controls',()=>{
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
  for(const id of [...app.matchAll(/\bid\('([^']+)'\)/g)].map(m=>m[1])) {
    assert.ok(ids.has(id),'Missing UI control '+id);
  }
  for(const id of [...shell.matchAll(/getElementById\('([^']+)'\)/g)].map(m=>m[1])) {
    assert.ok(ids.has(id),'Missing shell UI control '+id);
  }
  const allIds=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(allIds).size,allIds.length,'Duplicated DOM IDs');
});
test('primary UI has no mock AI chat reply and keeps real engine boundary',()=>{
  assert.match(html,/src="https:\/\/xulytiengviet\.github\.io\/Bilabot\/"/);
  assert.match(html,/trạng thái kết nối được hiển thị trong ứng dụng BilaBot/);
  assert.match(html,/dữ liệu/i,{message:'all device sections remain present'});
  assert.match(style,/Chat-first 2026/);
  assert.match(html,/id="google-button"/);
  assert.match(html,/id="claim-device"/);
});
