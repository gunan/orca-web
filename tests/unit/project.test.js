import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { createMesh, transformPositions } from '../../shared/geometry.js';
import { emptyProject, serializeProject, parseProject, export3MF } from '../../shared/project.js';

function sampleProject() {
  const project = emptyProject();
  project.name = 'Brackets & spacers <revision "A">';
  project.plates.push({ id: 'plate-2', name: 'Spare parts' });
  project.ids = { printerId: 'native-machine', processId: 'native-process', filamentId: 'native-filament' };
  project.overrides = { layer_height: '0.16', enable_support: true, outer_wall_speed: '70' };
  project.metadata = { author: 'A & B <designers>', description: 'Two plates; keep all settings and geometry.' };
  project.objects = [
    createMesh({ id: 'first', name: 'Bracket & <left> "quoted" \'part\'', positions: [0,0,0, 10,0,0, 0,10,0], position: [40,50,5], rotation: [10,20,90], scale: [2,1,0.5], plateId: 'plate-1', sourceFile: 'bracket.obj', sourceGroup: 'assembly/bracket' }),
    createMesh({ id: 'second', name: 'Spare', positions: [0,0,0, 20,0,0, 0,20,0], plateId: 'plate-2', visible: false })
  ];
  project.selectedId = 'first';project.selectedIds=['first'];
  return project;
}

test('project roundtrip preserves geometry, transforms, visibility, plates, selection, presets and metadata', () => {
  const original = sampleProject();
  const parsed = parseProject(serializeProject(original));
  assert.deepEqual(parsed, original);
  parsed.objects[0].positions[0] = 999;
  assert.equal(original.objects[0].positions[0], 0);
  const typed = sampleProject();
  typed.objects[0].positions = new Float32Array(typed.objects[0].positions);
  assert.deepEqual(parseProject(serializeProject(typed)).objects[0].positions, original.objects[0].positions);
});

test('projects reject duplicate IDs, missing plates, nonfinite coordinates and nonpositive scales', () => {
  const mutations = [
    project => project.objects.push({ ...project.objects[0] }),
    project => project.plates.push({ ...project.plates[0] }),
    project => { project.objects[0].plateId = 'missing'; },
    project => { project.activePlateId = 'missing'; },
    project => { project.objects[0].positions[0] = NaN; },
    project => { project.objects[0].position[0] = Infinity; },
    project => { project.objects[0].rotation[0] = NaN; },
    project => { project.objects[0].scale[0] = 0; },
    project => { project.objects[0].scale[0] = -1; },
    project => { project.objects[0].scale[0] = 10001; },
    project => { project.objects[0].positions.pop(); }
  ];
  for (const mutate of mutations) {
    const project = sampleProject(); mutate(project);
    assert.throws(() => serializeProject(project));
    assert.throws(() => parseProject(JSON.stringify(project)));
  }
  assert.throws(() => parseProject('{bad json'), /valid JSON/);
  assert.throws(() => parseProject(JSON.stringify({ ...emptyProject(), version: 999 })), /version/);
  assert.throws(() => parseProject(JSON.stringify({ ...emptyProject(), plates: [] })), /plates/);
});

test('project restore repairs stale selection and handles an empty project', () => {
  const project = sampleProject(); project.selectedId = 'deleted';
  assert.equal(parseProject(serializeProject(project)).selectedId, 'first');
  assert.deepEqual(parseProject(serializeProject(emptyProject())), emptyProject());
});

test('3MF ZIP escapes XML and contains transformed vertices plus a complete restorable web project', () => {
  const project = sampleProject();
  const buffer = export3MF(project);
  assert.ok(buffer instanceof Uint8Array);
  const files = unzipSync(buffer);
  assert.deepEqual(Object.keys(files).sort(), ['3D/3dmodel.model', 'Metadata/orca-web.json', '[Content_Types].xml', '_rels/.rels'].sort());
  const xml = strFromU8(files['3D/3dmodel.model']);
  assert.match(xml, /unit="millimeter"/);
  assert.ok(xml.includes('Brackets &amp; spacers &lt;revision &quot;A&quot;&gt;'));
  assert.ok(xml.includes('Bracket &amp; &lt;left&gt; &quot;quoted&quot; &apos;part&apos;'));
  assert.ok(xml.includes('A &amp; B &lt;designers&gt;'));
  assert.equal((xml.match(/<object /g) || []).length, 1);
  assert.equal((xml.match(/<item /g) || []).length, 1);
  const vertices = [...xml.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)].flatMap(match => match.slice(1).map(Number));
  assert.deepEqual(vertices, Array.from(transformPositions(project.objects[0])));
  assert.deepEqual(parseProject(strFromU8(files['Metadata/orca-web.json'])), project);
  assert.match(strFromU8(files['_rels/.rels']), /Target="\/3D\/3dmodel.model"/);
});

test('3MF default export honors active plate and visibility; allPlates expands only visible objects', () => {
  const project = sampleProject();
  project.objects[1].visible = true;
  const third = createMesh({ ...project.objects[0], id: 'hidden', visible: false });
  project.objects.push(third);
  const model = options => strFromU8(unzipSync(export3MF(project, options))['3D/3dmodel.model']);
  assert.equal((model().match(/<object /g) || []).length, 1);
  assert.equal((model({ allPlates: true }).match(/<object /g) || []).length, 2);
  project.activePlateId = 'plate-2';
  assert.match(model(), /name="Spare"/);
  project.objects[1].visible = false;
  assert.throws(() => export3MF(project), /no visible objects/);
});
