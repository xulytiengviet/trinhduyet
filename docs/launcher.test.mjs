import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const here=dirname(fileURLToPath(import.meta.url));
const read=p=>readFileSync(resolve(here,p),'utf8');
const root=read('../index.html'), docs=read('index.html'), native=read('device/index.html');
const launcher=read('launcher.js'),bridge=read('device/device-bridge.js');
const runtime=read('device/static/app.js');

test('entrypoints load a same-repository ESP32 runtime',()=>{
  assert.match(root,/id="native-esp32" src="\.\/docs\/device\/index\.html"/);
  assert.match(docs,/id="native-esp32" src="\.\/device\/index\.html"/);
  assert.doesNotMatch(root,/id="native-esp32"[^>]+src="https:\/\//);
  assert.match(native,/\.\/static\/app\.js\?v=direct1/);
});

test('real device protocol and validated pairing events',()=>{
  assert.match(runtime,/bilabot:pairing/);
  assert.match(runtime,/\/api\/ota\/check/);
  assert.match(runtime,/\/api\/ota\/activate/);
  assert.match(runtime,/\/api\/ws/);
  assert.match(bridge,/window\.BilaBotBridge\.startPair\(\)/);
  assert.match(bridge,/window\.XiaozhiDebug\.app\.connect\(\)/);
  assert.match(bridge,/e\.origin!==origin/);
  assert.match(launcher,/e\.source!==frame\.contentWindow/);
  assert.match(launcher,/^\s*connected:'Kết nối XiaoZhi thành công/m);
  assert.match(launcher,/^\s*code:'Đã nhận mã kích hoạt thật/m);
});

test('workflow is open, pair, talk and never invents an activation code',()=>{
  for(const label of ['Mở thiết bị','Ghép XiaoZhi','Trò chuyện','Lấy mã và ghép thiết bị']){
    assert.ok(docs.includes(label),'Missing '+label);
  }
  assert.match(docs,/id="activation-block"[^>]*hidden/);
  assert.match(launcher,/\/\^\\d\{6\}\$\/\.test/);
  assert.match(docs,/https:\/\/xiaozhi\.me\/console\/agents/);
  assert.ok(existsSync(resolve(here,'device/LICENSE')));
});

test('vendored static assets are resolvable within the repository',()=>{
  const refs=[...native.matchAll(/(?:src|href)="(\.[^"]+)"/g)]
    .map(x=>x[1].split('?')[0]).filter(x=>x!== './');
  for(const ref of refs){
    assert.ok(existsSync(resolve(here,'device',ref)), 'Missing: '+ref);
  }
});

test('browser device keeps its own pairing identity and does not overwrite BilaBot storage',()=>{
  const auth=read('device/auth.js');
  assert.match(runtime,/td_olivia_assistants_v1/);
  assert.match(runtime,/td_xiaozhi_web_client_settings/);
  assert.match(runtime,/key\.startsWith\('td_olivia_'\)/);
  assert.match(auth,/trinhduyet-connection-v2/);
  assert.match(auth,/trinhduyet-transport-session-v2/);
});
