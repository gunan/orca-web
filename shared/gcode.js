const EPSILON = 1e-7;
const complete = point => point.every(value => Number.isFinite(value) && Math.abs(value) <= 1000000);
const distance = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const bounded = (value, fallback, max) => Number.isFinite(value) ? clamp(Math.floor(value), 1, max) : fallback;

function arcPoints(start, end, words, clockwise, plane, units, absoluteCenter, tolerance, maxSteps) {
  const [u, v, w] = plane;
  const offsets = ['I', 'J', 'K'];
  let center;
  const sweepFor = candidate => {
    const first = Math.atan2(start[v] - candidate[1], start[u] - candidate[0]);
    let sweep = Math.atan2(end[v] - candidate[1], end[u] - candidate[0]) - first;
    if (clockwise) { if (sweep >= -EPSILON) sweep -= Math.PI * 2; }
    else if (sweep <= EPSILON) sweep += Math.PI * 2;
    return { first, sweep };
  };
  if (words.has(offsets[u]) || words.has(offsets[v])) {
    center = [u, v].map(axis => absoluteCenter ? (words.has(offsets[axis]) ? words.get(offsets[axis]) * units : start[axis]) : start[axis] + (words.get(offsets[axis]) || 0) * units);
  } else if (words.has('R')) {
    const radius = Math.abs(words.get('R') * units);
    const du = end[u] - start[u], dv = end[v] - start[v], chord = Math.hypot(du, dv);
    if (chord < EPSILON || chord > 2 * radius + EPSILON) return null;
    const offset = Math.sqrt(Math.max(0, radius * radius - chord * chord / 4));
    const midpoint = [(start[u] + end[u]) / 2, (start[v] + end[v]) / 2];
    const candidates = [-1, 1].map(sign => [midpoint[0] - sign * dv / chord * offset, midpoint[1] + sign * du / chord * offset]);
    center = candidates.find(candidate => words.get('R') < 0 ? Math.abs(sweepFor(candidate).sweep) >= Math.PI - EPSILON : Math.abs(sweepFor(candidate).sweep) <= Math.PI + EPSILON);
  }
  if (!center) return null;
  const radius = Math.hypot(start[u] - center[0], start[v] - center[1]);
  const endRadius = Math.hypot(end[u] - center[0], end[v] - center[1]);
  if (radius < EPSILON || Math.abs(radius - endRadius) > Math.max(0.05, radius * 0.01)) return null;
  const { first, sweep } = sweepFor(center);
  const stepAngle = Math.min(Math.PI / 18, 2 * Math.acos(clamp(1 - tolerance / radius, -1, 1)));
  const wanted = Math.max(2, Math.ceil(Math.abs(sweep) / Math.max(stepAngle, 1e-5)));
  const steps = Math.min(wanted, maxSteps), points = [];
  for (let index = 1; index <= steps; index++) {
    const fraction = index / steps, point = [...start];
    point[u] = center[0] + radius * Math.cos(first + sweep * fraction);
    point[v] = center[1] + radius * Math.sin(first + sweep * fraction);
    point[w] = start[w] + (end[w] - start[w]) * fraction;
    points.push(index === steps ? [...end] : point);
  }
  return { points, resolutionLimited: wanted > maxSteps };
}

/** Preview-only interpretation of commanded G-code, not a firmware simulator. */
export function parseGcode(text, options = {}) {
  if (typeof text !== 'string') throw new TypeError('G-code must be text');
  const maxSegments = bounded(options.maxSegments, 200000, 500000);
  const maxCharacters = bounded(options.maxCharacters, 25000000, 50000000);
  const maxLines = bounded(options.maxLines, 1000000, 2000000);
  const maxLayers = bounded(options.maxLayers, 10000, 50000);
  const maxArcSegments = bounded(options.maxArcSegments, 2048, 8192);
  const tolerance = Number.isFinite(options.arcTolerance) ? clamp(options.arcTolerance, 0.001, 1) : 0.1;
  const warnings = new Set(), segments = [], layers = [], nativeEstimates = {};
  let truncated = Boolean(options.inputTruncated || text.length > maxCharacters);
  if (truncated) warnings.add('Input exceeds the preview limit; only the beginning is shown.');
  let source = text.slice(0, maxCharacters);
  if (truncated && source.lastIndexOf('\n') >= 0) source = source.slice(0, source.lastIndexOf('\n'));
  const lines = source.split(/\r?\n/, maxLines + 1);
  const hasLayerComments = /^\s*;\s*(?:LAYER_CHANGE\b|LAYER\s*:|layer num\/total_layer_count\s*:)/mi.test(source);
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const metrics = { pathLengthMm: 0, extrusionPathMm: 0, travelMm: 0, extrusionMm: 0, retractionMm: 0, unretractionMm: 0, moveCommands: 0, skippedMoves: 0 };
  let position = [null, null, null], ePosition = 0, units = 1, absoluteXYZ = true, absoluteE = true;
  let plane = [0, 1, 2], absoluteCenter = false, feedrate = null, tool = 0, feature = 'Unknown';
  let currentLayer = null, layerZ = null, modalMotion = null, sawCommand = false, nextLayerNumber = 1, stop = false, processedThroughLine = 0;
  function newLayer(z = null, nativeNumber = null, preamble = false) {
    if (layers.length >= maxLayers) { truncated = true; stop = true; warnings.add('Layer limit reached; preview and observed metrics are partial.'); return; }
    layerZ = z;
    currentLayer = { index: layers.length, number: preamble ? null : nextLayerNumber++, z, nativeNumber, preamble, startSegment: segments.length, endSegment: segments.length, extrusionSegments: 0 };
    layers.push(currentLayer);
  }
  function captureComment(comment) {
    let match;
    if (/^\s*LAYER_CHANGE\b/i.test(comment)) newLayer(null);
    else if ((match = comment.match(/^\s*LAYER\s*:\s*(-?\d+)/i))) {
      if (currentLayer && !currentLayer.preamble && currentLayer.endSegment === currentLayer.startSegment) currentLayer.nativeNumber = Number(match[1]);
      else newLayer(null, Number(match[1]));
    }
    else if ((match = comment.match(/^\s*layer num\/total_layer_count\s*:\s*(\d+)/i))) {
      // Orca can include both LAYER_CHANGE and the layer number; annotate, do not double-count.
      if (!currentLayer || currentLayer.endSegment > currentLayer.startSegment) newLayer(null, Number(match[1]));
      else currentLayer.nativeNumber = Number(match[1]);
    }
    if ((match = comment.match(/^\s*Z\s*:\s*(-?\d+(?:\.\d+)?)/i))) { layerZ = Number(match[1]); if (currentLayer) currentLayer.z = layerZ; }
    if ((match = comment.match(/^\s*(?:TYPE|FEATURE)\s*:\s*(.+)/i))) feature = match[1].trim().slice(0, 100) || 'Unknown';
    if ((match = comment.match(/^\s*(?:estimated printing time(?:\s*\(normal mode\))?|total estimated time(?:\s*\(normal mode\))?)\s*=\s*(.+)/i))) nativeEstimates.printTime = match[1].trim().slice(0, 160);
    if ((match = comment.match(/^\s*(?:total )?filament used\s*\[(mm|g|cm3)\]\s*=\s*(.+)/i))) nativeEstimates[{ mm: 'filamentMm', g: 'filamentGrams', cm3: 'filamentCm3' }[match[1].toLowerCase()]] = match[2].trim().slice(0, 160);
    if ((match = comment.match(/^\s*(?:total )?filament cost\s*=\s*(.+)/i))) nativeEstimates.filamentCost = match[1].trim().slice(0, 160);
  }
  function addSegment(start, end, extrusion, line, arc = false) {
    if (segments.length >= maxSegments) { truncated = true; warnings.add('Segment limit reached; preview and observed metrics are partial.'); return false; }
    const length = distance(start, end);
    if (length < EPSILON) return true;
    const kind = extrusion > EPSILON ? 'extrusion' : extrusion < -EPSILON ? 'retraction' : 'travel';
    if (!currentLayer) newLayer(hasLayerComments ? null : end[2], null, hasLayerComments || kind !== 'extrusion');
    if (!hasLayerComments && kind === 'extrusion') {
      if (currentLayer.preamble && currentLayer.extrusionSegments === 0) { currentLayer.z = end[2]; currentLayer.preamble = false; currentLayer.number = nextLayerNumber++; }
      else if (Math.abs(end[2] - currentLayer.z) > 0.0001) newLayer(end[2]);
    }
    if (stop) return false;
    if (!currentLayer.preamble && currentLayer.z === null && kind === 'extrusion') currentLayer.z = layerZ ?? end[2];
    segments.push({ start: [...start], end: [...end], extrusion, length, feedrate, speed: feedrate === null ? null : feedrate / 60, tool, feature, layer: currentLayer.index, kind, line, arc });
    currentLayer.endSegment = segments.length;
    if (kind === 'extrusion') currentLayer.extrusionSegments++;
    metrics.pathLengthMm += length;
    if (kind === 'extrusion') { metrics.extrusionPathMm += length; metrics.extrusionMm += extrusion; }
    else metrics.travelMm += length;
    for (const point of [start, end]) point.forEach((value, axis) => { bounds.min[axis] = Math.min(bounds.min[axis], value); bounds.max[axis] = Math.max(bounds.max[axis], value); });
    return true;
  }
  outer: for (let index = 0; index < Math.min(lines.length, maxLines); index++) {
    processedThroughLine = index + 1;
    const raw = lines[index], semicolon = raw.indexOf(';');
    if (semicolon >= 0) captureComment(raw.slice(semicolon + 1));
    if (stop) break;
    const code = (semicolon >= 0 ? raw.slice(0, semicolon) : raw).replace(/\([^)]*\)/g, '').replace(/\*.*$/, '').trim().toUpperCase();
    if (!code) continue;
    const tokens = [...code.matchAll(/([A-Z])\s*([-+]?(?:\d+(?:\.\d*)?|\.\d+))/g)];
    const words = new Map(tokens.filter(token => !['G', 'M', 'N', 'T'].includes(token[1])).map(token => [token[1], Number(token[2])]));
    if (tokens.some(token => !Number.isFinite(Number(token[2])))) { warnings.add('Non-finite numeric commands were ignored.'); continue; }
    let motion = null, special = false;
    for (const token of tokens) {
      const number = Number(token[2]);
      // T is a tool-selection command only when it leads the block. In
      // M104 T1 and M204 T3000 it is a command parameter, not a tool change.
      if (token[1] === 'T' && token === tokens.find(item=>item[1] !== 'N')) { if(Number.isInteger(number)&&number>=0)tool = number; special = true; }
      if (token[1] === 'M') {
        special = true;
        if (number === 82) absoluteE = true;
        if (number === 83) absoluteE = false;
        if (number === 200 && (words.get('D') || 0) !== 0) warnings.add('Volumetric extrusion is not interpreted; E metrics may not be filament millimeters.');
      }
      if (token[1] !== 'G') continue;
      if ([0, 1, 2, 3].includes(number)) { motion = number; modalMotion = number; }
      else { special = true;
        if (number === 90) absoluteXYZ = true;
        else if (number === 91) absoluteXYZ = false;
        else if (number === 90.1) absoluteCenter = true;
        else if (number === 91.1) absoluteCenter = false;
        else if (number === 20) units = 25.4;
        else if (number === 21) units = 1;
        else if (number === 17) plane = [0, 1, 2];
        else if (number === 18) plane = [2, 0, 1];
        else if (number === 19) plane = [1, 2, 0];
        else if (number === 92) {
          ['X', 'Y', 'Z'].forEach((axis, axisIndex) => { if (words.has(axis)) position[axisIndex] = words.get(axis) * units; });
          if (words.has('E')) ePosition = words.get('E') * units;
        } else if (number === 28) {
          const named = ['X', 'Y', 'Z'].filter(axis => new RegExp(`\\b${axis}(?:\\s|[-+\\d.]|$)`).test(code));
          ['X', 'Y', 'Z'].forEach((axis, axisIndex) => { if (!named.length || named.includes(axis)) position[axisIndex] = null; });
          warnings.add('Homing positions are machine-specific; moves are omitted until XYZ coordinates are known.');
        } else if ([10, 11].includes(number)) warnings.add('Firmware retract commands have unknown distances; they are not included in E metrics.');
        else if ([53, 54, 55, 56, 57, 58, 59].includes(number)) warnings.add('Machine/work coordinate offsets are not simulated; displayed paths use commanded coordinates.');
      }
    }
    if (words.has('F') && !tokens.some(token => token[1] === 'M')) {
      if (words.get('F') >= 0) feedrate = words.get('F') * units;
      else warnings.add('Negative feed rates were ignored.');
    }
    if (motion === null && !special && [...words.keys()].some(key => ['X', 'Y', 'Z', 'E'].includes(key))) motion = modalMotion;
    if (motion === null) continue;
    sawCommand = true; metrics.moveCommands++;
    const target = position.map((value, axis) => words.has('XYZ'[axis]) ? (absoluteXYZ ? words.get('XYZ'[axis]) * units : Number.isFinite(value) ? value + words.get('XYZ'[axis]) * units : null) : value);
    const nextE = words.has('E') ? absoluteE ? words.get('E') * units : ePosition + words.get('E') * units : ePosition;
    const extrusion = nextE - ePosition;
    ePosition = nextE;
    if (extrusion < -EPSILON) metrics.retractionMm -= extrusion;
    if (!complete(position) || !complete(target)) {
      position = target; metrics.skippedMoves++; warnings.add('Initial, unknown-position or out-of-range moves were omitted instead of inventing their coordinates (preview limit ±1,000,000 mm).'); continue;
    }
    if (distance(position, target) < EPSILON && ![2, 3].includes(motion)) {
      if (extrusion > EPSILON) metrics.unretractionMm += extrusion;
      position = target; continue;
    }
    let points = [target];
    if ([2, 3].includes(motion)) {
      const arc = arcPoints(position, target, words, motion === 2, plane, units, absoluteCenter, tolerance, maxArcSegments);
      if (!arc) { metrics.skippedMoves++; warnings.add('Invalid or unsupported arcs were omitted instead of replaced with straight lines.'); position = target; continue; }
      points = arc.points;
      if (arc.resolutionLimited) warnings.add('Long arcs use limited preview tessellation; the original G-code is unchanged.');
    }
    for (const point of points) {
      if (!addSegment(position, point, extrusion / points.length, index + 1, points.length > 1)) break outer;
      position = point;
    }
  }
  if (lines.length > maxLines) { truncated = true; warnings.add('Line limit reached; preview and observed metrics are partial.'); }
  if (!sawCommand) warnings.add('No supported movement commands were found.');
  if (!segments.length) warnings.add('No renderable paths with known coordinates were found.');
  const retainedLines = options.includeSource ? lines.slice(0, maxLines) : null;
  if (retainedLines && (source === '' || (source.endsWith('\n') && lines.length <= maxLines && retainedLines.at(-1) === ''))) retainedLines.pop();
  return { ...(retainedLines ? { source: { lines: retainedLines, processedThroughLine: Math.min(processedThroughLine, retainedLines.length), complete: !options.inputTruncated && text.length <= maxCharacters && lines.length <= maxLines } } : {}), segments, layers, bounds: segments.length ? bounds : null, nativeEstimates, metrics, warnings: [...warnings], truncated,
    features: [...new Set(segments.filter(segment => segment.kind === 'extrusion').map(segment => segment.feature))].sort(),
    tools: [...new Set(segments.map(segment => segment.tool))].sort((a, b) => a - b),
    assumptions: ['Commanded coordinates are shown; firmware macros, mesh leveling, offsets and machine kinematics are not simulated.', 'Extrusion mode follows explicit M82/M83; G90/G91 control XYZ only. Arc curves are tessellated for display.', 'Observed extruding E excludes unknown-position moves and does not substitute for native material or time estimates.'] };
}
