import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256,newCode,isDeviceId,isCode,isBoard,equalHash,manifestFor,allowedOrigin} from './lib.mjs';
test('code preserves six decimal digits',()=>{for(let i=0;i<1000;i++) assert.match(newCode(),/^\d{6}$/)});
test('strict input validation',()=>{
  assert.equal(isCode('000123'),true);
  assert.equal(isCode('12345'),false);
  assert.equal(isDeviceId('70b04aaf-4ccb-4e75-86da-ad9b4e81014b'),true);
  assert.equal(isDeviceId('70:aa:bb:cc:dd:ee'),false);
  assert.equal(isBoard('ESP32-S3'),true);
  assert.equal(isBoard('unknown'),false);
});
test('hash comparison',()=>{assert.equal(equalHash('abc',sha256('abc')),true);assert.equal(equalHash('abd',sha256('abc')),false)});
test('exact origin, not suffix',()=>{
  assert.equal(allowedOrigin('https://app.pages.dev','https://app.pages.dev'),true);
  assert.equal(allowedOrigin('https://app.pages.dev.evil.example','https://app.pages.dev'),false);
});
test('OTA only when all release metadata agrees',()=>{
  const device={board:'ESP32-S3',firmware_version:'0.1.0'};
  const cfg={board:'ESP32-S3',version:'0.2.0',url:'https://cdn.example.com/fw.bin',sha256:'a'.repeat(64)};
  assert.equal(manifestFor(device,cfg).updateAvailable,true);
  assert.equal(manifestFor(device,{...cfg,url:'http://untrusted.invalid/fw.bin'}).updateAvailable,false);
  assert.equal(manifestFor({...device,board:'ESP32-C3'},cfg).updateAvailable,false);
  assert.equal(manifestFor({...device,firmware_version:'0.2.0'},cfg).updateAvailable,false);
});
