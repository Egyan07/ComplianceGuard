const os = require('os');
const fs = require('fs');
const path = require('path');
const LocalEvidenceProcessor = require('./evidence-processor');

// Reproduction + regression for the path-traversal write primitive.
// saveEvidenceFile() takes renderer-supplied fileName/category (via
// processManualEvidence) and must never write outside the evidence dir.
describe('LocalEvidenceProcessor.saveEvidenceFile path containment', () => {
  function newProcessor() {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-evi-'));
    return new LocalEvidenceProcessor(null, base);
  }

  it('contains a traversal fileName within the evidence dir', async () => {
    const p = newProcessor();
    const saved = await p.saveEvidenceFile(Buffer.from('x'), '../../../evil.txt', 'Documents');
    const resolved = path.resolve(saved.file_path);
    expect(resolved.startsWith(path.resolve(p.evidenceStoragePath) + path.sep)).toBe(true);
    expect(path.basename(resolved)).not.toContain('..');
  });

  it('contains a traversal category within the evidence dir', async () => {
    const p = newProcessor();
    const saved = await p.saveEvidenceFile(Buffer.from('x'), 'ok.txt', '../../../../tmp/escaped');
    const resolved = path.resolve(saved.file_path);
    expect(resolved.startsWith(path.resolve(p.evidenceStoragePath) + path.sep)).toBe(true);
  });

  it('still writes legitimate evidence normally', async () => {
    const p = newProcessor();
    const saved = await p.saveEvidenceFile(Buffer.from('hello'), 'report.pdf', 'Documents');
    expect(fs.existsSync(saved.file_path)).toBe(true);
    expect(saved.file_path).toContain('Documents');
  });
});
