// End-to-end smoke test for the bundled Stacktape language server.
// Spawns dist/yaml-language-server/server.js over stdio (LSP) and checks the core
// features: schema validation, reference validation, hover, completion, go-to-definition.
// Run after a build:  pnpm build && pnpm smoke
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = join(ROOT, 'dist', 'yaml-language-server', 'server.js');
if (!existsSync(SERVER)) {
  console.error('Build first: dist/yaml-language-server/server.js not found. Run `pnpm build`.');
  process.exit(1);
}

const TEXT = [
  'resources:',
  '  postsTable:',
  '    type: dynamo-db-table',
  '  api:',
  '    type: function',
  '    properties:',
  '      connectTo:',
  '        - postsTable',
  '        - typoo',
  '      environment:',
  '        - name: URL',
  "          value: $ResourceParam('postsTable', 'arn')",
  ''
].join('\n');

const pos = (offset) => {
  const lines = TEXT.slice(0, offset).split('\n');
  return { line: lines.length - 1, character: lines[lines.length - 1].length };
};
const directive = TEXT.indexOf("$ResourceParam('postsTable'");
const refPos = pos(directive + "$ResourceParam('".length + 3); // inside 'postsTable'
const complPos = pos(directive + "$ResourceParam('".length); // right after the opening quote

const cp = spawn(process.execPath, [SERVER, '--stdio'], { cwd: ROOT });
let buf = Buffer.alloc(0);
const msgs = [];
let stderr = '';
cp.stderr.on('data', (d) => (stderr += d));
cp.stdout.on('data', (d) => {
  buf = Buffer.concat([buf, d]);
  for (;;) {
    const he = buf.indexOf('\r\n\r\n');
    if (he === -1) break;
    const m = /Content-Length: (\d+)/i.exec(buf.slice(0, he).toString());
    if (!m) {
      buf = buf.slice(he + 4);
      continue;
    }
    const len = +m[1];
    const start = he + 4;
    if (buf.length < start + len) break;
    try {
      msgs.push(JSON.parse(buf.slice(start, start + len).toString()));
    } catch {}
    buf = buf.slice(start + len);
  }
});
const send = (msg) => {
  const s = JSON.stringify(msg);
  cp.stdin.write(`Content-Length: ${Buffer.byteLength(s)}\r\n\r\n${s}`);
};
const uri = 'file:///smoke.stacktape.yml';

send({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { processId: process.pid, rootUri: null, capabilities: {} }
});
setTimeout(() => {
  send({ jsonrpc: '2.0', method: 'initialized', params: {} });
  send({ jsonrpc: '2.0', method: 'json/schemaAssociations', params: [{ fileMatch: ['/*stacktape.yml'], uri: null }] });
  send({
    jsonrpc: '2.0',
    method: 'textDocument/didOpen',
    params: { textDocument: { uri, languageId: 'stacktape', version: 1, text: TEXT } }
  });
}, 500);
setTimeout(() => {
  send({
    jsonrpc: '2.0',
    id: 2,
    method: 'textDocument/definition',
    params: { textDocument: { uri }, position: refPos }
  });
  send({ jsonrpc: '2.0', id: 3, method: 'textDocument/hover', params: { textDocument: { uri }, position: refPos } });
  send({
    jsonrpc: '2.0',
    id: 4,
    method: 'textDocument/completion',
    params: { textDocument: { uri }, position: complPos }
  });
}, 5000);
setTimeout(() => {
  cp.kill();
  const caps = msgs.find((m) => m.id === 1)?.result?.capabilities;
  const diags = msgs.filter((m) => m.method === 'textDocument/publishDiagnostics').flatMap((m) => m.params.diagnostics);
  const diagMessages = diags.map((d) => d.message);
  const def = msgs.find((m) => m.id === 2)?.result;
  const hover = JSON.stringify(msgs.find((m) => m.id === 3)?.result?.contents ?? '');
  const complItems = msgs.find((m) => m.id === 4)?.result?.items ?? msgs.find((m) => m.id === 4)?.result ?? [];
  const complLabels = complItems.map((i) => i.label);

  const checks = [
    ['initialize returns capabilities', !!caps],
    ['definitionProvider advertised', !!caps?.definitionProvider],
    ['schema validation runs', diagMessages.some((m) => /Missing property/.test(m))],
    ['reference validation flags unknown "typoo"', diagMessages.some((m) => m.includes('Unknown resource "typoo"'))],
    ['no false-positive on valid "postsTable"', !diagMessages.some((m) => m.includes('Unknown resource "postsTable"'))],
    ['go-to-definition resolves', Array.isArray(def) && def.length > 0],
    ['hover previews referenced resource', /References resource \*\*postsTable\*\*/.test(hover)],
    ['completion lists resource names', complLabels.includes('postsTable') && complLabels.includes('api')]
  ];

  let failed = 0;
  for (const [name, ok] of checks) {
    console.log(`${ok ? '✓' : '✗'} ${name}`);
    if (!ok) failed++;
  }
  if (stderr.trim()) console.log('\nserver stderr:\n' + stderr.slice(0, 600));
  console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
  process.exit(failed ? 1 : 0);
}, 9000);
