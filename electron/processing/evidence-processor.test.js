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

describe('LocalEvidenceProcessor.processManualEvidence type validation (Phase 11)', () => {
  function newProcessor() {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-evi-'));
    const db = {
      addEvidence: async (row) => {
        db.lastRow = row;
        return 42;
      },
    };
    return new LocalEvidenceProcessor(db, base);
  }

  it('accepts canonical evidence types', async () => {
    const p = newProcessor();
    const id = await p.processManualEvidence({
      controlId: 'CC1.1',
      evidenceType: 'policy_document',
      title: 'Policy',
      description: '',
      content: 'text',
      contentType: 'text',
    }, 1);
    expect(id).toBe(42);
    expect(p.db.lastRow.evidence_type).toBe('policy_document');
  });

  it('accepts legacy aliases (translated by the engine before scoring)', async () => {
    const p = newProcessor();
    await p.processManualEvidence({
      controlId: 'CC1.1',
      evidenceType: 'security_settings',
      title: 'P',
      content: 'x',
      contentType: 'text',
    }, 1);
    expect(p.db.lastRow.evidence_type).toBe('security_settings');
  });

  it('rejects evidence types the canonical engine cannot score', async () => {
    const p = newProcessor();
    await expect(p.processManualEvidence({
      controlId: 'CC1.1',
      evidenceType: 'code_of_conduct', // former dead UI type
      title: 'P',
      content: 'x',
      contentType: 'text',
    }, 1)).rejects.toThrow(/Unknown evidence type/);
    expect(p.db.lastRow).toBeUndefined(); // nothing stored
  });

  it('falls back to non-scoring defaults when no type is supplied', async () => {
    const p = newProcessor();
    await p.processManualEvidence({
      controlId: 'CC1.1',
      title: 'P',
      content: 'x',
      contentType: 'text',
    }, 1);
    expect(p.db.lastRow.evidence_type).toBe('text');
  });
});
