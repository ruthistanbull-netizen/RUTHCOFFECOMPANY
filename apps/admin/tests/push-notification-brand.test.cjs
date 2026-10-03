const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const expectedBrand = "ROSTA Coffee";
function worker() {
  const handlers = {}, shown = [], messages = [], opened = [];
  let activated = false, claimed = false;
  const self = {
    addEventListener:(name,fn) => {handlers[name] = fn;},
    skipWaiting:async () => {activated = true;},
    location:{origin:"https://panel.test"},
    clients:{claim:async () => {claimed = true;},matchAll:async () => [{postMessage:message => messages.push(message)}],openWindow:async url => {opened.push(url);}},
    registration:{showNotification:async (title,options) => {shown.push({title,options});}},
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,"../public/push-sw.js"),"utf8"),{self,URL});
  async function send(name,event) {
    let waited;
    handlers[name]({...event,waitUntil:promise => {waited = promise;}});
    await waited;
  }
  return {shown,messages,opened,send,get activated(){return activated;},get claimed(){return claimed;}};
}
test("native heading uses the brand while the event and deep link remain intact",async () => {
  const w = worker();
  for (const type of ["order","appointment","reminder","test"]) {
    const payload = {title:"Yeni "+type,body:"İşletme / Sipariş 123",type,url:"/orders/123",tag:type+"-123"};
    await w.send("push",{data:{json:() => payload}});
    const {title,options} = w.shown.at(-1);
    assert.equal(title,expectedBrand);
    assert.equal(options.body,payload.title+"\n"+payload.body);
    assert.equal(options.data.url,payload.url);
    assert.equal(options.data.type,type);
    assert.equal(options.tag,payload.tag);
    assert.equal(w.messages.at(-1).payload.title,payload.title);
    assert.equal(w.messages.at(-1).payload.body,payload.body);
  }
  await w.send("notificationclick",{action:"open",notification:{close(){},data:w.shown[0].options.data}});
  assert.equal(w.opened[0],"https://panel.test/orders/123");
});
test("plain-text, missing and malformed payloads still produce branded native notifications",async () => {
  const w = worker();
  for (const value of [null,[],"text",{}]) await w.send("push",{data:{json:() => value}});
  await w.send("push",{data:{json(){throw new Error("text");},text:() => "Yeni sipariş metni"}});
  assert.ok(w.shown.every(row => row.title === expectedBrand));
  assert.equal(w.shown.at(-1).options.body,"Yeni sipariş metni");
  await w.send("notificationclick",{action:"dismiss",notification:{close(){},data:{url:"/orders"}}});
  assert.equal(w.opened.length,0);
});
test("an updated push-only worker activates and adopts open clients",async () => {
  const w = worker();await w.send("install",{});await w.send("activate",{});
  assert.ok(w.activated);assert.ok(w.claimed);
});
